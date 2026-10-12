#!/usr/bin/env python3
"""
Drive STRIDE's simulated treadmill from the PC. Debug builds only.

With the simulator on, STRIDE talks to a board in software (SimBoard.kt) that
behaves like the Gen 7 X22i, and never opens the real one, so nothing here can
move a belt. Use it to watch metrics, hill drawings and guided walks without
standing on anything.

    python tools/sim.py on                      # switch the simulator on (restarts STRIDE)
    python tools/sim.py start                   # free walk, warm-up first
    python tools/sim.py speed +0.5              # the on-screen speed buttons
    python tools/sim.py incline -1              # the on-screen incline buttons
    python tools/sim.py press incline_up        # the console's own buttons
    python tools/sim.py key out                 # pull the safety key (and `key in`)
    python tools/sim.py guided pyramid 6        # a guided walk, 6 minutes
    python tools/sim.py scenario guided-all 4   # all four shapes, 4 minutes each
    python tools/sim.py watch                   # print the state every 2 s
    python tools/sim.py off                     # back to the real board (restarts STRIDE)

Set STRIDE_DEVICE=<ip>:<port> (or pass --device) if more than one device is attached.
See docs/TEST_HARNESS.md.
"""
import argparse
import os
import re
import subprocess
import sys
import time

PKG = "dev.stride.hud"
SHAPES = ("steady", "rolling", "pyramid", "climb")
BUTTONS = ("speed_up", "speed_down", "incline_up", "incline_down", "start", "stop")


class Console:
    def __init__(self, device):
        self.base = ["adb"] + (["-s", device] if device else [])

    def shell(self, *args):
        r = subprocess.run(self.base + ["shell", *args], capture_output=True, text=True)
        if r.returncode != 0:
            sys.exit(f"adb failed: {r.stderr.strip() or r.stdout.strip()}")
        return r.stdout

    def broadcast(self, action, extras=()):
        out = self.shell("am", "broadcast", "-a", action, "-p", PKG, *extras)
        m = re.search(r'data="(.*)"', out)
        return m.group(1) if m else out.strip().splitlines()[-1] if out.strip() else ""

    def ctl(self, cmd, *extras):
        reply = self.broadcast(f"{PKG}.SIM_CTL", ["--es", "cmd", cmd, *extras])
        print(reply)
        if reply.startswith("refused"):
            sys.exit(1)
        return reply

    def restart(self):
        self.shell("am", "force-stop", PKG)
        self.shell("am", "start", "-n", f"{PKG}/.MainActivity")


def signed(text):
    """'+0.5', '-1', '2' -> float, for the relative commands."""
    return float(text)


def wait(con, seconds, every=10):
    """Sleep, printing the state now and then so a long walk is not silent."""
    end = time.time() + seconds
    while time.time() < end:
        time.sleep(min(every, max(0, end - time.time())))
        con.ctl("status")


def scenario_basic(con, _arg):
    """Every control once: start, speed and incline both ways, buttons, key, pause, end."""
    con.ctl("start"); wait(con, 8, 4)
    for _ in range(5):
        con.ctl("speed", "--ef", "by", "0.5"); time.sleep(1)
    con.ctl("incline", "--ef", "by", "3"); wait(con, 8, 4)
    con.ctl("press", "--es", "button", "speed_up")
    con.ctl("press", "--es", "button", "incline_up"); wait(con, 4, 2)
    con.ctl("speed", "--ef", "by", "-10"); wait(con, 4, 2)       # to zero: the belt pauses, the walk goes on
    con.ctl("speed", "--ef", "by", "0.1"); wait(con, 4, 2)       # and back from the minimum
    con.ctl("pause"); wait(con, 4, 2)
    con.ctl("resume"); wait(con, 6, 3)
    con.ctl("key", "--ez", "out", "true"); wait(con, 4, 2)
    con.ctl("key", "--ez", "out", "false"); con.ctl("ackkey")
    con.ctl("resume"); wait(con, 6, 3)
    con.ctl("incline", "--ef", "by", "-3")
    con.ctl("end"); wait(con, 6, 3)
    con.ctl("home")


def scenario_guided_all(con, arg):
    """The four guided shapes back to back, at a steady walking pace."""
    minutes = int(arg or 4)
    for shape in SHAPES:
        print(f"--- {shape}, {minutes} min ---")
        con.ctl("guided", "--es", "id", shape, "--ei", "min", str(minutes))
        time.sleep(4)
        con.ctl("setspeed", "--ef", "kph", "4.5")
        wait(con, minutes * 60 + 20, 15)
        con.ctl("end"); time.sleep(8)
        con.ctl("home"); time.sleep(3)


SCENARIOS = {"basic": scenario_basic, "guided-all": scenario_guided_all}


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--device", default=os.environ.get("STRIDE_DEVICE"))
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("on"); sub.add_parser("off"); sub.add_parser("status"); sub.add_parser("watch")
    for name in ("start", "pause", "resume", "end", "home", "ackkey"):
        sub.add_parser(name)
    sub.add_parser("speed").add_argument("by", type=signed)
    sub.add_parser("setspeed").add_argument("kph", type=float)
    sub.add_parser("incline").add_argument("by", type=signed)
    sub.add_parser("press").add_argument("button", choices=BUTTONS)
    sub.add_parser("key").add_argument("state", choices=("out", "in"))
    sub.add_parser("pulse").add_argument("state", choices=("on", "off"))
    g = sub.add_parser("guided"); g.add_argument("shape", choices=SHAPES); g.add_argument("minutes", type=int, nargs="?", default=10)
    s = sub.add_parser("scenario"); s.add_argument("name", choices=SCENARIOS); s.add_argument("arg", nargs="?")
    a = p.parse_args()

    con = Console(a.device)
    if a.cmd in ("on", "off"):
        # The switch lives in STRIDE, so STRIDE has to be running to take it.
        # Straight after an install it may not be yet; start it and try again.
        reply = ""
        for attempt in range(6):
            reply = con.broadcast(f"{PKG}.SIM", ["--ez", "on", "true" if a.cmd == "on" else "false"])
            if reply.startswith("sim "):
                break
            if attempt == 0:
                con.shell("am", "start", "-n", f"{PKG}/.MainActivity")
            time.sleep(2)
        else:
            sys.exit(f"STRIDE did not answer ({reply!r}). Is a debug build installed?")
        print(reply)
        con.restart()
        print("STRIDE restarted" + (" on the simulated board" if a.cmd == "on" else " on the real board"))
    elif a.cmd == "watch":
        try:
            while True:
                con.ctl("status"); time.sleep(2)
        except KeyboardInterrupt:
            pass
    elif a.cmd in ("speed", "incline"):
        con.ctl(a.cmd, "--ef", "by", str(a.by))
    elif a.cmd == "setspeed":
        con.ctl("setspeed", "--ef", "kph", str(a.kph))
    elif a.cmd == "press":
        con.ctl("press", "--es", "button", a.button)
    elif a.cmd == "key":
        con.ctl("key", "--ez", "out", "true" if a.state == "out" else "false")
    elif a.cmd == "pulse":
        con.ctl("pulse", "--ez", "on", "true" if a.state == "on" else "false")
    elif a.cmd == "guided":
        con.ctl("guided", "--es", "id", a.shape, "--ei", "min", str(a.minutes))
    elif a.cmd == "scenario":
        SCENARIOS[a.name](con, a.arg)
    else:
        con.ctl(a.cmd)


if __name__ == "__main__":
    main()
