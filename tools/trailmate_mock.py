#!/usr/bin/env python3
"""
A stand-in for TrailMate's device API, for testing the console's link and
upload on the emulator before the real one is deployed.

It speaks the endpoints the console uses, from spec 037's `contracts/api.md`,
and checks every uploaded workout with workout_check.py, answering 400 for a
broken one exactly as TrailMate would. Uploads that pass are saved to
`--out` so they can be looked at.

    python tools/trailmate_mock.py                      # port 8037, approve after 2 polls
    python tools/trailmate_mock.py --deny               # the runner taps Deny
    python tools/trailmate_mock.py --outage 503         # every upload answers 503
    python tools/trailmate_mock.py --revoked            # every token answers 401

Point the console at it in Settings → Who runs → TrailMate server:
`http://10.0.2.2:8037/api` from the emulator (the host's loopback).

Not TrailMate: no accounts, and the "QR" is a placeholder pattern, not a
code anything can scan. Issued tokens are kept in `--out`/tokens.json, so the
mock can be restarted with different failure flags without the console's
link going stale.
"""
import argparse
import json
import os
import secrets
import sys
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from workout_check import check, describe  # noqa: E402

ALPHABET = "BCDFGHJKLMNPQRSTVWXZ23456789"
QR = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" shape-rendering="crispEdges">'
      '<rect width="21" height="21" fill="#fff"/>'
      + "".join(f'<rect x="{x}" y="{y}" width="1" height="1"/>'
                for x in range(21) for y in range(21)
                if (x < 7 and y < 7 and (x in (0, 6) or y in (0, 6) or (1 < x < 5 and 1 < y < 5)))
                or (x > 13 and y < 7 and (x in (14, 20) or y in (0, 6) or (15 < x < 19 and 1 < y < 5)))
                or (x < 7 and y > 13 and (x in (0, 6) or y in (14, 20) or (1 < x < 5 and 15 < y < 19)))
                or (x >= 8 and y >= 8 and (x * 7 + y * 13) % 5 < 2))
      + "</svg>")

links = {}       # deviceCode -> {"userCode", "polls", "issued"}
tokens = set()   # live device tokens
received = {}    # workoutId -> activityId


def token_file():
    return os.path.join(Handler.opts.out, "tokens.json")


def save_tokens():
    os.makedirs(Handler.opts.out, exist_ok=True)
    with open(token_file(), "w", encoding="utf-8") as f:
        json.dump(sorted(tokens), f)


class Handler(BaseHTTPRequestHandler):
    opts = None

    def reply(self, code, body=None):
        data = b"" if body is None else json.dumps(body).encode()
        self.send_response(code)
        if body is not None:
            self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b""
        try:
            return json.loads(raw or b"{}")
        except ValueError:
            return None

    def token(self):
        auth = self.headers.get("Authorization", "")
        return auth[7:] if auth.startswith("Bearer ") else ""

    def do_POST(self):
        o = self.opts
        b = self.body()
        if self.path == "/api/device-link/start":
            if not b or b.get("client") != "stride" or not 1 <= len(b.get("deviceLabel", "")) <= 60:
                return self.reply(400, {"message": "bad start request"})
            code = "".join(secrets.choice(ALPHABET) for _ in range(8))
            device = secrets.token_urlsafe(32)
            links[device] = {"userCode": code, "polls": 0, "issued": False}
            pretty = code[:4] + "-" + code[4:]
            print(f"link started for {b['deviceLabel']!r}: {pretty}")
            return self.reply(200, {
                "deviceCode": device, "userCode": pretty,
                "verificationUri": "https://www.foolishrunner.com/link",
                "verificationUriComplete": f"https://www.foolishrunner.com/link?code={pretty}",
                "qrSvg": QR, "expiresIn": 600, "interval": o.interval})
        if self.path == "/api/device-link/token":
            link = links.get((b or {}).get("deviceCode"))
            if not link or link["issued"]:
                return self.reply(400, {"error": "expired_token"})
            link["polls"] += 1
            if link["polls"] == 1 and o.slow_down:
                return self.reply(400, {"error": "slow_down"})
            if link["polls"] < o.approve_after:
                return self.reply(400, {"error": "authorization_pending"})
            if o.deny:
                return self.reply(400, {"error": "access_denied"})
            link["issued"] = True
            tok = "tmd_" + secrets.token_urlsafe(32)
            tokens.add(tok)
            save_tokens()
            print(f"link {link['userCode']} approved")
            return self.reply(200, {"deviceToken": tok, "deviceId": str(uuid.uuid4()),
                                    "user": {"firstName": o.name}})
        if self.path == "/api/devices/workouts":
            if o.revoked or self.token() not in tokens:
                return self.reply(401, {"message": "Unauthorized"})
            if o.outage:
                return self.reply(o.outage, {"message": "simulated outage"})
            if b is None:
                return self.reply(400, {"message": "not JSON"})
            if len(b.get("samples", {}).get("t", [])) > 21600:
                return self.reply(413, {"message": "too many samples"})
            errs = check(b)
            print(describe(b))
            if errs:
                print("  REJECTED: " + "; ".join(errs))
                return self.reply(400, {"message": errs[0]})
            wid = b["workoutId"]
            if wid in received:
                print("  duplicate")
                return self.reply(200, {"activityId": received[wid], "duplicate": True})
            received[wid] = str(uuid.uuid4())
            os.makedirs(o.out, exist_ok=True)
            with open(os.path.join(o.out, wid + ".json"), "w", encoding="utf-8") as f:
                json.dump(b, f, indent=1)
            print("  accepted")
            return self.reply(201, {"activityId": received[wid], "garminForward": "skipped"})
        self.reply(404, {"message": "not found"})

    def do_DELETE(self):
        if self.path == "/api/devices/self":
            tok = self.token()
            if tok not in tokens:
                return self.reply(401, {"message": "Unauthorized"})
            tokens.discard(tok)
            save_tokens()
            print("device revoked")
            return self.reply(204)
        self.reply(404, {"message": "not found"})


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--port", type=int, default=8037)
    p.add_argument("--interval", type=int, default=2, help="poll interval to hand out, seconds")
    p.add_argument("--approve-after", type=int, default=2, help="approve on this poll")
    p.add_argument("--slow-down", action="store_true", help="answer slow_down to the first poll")
    p.add_argument("--deny", action="store_true")
    p.add_argument("--outage", type=int, default=0, help="answer uploads with this status")
    p.add_argument("--revoked", action="store_true", help="answer uploads with 401")
    p.add_argument("--name", default="Sam", help="the TrailMate first name to link as")
    p.add_argument("--out", default="trailmate-mock-uploads")
    Handler.opts = p.parse_args()
    if os.path.exists(token_file()):
        with open(token_file(), encoding="utf-8") as f:
            tokens.update(json.load(f))
    print(f"mock TrailMate on :{Handler.opts.port}/api")
    ThreadingHTTPServer(("", Handler.opts.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
