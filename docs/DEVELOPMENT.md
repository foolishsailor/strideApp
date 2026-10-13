# Developing STRIDE

Everything you need to build STRIDE, run it, and test it, with or without a
treadmill. For installing STRIDE on a console, see [INSTALL.md](INSTALL.md).
For the rules on code that moves the belt, read
[CONTRIBUTING.md](../CONTRIBUTING.md) and [SAFETY.md](../SAFETY.md) first.

- [Three ways to run it](#three-ways-to-run-it)
- [Tools](#tools)
- [Build](#build)
- [The browser preview](#1-the-browser-preview)
- [An emulator and the simulator](#2-an-emulator-with-the-simulated-treadmill)
- [A real console](#3-a-real-console)
- [Debug and release builds](#debug-and-release-builds)
- [Before anyone steps on it](#before-anyone-steps-on-it)
- [Where things live](#where-things-live)
- [Troubleshooting](#troubleshooting)

---

## Three ways to run it

| | Needs | Good for | Belt can move |
|---|---|---|---|
| **1. Browser preview** | A browser | Designing screens: HTML, CSS, layout | No |
| **2. Emulator + simulator** | Android SDK, emulator | The whole app on a simulated Gen 7 board: metrics, hills, workouts, heart-rate control, FTMS, safety logic | No |
| **3. Real console** | A console you can reach with `adb` | The truth: real board, real belt | **Yes** |

Work in 1 and 2. Go to 3 to confirm, belt empty first.

---

## Tools

| Tool | Version | For |
|---|---|---|
| Git | any | the repo |
| Android SDK Platform-Tools (`adb`) | 30 or later (pairing needs it) | talking to a console or emulator |
| JDK | **17** | Gradle 8.9 does not run on newer JDKs |
| Android SDK | platform `android-34`, build-tools `34.0.0` | building |
| Android Emulator + `system-images/android-33/google_apis/x86_64` | — | option 2. Android 13 matches the Gen 7 console |
| Python | 3.9+ | `tools/sim.py` |
| Bash | — | the `.sh` scripts. Git Bash on Windows |

Android Studio installs everything above except Python. Without it:

### Windows

No admin rights needed. Everything goes under `%LOCALAPPDATA%`.

1. **Git for Windows**, which brings Git Bash: <https://git-scm.com/download/win>.
   Run every `.sh` script from Git Bash.
2. **JDK 17:** download Temurin 17 (zip) from <https://adoptium.net> and unzip
   it to `%LOCALAPPDATA%\Programs\Temurin`. Set `JAVA_HOME` to that folder
   before building (see [Build](#build)). Another JDK on the `PATH` (say
   Java 23) is fine as long as `JAVA_HOME` points at 17.
3. **Platform-Tools:** unzip
   <https://dl.google.com/android/repository/platform-tools-latest-windows.zip>
   into `%LOCALAPPDATA%\Android` and add `%LOCALAPPDATA%\Android\platform-tools`
   to your user `PATH`. Open a new terminal and check with `adb version`.
4. **SDK command-line tools:** download from
   <https://developer.android.com/studio#command-line-tools-only> and unpack
   so that `%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest\bin` exists. The
   build scripts find the SDK there by themselves.
5. **SDK packages.** Recent command-line tools replace `sdkmanager` with an
   `android` command that uses slashes in package names:

   ```powershell
   $sdk = "$env:LOCALAPPDATA\Android\Sdk"
   & "$sdk\cmdline-tools\latest\bin\android.exe" --sdk=$sdk sdk install `
       "platforms/android-34" "build-tools/34.0.0" "platform-tools"
   ```

   With older tools, the same thing is
   `sdkmanager "platforms;android-34" "build-tools;34.0.0" "platform-tools"`.
6. **Python 3.9+** from <https://python.org>. Run it as `py`, since
   `python` in Git Bash can be a Microsoft Store placeholder.

### macOS

```sh
brew install --cask temurin@17 android-commandlinetools android-platform-tools
sdkmanager "platforms;android-34" "build-tools;34.0.0"
```

The build scripts find JDK 17 through `/usr/libexec/java_home` and the SDK at
`~/Library/Android/sdk`. Otherwise set `ANDROID_HOME`.

### Linux

Install a JDK 17 and the SDK command-line tools from your distribution or from
the links above, put the SDK at `~/Android/Sdk` (or set `ANDROID_HOME`), set
`JAVA_HOME` to the JDK 17, and install the same packages with `sdkmanager`.

---

## Build

```sh
cd console/stride
./run.sh build      # build only
./run.sh            # build, install on the attached device, launch, follow the log
./run.sh release    # a signed release build (see below)
```

On Windows, in Git Bash, point at JDK 17 first:

```sh
export JAVA_HOME="$(ls -d "$LOCALAPPDATA"/Programs/Temurin/jdk-17* | head -1)"
```

`run.sh` picks the device from `adb devices`, or from `STRIDE_DEVICE` if set.
The board probe builds the same way from `console/usbprobe`. Use `run.sh`
rather than calling `./gradlew` yourself: it sets up the paths, and Gradle on
its own fails in ways that blame the wrong thing.

---

## 1. The browser preview

The interface is built into `console/stride/app/src/main/assets/ui/`. It
opens on its own in a desktop browser, with a stubbed bridge and fake data, so
you can look at a screen without a device:

```sh
open console/stride/app/src/main/assets/ui/trailmate.html     # macOS
start console\stride\app\src\main\assets\ui\trailmate.html     # Windows
```

Add `?screen=live-workout`, `?screen=paused` or `?screen=summary` to land on a
state, or press the number keys.

It is built from React and TypeScript source in `console/stride/frontend/`;
don't edit the built file. See
[`console/stride/frontend/README.md`](../console/stride/frontend/README.md):

```sh
cd console/stride/frontend
npm install
npm run dev      # http://localhost:5173/trailmate.html?screen=live-workout
npm run build    # writes assets/ui/trailmate.html, then checks it for Chromium 83
```

---

## 2. An emulator with the simulated treadmill

The real app, on an Android 13 virtual console, driving a board in software
that behaves like the Gen 7 X22i. Nothing physical is involved.

**Create the virtual console** (once): a 1920×1080 landscape tablet, like the
real one.

In Git Bash on Windows (on macOS and Linux, drop the `.exe` and `.bat`, and
use your SDK path):

```sh
sdk="$LOCALAPPDATA/Android/Sdk"
export ANDROID_HOME="$sdk" JAVA_HOME="$(ls -d "$LOCALAPPDATA"/Programs/Temurin/jdk-17* | head -1)"
"$sdk/cmdline-tools/latest/bin/android.exe" --sdk="$sdk" sdk install \
    "emulator" "system-images/android-33/google_apis/x86_64"      # ~1.5 GB
"$sdk/emulator/emulator.exe" -accel-check                         # wants "WHPX … usable" on Windows
echo no | "$sdk/cmdline-tools/latest/bin/avdmanager.bat" create avd -n stride-console \
    -k "system-images;android-33;google_apis;x86_64" -d pixel_tablet
```

Then set the screen to match the console in
`~/.android/avd/stride-console.avd/config.ini`:

```ini
hw.lcd.width=1920
hw.lcd.height=1080
hw.lcd.density=160
hw.initialOrientation=landscape
```

On Windows the emulator needs the hypervisor. It is already on if you use
WSL 2 or Docker Desktop. Otherwise turn on **Windows Hypervisor Platform** in
*Turn Windows features on or off*.

**Run it:**

```sh
"$sdk/emulator/emulator.exe" -avd stride-console -no-boot-anim &   # first boot takes a minute or two
adb -s emulator-5554 wait-for-device
cd console/stride && STRIDE_DEVICE=emulator-5554 ./run.sh build
adb -s emulator-5554 install -r app/build/outputs/apk/debug/app-debug.apk
cd ../.. && py tools/sim.py --device emulator-5554 on            # STRIDE restarts on the simulated board
```

Check it took: the log shows `fp2: model 'SIM-X22I'` and `fp2: subscribed`.
FTMS stays off in the emulator ("not permitted on this console"): its
Bluetooth has nothing to advertise to, and STRIDE carries on without it.

**Drive it** with [`tools/sim.py`](../tools/sim.py). Every command is in
[TEST_HARNESS.md](TEST_HARNESS.md). The ones you will use most:

```sh
py tools/sim.py planned <workout id>    # one of the runner's TrailMate workouts
py tools/sim.py hr 2                    # hold heart-rate zone 2 (Manual -> Heart rate)
py tools/sim.py speed +0.5              # the on-screen buttons
py tools/sim.py incline +2
py tools/sim.py press incline_up        # the console's own buttons
py tools/sim.py key out                 # the safety key
py tools/sim.py watch                   # live state every 2 s
```

The simulator is debug-only, and with it on the USB board is never opened.
The same commands work on a real console (option 3) and are just as safe there.

---

## 3. A real console

Getting a console to accept `adb` is the install guide's Part 1. Once it does:

- **Gen 6** (Android 9): `adb connect <ip>:5555`.
- **Gen 7** (Android 13): Wireless debugging. Pair once, then connect:

  ```sh
  adb mdns services                          # shows the pairing and connect ports
  adb pair <ip>:<pairing-port> <six-digit code>
  adb connect <ip>:<connect-port>
  ```

  The connect port changes on reboot and sometimes when the console's Wi‑Fi
  drops. Read the new one from *Developer options → Wireless debugging*.
  Pairing survives.

Then `./run.sh` from `console/stride`. Reinstalling resets STRIDE's USB
permission, so tap OK on the console, or close and reopen STRIDE if the
prompt vanishes.

---

## Debug and release builds

| | Debug | Release |
|---|---|---|
| Built by | `./run.sh` with no signing key | `./run.sh release` |
| Signed with | the debug key | your key, from `local.properties` |
| `debuggable` | yes: settings readable, WebView DevTools on | no |
| Simulator, stall hook | **included** | **absent** |
| For | the bench | the machine you run on |

The four signing properties and the `keytool` line are at the top of
`console/stride/app/build.gradle.kts`. A debug build and a release build are
different apps to Android, so switching between them means uninstalling and
losing settings.

---

## Before anyone steps on it

Anything that changes how the board is driven gets this on the real machine,
**belt empty, a hand on the safety key**, before it is run on:

1. Connects; shows live speed, incline and limits.
2. Incline up and down.
3. Start: the belt eases up from the minimum.
4. Speed up and down; speed to zero holds; back up restarts from the minimum.
5. Pause, resume, STOP, end.
6. Safety key out (banner) and in.
7. App force-closed mid-run: the belt stops.
8. Poll loop stalled mid-run (`adb shell am broadcast -a dev.stride.hud.DEBUG_STALL_POLL -p dev.stride.hud --el ms 8000`):
   the watchdog stops the belt within about 3 s.
9. Power-cycle at the wall: STRIDE comes back by itself.

Say in the pull request which of these you ran and on what. "Built and
installed, belt idle" is worth knowing; so is "not run on yet".

---

## Where things live

| | |
|---|---|
| `console/stride/` | The app. Kotlin drives the machine; HTML in `assets/ui/` draws the screen |
| `…/hud/FitPro.kt`, `FitPro2.kt` | Gen 6 and Gen 7 protocols: framing only, no I/O |
| `…/hud/FitPro2Board.kt` | Makes a Gen 7 board look like a Gen 6 one to the poll loop |
| `…/hud/SimBoard.kt` | The simulated Gen 7 board (debug) |
| `console/usbprobe/` | Read-only board identifier |
| `protocol/` | The two protocols, written down |
| `treadmills/` | What each generation and machine is like |
| `tools/unchain.sh` | Takes a console from iFit to STRIDE |
| `tools/sim.py` | Drives the simulator |

---

## Troubleshooting

| Symptom | Cause, fix |
|---|---|
| `run.sh` builds nothing and says nothing | Fixed: it used to exit on a fresh clone with no `local.properties`. Pull. |
| `Could not determine … SDK location not found` | You called `./gradlew` directly. Use `run.sh`, or set `ANDROID_HOME`. |
| Gradle errors about the Java version | `JAVA_HOME` isn't JDK 17. |
| `adb devices` empty on Windows though connected | Fixed in the scripts (`\r` line endings). For your own scripts, pipe through `tr -d '\r'`. |
| `failed to connect` / `offline` / `protocol fault` | The console's connect port moved. Read the new one off the screen. If `adb connect` prints nothing, `adb kill-server` and try again. |
| STRIDE says *usb permission denied* at once | Android 12+: an immutable `PendingIntent` returns no extras. Fixed. |
| STRIDE starts, dies after ~5 s, relaunches, again | FTMS without `BLUETOOTH_ADVERTISE` on Android 12+. Fixed. |
| Console boots to the Android launcher | Android 10+ blocks a boot-time launch. `unchain.sh` grants *display over other apps*. |
| `sim.py` says *refused: simulator is off* | `py tools/sim.py on`. It restarts STRIDE. |
| A Windows `sleep`, `python` or `/tmp` surprise | Use Git Bash for `.sh`, `py` for Python, and paths without spaces where you can. |
