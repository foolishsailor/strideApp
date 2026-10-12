# Test harness: a treadmill in software

Watch STRIDE's metrics, hill drawing, guided walks, FTMS and Home Assistant
output without standing on anything, and without a belt that can move.

**Debug builds only.** A release build has no simulator and ignores every
command here.

## What it is

`SimBoard` is a Gen 7 motor board written in software, inside STRIDE. With the
simulator on, STRIDE talks to it instead of the USB board. The USB board is
**never opened**, so the real belt and deck cannot move whatever the harness
does. It speaks real [FitPro 2](../protocol/FITPRO2_PROTOCOL.md) frames, so
everything above the USB pipe runs as it would on the treadmill: the FitPro 2
translation, the safety logic, the watchdog, metrics, the hill, guided walks,
FTMS and MQTT.

It behaves the way the X22i was measured to:

- speed from about 1.5 to 20 km/h, incline −6 to +40 %;
- an idle board refuses a target speed, and PAUSED stops the belt;
- the belt reading freezes instead of reading 0, and the latest frame repeats
  every ~1.5 s, errors included;
- the safety key is SYSTEM_MODE 2, and letting go of the board stops the belt
  while the state still says RUNNING.

Rates (belt about 1.5 km/h/s up and 2 km/h/s down, deck 0.6 %/s), physical
button steps and calories (ACSM walking equation, 75 kg) are reasonable
guesses, not measurements.

## Where to run it

- **On the console:** safe, because the real board isn't opened. Good for
  seeing the real screen at the real size.
- **In an Android emulator:** no treadmill needed at all. Install the debug APK
  and switch the simulator on.

Either way you need the debug build (`console/stride/run.sh`) and `adb`.

## Commands

`tools/sim.py`, Python 3.9+, no packages. On Windows use `py tools\sim.py …`.
Set `STRIDE_DEVICE=<ip>:<port>` or pass `--device` if more than one device is
attached.

| Command | Does |
|---|---|
| `on` / `off` | Switch the simulator on or off, and restart STRIDE |
| `status` / `watch` | The session and the board, once / every 2 s |
| `start` | A free walk, warm-up first (as the welcome button does) |
| `guided <steady\|rolling\|pyramid\|climb> [minutes]` | One of the four guided shapes, default 10 min |
| `speed ±n` / `setspeed n` | The on-screen speed buttons / take a pace |
| `incline ±n` | The on-screen incline buttons |
| `press <speed_up\|speed_down\|incline_up\|incline_down\|start\|stop>` | The console's own buttons: the board changes, the HUD follows |
| `key out` / `key in`, `ackkey` | Pull or replace the safety key; acknowledge the banner |
| `pause` / `resume` / `end` / `home` | As on screen |
| `pulse on\|off` | A made-up heart rate that follows speed and grade |
| `scenario basic` | Every control once, about two minutes |
| `scenario guided-all [minutes]` | The four shapes back to back, default 4 min each |

Every command answers with the session and the board, for example:

```
ACTIVE target=4.5 km/h grade=3.0 % plan=Pyramid | state=3 mode=3 belt=4.50 (reports 4.50) target=4.50 grade=2.4→3.0 dist=212 m time=171 s kcal=9.8 released=false subs=15
```

The poll loop's stall hook is here too, for the watchdog:
`adb shell am broadcast -a dev.stride.hud.DEBUG_STALL_POLL -p dev.stride.hud --el ms 8000`.

## What it has found

- **HOME during a cool-down leaves the belt to the runaway check.** The welcome
  screen comes up while the board is still RUNNING. `enforceStopped` stops it
  within a poll, but records a "belt running unattended" incident and an MQTT
  runaway alert each time. Found on the emulator, 12/10/2026. Not yet changed.

## Safety

- The control commands are refused unless the session is on the simulator,
  so this cannot drive a real belt from a laptop.
- Which board a session talks to is decided once, at start-up. `on` and
  `off` restart STRIDE for that reason.
- If you leave the simulator on, the console won't drive the treadmill, and
  *About* shows the board as `SIM-X22I`. `python tools/sim.py off` puts it back.
