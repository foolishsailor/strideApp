# The FitPro 2 protocol (Gen 7)

An independent interoperability description of the USB protocol spoken by the
motor control board in Gen 7 NordicTrack consoles. iFit's software calls it
"FitPro 2". It is **not** [FitPro 1](FITPRO_PROTOCOL.md) on a new product id.
The framing, the encoding and the command set are all different.

> Independent interoperability work, for compatibility with hardware the authors
> own. Assembled from USB traffic on a real Gen 7 board and from a static reading
> of the publicly distributed console software (`com.ifit.glassos_service`
> 2026.08.25). Described in our own words. Nothing here is copied from anyone's
> documentation or source.
>
> Not affiliated with or endorsed by iFIT Health & Fitness, ICON Health &
> Fitness, NordicTrack or ProForm.

Each claim is marked one of:

- **HARDWARE**: seen on a real board.
- **CODE**: read from the console software but not yet seen on a board.
- **INFERRED**: a reasonable guess. Treat it as a hypothesis.

**Status, 11/10/2026:** STRIDE does not drive FitPro 2 yet. This page is the
groundwork. Nothing has been *written* to a FitPro 2 board.

---

## ⚠️ Read this first: never send FitPro 1 frames to this board

A FitPro 1 frame's **length** byte lands in FitPro 2's **type** slot. Any
FitPro 1 frame of length 9 (`02 09 …`) would be read as **`BOOTLOADER`**.
Lengths 1, 2, 7 and 14 would become SUBSCRIBE, WRITE, UNSUBSCRIBE and EXTENDED.
Choose the protocol by product id and never fall back from one to the other.

---

## Transport (HARDWARE)

| | |
|---|---|
| VID / PID | `0x213C` / **`0x0003`**, product string "iFIT-LargeX" |
| Interface | 0, **class `0xFF` (vendor-specific)**, not HID. There is no HID report descriptor |
| IN endpoint | `0x81`, interrupt, 64 bytes, interval 1 |
| OUT endpoint | **`0x01`**, interrupt, 64 bytes, interval 1 |
| Access | An ordinary app can claim it through `UsbManager`, with no root needed. iFit's `com.ifit.glassos_service` holds it while it runs, and it restarts itself after a force-stop. Disable it to free the board |

The console software also accepts PIDs 4 and 6 as FitPro 2 variants (an FTDI
bridge and "Stannite") (CODE). Only PID 3 has been seen.

**One USB packet carries one message** (CODE). There is no reassembly on this
channel. Long data, such as the feature list, arrives as several complete
messages and ends with an empty one (HARDWARE). Writes are the length of the
frame and are not padded to 64 bytes (CODE).

**The board waits to be spoken to.** Nothing arrived before the first request
(HARDWARE).

---

## Frame format

```
[0]   channel       0x02 = FitPro 2
[1]   source|type   high nibble = sender, low nibble = message type
[2]   payload length
[3…]  payload
```

- **No checksum** and **no sequence number** (CODE, and consistent with
  HARDWARE).
- **Feature ids** are UInt16 little-endian. **Values** are always IEEE-754
  float32 little-endian, whatever their meaning, so ints, bools and enums are
  sent as floats (CODE).
- Sender nibble: `0x0_` app (us), `0x1_` the board, `0x2_` / `0x3_` other
  controllers (CODE; `0x1_` is HARDWARE).
- iFit's own requests carry **one extra trailing `0x00`** after the payload,
  except `SUPPORTED_FEATURES`. Nothing is ever written into that byte, so it
  isn't a checksum. Copying it is the cautious choice (CODE). The board also
  tolerated frames with stray extra bytes (HARDWARE).

### Channels: byte 0 (CODE)

| Byte 0 | Channel | |
|---|---|---|
| `0x01` | File system | **never send** |
| **`0x02`** | **FitPro 2** | the only one STRIDE needs |
| `0x03` | ANT+ | |
| `0x05` | Memfault (crash reporting) | |
| `0x06` | **Firmware update** | **never send**. Its "hello" opens the update protocol |

---

## Message types

### Requests (app → board), low nibble of byte 1 (CODE)

| Type | Name | Payload |
|---|---|---|
| `0x1` | `SUBSCRIBE` | n × UInt16 feature id (iFit sends batches of 8) |
| `0x2` | `WRITE` | UInt16 feature id + float32 value (6 bytes) |
| `0x6` | `SUPPORTED_FEATURES` | none |
| `0x7` | `UNSUBSCRIBE` | n × UInt16 feature id |
| `0x9` | ⚠️ `BOOTLOADER` | **never send** |
| `0xE` | `EXTENDED` | 1 byte info type + data. Info type 2 = product info |

Every other type number is undefined. The board rejects one with error 6
(HARDWARE).

### Responses (board → app)

| Byte 1 | Name | Payload | |
|---|---|---|---|
| `0x11` | `FEATURES` | n × UInt16 feature id, **empty = end of list** | HARDWARE |
| `0x13` | `ACKNOWLEDGE` | the source/type byte being acknowledged | CODE |
| `0x14` | `ERROR` | `[request byte] [error code] [details…]` | HARDWARE |
| `0x15` | `EVENT` | UInt16 feature id + float32 value | CODE |
| `0x1E` | `EXTENDED` | `[info type] [data…]` | CODE |

### Error codes (CODE; code 6 HARDWARE)

| Code | Meaning | Details |
|---|---|---|
| 2 | framing | |
| 3 | features not supported | feature ids |
| 4 | write not supported | feature id |
| 5 | data out of range | feature id + rejected float |
| **6** | **request not supported** | none |
| 7 | write value not allowed | feature id (+ float) |

Example (HARDWARE): `02 14 02 04 06` means "error: request byte `0x04` (app,
type 4) is not a request, code 6".

---

## Session start-up

iFit's main start-up routine didn't decompile cleanly, so the **order** is
INFERRED from a sibling device that uses the same stack:

1. **Product info.** Send `02 0E 01 02 00`. The board answers with
   `EXTENDED` frames, `02 1E <len> 02 <item> <ASCII…>`, ending with item 0
   (CODE). Items: 1 software version, 2 software part number, 3 hardware part
   number, 4 model, 5 serial, 6 display type, 9 motor controller version,
   13 product serial, 20 motor controller type.
2. **Supported features.** Send `02 06 00`. The board answers with `02 11 …`
   chunks of up to 8 ids and then an empty `02 11 00`. **It then repeats the
   list** (HARDWARE). iFit tolerates the repeats.
3. **Subscribe** to what you need, 8 ids per request. The board answers with one
   `EVENT` per id holding its current value. After that it pushes `EVENT`s
   without being asked, and there is no polling (CODE).
4. iFit then writes `HEART_BEAT_INTERVAL` (161) = 720 once (CODE). The unit,
   and what the board does without it, are **unknown**.

**No security or unlock step.** FitPro 1's `VerifySecurity` has no FitPro 2
equivalent (CODE). The only challenge/response is ANT+ radio licensing, which
happens only if the board advertises feature 170. The board seen so far
doesn't.

A write counts as accepted when `ACKNOWLEDGE` or an `EVENT` for the same id
comes back. It is refused on `ERROR` (CODE). iFit waits up to 15 s and retries
3 times over USB (CODE).

---

## Feature ids

The board lists its own ids in step 2. The Gen 7 incline trainer seen so far
(HARDWARE) advertised these 61. Names are iFit's (CODE). "RW" is INFERRED from
a read-only flag in iFit's table. The board's own `WRITE_NOT_SUPPORTED` reply is
the authority.

| Id | Hex | Name | Notes | RW |
|---|---|---|---|---|
| 10 | `000A` | `DEVICE_TYPE` | 4 treadmill, 5 incline trainer | R |
| **102** | `0066` | **`SYSTEM_MODE`** | 0 boot, 1 idle, **2 DMK = safety key out**, 3 workout, 4 maintenance, 5 error | **never write** |
| 103 | `0067` | `IDLE_SYSTEM_MODE_LOCK` | bool, a lock-out flag | avoid |
| 105 / 106 | `0069` / `006A` | `USER_WEIGHT_KG` / `MAX_USER_WEIGHT_KG` | kg | W / R |
| 109 | `006D` | `KEY_COOKED` | physical keys: 1 STOP, 2 START, 3/4 speed ±, 5/6 incline ± … | R |
| 111 | `006F` | `VOLUME_PERCENT` | | W |
| 113 / 114 | `0071` / `0072` | total in-use time / time since start-up | s | R |
| 129 | `0081` | `FAN_STATE` | enum | W |
| 140 | `008C` | `DISPLAY_UNITS` | bool, polarity unknown | W |
| 150 | `0096` | `KEY_ARRAY_1` | | R |
| 161 | `00A1` | `HEART_BEAT_INTERVAL` | iFit writes 720. Unit unknown | avoid |
| 202–205 | `00CA`–`00CD` | current / warm-up / running / cool-down calories | kcal? | R |
| 222 | `00DE` | `PULSE` | bpm | R (W?) |
| 223 | `00DF` | `PULSE_SOURCE` | 0 none, 1 hand … 6 BLE | R |
| 227 / 228 | `00E3` / `00E4` | average / max pulse | bpm | R |
| 252–256 | `00FC`–`0100` | distance (current, warm-up, running, cool-down, machine total) | **units unknown** | R |
| 265 / 266 | `0109` / `010A` | belt total hours / metres | | R |
| 267 | `010B` | `BELT_REPLACED` | | **never write** |
| **301** | `012D` | **`TARGET_KPH`** | km/h | **W** |
| **302** | `012E` | **`CURRENT_KPH`** | km/h | R |
| 303 / 304 | `012F` / `0130` | `MIN_KPH` / `MAX_KPH` | km/h | R |
| 307 / 308 | `0133` / `0134` | average / workout max km/h | | R |
| **401** | `0191` | **`TARGET_GRADE_PERCENT`** | % | **W** |
| **402** | `0192` | **`CURRENT_GRADE_PERCENT`** | % | R |
| 403 / 404 | `0193` / `0194` | `MIN_GRADE_PERCENT` / `MAX_GRADE_PERCENT` | % | R |
| 407 / 408 | `0197` / `0198` | average / workout max grade | % | R |
| 411 / 412 | `019B` / `019C` | vertical metres net / gain | m | R |
| 415 | `019F` | `CALIBRATE_GRADE` | runs the lift through calibration | **never write** |
| 416 | `01A0` | `GRADE_FEEDBACK_RANGE` | | R |
| **602** | `025A` | **`WORKOUT_STATE`** | 0 none, 1 ready to start, 2 warm-up, **3 running**, 4 cool-down, **5 paused**, 6 results, 7 off machine | **W** |
| 603–605 | `025B`–`025D` | warm-up / **running (elapsed)** / cool-down time | s | R |
| 610 | `0262` | `GOAL_TIME` | s | W |
| 615–625 | `0267`–`0271` | warm-up / cool-down / results / pause timeouts and count-downs | s? | W? |
| 2108 | `083C` | `CONTROLLER_ERROR` | | R |
| 2132 / 2133 | `0854` / `0855` | controller comms success / retry rate | | R |

### Doing things

| To | |
|---|---|
| Read speed, incline | subscribe to 302, 402 |
| Know the limits | subscribe to 303, 304, 403, 404 |
| Detect the safety key | `SYSTEM_MODE` (102) = 2. iFit maps this to "safety key removed" (CODE) |
| See physical keys | `KEY_COOKED` (109) |
| Set target speed / incline | write 301 / 401 |
| Start, pause, end | write `WORKOUT_STATE` (602): 3 running, 5 paused, 6 results, 0 none. The board reports 1 when the user presses Start (CODE) |

**Not yet known:** whether `PAUSED` stops the belt (INFERRED yes), whether the
board stops the belt when the host goes quiet, and the units of distance and
calories. iFit seems to refuse target speeds below 0.5 km/h rather than stop by
writing 0 (INFERRED, from a garbled part of the decompile).

---

## Worked examples

No checksum anywhere. The trailing `00` is iFit's padding.

**Product info:** `02 0E 01 02 00`

**Supported features:** `02 06 00`

**Subscribe to current speed and current incline:**

```
02 01 04 2E 01 92 01 00
      │  └───┘ └───┘
      │  302   402
      └ 4 payload bytes
```

Replies, one `EVENT` per id, for example `02 15 06 2E 01 00 00 A0 40`, which is
`CURRENT_KPH` = 5.0 (float `0x40A00000`).

**Set target incline to 2.0 %:** (not yet tried on hardware)

```
02 02 06 91 01 00 00 00 40 00
      │  └───┘ └─────────┘
      │  401   2.0f
      └ 6 payload bytes
```

Expect `02 13 01 02` (ACK) and/or an `EVENT` for 401. A value out of range comes
back as `02 14 08 02 05 91 01 <float>`.

---

## Never send

So that a protocol layer can refuse these outright:

1. **Any FitPro 1 frame.** See the top of this page.
2. **Any byte 0 other than `0x02`**, in particular `0x01` (file system) and
   `0x06` (firmware update).
3. **Request type `0x9` (`BOOTLOADER`)** or any undefined type.
4. **`EXTENDED`** with any info type other than 2 (product info) or 3 (heart-rate
   monitor list).
5. **`WRITE`** to `SYSTEM_MODE` 102, `CALIBRATE_GRADE` 415, `BELT_REPLACED`
   267, motor-replaced and calibrate-motor flags, activation, disconnect,
   update-related flags, ANT licence, any raw drive/incline/resistance motor or
   throttle parameter (2301–2514, 701–725), and, until understood,
   `IDLE_SYSTEM_MODE_LOCK` 103 and `HEART_BEAT_INTERVAL` 161.

Writes to 301, 401 and 602 are legitimate but **move the machine**. Make them
only with someone at the treadmill, the safety key on, and STOP in reach.

---

## Over Bluetooth too

The same framing appears to be used over BLE on some iFit equipment (INFERRED
from the transport-independent design). The board described here was reached
over USB.
