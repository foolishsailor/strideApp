# Contributing

Fork it, change it, ship it. STRIDE is [Apache-2.0](LICENSE), so you can do all
of that commercially and without asking me. There's no CLA and you keep the
copyright on what you write.

I built this for my own treadmill. If it's useful to you, take it somewhere I
wouldn't have.

## The most useful thing you can do

**Tell me what board your treadmill has.** Working or not. The easiest way
is a page in [`treadmills/`](treadmills/README.md), copied from its template.

Right now the known-good list is two machines: a NordicTrack C 1750 (Gen 6,
FitPro) in daily use, and a NordicTrack X22i (Gen 7, FitPro 2), newer but
run on. That's the single biggest thing standing between this working
on my treadmill and working on yours. I'm not buying more treadmills to find
out, so the list can only come from other people.

[`console/usbprobe`](console/usbprobe) asks your board what it is and changes
nothing. Run it and [open an issue](https://github.com/keranm/strideApp/issues)
with the result, even if the answer is "it didn't work".

Second most useful: **the install guide is unproven.** Nobody who didn't
already know the answers has followed [docs/INSTALL.md](docs/INSTALL.md) end to
end. If you get stuck, the place you got stuck is a bug in the guide. Tell me
where, or send a pull request that fixes it.

## Getting set up

**[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** has the full setup for Windows,
macOS and Linux, plus the emulator and the simulated treadmill, which together
let you run the whole app with no treadmill at all. The short version:

You need the Android SDK and a console you can reach over ADB, or an emulator.

```sh
git clone https://github.com/keranm/strideApp.git
cd strideApp/console/stride
./run.sh          # builds, installs, launches, tails the log
```

`run.sh` sets `JAVA_HOME` for you. Calling `./gradlew` directly tends to fail
in a way that blames the wrong thing.

The interface is a React + TypeScript project in
[`console/stride/frontend/`](console/stride/frontend/), in the TrailMate
app's design. It builds to `trailmate.html` in
[`console/stride/app/src/main/assets/ui/`](console/stride/app/src/main/assets/ui/).
You can redesign a screen in a desktop browser, with a stubbed bridge and fake
data, without going anywhere near a treadmill:

```sh
cd console/stride/frontend && npm install
npm run dev    # http://localhost:5173/trailmate.html
```

Add `?screen=live-guided`, `?screen=summary`, `?screen=paused` and so on to
land on a particular state, or press the number keys to jump between them.
See [the frontend README](console/stride/frontend/README.md) for how it is
organised.

## Where things live

| | |
|---|---|
| `console/stride/` | The Android app. Kotlin drives the machine, HTML draws the screen. |
| `console/usbprobe/` | Read-only board identifier for Gen 6 (FitPro 1) and Gen 7 (FitPro 2) boards. Sends only identity and read requests, moves nothing. |
| `protocol/` | The [FitPro serial protocol](protocol/FITPRO_PROTOCOL.md) (Gen 6) and [FitPro 2](protocol/FITPRO2_PROTOCOL.md) (Gen 7), decoded. Start here for a different machine. |
| `tools/unchain.sh` | Disables the iFit packages in the order that matters. |
| `tools/sim.py` | Drives a simulated treadmill in debug builds: speed, incline, the four guided runs, the safety key. See [TEST_HARNESS.md](docs/TEST_HARNESS.md). |

## If you touch anything that moves the belt

This is the one place I'd ask you to be careful, because it's a motor with a
person standing on it.

- **The safety key is the stop of record.** It's hardware and it cuts the
  motor. Nothing in software gets to be the last line.
- **Incline is driven, speed is only ever suggested.** The user decides when to
  go faster. Auto start-up is optional and capped at 3 km/h.
- **Every request is clamped** to the range the board reports for itself, in
  Kotlin, not in the interface. A layout can't outrun the machine, and it
  should stay that way.
- **Say what you tested on.** "Built and installed, board idle, no errors" is
  worth knowing. So is "I haven't run on this".

Read [SAFETY.md](SAFETY.md) before changing anything in that area.

## Style

Nothing strict. Two habits that make the code readable:

- **Comments explain why, not what.** The tricky parts of this project are all
  "the board reports 0.00 at every speed" or "this console boots at 2010", and
  those facts are invisible from the code alone.
- **Commit messages carry the reasoning.** Look at the log for the shape.

## What I can promise

Not much. This is a side project on one treadmill and I may be slow. If you
send something and I go quiet, chase me, or fork it and carry on without me.
That's what the licence is for.
