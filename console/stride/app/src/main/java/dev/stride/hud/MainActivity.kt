package dev.stride.hud

import android.annotation.SuppressLint
import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONArray
import org.json.JSONObject
import kotlin.concurrent.thread

/**
 * STRIDE HUD.
 *
 * Kotlin owns the treadmill (USB + FitPro) and the workout session; the
 * UI is an HTML page in a WebView so it can be designed and iterated in a
 * browser. State is pushed to JS at poll rate; button presses come back over
 * the `Stride` bridge.
 *
 * The physical safety key remains the stop of record.
 */
class MainActivity : Activity() {

    companion object {
        const val TAG = FitProConnection.TAG
        const val ACTION_USB_PERMISSION = "dev.stride.hud.USB_PERMISSION"
        const val POLL_MS = 200L

        /** Request code for the location permission a BLE scan needs. */
        const val SCAN_PERMISSION = 1

        /** How long to wait before answering a securityBlock again. The board
         *  can refuse for a moment while it settles; hammering VerifySecurity
         *  at 5 Hz would be its own kind of denial of service. */
        const val UNLOCK_RETRY_MS = 2000L

        /** How long our own write owns the target before the board's echo is
         *  believed again. Six polls — comfortably longer than the board takes
         *  to reflect a write, short enough that a physical press still feels
         *  immediate. */
        const val FOLLOW_SETTLE_MS = 1200L

        /**
         * How long the setpoint must have been still before a shortfall counts
         * as the belt failing rather than the belt on its way somewhere.
         *
         * The board ramps to a new speed over several seconds, during which the
         * odometer is honestly and correctly below the setpoint. Without this,
         * every press of + would be filed as a slip.
         */
        const val SLIP_SETTLE_MS = 8_000L

        /** Shortest shortfall worth a line in the incident record. Below this
         *  it is the estimator's own noise, which is what the wide band on
         *  Snapshot.slipping already allows for. */
        const val SLIP_MIN_MS = 3_000L

        /** The grid the speed keys move on. An adopted value snaps to it, so a
         *  board reporting 6.499 cannot render as 6.4 and then take two presses
         *  to reach 6.5. Grade is deliberately not quantised — its step size is
         *  not settled here and incline is not what was reported broken. */
        const val KPH_STEP = 0.1

        /**
         * What a session is called, now that there is only one kind.
         *
         * Was "run" or "run", chosen on a screen of its own. The distinction
         * bought a word and cost a tap, and the ceiling it advertised — 6.5 km/h
         * against 19 — was never enforced anywhere: both clamp to the board's
         * own MIN_KPH/MAX_KPH. Deriving it from pace instead would be a guess,
         * because 7-8 km/h is a run for some people and a jog for the same
         * person on a different day. The console does not know, so it does not
         * say. Sessions recorded before 2026-09-07 still read "run"; nothing
         * rewrites them.
         */
        const val WORKOUT = "workout"

        /**
         * How far the wall clock may disagree with the monotonic clock before
         * it counts as having been corrected rather than merely drifting.
         *
         * NTP moves this board by *sixteen years*, so anything in the region of
         * a minute separates the two cases with room to spare. Small enough to
         * catch an ordinary time-zone correction too; large enough that normal
         * clock skew over a 40-minute run never trips it.
         */
        const val CLOCK_JUMP_MS = 60_000L

        /**
         * Before this, a date is the board's boot clock rather than a date.
         *
         * 2024-01-01. The console cannot have recorded a run before it was
         * built, so anything earlier is the 2010 epoch this board comes up on —
         * whatever year it happens to claim.
         */
        const val SANE_EPOCH_MS = 1_704_067_200_000L

        /**
         * Longer than this between two live pulse readings and the seconds in
         * between are credited to no zone.
         *
         * The strap reports about once a second; four seconds is a dropout, and
         * on 17 August 2026 one lasted from the end of the run until the strap
         * was taken off entirely. Time nobody was measured is not time in a zone.
         */
        const val ZONE_MAX_GAP_MS = 4_000L

        /** Fan is polled on its own exchange, not folded into TELEMETRY —
         *  see [readFan]. */
        const val FAN_EVERY_MS = 1000L

        /** How many times to command the fan off before letting it go. On a
         *  board that will not report fan state there is nothing to confirm
         *  against, so this cannot be "until it agrees" the way levelling is. */
        const val FAN_OFF_NAGS = 25

        /** How many consecutive rejections before a queued write is abandoned.
         *
         *  This is a responsiveness number, not just a safety valve. PAUSE and
         *  STOP are queued writes, so however long we keep retrying is how long
         *  the console feels unresponsive when the board is refusing — the
         *  first attempt at fifty tries meant ten seconds of nothing happening
         *  after a tap, which read as broken rather than busy.
         *
         *  Fifteen is three seconds: still far more than the "one dropped frame
         *  must not spend a command" rule needs, and short enough that a
         *  refusal surfaces while the person is still looking at the button. */
        const val WRITE_TRIES = 15

        /**
         * How long the board may say nothing before it counts as not answering.
         *
         * Distinct from a refused frame, which is the board talking. Silence is
         * either the machine asleep — see [FitPro.Mode.SLEEP] — or the board
         * gone from the USB bus, and the second of those is only ever fixed by
         * a new connection.
         */
        const val SILENCE_MS = 5_000L
        /** How long a FitPro 2 belt gets to coast to a halt after a stop. */
        const val FP2_STOP_SETTLE_MS = 6_000L
        /** Poll loop silent this long mid-workout: release the board. See watchdog(). */
        const val WATCHDOG_MS = 3_000L

        /** How long to leave between two attempts at rebuilding the transport.
         *  Nothing about a silent board is urgent enough to retry at poll rate. */
        const val REACQUIRE_MS = 5_000L

        /**
         * How long a wake is given before it is called a failure.
         *
         * Long enough for a reacquire and a mode write to land at 5 Hz, short
         * enough that somebody standing in front of a dark machine at 6am gets
         * a straight answer rather than a spinner.
         */
        const val WAKE_WAIT_MS = 8_000L

        /**
         * The interface: one document, built from console/stride/frontend in
         * the TrailMate theme. It implements the page's entry points —
         * `window.render(state)`, `window.plan(p)`, `window.stopPressed()` — and
         * Kotlin never needs to know more about it than this address.
         *
         * There used to be a choice of interfaces, saved under the "ui" pref
         * and switchable from Settings. It went on 12 October 2026;
         * a stale "ui" pref on an upgraded console is simply never read.
         */
        const val UI_URL = "file:///android_asset/ui/trailmate.html"

        /** The launch screen's field colour, painted behind the page. */
        const val FIELD = 0xFF100F0E.toInt()

        const val PREFS = "stride"
        /** Debug builds: run against SimBoard instead of the USB board. */
        const val PREF_SIM = "sim"

        /** How briskly a ramp winds the belt up. */
        const val RAMP_KPH_PER_SEC = 1.0

        /**
         * How briskly the belt is allowed to wind *down* to a standstill.
         *
         * The first full guided run ended by cutting the belt from 4.2 km/h to
         * zero the instant the plan expired, which was enough to catch someone
         * off guard — at a run it would have been enough to put them on the
         * floor. Every automatic finish now decelerates instead. Quick, but not
         * sudden: 2 km/h per second brings a brisk run to a stop in about two
         * seconds and a hard run in five.
         *
         * The STOP button has its own, brisker one — see [STOP_DECEL_KPH_PER_SEC].
         */
        const val DECEL_KPH_PER_SEC = 2.0

        /**
         * The STOP button, above a running pace.
         *
         * STOP used to hand the board a bare {KPH 0, PAUSE}, which is the
         * machine's own rapid stop. At a run that is exactly right: somebody
         * reaching for STOP wants the belt to stop, now. Above about 6 km/h it
         * is enough to pitch you forward — reported on 2026-08-10 after a
         * stumble.
         *
         * So a stop from a run sheds the speed a run cannot absorb first, and
         * hands over to that same rapid stop once the belt is down to
         * [STOP_EASE_ABOVE_KPH] — the speed it is already fine from. Below that
         * threshold nothing changes at all.
         *
         * **The rate is set by what pressing STOP means.** It is a decision,
         * not a stumble: unlike the safety key, the person has chosen this and
         * is braced for it, so easing must not read as the console dithering.
         * At 6 km/h per second the belt is off the top of its range in about a
         * second and into the ordinary stop — quick enough to feel answered,
         * gradual enough not to throw anyone forward. Raised from 3.0 on
         * 2026-08-10: the first rate on real legs was safe and slow.
         *
         *     from 12 km/h   1.0 s of easing, then the stop
         *     from 10 km/h   0.8 s
         *     from  8 km/h   0.4 s
         *
         * Three times [DECEL_KPH_PER_SEC], which is the same trade seen from
         * the other end: a plan running out has not asked for anything, so it
         * gets the gentler wind-down and the whole way to a standstill.
         */
        const val STOP_DECEL_KPH_PER_SEC = 6.0
        const val STOP_EASE_ABOVE_KPH = 6.0

        /**
         * How long a wind-down may hold [enforceStopped] off.
         *
         * A wind-down is the stop being carried out, so the safety net stands
         * aside while one is in flight — but not indefinitely. Every wind-down
         * only ever takes speed off and reaches its floor within a few seconds,
         * so anything still running after this has stuck, and the net wins.
         */
        const val WIND_DOWN_MAX_MS = 10_000L

        /**
         * Below this the belt counts as stopped. Not zero: the board reports
         * small non-zero speeds while the belt coasts to rest, and demanding
         * an exact zero would nag forever.
         */
        const val STOPPED_KPH = 0.3

        /**
         * Metres the odometer must advance before an idle belt counts as moving.
         *
         * Distance is whole metres, so one of them can appear at the boundary of
         * a run that has just ended. Two cannot arrive on a belt that is
         * standing still — nothing fabricates metres.
         */
        const val IDLE_ODO_METRES = 2.0

        /**
         * No odometer movement at all for this long, and the idle belt really is
         * stopped. Only ever consulted when *nothing* has moved: a belt crawling
         * too slowly to have covered [IDLE_ODO_METRES] yet keeps its anchor, so
         * a slow runaway is still caught, however long it takes to prove.
         */
        const val IDLE_STILL_MS = 4000L

        /** Close enough to level to stop asking. The deck reports whole percent. */
        const val LEVEL_GRADE = 0.5

        /* ---- the speed readout ------------------------------------------
         *
         * See [beltSpeed]. The board will not tell us the belt speed, so it is
         * estimated from two things that disagree in useful ways: what the belt
         * was told to do, which is instant but may be a lie, and the odometer,
         * which is the truth but arrives in whole metres and several seconds
         * late. These are the weights on that trade.
         */

        /** How fast the model lets the belt gain and shed speed, km/h per
         *  second. Deliberately a little *under* what the machine can do: a
         *  readout that arrives slightly behind climbs smoothly, and one that
         *  arrives ahead has to come back down, which is a wobble. */
        const val BELT_UP_KPH_PER_SEC = 1.2
        const val BELT_DOWN_KPH_PER_SEC = 2.5

        /** How much of the odometer's disagreement is taken back per poll —
         *  into where the model thinks it is, and into how fast it thinks it is
         *  going. The second is small on purpose: it is an integrator, and it
         *  is the only thing that can outvote the commanded pace. */
        const val TRIM_POSITION = 0.15
        const val TRIM_SPEED = 0.006

        /** Whole metres at 6 km/h is a sawtooth with a 0.6 s period. Nothing
         *  about a belt changes that fast, so the disagreement is smoothed
         *  before it is allowed to move the number on screen. Without this the
         *  last digit flickers about half of every second. */
        const val TRIM_SMOOTH = 0.15

        /** A disagreement smaller than this is measurement noise or belt
         *  calibration, not news, and it bleeds away at [TRIM_SETTLE_PER_SEC]
         *  so a steady pace reads as the pace that was asked for.
         *
         *  This is the old settle band, kept as a decision but moved: it used
         *  to switch the whole readout over to the target once it came close,
         *  which is why leaving it looked like a jump. Now it pulls the
         *  *correction* to nothing, so arriving and leaving are both smooth,
         *  and a belt that is genuinely a long way off still says so. */
        const val TRIM_SETTLE_KPH = 0.35
        const val TRIM_SETTLE_PER_SEC = 0.10

        /** The correction is bounded, so one wild odometer frame cannot run the
         *  readout away from the machine. */
        const val TRIM_MAX_KPH = 4.0

        /**
         * How close the model must be to the commanded pace before the odometer
         * is allowed to correct it at all.
         *
         * Wider than one step of the model's own ramp (BELT_UP_KPH_PER_SEC at
         * POLL_MS is 0.24 km/h), so "arrived" is not a state it can skip over
         * between two polls, and far below the smallest change anyone can ask
         * for by hand. See beltSpeed() for what this protects against.
         */
        const val TRIM_ARRIVED_KPH = 0.30

        /* ---- belt calibration — see BeltCalibration and calTick ---------- */

        /** After the belt changes speed, the pod is ignored for this long: the
         *  belt is still getting there, and so is the stride on it. */
        const val CAL_SETTLE_MS = 6_000L
        /** The pod is averaged over this much of the most recent running. A
         *  single reading moves with every footfall; this does not. */
        const val CAL_WINDOW_MS = 20_000L
        /** Seconds of steady readings before "Use Stryd reading" will act. */
        const val CAL_READY_SECS = 10.0
        /** The echo of what we sent, within the board's rounding. */
        const val ECHO_KPH = 0.03

        /** The treadmill's incline keys, a step the same as the rail's. */
        const val INCLINE_KEY_STEP = 0.5

        /** How often the board is read in standby. Slow, but not stopped:
         *  see enterStandby. */
        const val STANDBY_POLL_MS = 2_000L
        const val KM_PER_MILE = 1.609344

        /**
         * Fallbacks only. The live values are in [Settings] — warm-up length,
         * cool-down length and warm-up speed are all set on the console now,
         * and these are what a fresh install starts from.
         */
        const val WARMUP_KPH = 2.0
        const val WARMUP_MS = 2 * 60 * 1000L
        const val COOLDOWN_MS = 2 * 60 * 1000L

        /** Longer than this between polls and the estimator re-seeds rather
         *  than integrating across a gap it knows nothing about. */
        const val MAX_STEP_MS = 2000L

        /**
         * How fast a guided run is allowed to move the deck.
         *
         * One percent at a time, no more often than every three seconds, so the
         * biggest jump a plan asks for — flat to nine percent — takes about half
         * a minute to arrive rather than landing under someone mid-stride.
         */
        const val INCLINE_STEP = 1.0
        const val INCLINE_EVERY_MS = 3000L


        val TELEMETRY = listOf(
            FitPro.Field.ACTUAL_KPH,
            FitPro.Field.ACTUAL_INCLINE,
            FitPro.Field.WORKOUT_MODE,
            FitPro.Field.DISTANCE,
            FitPro.Field.CURRENT_TIME,
            FitPro.Field.PULSE,
            FitPro.Field.CALORIES,
            // Read on the chance it is a different sensor from DISTANCE — see
            // Snapshot.rpm. It has only ever been asked for by probeSpeed(),
            // which runs once per app start and had already rolled out of the
            // buffer every time anyone went looking. Reading it every poll is
            // how we find out what it does over a whole run.
            FitPro.Field.RPM,
        )
        val LIMITS = listOf(
            FitPro.Field.MIN_KPH, FitPro.Field.MAX_KPH,
            FitPro.Field.MIN_GRADE, FitPro.Field.MAX_GRADE,
        )
        /** Kept out of TELEMETRY on purpose — see [readFan]. */
        val FAN_READ = listOf(FitPro.Field.FAN_STATE)

        /** The board's own idle timer, read once at startup — see [readSleepConfig]. */
        val SLEEP_FIELDS = listOf(
            FitPro.Field.IDLE_TIMEOUT,
            FitPro.Field.IDLE_MODE_LOCKOUT,
            FitPro.Field.SLEEP_TIMER_STATE,
        )

        /** KPH/GRADE are the board's *targets* — read so physical buttons don't desync us. */
        val READS = listOf(FitPro.Field.KPH, FitPro.Field.GRADE) + TELEMETRY

        /** Candidate sources for a real belt speed — see probeSpeed(). */
        val SPEED_PROBE = listOf(FitPro.Field.RPM, FitPro.Field.ACTUAL_KPH)
    }

    private lateinit var web: WebView

    private val prefs by lazy { getSharedPreferences(PREFS, Context.MODE_PRIVATE) }

    private val conn by lazy { FitProConnection(this) }
    private val cfg by lazy { Settings(this) }
    /* The strap hunt is held off while an FTMS client is subscribed: this
       console's radio cannot scan as a central and hold a peripheral link at
       the same time. See HeartRate.seek. */
    private val strap by lazy { HeartRate(this) { ftms.listeners > 0 } }
    /** A Stryd or other foot pod: cadence, power, stride. Held off the same way. */
    private val pod by lazy { Footpod(this) { ftms.listeners > 0 } }
    /** Bluetooth headphones, for the apps played over a run. Classic Bluetooth, not BLE. */
    private val phones by lazy { Headphones(this) }
    /** The scan the location-permission dialog interrupted. */
    @Volatile private var scanAfterPermission: (() -> Unit)? = null
    /** The treadmill as a standard Bluetooth fitness machine, for Zwift and
     *  friends. Telemetry only, and silent on a radio that cannot advertise. */
    private val ftms by lazy { Ftms(this) }

    @Volatile private var running = false
    @Volatile private var deviceId: Byte = FitPro.Dev.TREADMILL
    /** Set when the board is a Gen 7 (FitPro 2). Null means FitPro 1. */
    @Volatile private var fp2: FitPro2Board? = null
    /** When a stop was last queued for a FitPro 2 board. See enforceStopped. */
    private var fp2StopAt = 0L
    @Volatile private var targetKph = 0.0
    @Volatile private var targetGrade = 0.0

    /**
     * How this belt really runs, measured against a foot pod. [targetKph] and
     * everything else on the console is true speed; only what is written to
     * the board goes through this, in [toBoard]. Replaced whole, never edited.
     */
    @Volatile private var calib = BeltCalibration(emptyList())
    /** The speed the board was last sent, after [calib]. Its echo of this is
     *  ours; anything else in that field came from the machine's own keys. */
    @Volatile private var sentBeltKph = 0.0
    /** True metres per odometer metre at the speed last sent — see [trueOdometer]. */
    private var odoScale = 1.0
    private var odoRawLast = -1.0
    private var odoTrue = 0.0

    /* ---- a calibration in progress — see calTick ---- */
    @Volatile private var calOn = false
    /** The true speed being calibrated, and what the board is sent for it. */
    @Volatile private var calKph = 0.0
    @Volatile private var calBelt = 0.0
    @Volatile private var calNote = ""
    /** When the belt last changed speed. The pod is not listened to until it has settled. */
    @Volatile private var calChangedAt = 0L
    /** Recent pod readings, (elapsedRealtime, km/h). Poll thread only. */
    private val calPod = ArrayDeque<Pair<Long, Double>>()
    @Volatile private var calPodKph = 0.0
    @Volatile private var calPodSecs = 0.0
    @Volatile private var fanState = 0
    @Volatile private var pendingWrite: Map<FitPro.Field, Double>? = null

    /** True while the board is refusing traffic pending VerifySecurity. The
     *  HUD shows this rather than sitting silently unable to act. */
    @Volatile private var boardLocked = false
    private var unlockAttempts = 0
    private var lastUnlockMs = 0L

    /** When the board last said anything at all — a refusal counts, silence
     *  does not. See [boardAwake] and the null branch of [pollLoop]. */
    @Volatile private var lastReplyMs = 0L
    @Volatile private var lastReacquireMs = 0L

    /** When somebody last asked for the machine to be woken, or 0 if nobody
     *  has since it was last awake. See [wakeState]. */
    @Volatile private var wakeAskedAt = 0L

    /** When we last wrote a target. Until this settles, our value outranks the
     *  board's echo of it — see the follow block in [pollLoop]. */
    private var lastWriteMs = 0L
    private var sinceFan = 0L
    private var fanStopping = false
    private var fanOffNags = 0

    /** Consecutive rejections of the same queued write, and the last snapshot
     *  that came off a good frame — what the HUD keeps showing while the board
     *  is refusing. */
    private var writeTries = 0
    @Volatile private var lastSnap: Snapshot? = null
    /** Null until the board has answered a fan read once. Stays null on a board
     *  that does not report fan state, and the HUD keeps its local value. */
    private var fanReadable: Boolean? = null

    /** Snap to a step grid, killing float drift like 6.500000000000001. */
    private fun quantise(v: Double, step: Double) = Math.round(v / step) * step

    /**
     * Average pace for the session, km/h, from distance over time.
     *
     * Both numbers are counters the board keeps, so this is measured rather than
     * estimated — unlike the old average, which was the mean of the odometer
     * estimator's per-poll output and therefore carried all of that estimator's
     * drift into the summary screen.
     */
    private fun avgPace(): Double {
        val secs = elapsedSec()
        return if (secs > 1.0) sessionDistance / secs * 3.6 else 0.0
    }

    /**
     * Which zone a share of maximum heart rate falls in, 0-5.
     *
     * The usual five-zone split on percentage of maximum. Zone 0 is everything
     * below 50%, which is standing about rather than a training zone, and is
     * counted separately so it cannot inflate zone 1.
     */
    private fun zoneIndex(share: Double): Int = when {
        share < 0.50 -> 0
        share < 0.60 -> 1
        share < 0.70 -> 2
        share < 0.80 -> 3
        share < 0.90 -> 4
        else -> 5
    }

    /** Pace at the moment of pausing, and the speed the resume ramp is climbing
     *  towards. Zero for either means no ramp is in progress. */
    @Volatile private var pausedKph = 0.0
    @Volatile private var rampTo = 0.0
    /** "warmup", "resuming" or "cooldown" while a ramp is in flight. */
    @Volatile private var rampReason = ""

    /** Deadline for a timed phase (warm-up / cool-down), on the elapsedRealtime clock. */
    @Volatile private var phaseEndsAt = 0L

    // --- session (ours, not the board's) ------------------------------------
    @Volatile private var session = Session.WELCOME
    @Volatile private var workout = "none"
    @Volatile private var dmk = false

    /**
     * Whose run this is. Set from the welcome screen, defaulting to whoever
     * Settings names — which is nobody on a fresh install, so the screen asks.
     */
    @Volatile private var runner = ""

    /**
     * The current runner's maximum heart rate, or 0 if they have not given an
     * age. Cached rather than looked up per frame: reading it means parsing the
     * whole person list out of JSON in SharedPreferences, and the poll loop
     * builds a Snapshot five times a second. Refreshed wherever [runner] is
     * set, which is the only thing that can change the answer mid-run.
     */
    @Volatile private var runnerHrMax = 0

    private fun refreshRunnerHrMax() {
        runnerHrMax = cfg.person(runner)?.maxPulse ?: 0
    }

    // --- guided run ---------------------------------------------------------
    /** Empty on a casual run. Set once at START and never rewritten mid-run. */
    @Volatile private var planName = ""
    /**
     * The route being run, if this is a route rather than a workout.
     *
     * Held alongside `planSteps` rather than replacing it: the HUD's sparkline
     * and segment counter read the steps, so a route fills both — the steps for
     * anything that wants to draw the ground, and this for the thing that
     * decides which part of it you are standing on.
     */
    @Volatile private var route: Route? = null

    @Volatile private var planSteps: List<Plan.Step> = emptyList()
    @Volatile private var stepIndex = -1

    /** Where the run is on the plan's drawn profile: metres on a route, seconds on a workout. */
    @Volatile private var planElapsed = 0.0

    /** A TrailMate workout or Manual → Heart rate run under way (spec 038). See WorkoutRunner. */
    @Volatile private var workoutRunner: WorkoutRunner? = null
    /** The runner's zones for it, and what the run screen was last told about it. */
    private var workoutZones = Zones.NONE
    @Volatile private var workoutView: WorkoutView? = null

    /**
     * Cleared the moment he touches INCLINE, and only restored at the next
     * segment. A plan that argues with the person on the treadmill about the
     * hill they are standing on is a plan that feels possessed.
     */
    @Volatile private var inclineAuto = false
    private var lastInclineMoveAt = 0L

    /** Last speed the *board* reported, as opposed to what we asked for. */
    @Volatile private var lastActualKph = 0.0
    /** The grade the board last reported, for enforceLevel. */
    @Volatile private var lastActualGrade = 0.0

    /**
     * How fast the belt is turning while no workout is running, from the
     * odometer. See [idleBeltSpeed] — this is what [enforceStopped] actually
     * runs on, because [lastActualKph] is zero on this board at every speed.
     */
    @Volatile private var idleBeltKph = 0.0
    /** Odometer anchor for [idleBeltSpeed]; negative means "not anchored yet". */
    private var idleOdoMetres = -1.0
    private var idleOdoAt = 0L

    /** How many times we have had to re-command a stop. Reset when it takes. */
    @Volatile private var stopNags = 0

    /** Uptime at which the current runaway was first seen. */
    private var runawayAtUptime = 0L
    private var runawayPeakKph = 0.0

    /** Uptime the current shortfall began at; 0 when the belt is keeping up. */
    private var slipSince = 0L
    /** Worst shortfall in the current episode, km/h, and the setpoint it was
     *  measured against. */
    private var slipWorst = 0.0
    private var slipTarget = 0.0
    /** Last setpoint seen and when it moved — see [SLIP_SETTLE_MS]. */
    private var slipLastTarget = -1.0
    private var slipTargetChangedAt = 0L

    /**
     * Write one line to the console's own incident record.
     *
     * Not Log.w. Logcat on this console holds roughly a day and had already
     * rolled past the start of the 2026-08-28 runaway by the time anyone
     * looked — the whole reason that morning has no answer. This file is small,
     * append-only, and survives both the buffer and a reboot.
     *
     * The clock is stamped as well as the uptime because this board boots at
     * 2010-01-01 and only jumps to the real time once the network is up. A line
     * claiming 2010 is not a broken record; it is a runaway that began before
     * NTP landed, and the uptime is what orders it.
     */
    private fun recordIncident(line: String) {
        try {
            val f = java.io.File(filesDir, "incidents.log")
            // Keep it bounded. This should be a handful of lines a year, and a
            // file that can grow without limit on a device nobody logs into is
            // its own bug.
            if (f.length() > 64 * 1024) f.delete()
            val when_ = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.US)
                .format(java.util.Date())
            f.appendText("$when_ (up ${SystemClock.elapsedRealtime() / 1000}s) $line\n")
        } catch (e: Exception) {
            Log.w(TAG, "could not write incident record: ${e.message}")
        }
    }
    /**
     * Watch for the belt running short of the pace it was told to hold, and
     * write one line per episode to the incident record.
     *
     * Edge-triggered rather than per-poll: an episode is a start, a worst
     * point and an end, and five polls a second of "still short" is not a
     * record, it is a flood. Nothing here stops or corrects anything — a belt
     * that cannot reach its pace is a maintenance question, not a safety one,
     * and the runner can already feel it. This exists so that the next time it
     * happens there is something to read afterwards, which on 8 September 2026
     * there was not.
     *
     * Be clear about what this can and cannot see: it compares the setpoint
     * against the odometer, and the odometer counts the drive roller. A belt
     * slipping *over* that roller moves neither number. See Snapshot.slipping.
     */
    private fun watchSlip(s: Snapshot) {
        val now = SystemClock.elapsedRealtime()

        // A setpoint that has just moved is not a shortfall — the belt is on
        // its way. Abandon any episode in progress rather than attributing it
        // to a speed that is no longer the one being asked for.
        if (s.targetSpeed != slipLastTarget) {
            slipLastTarget = s.targetSpeed
            slipTargetChangedAt = now
            slipSince = 0L
            return
        }
        if (now - slipTargetChangedAt < SLIP_SETTLE_MS) { slipSince = 0L; return }

        if (s.slipping) {
            if (slipSince == 0L) { slipSince = now; slipWorst = 0.0 }
            val short = s.speed - s.beltKph
            if (short > slipWorst) { slipWorst = short; slipTarget = s.speed }
            return
        }

        if (slipSince == 0L) return
        val ran = now - slipSince
        slipSince = 0L
        if (ran < SLIP_MIN_MS) return
        recordIncident("BELT SHORT OF PACE for ${ran / 1000}s — worst " +
                "${"%.1f".format(slipWorst)} km/h under a " +
                "${"%.1f".format(slipTarget)} km/h setpoint (rpm ${"%.0f".format(s.rpm)})")
        Log.w(TAG, "belt short of pace for ${ran / 1000}s, worst " +
                "${"%.1f".format(slipWorst)} km/h under ${"%.1f".format(slipTarget)}")
    }

    /** True while the deck is being brought back to level after a workout. */
    @Volatile private var levelling = false
    @Volatile private var levelNags = 0

    /**
     * The wind-down: true while the belt is being eased to a stop, with the
     * rate it is being eased at, the speed it hands over to the machine's own
     * stop at, and when it started. See [beginWindDown] and [decelStep].
     *
     * One mechanism for both kinds of stop — a workout ending and the STOP
     * button — because they differ only in those two numbers.
     */
    @Volatile private var stopping = false
    @Volatile private var stopRate = DECEL_KPH_PER_SEC
    @Volatile private var stopFloor = 0.0
    @Volatile private var stopSince = 0L

    /** Wall time is unusable here — the console's clock is years out and may
     *  jump if NTP ever reaches it. elapsedRealtime() only ever moves forward. */
    @Volatile private var activeSince = 0L
    @Volatile private var accumulatedMs = 0L

    /** The board's counters are lifetime-ish, so a session is a delta from
     *  wherever they happened to be when START was pressed. */
    @Volatile private var armBaseline = false
    @Volatile private var baseDistance = 0.0
    @Volatile private var baseCalories = 0.0
    @Volatile private var sessionDistance = 0.0
    @Volatile private var sessionCalories = 0.0

    // Rolling stats for the summary screen.
    @Volatile private var maxSpeed = 0.0
    @Volatile private var maxIncline = 0.0
    // Written by the poll thread, cleared from the WebView thread on START.
    @Volatile private var speedSum = 0.0
    @Volatile private var inclineSum = 0.0
    @Volatile private var samples = 0

    /** Pulse keeps its own count: it is the one number that can be absent for
     *  part of a run, and averaging zeros from before the strap connected
     *  would report a heart rate nobody had. */
    @Volatile private var maxPulse = 0
    @Volatile private var pulseSum = 0L
    @Volatile private var pulseSamples = 0

    /**
     * Seconds in each heart-rate zone, 0-5. Index 0 is below zone 1.
     *
     * Accumulated in wall-clock time rather than in samples, so a strap that
     * drops out for a minute does not quietly donate that minute to whichever
     * zone it was in when it went. Only advanced while a reading is live.
     */
    private val zoneSecs = DoubleArray(6)
    @Volatile private var lastZoneAt = 0L

    /**
     * Metres climbed, integrated as the run goes.
     *
     * The HUD has always computed this in the page (see profile() in
     * stride-core.js) and thrown it away at the end. History needs it after the
     * fact, so it is accumulated here too, from the same rise-over-run.
     */
    @Volatile private var climbM = 0.0
    @Volatile private var lastClimbMetres = 0.0

    /** Set once when the belt stops, so the summary screen can show it. */
    @Volatile private var earned: List<String> = emptyList()
    @Volatile private var sessionStartedAt = 0L

    /**
     * The same instant as [sessionStartedAt], on the clock that cannot be moved.
     *
     * [SystemClock.elapsedRealtime] counts since boot and is unaffected by NTP,
     * which is the whole point: it is the only witness to how long ago the run
     * began that survives the wall clock being corrected underneath it. See
     * [sessionStartWall].
     */
    @Volatile private var sessionStartedUptime = 0L

    @Volatile private var maxKph = 19.0
    @Volatile private var minKph = 1.6
    @Volatile private var maxGrade = 12.0
    @Volatile private var minGrade = -3.0

    // Speed-probe bookkeeping — see probeSpeed().
    /** Last board mode we logged, so transitions are visible without spam. */
    @Volatile private var lastBoardMode: Int? = null

    /** Sticky safety-key alarm — see accumulate(). Cleared only by acknowledging. */
    @Volatile private var dmkLatched = false

    private var missingSpeedPolls = 0
    private var speedProbed = false

    // The belt-speed estimator — see beltSpeed(). Poll thread only.
    /** What the belt was told to do, rate-limited: the feed-forward half. */
    private var modelKph = 0.0
    /** What the ground says it actually did, minus that: the correction half.
     *  Persistent, because a correction the model erases every poll is not a
     *  correction. */
    private var trimKph = 0.0
    /** Where the model believes the board's odometer should have got to, and
     *  the smoothed disagreement with where it actually is. */
    private var modelMetres = 0.0
    private var trimResidual = 0.0
    private var lastEstimateAt = 0L

    private val permissionReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action != ACTION_USB_PERMISSION) return
            // Ask the manager rather than trust the extras alone, so a reply
            // that arrives without them still gets the right answer.
            val device: UsbDevice? = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
                ?: conn.findDevice()
            val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false) ||
                (device != null && conn.hasPermission(device))
            if (granted && device != null) start(device) else Log.w(TAG, "usb permission denied")
        }
    }

    /** Exposed to the page as `Stride`. Every call lands on a WebView thread. */
    inner class Bridge {

        /**
         * Welcome screen → straight into a warm-up, the way iFit did it:
         * choosing a workout *is* starting it, and the belt eases up to
         * [WARMUP_KPH] rather than waiting for a separate START press.
         *
         * The belt moves as a direct result of this tap, so the welcome screen
         * says so.
         *
         * Took a `type` of "run" or "run" until 2026-09-07. Nothing downstream
         * did anything with it but change a word, and the screen that asked for
         * it sold the choice on a speed ceiling no code enforced — see flow()
         * in stride-core.js. It is a workout.
         */
        @JavascriptInterface fun choose() {
            if (dmk) return
            workout = WORKOUT
            clearPlan()
            resetSession()
            session = Session.WARMUP
            activeSince = SystemClock.elapsedRealtime()
            phaseEndsAt = activeSince + cfg.warmupMs()
            targetKph = 0.0
            rampTo = cfg.warmupKph()
            rampReason = "warmup"
            pendingWrite = mapOf(FitPro.Field.WORKOUT_MODE to FitPro.Mode.RUNNING.toDouble())
            Log.i(TAG, "workout chosen — warming up to ${cfg.warmupKph()} km/h")
            repaint()
        }

        /**
         * The runner's routes, for the picker: their starred TrailMate routes
         * and race courses, as last synced. Answers with or without a network,
         * which is the whole reason [Routes] stores them.
         */
        @JavascriptInterface fun routes(): String = routes.json(cfg.active)

        /**
         * What TrailMate last sent for each person, by name, for the home
         * screen's Today and Tomorrow: `{ name: { state, fetchedAt, zones,
         * workouts } }`. See [TrailMateView.person].
         */
        @JavascriptInterface fun schedules(): String = JSONObject().apply {
            for (p in cfg.people()) put(p.name, tmView.person(p.id))
        }.toString()

        /** Ask TrailMate again for everyone now (pull to refresh, Settings). */
        @JavascriptInterface fun refreshSchedules() = sync.request(force = true)

        /**
         * Start one of the runner's planned workouts from TrailMate (spec 038):
         * its steps drive the belt speed and the deck, as [WorkoutRunner] says.
         * No console warm-up or cool-down: the workout has its own.
         */
        @JavascriptInterface fun chooseWorkout(id: String) {
            if (dmk) return
            val w = tmStore.workout(cfg.active, id) ?: run {
                Log.w(TAG, "no runnable workout $id for ${cfg.active.ifEmpty { "a guest" }}")
                return
            }
            startWorkout(w, tmStore.zones(cfg.active))
        }

        /**
         * Manual → Heart rate (spec 038, US5): hold zone [zone] of the runner's
         * own zones, or the range [minBpm]–[maxBpm] when [zone] is 0, until STOP.
         */
        @JavascriptInterface fun chooseHeartRate(zone: Int, minBpm: Int, maxBpm: Int) {
            if (dmk) return
            val zones = tmStore.zones(cfg.active)
            val band = if (zone > 0) zones.hr[zone] else if (minBpm in 1..maxBpm) HrBand(minBpm, maxBpm) else null
            if (band == null) {
                Log.w(TAG, "heart rate: no band for zone $zone ($minBpm–$maxBpm)")
                return
            }
            startWorkout(Workout.heartRate(band, zone.takeIf { it > 0 }), zones)
        }

        /** NEXT: end the workout's current step (the one way an open step ends, short of STOP). */
        @JavascriptInterface fun nextStep() {
            val r = workoutRunner ?: return
            r.next(workoutProgress())
            if (r.finished && !stopping) requestFinish()
        }

        /**
         * Start a run on a recorded route.
         *
         * No `minutes`, and that is deliberate rather than an omission: a
         * route has its own length. Cutting it to fit a
         * time slot means never reaching the summit, which is the reason for
         * running it again.
         *
         * @param loop run it out and then run it home — see [Route.outAndBack].
         *             A property of *this* run, chosen on the picker, not of
         *             the route: the same 30-minute one-way run is the right
         *             length some mornings and half a run on others.
         */
        @JavascriptInterface fun chooseRoute(id: String, loop: Boolean) {
            if (dmk) return
            val found = routes.byId(cfg.active, id) ?: run {
                Log.w(TAG, "no such route: $id")
                return
            }
            val r = if (loop) found.outAndBack() else found

            route = r
            planElapsed = 0.0
            // Steps carry the same ground so the HUD can draw it, expressed in
            // metres. Nothing reads them as seconds while a route is active —
            // routeTick owns the position — but the sparkline and the segment
            // counter both want the shape.
            planSteps = r.segments.map {
                Plan.Step(startSec = it.startM, endSec = it.endM,
                          incline = it.incline.coerceIn(minGrade, maxGrade),
                          label = r.name)
            }
            planName = r.name
            stepIndex = -1
            inclineAuto = true
            lastInclineMoveAt = 0L

            beginPlannedRun(cfg.warmupKph())
            Log.i(TAG, "route: ${r.name}, ${"%.2f".format(r.distanceM / 1000)} km, " +
                    "${"%.0f".format(r.climbM)} m climb, ${r.segments.size} segments" +
                    if (loop) " (looped)" else "")
            pushPlan()
            repaint()
        }

        /** Straight to the workout proper, keeping whatever pace is set. */
        @JavascriptInterface fun skipWarmup() {
            if (session != Session.WARMUP) return
            session = Session.ACTIVE
            phaseEndsAt = 0L
            Log.i(TAG, "warm-up skipped")
            repaint()
        }

        /** Cool-down is the last thing standing between here and the summary. */
        @JavascriptInterface fun skipCooldown() {
            if (session != Session.COOLDOWN) return
            requestFinish()
            repaint()
        }

        /** Belt to a halt, timer held. The board's own Pause is the legal exit
         *  from Running — writing Idle while running is silently ignored. */
        @JavascriptInterface fun pause() {
            // Pressed again while the belt is still easing down: that is
            // somebody asking a second time, and the answer to asking twice is
            // the stop they would have got before any of this existed.
            if (session == Session.PAUSED && stopping) {
                stopping = false
                targetKph = 0.0
                pendingWrite = mapOf(
                    FitPro.Field.KPH to 0.0,
                    FitPro.Field.WORKOUT_MODE to FitPro.Mode.PAUSE.toDouble(),
                )
                Log.i(TAG, "stop pressed again — stopping the belt outright")
                repaint()
                return
            }
            if (Session.isMoving(session)) {
                accumulatedMs += SystemClock.elapsedRealtime() - activeSince
                session = Session.PAUSED
                phaseEndsAt = 0L
            }
            // Remember the pace so RESUME can climb back to it. Taken before the
            // wind-down starts eating it.
            if (targetKph > 0.0) pausedKph = targetKph
            rampTo = 0.0
            rampReason = ""
            // Above a run the speed is shed first — see STOP_EASE_ABOVE_KPH.
            // The screen still answers the press immediately: the clock stops
            // here and the overlay goes up while the belt is still moving,
            // which is the right way round. A STOP that took two seconds to
            // acknowledge would read as a console that had missed it.
            if (beginWindDown(STOP_DECEL_KPH_PER_SEC, STOP_EASE_ABOVE_KPH, "stop pressed")) {
                repaint()
                return
            }
            targetKph = 0.0
            pendingWrite = mapOf(
                FitPro.Field.KPH to 0.0,
                FitPro.Field.WORKOUT_MODE to FitPro.Mode.PAUSE.toDouble(),
            )
            repaint()
        }

        /**
         * Pressing RESUME means "I want to keep going", so getting back to pace
         * shouldn't be a dozen taps. But it must not lurch either — the belt
         * starts from a standstill and climbs to the old speed at [RAMP_KPH_PER_SEC],
         * driven from the poll loop. Touching SPEED cancels it.
         */
        @JavascriptInterface fun resume() {
            if (dmk) return
            if (session != Session.PAUSED) return
            session = Session.ACTIVE
            activeSince = SystemClock.elapsedRealtime()
            // RESUME during a STOP's wind-down catches the belt where it is and
            // climbs from there. Zeroing the target would drop it to a
            // standstill first, which is a lurch in each direction for someone
            // who has changed their mind a second after pressing STOP.
            if (stopping) {
                stopping = false
                Log.i(TAG, "resumed mid wind-down at ${"%.1f".format(targetKph)} km/h")
            } else {
                targetKph = 0.0
            }
            rampTo = if (pausedKph > 0.0) pausedKph else cfg.warmupKph()
            rampReason = "resuming"
            pendingWrite = mapOf(FitPro.Field.WORKOUT_MODE to FitPro.Mode.RUNNING.toDouble())
            Log.i(TAG, "resuming — ramping back to ${"%.1f".format(rampTo)} km/h")
            repaint()
        }

        /**
         * "End workout" doesn't stop dead — it eases down. The belt ramps back
         * to running pace, the deck flattens, and the clock keeps running for
         * [COOLDOWN_MS]. SKIP goes straight to the summary.
         */
        @JavascriptInterface fun end() {
            if (session == Session.SUMMARY) return
            // Ending from a pause means the belt is already stopped. Running a
            // cool-down from there spins it back up to 2 km/h only to run it
            // down again, which is disconcerting and faintly alarming — the
            // workout was over the moment STOP was pressed.
            if (session == Session.PAUSED) {
                Log.i(TAG, "ended from a pause — no cool-down, belt already stopping")
                // The plan is deliberately left standing: the summary is a
                // summary *of* it, and clearing it here is what used to put
                // "manual run" at the top of a guided run's recap. It goes on
                // the way out of the summary — see home().
                finishWorkout()
                repaint()
                return
            }
            // A TrailMate workout brings its own cool-down as a step (spec 038):
            // ending one early finishes it, with the belt eased down, rather
            // than starting the console's own on top.
            if (workoutRunner != null) {
                Log.i(TAG, "workout ended early — no console cool-down")
                requestFinish()
                repaint()
                return
            }
            val now = SystemClock.elapsedRealtime()
            // Coming out of a pause the clock is already stopped; restart it so
            // the cool-down is counted like any other part of the workout.
            if (!Session.isMoving(session)) activeSince = now
            session = Session.COOLDOWN
            phaseEndsAt = now + cfg.cooldownMs()
            pausedKph = 0.0
            rampTo = cfg.warmupKph()
            rampReason = "cooldown"
            // Put the machine back how you'd want to find it. Incline is the one
            // setting that persists otherwise, and starting the next run on
            // yesterday's hill is a nasty surprise.
            targetGrade = 0.0
            pendingWrite = mapOf(
                FitPro.Field.GRADE to 0.0,
                FitPro.Field.WORKOUT_MODE to FitPro.Mode.RUNNING.toDouble(),
            )
            Log.i(TAG, "cooling down for ${cfg.cooldownMs() / 1000}s")
            repaint()
        }

        /**
         * Summary → welcome.
         *
         * The belt is commanded to a stop here as well as at the end of the
         * workout. It should already be stopped, and on 31 July it was not —
         * the console went back to the welcome screen with the belt still
         * running. `enforceStopped` is the thing that actually guarantees it;
         * this is the cheap second attempt at the moment the screen changes.
         */
        @JavascriptInterface fun home() {
            // Taken before anything is reset: is there a belt that may still be
            // turning? Mid-run, in the cool-down, or still winding down.
            val wasMoving = Session.isMoving(session) || stopping || beltStillKph() >= STOPPED_KPH
            session = Session.WELCOME
            workout = "none"
            // Normally a no-op: the summary has already closed the recording.
            // From anywhere else, a run going home without a summary is still
            // a run, and it is kept rather than thrown away.
            recorder.finish()
            trailmate.clearSummary()
            clearPlan()
            resetSession()
            // Leaving the summary ends any easing still in flight. The console
            // is about to say "welcome", and a belt still winding down behind
            // that screen is worse than a stop that nobody is standing on the
            // belt for. Taking the wind-down away also takes its tidy-up away,
            // so that is done here instead — otherwise leaving the summary in
            // the first second or two would strand the deck on a hill.
            val parked = stopping
            if (parked) {
                stopping = false
                Log.i(TAG, "left the summary mid wind-down — stopping the belt outright")
                parkDeckAndFan()
            }
            targetKph = 0.0
            /* IDLE is not a way out of running: the board ignores it (FitPro 1)
             * or its effect on a moving belt is unproven (FitPro 2), and PAUSE
             * is the legal exit — see pause(). HOME pressed during a cool-down
             * used to send IDLE, leave the belt turning behind the welcome
             * screen, and let enforceStopped catch it as a runaway: stopped,
             * but logged as an incident every time. Found
             * with the simulated treadmill, 12/10/2026.
             *
             * So a belt that may be moving gets PAUSE, and IDLE follows once
             * it has stopped — see idleStep. */
            pendingWrite = buildMap {
                put(FitPro.Field.KPH, 0.0)
                put(FitPro.Field.WORKOUT_MODE,
                    (if (wasMoving) FitPro.Mode.PAUSE else FitPro.Mode.IDLE).toDouble())
                // Only when we are the ones levelling the deck. An incline set
                // by hand on the summary screen is a choice about the next
                // run, and DONE is not the moment to throw it away.
                if (parked) put(FitPro.Field.GRADE, 0.0)
            }
            idleWhenStopped = wasMoving
            repaint()
        }

        @JavascriptInterface fun speed(delta: Double) {
            if (!Session.isMoving(session) || dmk) return
            rampTo = 0.0; rampReason = ""   // manual control abandons the ramp
            workoutRunner?.speedTakenOver()  // and the workout's hold on the speed, until its next step
            var next = targetKph + delta
            // Below the machine's minimum there is no "slow", only stopped —
            // so stepping down out of the bottom of the range means stop, and
            // stepping up out of zero jumps straight to the minimum.
            next = if (next < minKph) { if (delta > 0) minKph else 0.0 } else next
            // Not quantised to km/h: in miles the rail sends the km/h step
            // that lands on the next 0.1 mph, which a km/h grid would undo.
            targetKph = next.coerceIn(0.0, topKph())
            pendingWrite = mapOf(FitPro.Field.KPH to targetKph)
        }

        /**
         * Go straight to a speed: a stop picked from the speed rail, or a pace
         * set on the calibration panel. Only ever because somebody touched it —
         * a plan never sets the belt speed on its own.
         */
        @JavascriptInterface fun setSpeed(kph: Double) {
            if (!Session.isMoving(session) || dmk) return
            rampTo = 0.0; rampReason = ""   // as with any manual change
            workoutRunner?.speedTakenOver()
            targetKph = if (kph < minKph) 0.0 else kph.coerceIn(0.0, topKph())
            pendingWrite = mapOf(FitPro.Field.KPH to targetKph)
            Log.i(TAG, "pace: set to ${"%.2f".format(targetKph)} km/h")
        }

        /* ---- belt calibration --------------------------------------------
         *
         * Started from Settings → Treadmill. It is an ordinary run with the
         * calibration panel over it: the safety key, STOP and pause all work as
         * they always do. See calTick for what is measured while it runs. */

        /** Start calibrating: a run if none is running, then the panel. */
        @JavascriptInterface fun calibrate() {
            if (dmk) return
            if (!Session.isMoving(session) && session != Session.PAUSED) choose()
            calOn = true
            calKph = -1.0          // calTick picks up the dial on the next poll
            calNote = ""
            Log.i(TAG, "calibration: started")
            repaint()
        }

        /** Belt a little faster or slower, with the dial left where it is. */
        @JavascriptInterface fun calNudge(delta: Double) {
            if (!calOn || calKph <= 0.0 || dmk) return
            calSetBelt(calBelt + delta, "nudged")
            repaint()
        }

        /** Set the belt so the pod's average would have read the dial. */
        @JavascriptInterface fun calUseStryd() {
            if (!calOn || calKph <= 0.0 || dmk) return
            if (calPodSecs < CAL_READY_SECS || calPodKph <= 0.0) {
                calNote = "Keep going: the Stryd needs ${CAL_READY_SECS.toInt()} steady seconds."
            } else {
                // The belt and the pod are in proportion over this small a
                // change, so scaling what is sent by how far the pod is off
                // lands on it.
                calSetBelt(calBelt * calKph / calPodKph, "from the Stryd at ${"%.2f".format(calPodKph)}")
                calNote = "Belt set from the Stryd. Let it settle, check it agrees, then save."
            }
            repaint()
        }

        /** Keep what is being sent for this speed as a calibration point. */
        @JavascriptInterface fun calSave() {
            if (!calOn || calKph <= 0.0) return
            val point = BeltCalibration.Point(calKph, calBelt)
            calib.with(point)
                .onSuccess {
                    calib = it
                    cfg.saveBeltCalibration(it)
                    calNote = "Saved. Try another speed, or finish."
                    Log.i(TAG, "calibration: saved ${point.kph} -> ${point.belt} " +
                            "(${it.points.size} point(s))")
                }
                .onFailure {
                    calNote = it.message ?: "Could not save that point."
                    Log.w(TAG, "calibration: refused ${point.kph} -> ${point.belt}: ${it.message}")
                }
            repaint()
        }

        /** Leave the panel. The run carries on, on the saved table. */
        @JavascriptInterface fun calDone() {
            if (!calOn) return
            calOn = false
            calNote = ""
            Log.i(TAG, "calibration: done")
            if (Session.isMoving(session) && targetKph > 0.0 && rampTo <= 0.0) {
                pendingWrite = mapOf(FitPro.Field.KPH to targetKph)
            }
            repaint()
        }

        /** The saved table, for Settings: {points:[{kph, belt}], pod}. */
        @JavascriptInterface fun calibrationJson(): String = calibrationState()

        @JavascriptInterface fun calibrationRemove(kph: Double): String {
            calib = calib.without(kph)
            cfg.saveBeltCalibration(calib)
            Log.i(TAG, "calibration: removed the point near $kph km/h")
            return calibrationState()
        }

        @JavascriptInterface fun calibrationClear(): String {
            calib = BeltCalibration(emptyList())
            cfg.saveBeltCalibration(calib)
            Log.i(TAG, "calibration: cleared")
            return calibrationState()
        }

        /** Incline has no interlock — the board services it in any state. */
        @JavascriptInterface fun incline(delta: Double) = gradeByHand(targetGrade + delta)

        /**
         * Go straight to a grade: a stop picked from the incline rail. A step
         * computed on the page from the last snapshot's target could land off
         * by whatever moved in the fifth of a second since.
         */
        @JavascriptInterface fun setIncline(pct: Double) {
            gradeByHand(pct)
            Log.i(TAG, "incline: set by hand to ${"%.1f".format(targetGrade)} %")
        }

        private fun gradeByHand(grade: Double) {
            // Touching the hill takes it back from the plan until the next
            // segment. Same rule as speed abandoning its ramp: the person on the
            // treadmill outranks the schedule.
            if (inclineAuto) {
                inclineAuto = false
                Log.i(TAG, "guided: incline taken over by hand for this segment")
            }
            workoutRunner?.inclineTakenOver()
            // A hand on the incline outranks the levelling nag, exactly as it
            // outranks the plan. Otherwise setting a slope from the summary
            // screen would be undone a fifth of a second later.
            if (levelling) {
                levelling = false
                Log.i(TAG, "levelling abandoned — incline set by hand")
            }
            targetGrade = grade.coerceIn(minGrade, maxGrade)
            pendingWrite = mapOf(FitPro.Field.GRADE to targetGrade)
        }

        /** Off → Low → Medium → High → Auto → Off */
        @JavascriptInterface fun fan() {
            fanState = (fanState + 1) % 5
            pendingWrite = mapOf(FitPro.Field.FAN_STATE to fanState.toDouble())
        }

        @JavascriptInterface fun setFan(level: Int) {
            fanState = level.coerceIn(0, 4)
            pendingWrite = mapOf(FitPro.Field.FAN_STATE to fanState.toDouble())
        }

        @JavascriptInterface fun setRunner(name: String) {
            val strapWas = cfg.hrAddr()
            val podWas = cfg.podAddr()
            val phonesWas = cfg.phonesAddr()
            runner = name
            cfg.active = cfg.person(name)?.id ?: ""
            if (cfg.active.isNotEmpty()) sync.request(cfg.active)
            refreshRunnerHrMax()
            // Their own strap, pod and headphones, not the last runner's.
            if (cfg.hrAddr() != strapWas) applyStrap()
            if (cfg.podAddr() != podWas) applyPod()
            if (cfg.phonesAddr() != phonesWas) {
                if (phonesWas.isNotBlank()) phones.release(phonesWas)
                applyPhones()
            }
            Log.i(TAG, "runner: $name")
        }

        /** "I've put the key back." If it is still out, the next poll re-raises. */
        @JavascriptInterface fun ackDmk() {
            dmkLatched = false
            dmk = false
            repaint()
        }

        // --- settings -------------------------------------------------------
        //
        // The settings screen is one shared document (assets/ui/stride-settings.js)
        // rendered into whichever interface is up, so all of this is read and
        // written through here rather than through five copies of it.

        @JavascriptInterface fun settingsJson(): String = cfg.json().toString()

        /** Everything arrives as a string; [Settings.set] types it by key. */
        @JavascriptInterface fun saveSetting(key: String, value: String) {
            cfg.set(key, value)
            Log.i(TAG, "settings: $key = $value")
            applySetting(key)
        }

        @JavascriptInterface fun addPerson(name: String): String {
            cfg.addPerson(name)?.let { Log.i(TAG, "settings: added ${it.name} (${it.id})") }
            return cfg.json().toString()
        }

        @JavascriptInterface fun removePerson(name: String): String {
            // Their TrailMate link goes with them. Left behind, it would be a
            // working token belonging to nobody on this console.
            cfg.person(name)?.let { trailmate.disconnect(it.id) }
            cfg.savePeople(cfg.people().filterNot { it.name == name })
            // Whoever is mid-run keeps running; only the list changed.
            Log.i(TAG, "settings: removed $name")
            return cfg.json().toString()
        }

        /**
         * Set or clear somebody's age. Zero, or anything outside what
         * `220 - age` means anything for, clears it back to "has not said" —
         * which is a supported state and not an error. See Settings.Person.age.
         */
        @JavascriptInterface fun setPersonAge(name: String, age: Int): String {
            val clean = if (age in 13..100) age else 0
            cfg.savePeople(cfg.people().map {
                if (it.name == name) it.copy(age = clean) else it
            })
            // The runner may be the person just edited, and the heart-rate
            // zones come off a cached copy.
            refreshRunnerHrMax()
            Log.i(TAG, "settings: age for $name -> ${if (clean > 0) "$clean" else "not given"}")
            return cfg.json().toString()
        }

        // --- devices: heart-rate strap, foot pod, headphones ---
        /*
         * One Settings section for everything Bluetooth, so one scan looks for
         * all three kinds at once. Each kind still has its own class and its
         * own saved address; `kind` is "hr", "pod" or "phones".
         */
        @JavascriptInterface fun devicesScan() {
            // Asking for location is asynchronous: the dialog is still on
            // screen when this returns. Scanning through it is the documented
            // way to get an empty list that looks exactly like "nothing here",
            // so the scan waits for the answer — see onRequestPermissionsResult.
            if (ensureScanPermission { scanAll() }) scanAll()
        }

        @JavascriptInterface fun devicesFound(): String = JSONArray().apply {
            fun add(kind: String, list: List<BleSensor.Found>) = list.forEach {
                put(JSONObject().put("kind", kind).put("address", it.address)
                    .put("name", it.name).put("rssi", it.rssi))
            }
            add("hr", strap.found())
            add("pod", pod.found())
            add("phones", phones.found())
        }.toString()

        @JavascriptInterface fun devicePair(kind: String, address: String, name: String) {
            strap.stopScan(); pod.stopScan(); phones.stopScan()
            when (kind) {
                "hr" -> { cfg.saveStrap(address, name); strap.connect(address) }
                "pod" -> { cfg.savePod(address, name); pod.connect(address) }
                "phones" -> { cfg.savePhones(address, name); phones.pair(address) }
                else -> return
            }
            Log.i(TAG, "$kind: pairing with $name")
        }

        @JavascriptInterface fun deviceForget(kind: String) {
            when (kind) {
                "hr" -> { strap.disconnect(); cfg.forgetStrap() }
                "pod" -> { pod.disconnect(); cfg.forgetPod() }
                "phones" -> { phones.forget(cfg.phonesAddr()); cfg.forgetPhones() }
                else -> return
            }
            Log.i(TAG, "$kind: forgotten")
        }

        @JavascriptInterface fun devicesStatus(): String = JSONObject()
            .put("available", strap.available)
            .put("scanning", strap.scanning || pod.scanning || phones.scanning)
            .put("hr", JSONObject()
                .put("name", cfg.hrName()).put("address", cfg.hrAddr())
                .put("connected", strap.connected).put("battery", strap.battery)
                .put("bpm", strap.bpm()))
            .put("pod", JSONObject()
                .put("name", cfg.podName()).put("address", cfg.podAddr())
                .put("connected", pod.connected).put("battery", pod.battery)
                .put("cadence", pod.cadence()).put("watts", pod.watts()))
            .put("phones", JSONObject()
                .put("name", cfg.phonesName()).put("address", cfg.phonesAddr())
                .put("connected", phones.connected(cfg.phonesAddr())))
            .toString()

        // --- trailmate ---
        /*
         * Connecting a runner to TrailMate, per person, from People. The
         * page starts a link and then polls trailmateStatus for the code, the
         * QR and how it is going; see TrailMate for the flow. Nothing here
         * hands the page a token — status says "linked", not with what.
         */
        @JavascriptInterface fun trailmateStatus(): String = trailmate.statusJson()

        @JavascriptInterface fun trailmateConnect(personId: String) {
            val p = cfg.personById(personId) ?: return
            Log.i(TAG, "trailmate: connecting ${p.name}")
            trailmate.startLink(p)
        }

        @JavascriptInterface fun trailmateCancel() = trailmate.cancelLink()

        @JavascriptInterface fun trailmateDisconnect(personId: String) =
            trailmate.disconnect(personId)

        /** A run TrailMate refused, back in the queue to try again. */
        @JavascriptInterface fun trailmateRetry(workoutId: String) = trailmate.retry(workoutId)

        /** What the board says it can do. Reported, never set — see Settings. */
        @JavascriptInterface fun boardLimits(): String = JSONObject()
            .put("minGrade", minGrade).put("maxGrade", maxGrade)
            .put("minKph", minKph).put("maxKph", maxKph)
            .toString()

        @JavascriptInterface fun about(): String = JSONObject()
            .put("version", BuildConfig.VERSION_NAME)
            .put("build", BuildConfig.VERSION_CODE)
            .put("board", fp2?.let { "FitPro 2 · ${it.model.ifEmpty { "Gen 7" }}" }
                ?: "FitPro · device 0x%02x".format(deviceId))
            .put("android", android.os.Build.VERSION.RELEASE)
            .toString()

        @JavascriptInterface fun resetSettings(): String {
            cfg.resetSettings()
            applySetting("")
            Log.i(TAG, "settings: reset to defaults")
            return cfg.json().toString()
        }

        @JavascriptInterface fun resetMySettings(): String {
            cfg.resetMine()
            applySetting("")
            applyPhones()
            Log.i(TAG, "settings: reset $runner's own")
            return cfg.json().toString()
        }

        /** Screen sleep. The panel is the only light in the room at 6am. */
        /**
         * Standby, the way iFit's console did it: the backlight off, not
         * merely dim, with the panel and its touch layer still on, so a tap
         * anywhere brings it back. Was 2%, which left a lit slab in the room.
         * Waking restores the brightness chosen in Display, not Android's
         * default.
         */
        @JavascriptInterface fun dim(on: Boolean) {
            if (on) enterStandby() else leaveStandby()
        }

        /**
         * "awake" | "asleep" | "waking" | "unreachable".
         *
         * The sleep screen asks this on the tap that woke it, and keeps asking
         * while a wake is in flight. "awake" is the ordinary answer and means
         * the tap was the whole gesture — the question is only put when there
         * is something to ask about.
         */
        @JavascriptInterface fun wakeState(): String = this@MainActivity.wakeState()

        /** The second, deliberate half of the tap. See [wakeBoard]. */
        @JavascriptInterface fun wakeBoard() = this@MainActivity.wakeBoard()

        /** Apps the console can open: [{pkg, name, icon}]. See [OverApp]. */
        @JavascriptInterface fun apps(): String = overApp.list()

        /** Open one, with the run over it. */
        @JavascriptInterface fun openApp(pkg: String) = runOnUiThread { overApp.open(pkg) }

        /** Over an app: the parts of the page that take touches, as JSON
         *  [[x, y, w, h], …] in screen pixels or "all". Everything else goes
         *  to the app underneath. */
        @JavascriptInterface fun touchable(json: String) = runOnUiThread { overApp.touchable(json) }

        /** Over an app: back to STRIDE full screen. */
        @JavascriptInterface fun closeApp() = runOnUiThread { overApp.close() }
    }

    /**
     * Which pulse to believe.
     *
     * The board's number comes from contact grips on machines that have them,
     * and is only there while both hands are on the bar — so it drops out on
     * exactly the hills where it is worth having. On a machine with no grips,
     * which is most of them now, it is zero for the whole run. A strap does
     * not care what your arms are doing, and is the source that always works.
     *
     * Automatic prefers the strap and falls back, and the fallback is on the
     * strap's *reading* rather than its connection: a strap can be connected
     * and still reporting nothing, having been put on dry or slipped. Zero from
     * either source means "no reading", never "no pulse".
     */
    private fun pulseNow(fromBoard: Int): Int = when (cfg.hrSource()) {
        "grips" -> fromBoard
        "strap" -> strap.bpm()
        else -> strap.bpm().takeIf { it > 0 } ?: fromBoard
    }

    private data class PodReading(val cadence: Int, val watts: Int, val strideM: Double, val kph: Double)

    /**
     * The foot pod's numbers, all zero without a recent reading.
     *
     * Under the simulator with `tools/sim.py pod on`, a stand-in worked out
     * from the belt instead, so the screen can be built and checked on the
     * emulator, which has no Bluetooth: cadence rising with pace, and power
     * from a 75 kg runner at about 1.04 W/kg per m/s plus the lift against
     * gravity on the incline. Plausible, not physiology.
     */
    private fun podNow(kph: Double, grade: Double): PodReading {
        val s = sim
        if (s == null || !s.podOn) {
            return PodReading(pod.cadence(), pod.watts(), pod.strideM(), pod.speedKph())
        }
        if (kph <= 0.0) return PodReading(0, 0, 0.0, 0.0)
        val ms = kph / 3.6
        val cadence = Math.round(100 + 6 * kph).toInt()
        val watts = Math.round(75 * ms * (1.04 + 9.81 * grade.coerceAtLeast(0.0) / 100)).toInt()
        // A pod reads the belt, not the dial, so the stand-in follows what the
        // board was sent: a belt 2% slow, which is something to calibrate.
        val belt = if (sentBeltKph > 0.0) sentBeltKph else kph
        return PodReading(cadence, watts, ms * 60 / cadence, belt * 0.98)
    }

    // --- standby -------------------------------------------------------------

    /**
     * As low as the console goes while a touch can still wake it.
     *
     * Entered from the page after Settings → Display → Sleep after, between
     * runs only. Android's own sleep is off the table: it takes the touch
     * layer with it, and then only the power button wakes the panel. So:
     *  - the backlight off, the panel's biggest draw (the touch layer stays on);
     *  - Bluetooth let go: strap, pod and headphones disconnected, the treadmill
     *    no longer advertised;
     *  - the board read every [STANDBY_POLL_MS] instead of five times a second,
     *    and nothing drawn. Not stopped: that poll is what notices a belt
     *    running with nobody on it (enforceStopped), and it stays.
     * A Gen 7 board has no sleep state of its own to put it in.
     *
     * Waking undoes each, and the sensors are back in about five seconds.
     */
    @Volatile private var standby = false

    private fun enterStandby() {
        if (standby || Session.isMoving(session)) return
        standby = true
        runOnUiThread {
            window.attributes = window.attributes.apply {
                screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_OFF
            }
        }
        strap.disconnect(); pod.disconnect()
        phones.release(cfg.phonesAddr())
        ftms.quiet(true)
        Log.i(TAG, "standby: backlight off, Bluetooth released, board polled every ${STANDBY_POLL_MS / 1000} s")
    }

    private fun leaveStandby() {
        runOnUiThread {
            window.attributes = window.attributes.apply { screenBrightness = cfg.brightness() }
        }
        if (!standby) return
        standby = false
        ftms.quiet(false)
        applyStrap(); applyPod(); applyPhones()
        Log.i(TAG, "standby: woken")
        repaint()
    }

    // --- the treadmill's own buttons ------------------------------------------

    /**
     * A button on the treadmill, as a Gen 7 board reports it.
     *
     * The board acts on none of its own keys: it tells the console, and iFit's
     * app used to decide. With iFit gone they did nothing at all — volume,
     * speed, incline, and STOP. Each now does what the same control on screen
     * does, through the same bridge call, so it obeys the same rules (the
     * safety key, the minimum speed, the calibration). Poll thread.
     */
    private fun physicalKey(code: Int) {
        // The screen is dark and asleep in the page too; a tap wakes it.
        if (standby) { Log.i(TAG, "standby: key $code ignored — tap the screen"); return }
        when (code) {
            FitPro2.Key.VOLUME_UP -> volume(+1)
            FitPro2.Key.VOLUME_DOWN -> volume(-1)
            // Halt first, ask second, as the STOP on screen does.
            FitPro2.Key.STOP -> if (Session.isMoving(session)) {
                bridge.pause()
                runOnUiThread { web.evaluateJavascript("window.stopPressed && window.stopPressed()", null) }
            }
            FitPro2.Key.START -> when (session) {
                Session.PAUSED -> bridge.resume()
                Session.WELCOME, Session.SUMMARY -> bridge.choose()
                else -> {}
            }
            FitPro2.Key.SPEED_UP -> bridge.speed(speedStep(+1))
            FitPro2.Key.SPEED_DOWN -> bridge.speed(speedStep(-1))
            FitPro2.Key.INCLINE_UP -> bridge.incline(INCLINE_KEY_STEP)
            FitPro2.Key.INCLINE_DOWN -> bridge.incline(-INCLINE_KEY_STEP)
        }
    }

    /** The km/h change that lands on the next 0.1 of the unit on screen, the
     *  way the speed rail steps (speedDelta in the page). */
    private fun speedStep(dir: Int): Double {
        val per = if (cfg.metric()) 1.0 else KM_PER_MILE
        val shown = targetKph / per
        val next = if (dir > 0) Math.floor(shown * 10 + 1e-6) / 10 + 0.1
                   else Math.ceil(shown * 10 - 1e-6) / 10 - 0.1
        return next * per - targetKph
    }

    /** The console's media volume, which is the headphones while they are
     *  connected, with Android's own volume bar so the change can be seen. */
    private fun volume(dir: Int) {
        val am = getSystemService(Context.AUDIO_SERVICE) as? android.media.AudioManager ?: return
        runOnUiThread {
            am.adjustStreamVolume(android.media.AudioManager.STREAM_MUSIC,
                if (dir > 0) android.media.AudioManager.ADJUST_RAISE else android.media.AudioManager.ADJUST_LOWER,
                android.media.AudioManager.FLAG_SHOW_UI)
            Log.i(TAG, "volume ${if (dir > 0) "up" else "down"}: " +
                    "${am.getStreamVolume(android.media.AudioManager.STREAM_MUSIC)}/" +
                    "${am.getStreamMaxVolume(android.media.AudioManager.STREAM_MUSIC)}")
        }
    }

    // --- belt calibration -----------------------------------------------------

    /** The fastest true speed the board's top speed reaches. */
    private fun topKph(): Double = calib.fromBelt(maxKph)

    /**
     * What to send the board for a true [kph]: the calibration being worked on
     * if this is its speed, otherwise the saved table. Held to the board's own
     * range and to the hundredths it takes.
     */
    private fun beltFor(kph: Double): Double {
        if (kph <= 0.0) return 0.0
        val b = if (calOn && calBelt > 0.0 && Math.abs(kph - calKph) < 1e-6) calBelt else calib.toBelt(kph)
        return (Math.round(b * 100.0) / 100.0).coerceIn(minKph, maxKph)
    }

    /**
     * A write on its way to the board, with its speed translated from true to
     * what this belt needs. The one place that happens — every speed the
     * console sends, from a + press to a stop, comes through here.
     */
    private fun toBoard(writes: Map<FitPro.Field, Double>?): Map<FitPro.Field, Double>? {
        val kph = writes?.get(FitPro.Field.KPH) ?: return writes
        val belt = beltFor(kph)
        sentBeltKph = belt
        if (kph > 0.0 && belt > 0.0) odoScale = kph / belt
        return if (belt == kph) writes else writes + (FitPro.Field.KPH to belt)
    }

    /**
     * The board's odometer, in true metres.
     *
     * The odometer counts the roller at the speed it was sent, so it is off by
     * exactly what the belt is off by. Each metre it adds is scaled by the
     * calibration at the speed that was running. A board that reseeds its
     * counter reseeds this too, which is what everything downstream of it
     * already expects.
     */
    private fun trueOdometer(raw: Double): Double {
        val last = odoRawLast
        odoRawLast = raw
        odoTrue = if (last < 0.0 || raw < last) raw else odoTrue + (raw - last) * odoScale
        return odoTrue
    }

    /** Send [belt] for the speed on the dial, and start listening to the pod afresh. */
    private fun calSetBelt(belt: Double, why: String) {
        val lo = maxOf(minKph, calKph * BeltCalibration.MIN_RATIO)
        val hi = minOf(maxKph, calKph * BeltCalibration.MAX_RATIO)
        calBelt = (Math.round(belt.coerceIn(lo, hi) * 100.0) / 100.0)
        rampTo = 0.0; rampReason = ""   // a hand on the belt ends a ramp, as with + and −
        workoutRunner?.speedTakenOver()
        calRestart()
        calNote = ""
        pendingWrite = mapOf(FitPro.Field.KPH to targetKph)
        Log.i(TAG, "calibration: ${"%.2f".format(calKph)} km/h now sends " +
                "${"%.2f".format(calBelt)} ($why)")
    }

    /** Called from both threads, so it only moves the mark: calTick, which
     *  owns [calPod], drops everything gathered before it. */
    private fun calRestart() {
        calChangedAt = SystemClock.elapsedRealtime()
        calPodKph = 0.0
        calPodSecs = 0.0
    }

    private fun calibrationState(): String = JSONObject()
        .put("points", calib.json())
        .put("pod", pod.connected)
        .put("miles", !cfg.metric())
        .toString()

    /**
     * One poll of a calibration: follow the dial, and average the pod.
     *
     * A new speed on the dial, by the rails or a pace button, starts from what
     * the saved table already says for it, so a second visit to a speed
     * refines rather than starts over. The pod is then averaged over the last
     * [CAL_WINDOW_MS], skipping the first [CAL_SETTLE_MS] after any change.
     *
     * Returns what the panel shows, or null when no calibration is running.
     */
    private fun calTick(podKph: Double): CalibrationLive? {
        if (!calOn) return null
        if (session == Session.WELCOME || session == Session.SUMMARY) {
            calOn = false
            Log.i(TAG, "calibration: ended with the run")
            return null
        }
        val now = SystemClock.elapsedRealtime()
        if (Math.abs(targetKph - calKph) > 1e-6) {
            calKph = targetKph
            calBelt = 0.0          // so beltFor answers from the table
            calBelt = beltFor(targetKph)
            calRestart()
        }
        val since = calChangedAt
        while (calPod.isNotEmpty() && calPod.first().first < since) calPod.removeFirst()
        val steady = Session.isMoving(session) && calKph > 0.0 && rampTo <= 0.0 &&
                now - since >= CAL_SETTLE_MS
        if (!steady) {
            // Not running at a steady speed: what was gathered no longer
            // describes one thing.
            calPod.clear(); calPodKph = 0.0; calPodSecs = 0.0
        } else {
            // A missed pod reading is skipped, not a reason to start again.
            if (podKph > 0.0) calPod.addLast(now to podKph)
            while (calPod.isNotEmpty() && now - calPod.first().first > CAL_WINDOW_MS) calPod.removeFirst()
            calPodKph = if (calPod.isEmpty()) 0.0 else calPod.sumOf { it.second } / calPod.size
            calPodSecs = if (calPod.isEmpty()) 0.0 else (now - calPod.first().first) / 1000.0
        }
        return CalibrationLive(
            kph = calKph,
            belt = calBelt,
            tableBelt = if (calKph > 0.0) calib.toBelt(calKph) else 0.0,
            podKph = calPodKph,
            podSecs = calPodSecs,
            ready = calPodSecs >= CAL_READY_SECS,
            pod = podKph > 0.0 || pod.connected,
            miles = !cfg.metric(),
            points = calib.points,
            note = calNote,
        )
    }

    // --- applying settings ----------------------------------------------------

    /**
     * React to one setting having changed, where it needs more than being
     * stored. Anything read at the point of use — warm-up length, incline rate,
     * units — needs nothing here and is deliberately absent.
     */
    private fun applySetting(key: String) {
        when (key) {
            Settings.BRIGHTNESS -> applyBrightness()

            Settings.HR_SOURCE, Settings.HR_ADDR -> applyStrap()

            Settings.POD_ADDR -> applyPod()

            // A different server may well be one that answers: try the queue
            // now rather than at the end of a back-off against the old one.
            Settings.TRAILMATE_URL -> trailmate.kick()

            // A reset changes everything at once.
            "" -> {
                applyBrightness()
                applyStrap()
                applyPod()
            }
        }
    }

    private fun applyBrightness() = runOnUiThread {
        window.attributes = window.attributes.apply { screenBrightness = cfg.brightness() }
    }

    /** Hold a connection only when a strap could actually be used. */
    private fun applyStrap() {
        if (cfg.hrSource() == "grips" || cfg.hrAddr().isBlank()) strap.disconnect()
        else strap.connect(cfg.hrAddr())
    }

    /** Hold a connection to the foot pod whenever one is paired. */
    private fun applyPod() {
        if (cfg.podAddr().isBlank()) pod.disconnect() else pod.connect(cfg.podAddr())
    }

    /** Reconnect saved headphones; most do it themselves, this is the nudge. */
    private fun applyPhones() {
        if (cfg.phonesAddr().isNotBlank()) phones.connect(cfg.phonesAddr())
    }

    /** One Settings scan looks for every kind of device at once. */
    private fun scanAll() {
        strap.scan()
        pod.scan()
        phones.scan()
    }

    /**
     * A BLE scan on API 23–30 returns an empty list, not an error, without a
     * location permission. This app targets 28, so that is the rule that
     * applies — and an empty list is exactly what "no straps here" looks like,
     * which makes it the single most confusing way for this feature to fail.
     */
    private fun ensureScanPermission(then: () -> Unit): Boolean {
        if (android.os.Build.VERSION.SDK_INT < 23) return true
        val perm = android.Manifest.permission.ACCESS_COARSE_LOCATION
        if (checkSelfPermission(perm) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
            return true
        }
        Log.i(TAG, "ble: asking for location permission so a BLE scan can return results")
        scanAfterPermission = then
        requestPermissions(arrayOf(perm), SCAN_PERMISSION)
        return false
    }

    /** The scan the user asked for, once they have answered the dialog. */
    override fun onRequestPermissionsResult(
        code: Int, permissions: Array<out String>, results: IntArray
    ) {
        super.onRequestPermissionsResult(code, permissions, results)
        if (code != SCAN_PERMISSION) return
        val granted = results.firstOrNull() ==
            android.content.pm.PackageManager.PERMISSION_GRANTED
        if (granted) scanAfterPermission?.invoke()
        else Log.w(TAG, "ble: location refused, a BLE scan will find nothing")
        scanAfterPermission = null
    }

    /** Each person's routes from TrailMate, stored so they work offline. See Routes. */
    private val routes by lazy { Routes(this) }

    /** Each linked person's planned workouts, zones and routes from TrailMate (spec 038). */
    private val tmStore by lazy { TrailMateStore(this, routes) }
    private val tmView by lazy { TrailMateView(trailmate, tmStore) }
    private val sync by lazy { TrailMateSync(this, cfg, trailmate, tmStore) { Session.isMoving(session) } }

    /** Every run this console has recorded — see History. */
    private val history by lazy { History(this) }

    /** Who is connected to TrailMate, and the runs on their way there. */
    private val trailmate by lazy {
        TrailMate(this, cfg).also { it.onState = { id, state -> history.markTrailMate(id, state) } }
    }

    /**
     * The second-by-second trace of the run under way, for TrailMate — see
     * RunRecorder. Finished runs go straight to the queue, which decides
     * whether the runner is connected and so whether it leaves the console.
     */
    private val recorder by lazy { RunRecorder(this) { id, w -> trailmate.enqueue(id, w) } }

    /**
     * Start or feed the recording, from the poll loop.
     *
     * A recording begins on the first frame of a run with a profile behind
     * it, never for a guest — the same line History draws. The plan goes in
     * at the start, because it is fixed at START and the recording has to be
     * able to describe the run on its own after a crash.
     */
    private fun record(snap: Snapshot) {
        // The live session as well as the frame's: END lands on a WebView
        // thread, and a frame built a moment before it would otherwise open a
        // fresh recording for a run that has just been closed.
        if (Session.isMoving(snap.session) && Session.isMoving(session) &&
            !recorder.recording && snap.whoId.isNotEmpty()) {
            val w = workoutRunner
            val plan = when {
                w != null -> RunRecorder.PlanInfo(planName, planSteps, isRoute = false,
                    plannedWorkoutId = w.workout.plannedId, marked = true)
                planName.isNotEmpty() && planSteps.isNotEmpty() ->
                    RunRecorder.PlanInfo(planName, planSteps, isRoute = route != null)
                else -> null
            }
            recorder.begin(snap.whoId, plan, boardName())
            // The step under way began in the frame that opened the
            // recording, before there was one to mark it in.
            w?.step?.let { recorder.mark(it.label, it.incline ?: targetGrade) }
        }
        recorder.tick(snap, strap.bpm() > 0)
    }

    /** What the workout says it was recorded on. */
    private fun boardName(): String = when {
        sim != null -> "STRIDE simulator"
        fp2 != null -> fp2?.model?.ifEmpty { "FitPro 2" } ?: "FitPro 2"
        else -> "FitPro"
    }

    /** The session's average pulse so far, or 0 if nothing ever read. */
    private fun avgPulseNow(): Int =
        if (pulseSamples > 0) (pulseSum / pulseSamples).toInt() else 0


    /**
     * Start easing the belt down, and say whether there was anything to ease.
     *
     * Both deliberate stops arm one of these: a workout ending, at
     * [DECEL_KPH_PER_SEC] all the way to a standstill, and the STOP button, at
     * [STOP_DECEL_KPH_PER_SEC] as far as [STOP_EASE_ABOVE_KPH]. False means the
     * belt is already at or below the floor, and the caller should command the
     * stop itself in the ordinary way.
     *
     * @param floor the speed to hand over to the machine's own stop at.
     */
    private fun beginWindDown(rate: Double, floor: Double, why: String): Boolean {
        // Nothing to wind down from — and a pulled safety key has already
        // stopped the belt more decisively than this ever could.
        if (targetKph <= floor || dmk) return false
        stopping = true
        stopRate = rate
        stopFloor = floor
        stopSince = SystemClock.elapsedRealtime()
        rampTo = 0.0
        rampReason = "stopping"
        // Whatever was queued is superseded: an incline nudge has nothing to say
        // to a belt that is stopping, and a write the board is refusing sits in
        // front of decelStep in the poll loop's order until it gives up on it —
        // seconds during which nothing would be taking speed off.
        pendingWrite = null
        Log.i(TAG, "$why — winding down from ${"%.1f".format(targetKph)} km/h " +
                "at ${"%.1f".format(rate)} km/h/s" +
                if (floor > 0.0) " to ${"%.1f".format(floor)} km/h" else "")
        return true
    }

    /**
     * Finish now, and let the belt catch up.
     *
     * Every automatic route to the summary comes through here — the plan
     * expiring, the cool-down expiring, SKIP — so none of them can drop the belt
     * out from under someone.
     *
     * The summary goes up at the moment of ending rather than when the belt
     * arrives at zero. Waiting meant the live screen stayed up through the
     * wind-down, and on a guided run or a route that had just run out that
     * screen was the casual lap counter — a run ending on the one display that
     * had nothing to do with it. Ending is a decision; the screen answers it
     * immediately and the belt eases down underneath.
     */
    private fun requestFinish() {
        beginWindDown(DECEL_KPH_PER_SEC, 0.0, "workout ended")
        // Reads the wind-down it just armed, and leaves the belt to it.
        finishWorkout()
    }

    /**
     * One tick of the wind-down, or null if nothing is stopping.
     *
     * Below the machine's minimum there is no "slow", only stopped, so the last
     * step goes straight to zero rather than trying to hold 1.5 km/h. Reaching
     * the floor commands the stop: a wind-down is only ever the approach to one.
     */
    private fun decelStep(): Map<FitPro.Field, Double>? {
        if (!stopping) return null
        val step = stopRate * POLL_MS / 1000.0
        targetKph = (targetKph - step).coerceAtLeast(0.0)
        if (targetKph <= stopFloor || targetKph < minKph) {
            stopping = false
            rampTo = 0.0
            rampReason = ""
            targetKph = 0.0
            // "Commanded zero", not "stopped". The belt takes a moment to come
            // to rest, and the write that tells it to may not even arrive —
            // see enforceStopped, which is what actually finishes the job.
            Log.i(TAG, "wind-down complete — commanding stop")
            // A workout that ended while the belt was still easing down left
            // its tidy-up to us — see finishWorkout. It goes out behind the
            // stop, never in front of it.
            if (session == Session.SUMMARY) parkDeckAndFan()
            return mapOf(
                FitPro.Field.KPH to 0.0,
                FitPro.Field.WORKOUT_MODE to FitPro.Mode.PAUSE.toDouble(),
            )
        }
        return mapOf(FitPro.Field.KPH to targetKph)
    }

    /**
     * The belt must not be moving unless a workout is.
     *
     * This exists because it was not true. On 31 July a guided run finished,
     * the console logged "belt stopped", showed the summary, and went back to
     * the welcome screen — while the belt kept running. It ran for another
     * thirty-five seconds until somebody hit the physical stop button.
     *
     * The stop was sent once, as a one-shot `pendingWrite`, and the log for
     * that exact moment shows `dropped frame (status:failed)`. One lost frame
     * and the command was simply gone. Nothing retried it and nothing checked,
     * because the code treated "I decremented my own target to zero" as
     * meaning the machine had stopped.
     *
     * So this asks the board what it is actually doing, every poll, and keeps
     * commanding a stop until it agrees. A treadmill running with nobody
     * driving it is the worst failure this project has, and one dropped USB
     * frame should not be able to cause it.
     *
     * It then spent a month unable to fire. What it asked the board was
     * ActualKph, which this board reports as 0.00 at every speed — the same
     * fact [beltSpeed] and [probeSpeed] are both written around — so the guard
     * returned at `actualKph < STOPPED_KPH` on every poll of every day. On
     * 2026-08-28 the belt was found running against the welcome screen with
     * twenty-three hours of log behind it and not one line from here.
     *
     * The lesson is narrower than "test the net": the net *was* reasoned about
     * carefully. It was wired to the one signal the codebase already knew was
     * dead, in a different file, in a comment written by the same hand. A
     * safety check has to be fed something proven to move — see [beltStillKph].
     */
    /**
     * The best evidence available that the belt is turning, km/h.
     *
     * Whichever source can see it: the board's own ActualKph if it ever starts
     * answering, and otherwise the odometer — see [idleBeltSpeed]. Taking the
     * larger means a broken field reading zero can no longer outvote a moving
     * belt, which is exactly how the net came to be dead.
     */
    private fun beltStillKph(): Double = maxOf(lastActualKph, idleBeltKph)

    private fun enforceStopped(actualKph: Double): Map<FitPro.Field, Double>? {
        if (Session.isMoving(session)) return null
        if (actualKph < STOPPED_KPH) return null
        // FitPro 2 only. Its belt reading is real — FitPro 1's ActualKph reads
        // 0 at every speed, which is why this never came up there — so a STOP
        // is seen while the belt is still coasting to a halt, and every press
        // recorded a runaway and sent the alert. A stop that has just been
        // commanded gets time to land; one that does not land is caught after.
        if (fp2 != null && SystemClock.elapsedRealtime() - fp2StopAt < FP2_STOP_SETTLE_MS) return null
        // A wind-down *is* the stop being carried out, deliberately gradually —
        // slamming zero over it would undo the one thing it exists for. Bounded,
        // because this is the net and the net cannot be held off for ever: a
        // wind-down only ever takes speed off and reaches its floor in a few
        // seconds, so one still running after WIND_DOWN_MAX_MS has stuck.
        if (stopping) {
            if (SystemClock.elapsedRealtime() - stopSince < WIND_DOWN_MAX_MS) return null
            stopping = false
            Log.w(TAG, "wind-down still running after ${WIND_DOWN_MAX_MS / 1000}s " +
                    "— stopping the belt outright")
        }
        stopNags++
        runawayPeakKph = maxOf(runawayPeakKph, actualKph)
        if (stopNags == 1) {
            runawayAtUptime = SystemClock.elapsedRealtime()
            recordIncident("BELT RUNNING UNATTENDED at ${"%.1f".format(actualKph)} km/h " +
                    "(session=${Session.name(session)}, boardMode=$lastBoardMode) " +
                    "— commanding stop")
        }
        if (stopNags == 1 || stopNags % 25 == 0) {
            Log.w(TAG, "belt still moving at ${"%.1f".format(actualKph)} km/h " +
                    "outside a workout — commanding stop again (attempt $stopNags)")
        }
        return mapOf(
            FitPro.Field.KPH to 0.0,
            FitPro.Field.WORKOUT_MODE to FitPro.Mode.PAUSE.toDouble(),
        )
    }

    /**
     * The deck must not be left tilted when the run is over.
     *
     * `enforceStopped` exists because one dropped frame left the belt running.
     * This is the same failure for the other axis, and it went unnoticed
     * longer: every hand-authored incline plan ended flat, so nothing was ever left
     * standing on a slope. A route can end anywhere — and a run stopped early
     * ends wherever the ground happened to be, which on the first one tried was
     * a −3% descent.
     *
     * Only while `levelling`, so this can never fight somebody setting an
     * incline by hand from the welcome screen: the flag is set when a workout
     * ends and cleared the moment the deck is level or anything else takes
     * charge of the grade.
     */
    private fun enforceLevel(actualGrade: Double): Map<FitPro.Field, Double>? {
        if (!levelling) return null
        if (Session.isMoving(session)) { levelling = false; return null }
        if (Math.abs(actualGrade) < LEVEL_GRADE) { levelling = false; return null }
        levelNags++
        if (levelNags == 1 || levelNags % 25 == 0) {
            Log.w(TAG, "deck still at ${"%.1f".format(actualGrade)}% after the run " +
                    "— commanding level again (attempt $levelNags)")
        }
        return mapOf(FitPro.Field.GRADE to 0.0)
    }

    /**
     * Turn the fan off after the run, and keep asking until it is.
     *
     * The belt stops and the deck levels, both of them enforced rather than
     * asked once — and the fan was left out of that. It ran on after a run
     * ended on 2026-08-07. It is not a safety interlock like the belt, but it
     * is the same promise: what the run turned on, the end of the run turns
     * off, and it is *seen* to turn off.
     *
     * Gives up after [FAN_OFF_NAGS] rather than nagging for ever, because on a
     * board that does not report FAN_STATE there is nothing to confirm against
     * and a silent forever-loop of writes is its own bug.
     */
    private fun enforceFanOff(): Map<FitPro.Field, Double>? {
        if (!fanStopping) return null
        if (Session.isMoving(session)) { fanStopping = false; return null }
        // Confirmed off by the board, where the board will say.
        if (fanReadable == true && fanState == 0) {
            fanStopping = false
            Log.i(TAG, "fan: confirmed off")
            return null
        }
        fanOffNags++
        if (fanOffNags > FAN_OFF_NAGS) {
            fanStopping = false
            // Not readable means not confirmable — say so rather than claim it.
            if (fanReadable == true) Log.w(TAG, "fan: still on after $fanOffNags attempts")
            else Log.i(TAG, "fan: off commanded (board does not report fan state)")
            return null
        }
        fanState = 0
        return mapOf(FitPro.Field.FAN_STATE to 0.0)
    }

    /**
     * Show the recap and put the machine back how it should be found.
     *
     * A wind-down still in flight owns the board, and this hands it everything:
     * no speed write, no deck write, no levelling nag. Those all outrank
     * [decelStep] in the poll loop's order, and a belt still at running pace
     * must not queue behind a deck that moves one percent every three seconds.
     * The wind-down does the tidying when it lands — see [parkDeckAndFan].
     *
     * The numbers are those of the moment of ending, not of the moment the belt
     * finally rests. A summary whose distance kept climbing while it was being
     * read would be a stranger thing than a couple of coasting metres missing
     * from it.
     */
    private fun finishWorkout() {
        if (Session.isMoving(session)) {
            accumulatedMs += SystemClock.elapsedRealtime() - activeSince
        }
        session = Session.SUMMARY
        phaseEndsAt = 0L
        rampTo = 0.0
        pausedKph = 0.0
        Log.i(TAG, "workout ended: ${"%.0f".format(sessionDistance)} m in " +
                "${accumulatedMs / 1000} s, ${"%.0f".format(sessionCalories)} kcal" +
                if (pulseSamples > 0) ", hr ${avgPulseNow()}/${maxPulse}" else "")
        // Recorded before the screen draws, so the summary can show what this
        // run beat. Guests are summarised and forgotten — see History.record.
        earned = history.record(History.Run(
            who = runner,
            startedAt = sessionStartWall(),
            elapsed = accumulatedMs / 1000.0,
            distance = sessionDistance,
            calories = sessionCalories,
            climbM = climbM,
            avgSpeed = avgPace(),
            maxSpeed = maxSpeed,
            maxIncline = maxIncline,
            avgPulse = avgPulseNow(),
            maxPulse = maxPulse,
            plan = planName,
            workoutId = recorder.currentId,
        ))
        if (earned.isNotEmpty()) Log.i(TAG, "achievements: ${earned.joinToString("; ")}")
        // And the trace, closed and handed on. Building the workout happens
        // off this thread; the summary picks up how sending it went from
        // TrailMate.summaryState as it changes.
        trailmate.clearSummary()
        recorder.finish()
        if (stopping) return          // the wind-down parks the machine after it
        rampReason = ""
        targetKph = 0.0
        parkDeckAndFan()
        // The belt goes in the same write. This is the one path where no
        // wind-down has commanded the stop already, so it must be commanded
        // here — and it must not be left out of the write parkDeckAndFan
        // queued, which would drop it.
        pendingWrite = mapOf(
            FitPro.Field.KPH to 0.0,
            FitPro.Field.GRADE to 0.0,
            FitPro.Field.WORKOUT_MODE to FitPro.Mode.PAUSE.toDouble(),
        )
    }

    /**
     * Put the deck back to level and the fan off, and keep asking until the
     * board agrees on both — [enforceLevel] and [enforceFanOff] do the asking.
     *
     * Split out of [finishWorkout] because it does not always run there: a
     * workout can end while the belt is still winding down, and everything in
     * here has to wait until it has stopped.
     */
    private fun parkDeckAndFan() {
        targetGrade = 0.0
        pendingWrite = mapOf(FitPro.Field.GRADE to 0.0)
        levelling = true
        levelNags = 0
        // The fan goes off with everything else. It was running on after the
        // run ended because nothing here ever told it to stop.
        fanStopping = true
        fanOffNags = 0
    }

    /** The segment after [idx], or null at the end. */
    private fun followingStep(idx: Int): Plan.Step? =
        if (idx < 0) null else planSteps.getOrNull(idx + 1)

    /**
     * Forget the plan, here and on the page. The page keeps the last plan it
     * was sent, so without the push a free run's warm-up announced the last
     * workout's steps ("1 stretches ahead · first up: Heart rate zone 2").
     */
    private fun clearPlan() {
        workoutRunner = null
        workoutView = null
        route = null
        planName = ""
        planSteps = emptyList()
        stepIndex = -1
        inclineAuto = false
        planElapsed = 0.0
        pushPlan()
    }

    /** The segment the run is currently in, or null on a casual run. */
    private fun currentStep(): Plan.Step? {
        if (planSteps.isEmpty()) return null
        return planSteps.getOrNull(stepIndex.coerceAtLeast(0))
    }

    /**
     * Run the guided run: advance the segment, then nudge the deck towards
     * whatever that segment asks for.
     *
     * Plan time is *session* time, which already excludes anything spent
     * paused — a run interrupted for two minutes should still be the run that
     * was chosen, not two minutes shorter.
     */
    /**
     * Run a route: advance the segment by **distance travelled** rather than by
     * the clock, and nudge the deck towards it.
     *
     * This is the one substantive difference between a route and a timed plan,
     * and it is not a detail. A route was recorded outdoors, where the hill
     * arrived at a certain point on the ground. Replay it on a timer while
     * running slower indoors than out and the hill arrives late, the run ends
     * before the route does, and the summit — the reason for choosing it — is
     * never reached. Driven by distance, the ground arrives where it did
     * outdoors however fast it is taken.
     */
    private fun routeTick(metres: Double) {
        val r = route ?: return

        // The HUD's position marker reads planElapsed against the plan steps,
        // and a route's steps are in metres — so this is metres too. Without
        // it the runner sat at the start line for the whole run while the
        // ground moved under them, which is what the first route showed.
        planElapsed = metres

        if (metres >= r.distanceM) {
            if (!stopping) {
                Log.i(TAG, "route: ${r.name} complete at ${"%.0f".format(metres)} m")
                // The route is *not* cleared here: clearing it dropped the guided
                // view, and what the console fell back to was the casual lap
                // counter, which is where a finished route used to spend its
                // last few seconds. It goes on the way out of the summary.
                requestFinish()
            }
            return
        }

        val idx = r.segments.indexOfFirst { metres < it.endM }.coerceAtLeast(0)
        if (idx != stepIndex) {
            stepIndex = idx
            inclineAuto = true
            Log.i(TAG, "route: segment ${idx + 1}/${r.segments.size} at " +
                    "${"%.0f".format(metres)} m — ${"%.1f".format(r.segments[idx].incline)}%")
        }
        driveIncline(r.inclineAt(metres))
    }

    /**
     * Move the deck towards the segment's target, slowly.
     *
     * Only ever while the belt is genuinely moving and under the plan's control:
     * a paused run, a pulled safety key or a manual override all stop the hill
     * dead where it is.
     */
    private fun driveIncline(target: Double) {
        if (inclineAuto) stepInclineTowards(target)
    }

    /**
     * One step of the deck towards [target], at the runner's incline rate. The
     * caller decides whether the plan still has the deck; this only moves it,
     * and only while the belt is genuinely moving.
     */
    private fun stepInclineTowards(target: Double) {
        if (dmk || session != Session.ACTIVE) return
        if (pendingWrite != null) return          // don't stamp on a queued write

        val goal = target.coerceIn(minGrade, maxGrade)
        if (Math.abs(targetGrade - goal) < 0.05) return

        val now = SystemClock.elapsedRealtime()
        if (now - lastInclineMoveAt < cfg.inclineEveryMs()) return
        lastInclineMoveAt = now

        val next = if (targetGrade < goal) {
            (targetGrade + cfg.inclineStep()).coerceAtMost(goal)
        } else {
            (targetGrade - cfg.inclineStep()).coerceAtLeast(goal)
        }
        targetGrade = next.coerceIn(minGrade, maxGrade)
        pendingWrite = mapOf(FitPro.Field.GRADE to targetGrade)
        Log.i(TAG, "guided: incline -> ${"%.1f".format(targetGrade)}% (goal ${"%.1f".format(goal)}%)")
    }

    /**
     * The belt starts for a planned run — a route or a workout —
     * straight into ACTIVE: each brings its own opening, so the console's
     * timed warm-up would be a second one. [rampKph] is where the belt eases
     * up to first; 0 leaves it to the plan.
     */
    private fun beginPlannedRun(rampKph: Double) {
        workout = WORKOUT
        resetSession()
        session = Session.ACTIVE
        activeSince = SystemClock.elapsedRealtime()
        phaseEndsAt = 0L
        targetKph = 0.0
        targetGrade = 0.0
        rampTo = rampKph
        rampReason = if (rampKph > 0) "warmup" else ""
        pendingWrite = mapOf(
            FitPro.Field.GRADE to 0.0,
            FitPro.Field.WORKOUT_MODE to FitPro.Mode.RUNNING.toDouble(),
        )
    }

    /** The speeds a workout may drive: the board's, under the runner's own limit. */
    private fun workoutLimits() = SpeedLimits.of(minKph, topKph(), cfg.workoutSpeedLimit())

    private fun startWorkout(w: Workout, zones: Zones) {
        clearPlan()
        val r = WorkoutRunner(w, zones, workoutLimits(), fallbackKph = cfg.warmupKph(),
            onStep = { i, s ->
                stepIndex = i
                recorder.mark(s.label, s.incline ?: targetGrade)
                Log.i(TAG, "workout: step ${i + 1}/${w.steps.size} — ${s.label}")
            })
        workoutZones = zones
        planSteps = r.profile()
        planName = w.name
        stepIndex = -1
        lastInclineMoveAt = 0L
        workoutRunner = r
        beginPlannedRun(0.0)
        Log.i(TAG, "workout: ${w.name}, ${w.steps.size} steps" +
                if (w.plannedId.isNotEmpty()) " (TrailMate ${w.plannedId})" else "")
        pushPlan()
        repaint()
    }

    /**
     * The heart rate heart-rate control steers by: a strap's only, since grip
     * readings come and go with the runner's hands. On the simulator, its
     * pretend heart stands in for a strap.
     */
    private fun controlBpm(): Int = strap.bpm().takeIf { it > 0 } ?: sim?.heartBpm() ?: 0

    private fun workoutProgress() = WorkoutRunner.Progress(
        movingS = elapsedSec(), metres = sessionDistance, bpm = controlBpm(),
        nowMs = SystemClock.elapsedRealtime(), currentKph = targetKph,
    )

    /** One frame of a workout: the runner says what to drive, the console drives it. */
    private fun workoutTick() {
        val r = workoutRunner ?: return
        val p = workoutProgress()
        val cmd = r.tick(p)
        if (r.finished) {
            if (!stopping) {
                Log.i(TAG, "workout: ${r.workout.name} complete")
                requestFinish()   // the plan stays for the summary, as for routes
            }
            return
        }
        planElapsed = r.profilePosition(p, planSteps)
        cmd.speedKph?.let(::driveSpeed)
        cmd.incline?.let(::stepInclineTowards)
        workoutView = WorkoutView.of(r, p, workoutZones)
    }

    /**
     * Take the belt towards [goal] through the ordinary ramp, so a workout's
     * speed changes come at the same gentle rate as every other the console
     * makes, and a hand on the speed ends them the same way.
     */
    private fun driveSpeed(goal: Double) {
        if (dmk || session != Session.ACTIVE) return
        if (Math.abs(targetKph - goal) < 0.05 && rampTo == 0.0) return
        if (rampTo != goal) {
            rampTo = goal
            rampReason = "workout"
        }
    }

    /** Warm-up rolls into the workout; cool-down rolls into the summary. */
    private fun advancePhase() {
        if (phaseEndsAt == 0L || SystemClock.elapsedRealtime() < phaseEndsAt) return
        when (session) {
            Session.WARMUP -> {
                session = Session.ACTIVE
                phaseEndsAt = 0L
                Log.i(TAG, "warm-up complete")
            }
            Session.COOLDOWN -> requestFinish()
        }
    }

    private fun phaseLeftSec(): Double {
        if (phaseEndsAt == 0L) return 0.0
        return ((phaseEndsAt - SystemClock.elapsedRealtime()) / 1000.0).coerceAtLeast(0.0)
    }

    private fun resetSession() {
        accumulatedMs = 0L
        activeSince = SystemClock.elapsedRealtime()
        armBaseline = true
        sessionDistance = 0.0
        sessionCalories = 0.0
        maxSpeed = 0.0
        maxIncline = 0.0
        speedSum = 0.0
        inclineSum = 0.0
        samples = 0
        maxPulse = 0
        pulseSum = 0L
        pulseSamples = 0
        zoneSecs.fill(0.0)
        lastZoneAt = 0L
        climbM = 0.0
        lastClimbMetres = 0.0
        earned = emptyList()
        sessionStartedAt = System.currentTimeMillis()
        sessionStartedUptime = SystemClock.elapsedRealtime()
    }

    /**
     * When this session actually began, in wall-clock time — or 0 if unknowable.
     *
     * This board boots at 2010-01-01 and only jumps to the real time once the
     * network is up, which takes five to ten minutes. Start a run inside that
     * window and it is stamped 2010, which is what happened to three of the
     * first five runs this console ever recorded: two of them are dated
     * 2010-01-01 10:30 and 10:31, minutes apart, on days that were weeks apart.
     *
     * The correction is arithmetic rather than a guess. Two clocks started
     * together at [resetSession]: the wall clock, which NTP can yank, and
     * [SystemClock.elapsedRealtime], which it cannot. If the wall clock has
     * advanced by more than the monotonic clock says has actually passed, it
     * was corrected mid-run — and *now* is trustworthy, so the true start is
     * simply now minus however long the run has really been running. A run
     * that began before NTP and ended after it dates itself exactly. Since
     * runs run 25-40 minutes and NTP lands in 5-10, that is the usual case.
     *
     * The remaining case is a run that both starts and ends before the network
     * arrives. Nothing can date that one, so it returns 0 — "no date" — rather
     * than 2010. History treats 0 as undateable and leaves it out of streaks
     * and weekly counts instead of quietly filing it under a day in 2010 and
     * reporting a number that is wrong. Same rule as everywhere else here:
     * withhold rather than caption.
     */
    private fun sessionStartWall(): Long {
        if (sessionStartedAt <= 0L || sessionStartedUptime <= 0L) return 0L
        val ran = SystemClock.elapsedRealtime() - sessionStartedUptime
        val now = System.currentTimeMillis()
        val drifted = Math.abs(now - (sessionStartedAt + ran)) > CLOCK_JUMP_MS
        val started = if (drifted) now - ran else sessionStartedAt
        return if (started < SANE_EPOCH_MS) 0L else started
    }

    private fun elapsedSec(): Double {
        val live = if (Session.isMoving(session))
            SystemClock.elapsedRealtime() - activeSince else 0L
        return (accumulatedMs + live) / 1000.0
    }

    @SuppressLint("SetJavaScriptEnabled", "AddJavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Lets the HUD be inspected and driven from a laptop over adb, so
        // layout can be checked against fake state without arming the belt.
        //
        // Debug builds only. The DevTools socket this opens will execute
        // anything in the page's context — including the `Stride` bridge,
        // which is to say the belt — for whoever can reach it. That is a fair
        // trade on a bench and no trade at all on a treadmill in a hallway.
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        calib = cfg.beltCalibration()
        if (!calib.isEmpty) Log.i(TAG, "belt calibration: ${calib.points.size} point(s)")
        runner = cfg.defaultRunner()
        cfg.active = cfg.person(runner)?.id ?: ""
        refreshRunnerHrMax()
        applyBrightness()
        applyStrap()
        applyPod()
        applyPhones()
        // Anything queued last time goes as soon as there is a network, and a
        // run the console did not live to finish is turned into a workout.
        trailmate.start()
        trailmate.onLinked = { sync.request(it, force = true) }
        trailmate.syncInfo = { tmView.sync(it) }
        sync.start()
        recorder.recover()
        // Loaded now rather than at the first finished run, so an older
        // console's history.json is moved into the database at start-up.
        history.recent("", 0)

        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            /* The launch screen's field colour. The WebView paints this before
               the document does, so it is the one frame between the splash and
               the UI — matching it makes the handover invisible. */
            setBackgroundColor(FIELD)
            addJavascriptInterface(bridge, "Stride")
            /* A reload (the WebView recovering, or DevTools) starts the page
               from nothing, and the plan is the one thing sent once rather than
               at poll rate — so it has to go over again or the page draws a
               guided run with no ground ahead of it. */
            webViewClient = object : android.webkit.WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    if (planSteps.isNotEmpty()) pushPlan()
                    if (overApp.showing) pushOverApp(true)
                }
            }
            loadUrl(UI_URL)
        }
        setContentView(web)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY

        val filter = IntentFilter(ACTION_USB_PERMISSION)
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(permissionReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(permissionReceiver, filter)
        }

        registerDebugHooks()
        val s = sim
        if (s != null) startSim(s) else acquireBoard()
    }

    /** The page's bridge; the test harness drives the same one. */
    private val bridge by lazy { Bridge() }

    /** Netflix and the rest, with the run drawn over them. See [OverApp]. */
    private val overApp by lazy { OverApp(this, { web }, ::pushOverApp) }

    private fun pushOverApp(on: Boolean) {
        web.evaluateJavascript("window.overApp && window.overApp($on)", null)
    }

    /** In front again, by whatever road — the overlay's BACK, the other app's
     *  own back button, the launcher: the page comes home. */
    override fun onResume() {
        super.onResume()
        overApp.reclaim()
    }

    /**
     * Debug builds, when switched on with tools/sim.py: a board in software.
     * Decided once, at start-up — the USB board is then never looked for or
     * opened, so nothing this session does can reach the real belt.
     */
    private val sim: SimBoard? by lazy {
        if (BuildConfig.DEBUG && prefs.getBoolean(PREF_SIM, false)) SimBoard() else null
    }

    private fun startSim(board: SimBoard) {
        Log.w(TAG, "SIMULATOR: the real board is not opened this session — tools/sim.py off to undo")
        conn.openSim(board)
        startLoops()
    }

    /**
     * Wait for the control board to show up on the USB bus.
     *
     * It is not always there: it has been seen to drop off the bus entirely and
     * only re-enumerate after a console reboot. Failing once and giving up left
     * the HUD looking alive but permanently disconnected, so keep looking.
     */
    private fun acquireBoard() {
        thread(name = "usb-wait") {
            var announced = false
            while (running.not() && !isFinishing) {
                val device = conn.findDevice()
                if (device == null) {
                    if (!announced) {
                        Log.e(TAG, "control board not on the USB bus — waiting. " +
                                "(is com.ifit.eru enabled again? does the console need a reboot?)")
                        announced = true
                    }
                    Thread.sleep(5000)
                    continue
                }
                if (conn.hasPermission(device)) {
                    runOnUiThread { start(device) }
                    return@thread
                }
                // Must be MUTABLE: UsbManager answers by filling in EXTRA_DEVICE
                // and EXTRA_PERMISSION_GRANTED, and an immutable intent arrives
                // with neither, which reads as "denied". Invisible on the
                // Android 9 console; found on a Gen 7 running Android 13.
                val flags = if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
                val pi = PendingIntent.getBroadcast(
                    this, 0, Intent(ACTION_USB_PERMISSION).setPackage(packageName), flags
                )
                runOnUiThread {
                    (getSystemService(Context.USB_SERVICE) as UsbManager)
                        .requestPermission(device, pi)
                }
                return@thread
            }
        }
    }

    private fun start(device: UsbDevice) {
        // The simulator owns the session; the USB board stays shut.
        if (sim != null) { Log.w(TAG, "simulator on — not opening the USB board"); return }
        val err = conn.open(device)
        if (err != null) { Log.e(TAG, "open failed: $err"); return }
        startLoops()
    }

    private fun startLoops() {
        running = true
        thread(name = "fitpro-poll") { pollLoop() }
        thread(name = "fitpro-watchdog") { watchdog() }
    }

    /* ---------------------------------------------------------------- *
     * Watchdog — FitPro 2
     * ---------------------------------------------------------------- *
     *
     * Found on a Gen 7 with the belt empty, 11/10/2026: with the app frozen
     * but still holding the USB interface, the belt ran on at 2 km/h and STOP
     * on the screen did nothing — only the safety key stopped it. The same
     * board stops its belt at once when the app lets go of the interface
     * (force-closed: the belt stopped immediately).
     *
     * So this thread, which is not the poll thread, watches the poll loop's
     * heartbeat. If a workout is under way and the loop has not come round for
     * [WATCHDOG_MS] — stuck in a network call, a deadlock, anything — it lets
     * go of the board, which stops the belt, and marks the workout paused so
     * that nothing restarts the belt until somebody presses RESUME. A whole
     * frozen process takes this thread with it; that case is the board's own
     * heartbeat to solve, and the safety key in the meantime.
     *
     * FitPro 2 only: what a FitPro 1 board does on release is unknown.
     */
    @Volatile private var pollBeat = 0L
    @Volatile private var debugStallMs = 0L

    /**
     * `adb shell am broadcast -a dev.stride.hud.DEBUG_STALL_POLL -p dev.stride.hud --el ms 8000`
     * stalls the poll loop once, for testing the watchdog. Registered in debug
     * builds only; a release build has no way to do this.
     */
    private fun registerDebugHooks() {
        if (!BuildConfig.DEBUG) return
        fun listen(action: String, onReceive: (Intent) -> String?) {
            val r = object : BroadcastReceiver() {
                override fun onReceive(c: Context, i: Intent) { onReceive(i)?.let { resultData = it } }
            }
            val f = IntentFilter(action)
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(r, f, Context.RECEIVER_EXPORTED)
            else @Suppress("UnspecifiedRegisterReceiverFlag") registerReceiver(r, f)
        }

        listen("dev.stride.hud.DEBUG_STALL_POLL") { i ->
            debugStallMs = i.getLongExtra("ms", 8000L).coerceIn(0L, 30_000L)
            "stalling ${debugStallMs} ms"
        }

        // Simulator on or off. Takes effect at the next start — tools/sim.py
        // restarts the app — because which board a session talks to is decided
        // once, before anything has been opened.
        listen("dev.stride.hud.SIM") { i ->
            val on = i.getBooleanExtra("on", true)
            prefs.edit().putBoolean(PREF_SIM, on).commit()
            Log.w(TAG, "simulator ${if (on) "ON" else "off"} from the next start")
            if (on) "sim on (restart to apply)" else "sim off (restart to apply)"
        }

        // The harness. Simulator sessions only: these press the same buttons a
        // person would, and on a real board that would be driving a belt from
        // a laptop. Refused unless the session is talking to SimBoard.
        listen("dev.stride.hud.SIM_CTL") { i -> simControl(i) }
    }

    /** One harness command. Returns a line for tools/sim.py to print. */
    private fun simControl(i: Intent): String {
        val board = sim ?: return "refused: simulator is off — tools/sim.py on"
        fun f(name: String, def: Float) = i.getFloatExtra(name, def).toDouble()
        val cmd = i.getStringExtra("cmd") ?: "status"
        Log.i(TAG, "sim ctl: $cmd")
        when (cmd) {
            "start" -> bridge.choose()
            "planned" -> bridge.chooseWorkout(i.getStringExtra("id") ?: "")
            "hr" -> bridge.chooseHeartRate(i.getIntExtra("zone", 0), i.getIntExtra("min", 0), i.getIntExtra("max", 0))
            "next" -> bridge.nextStep()
            "speed" -> bridge.speed(f("by", 0.1f))
            "setspeed" -> bridge.setSpeed(f("kph", 3f))
            "incline" -> bridge.incline(f("by", 1f))
            "setincline" -> bridge.setIncline(f("pct", 0f))
            "pause" -> bridge.pause()
            "resume" -> bridge.resume()
            "end" -> bridge.end()
            "home" -> bridge.home()
            "ackkey" -> bridge.ackDmk()
            "press" -> board.press(i.getStringExtra("button") ?: "")
            "key" -> board.key(out = i.getBooleanExtra("out", true))
            "pulse" -> board.pulseOn = i.getBooleanExtra("on", true)
            "pod" -> board.podOn = i.getBooleanExtra("on", true)
            // Run as somebody, adding them if they are not here yet. A guest
            // run is never recorded for TrailMate, so testing the recording
            // needs a profile, and typing one in on the emulator every time
            // is no way to test anything.
            "runner" -> {
                val name = i.getStringExtra("name") ?: "Tester"
                if (cfg.person(name) == null) cfg.addPerson(name)
                bridge.setRunner(name)
            }
            "status" -> {}
            else -> return "unknown command '$cmd'"
        }
        return "${Session.name(session)} target=${"%.1f".format(targetKph)} km/h " +
            "grade=${"%.1f".format(targetGrade)} % plan=${planName.ifEmpty { "-" }} who=${runner.ifEmpty { "guest" }}" +
            (workoutView?.let { " step=${it.step}/${it.steps} hr=${controlBpm()} ${it.hrState?.name?.lowercase() ?: ""}" } ?: "") +
            " | ${board.status()}"
    }
    @Volatile private var watchdogTripped = false
    /** Setup and reacquire legitimately take seconds; the watchdog stands down. */
    @Volatile private var pollBusy = false

    private fun watchdog() {
        while (running) {
            Thread.sleep(500)
            if (fp2 == null || pollBusy || pollBeat == 0L || !conn.isOpen) continue
            if (!Session.isMoving(session)) continue
            val stalled = SystemClock.elapsedRealtime() - pollBeat
            if (stalled < WATCHDOG_MS) continue
            Log.e(TAG, "watchdog: poll loop silent for ${stalled} ms mid-workout — releasing the board to stop the belt")
            recordIncident("WATCHDOG: poll loop silent ${stalled} ms in ${Session.name(session)} — board released, belt stopped")
            watchdogTripped = true
            conn.close()
        }
    }

    /**
     * What the poll loop does first when it comes back after the watchdog: the
     * same as the safety key — paused, nothing remembered for the resume ramp,
     * and the board told PAUSED once it is reachable again, since it will still
     * say RUNNING.
     */
    private fun afterWatchdog() {
        watchdogTripped = false
        if (Session.isMoving(session)) {
            accumulatedMs += SystemClock.elapsedRealtime() - activeSince
            session = Session.PAUSED
            phaseEndsAt = 0L
        }
        targetKph = 0.0
        stopping = false
        pausedKph = 0.0
        rampTo = 0.0
        rampReason = ""
        pendingWrite = mapOf(
            FitPro.Field.KPH to 0.0,
            FitPro.Field.WORKOUT_MODE to FitPro.Mode.PAUSE.toDouble(),
        )
        lastReacquireMs = 0L   // reconnect now, not after the usual gap
        repaint(boardOk = false)
    }

    private fun pollLoop() {
        if (conn.isFitPro2) {
            // Gen 7. Its own start-up, and nothing below that speaks FitPro 1
            // may run against it: a FitPro 1 frame's length byte is a FitPro 2
            // message type, and a 9-byte one means BOOTLOADER.
            if (!startFitPro2()) { Log.e(TAG, "FitPro 2 board did not come up"); return }
        } else {
            if (!resolveDeviceId()) { Log.e(TAG, "board did not answer on 4 or 2"); return }
            // Before anything else. A locked board refuses reads too, so limits,
            // telemetry and every workout command all depend on this.
            unlockWithRetries()
            readLimits()
            readSleepConfig()
        }

        var rejects = 0
        while (running) {
            pollBeat = SystemClock.elapsedRealtime()
            if (watchdogTripped) afterWatchdog()
            // Standby: read the board every STANDBY_POLL_MS, not five times a
            // second. Waited in short steps that keep the heartbeat fresh — the
            // loop is slow, not stalled, and the watchdog must not think so.
            var rested = 0L
            while (standby && running && rested < STANDBY_POLL_MS - POLL_MS) {
                Thread.sleep(500)
                rested += 500
                pollBeat = SystemClock.elapsedRealtime()
            }
            // Debug builds only: stand in for a poll loop stuck in a network
            // call, so the watchdog can be tested on a real belt. See
            // registerDebugHooks.
            if (BuildConfig.DEBUG && debugStallMs > 0) {
                val ms = debugStallMs
                debugStallMs = 0
                Log.w(TAG, "debug: stalling the poll loop for $ms ms")
                Thread.sleep(ms)
            }
            // enforceStopped comes first and outranks everything, including a
            // queued write: nothing is more important than a belt that should
            // not be moving.
            /* A mode change travels alone.
             *
             * The board rejects the *whole* frame if any one field in it is
             * invalid, and WORKOUT_MODE is the field most likely to be: it is
             * a state machine, and a transition the board does not accept from
             * where it currently is fails the speed write riding alongside it.
             * On 2026-08-07 starting a run against a board wedged in
             * WorkoutMode 2 refused {KPH, WORKOUT_MODE} together, over and
             * over, and the console cycled start → refuse → end → start.
             *
             * Sending the mode by itself also gets the order right, which
             * matters on this hardware: FitPro.Mode notes that the belt will
             * not act on a speed write while the console is IDLE. Mode first,
             * then the speed it enables — and if the mode is refused, the
             * speed is still queued rather than lost with it. */
            var queued = pendingWrite
            // A stop on its way to a FitPro 2 board — see enforceStopped.
            if (fp2 != null && queued?.get(FitPro.Field.WORKOUT_MODE)?.toInt() == FitPro.Mode.PAUSE) {
                fp2StopAt = SystemClock.elapsedRealtime()
            }
            var rest: Map<FitPro.Field, Double>? = null
            if (queued != null && queued.size > 1 &&
                queued.containsKey(FitPro.Field.WORKOUT_MODE)) {
                rest = queued.filterKeys { it != FitPro.Field.WORKOUT_MODE }
                queued = mapOf(FitPro.Field.WORKOUT_MODE to
                               queued.getValue(FitPro.Field.WORKOUT_MODE))
            }

            val writes = enforceStopped(beltStillKph())
                ?: enforceLevel(lastActualGrade)
                ?: enforceFanOff()
                ?: queued ?: decelStep() ?: rampStep() ?: idleStep()

            if (writes != null) lastWriteMs = SystemClock.elapsedRealtime()
            // True speed to what this belt needs — see BeltCalibration. A copy,
            // so `writes === queued` below still recognises the queued write.
            val sent = toBoard(writes)

            /* Both protocols come down to the same three outcomes — silence, a
             * refusal, or a set of FitPro 1 field values — so everything after
             * this point, all the safety logic included, is shared. FitPro 2
             * translates inside FitPro2Board; FitPro 1 is the frame it always
             * was, plus the security block that only it has. */
            val board = fp2
            var reply: ByteArray? = null
            val outcome: FitPro2Board.Result = if (board != null) {
                board.cycle(sent, minKph)
            } else {
                reply = conn.exchange(FitPro.readWrite(deviceId, READS, sent ?: emptyMap()))
                when {
                    reply == null -> FitPro2Board.Result.Silent
                    // The board asking to be unlocked is not a dropped frame — it is a
                    // request, and the only correct answer is to authenticate again.
                    // Ignoring it costs everything: reads are refused too, so the HUD
                    // goes quiet, every workout command is silently rejected, and the
                    // console can still navigate while being unable to act.
                    FitPro.isSecurityBlock(reply) -> {
                        lastReplyMs = SystemClock.elapsedRealtime()
                        boardLocked = true
                        if (unlockAttempts == 0 || SystemClock.elapsedRealtime() - lastUnlockMs > UNLOCK_RETRY_MS) {
                            unlockAttempts++
                            lastUnlockMs = SystemClock.elapsedRealtime()
                            Log.w(TAG, "board locked (attempt $unlockAttempts) — authenticating again")
                            if (unlockWithRetries()) {
                                rejects = 0
                                unlockAttempts = 0
                            }
                        }
                        Thread.sleep(POLL_MS)
                        continue
                    }
                    else -> FitPro.rejectReason(reply, READS)
                        ?.let { FitPro2Board.Result.Rejected(it) }
                        ?: FitPro2Board.Result.Values(FitPro.parse(reply, READS))
                }
            }

            if (outcome is FitPro2Board.Result.Silent) {
                // Same rule as the reject path below: a board that has stopped
                // answering is a reason to say so, not a reason to stop
                // drawing. This one used to fall straight through to the sleep
                // and push nothing at all, which froze the screen for as long
                // as the USB read kept timing out — a second per attempt.
                repaint(boardOk = false)
                // Silence is two different things wearing the same face. The
                // machine asleep still owns its USB endpoint and is woken
                // deliberately — see [wakeBoard], which is the person's call,
                // not ours. But the board has also been seen to leave the bus
                // outright, and that one nothing but a fresh connection fixes;
                // before this, the poll loop read into a closed pipe for ever
                // and the only cure was the switch on the wall.
                val quiet = SystemClock.elapsedRealtime() - lastReplyMs
                if (quiet > SILENCE_MS &&
                    SystemClock.elapsedRealtime() - lastReacquireMs > REACQUIRE_MS) {
                    reacquire()
                }
                Thread.sleep(POLL_MS)
                continue
            }
            lastReplyMs = SystemClock.elapsedRealtime()

            if (outcome is FitPro2Board.Result.Rejected) {
                val why = outcome.reason
                // Log the first few and then every hundredth — a persistent
                // reject reason is a real signal, a lone one is just noise.
                if (rejects < 5 || rejects % 100 == 0) {
                    Log.w(TAG, "dropped frame ($why)" + (reply?.let { ": ${FitPro.hex(it)}" } ?: ""))
                }
                rejects++

                // A write the board will never accept must not be retried for
                // ever. pendingWrite is deliberately kept until a frame lands,
                // so one dropped frame cannot spend a command — but if the
                // board is refusing this particular write, that same rule turns
                // into an infinite retry that blocks everything queued behind
                // it. On 2026-08-07 finishWorkout's {KPH 0, GRADE 0, PAUSE} was
                // refused the instant the deck finished levelling, and the
                // console spent twelve minutes retrying it at 5 Hz.
                if (queued != null && writes === queued) {
                    writeTries++
                    if (writeTries > WRITE_TRIES) {
                        Log.w(TAG, "giving up on a write the board keeps refusing ($why): " +
                                   queued.keys.joinToString { it.name })
                        // A refused mode change must not take the rest of the
                        // command down with it. The speed still wants sending.
                        pendingWrite = rest
                        writeTries = 0
                    }
                }

                // Keep the screen alive. The HUD used to repaint only after a
                // good frame, so a board that refused everything froze the
                // console mid-render — buttons appeared dead, and the last
                // thing painted stayed up. The board being unhappy is worth
                // saying out loud; it is not a reason to stop drawing.
                repaint(boardOk = false)

                Thread.sleep(POLL_MS)
                continue
            }
            boardLocked = false
            writeTries = 0

            // Only now is the queued write known to have landed. Clearing it
            // before the exchange is what lost the deck-levelling command on
            // 31 July: finishWorkout queued {KPH 0, GRADE 0, PAUSE}, the very
            // next frame came back `status:failed`, and the write was already
            // gone — so the belt stopped (the decel ramp had it) and the deck
            // stayed at -3% until somebody noticed. One dropped USB frame
            // should not be able to spend a command.
            // When a mode change was split off, landing it promotes the rest of
            // the command rather than clearing the queue — the speed that was
            // asked for alongside it still has to be sent, on the very next
            // poll, now that the board is in a state that will accept it.
            if (queued != null && writes === queued) pendingWrite = rest

            val v = (outcome as FitPro2Board.Result.Values).v.filter { (f, value) ->
                // Reject anything outside what the machine says it can do.
                when (f) {
                    FitPro.Field.ACTUAL_KPH, FitPro.Field.KPH ->
                        value >= 0.0 && value <= maxKph + 0.5
                    FitPro.Field.ACTUAL_INCLINE, FitPro.Field.GRADE ->
                        value >= minGrade - 0.5 && value <= maxGrade + 0.5
                    else -> true
                }
            }
            if (v.isEmpty()) { Thread.sleep(POLL_MS); continue }

            // Follow the board rather than our own idea of the target —
            // physical button presses never reach this app.
            //
            // But not straight away. A write takes a few polls to appear in the
            // board's own KPH field, and adopting the echo before it lands puts
            // the old value back: press + at 6.4, we write 6.5, the next frame
            // still says 6.4, and the target snaps back. Press again and the
            // step is added to a stale number, so the display dances and settles
            // somewhere that was never asked for — 6.4 + 0.1 arriving at 6.6 by
            // way of 5.2, which is the board's ramp being echoed into a target.
            //
            // So the board only gets to speak once ours has had time to land.
            // Physical presses still come through: they are not writes of ours,
            // so nothing is holding the window open.
            //
            // The echo is in the board's speed, not true speed — see
            // BeltCalibration. Our own echo is left alone: translated back it
            // would be rounded, and while a calibration is being worked on it
            // is deliberately not what the table says. Anything else is the
            // machine's own keys, and is translated before it is adopted.
            if (writes == null && SystemClock.elapsedRealtime() - lastWriteMs > FOLLOW_SETTLE_MS) {
                v[FitPro.Field.KPH]?.let {
                    if (Math.abs(it - sentBeltKph) > ECHO_KPH) {
                        targetKph = quantise(calib.fromBelt(it), KPH_STEP)
                        sentBeltKph = it
                    }
                }
                v[FitPro.Field.GRADE]?.let { targetGrade = it }
            }

            val snap = accumulate(v)
            lastSnap = snap
            record(snap)
            watchSlip(snap)
            ftms.update(snap)
            // Through repaint() rather than push(), so the session stamped on
            // the frame is the one that is true at the moment it is handed to
            // the page. A press lands on a WebView thread and can arrive
            // between accumulate() and here; pushing `snap` straight out would
            // then put the screen the person just left back for a fifth of a
            // second. One path, one answer to "which screen is this".
            repaint()

            sinceFan += POLL_MS
            if (sinceFan >= FAN_EVERY_MS) { sinceFan = 0; readFan() }

            Thread.sleep(POLL_MS)
        }
    }

    /** HOME paused a moving belt; IDLE goes once it has stopped. See home(). */
    @Volatile private var idleWhenStopped = false

    /**
     * The second half of HOME on a moving belt: IDLE, once the belt is still.
     *
     * Queued rather than returned, so that a refusal is retried and given up on
     * by the same rules as any other write. A run started in the meantime
     * cancels it — that run is in charge of the board now.
     */
    private fun idleStep(): Map<FitPro.Field, Double>? {
        if (!idleWhenStopped) return null
        if (Session.isMoving(session)) { idleWhenStopped = false; return null }
        if (beltStillKph() >= STOPPED_KPH) return null
        idleWhenStopped = false
        pendingWrite = mapOf(FitPro.Field.WORKOUT_MODE to FitPro.Mode.IDLE.toDouble())
        Log.i(TAG, "home: belt stopped — board back to idle")
        return null
    }

    /**
     * One tick of the resume ramp, or null if there's nothing to wind up.
     *
     * The first step goes straight to the machine's minimum — below 1.6 km/h
     * this treadmill has no "slow", only stopped — and from there it climbs at
     * a running-pace-per-second until it reaches where you left off.
     */
    private fun rampStep(): Map<FitPro.Field, Double>? {
        val goal = rampTo
        if (goal <= 0.0 || !Session.isMoving(session) || dmk) return null

        val step = RAMP_KPH_PER_SEC * POLL_MS / 1000.0
        val done: Boolean
        if (targetKph < goal) {
            // Below the machine's minimum there is no "slow", only stopped, so
            // the first step off zero jumps straight to it.
            targetKph = (if (targetKph < minKph) minKph else targetKph + step).coerceAtMost(goal)
            done = targetKph >= goal
        } else {
            // Ramping down — cool-down easing back from whatever pace was set.
            targetKph = (targetKph - step).coerceAtLeast(goal)
            done = targetKph <= goal
        }
        if (done) {
            rampTo = 0.0
            rampReason = ""
            Log.i(TAG, "ramp complete at ${"%.1f".format(targetKph)} km/h")
        }
        return mapOf(FitPro.Field.KPH to targetKph)
    }

    /** Fold one board reading into the session and return what to display. */
    private fun accumulate(v: Map<FitPro.Field, Double>): Snapshot {
        advancePhase()
        // WorkoutMode.Dmk — the dead man's key has been pulled.
        val boardMode = v[FitPro.Field.WORKOUT_MODE]?.toInt()
        // The board reports 8 only in bursts, dropping back to Pause(3) while the
        // key may still be out — so treat it as an edge and latch it. The banner
        // then stays up until acknowledged, and re-arms instantly if 8 recurs.
        val keyOut = boardMode == FitPro.Mode.DMK
        if (keyOut) dmkLatched = true
        if (boardMode != null && boardMode != lastBoardMode) {
            Log.i(TAG, "board WorkoutMode -> $boardMode (${FitPro.Mode.name(boardMode)})")
            lastBoardMode = boardMode
        }
        // Any mode but Sleep means the machine is up, however it got there —
        // our write, the physical START, or somebody's foot on the belt. The
        // wake is then over and a later tap starts a fresh one.
        if (boardMode != null && boardMode != FitPro.Mode.SLEEP) wakeAskedAt = 0L
        if (keyOut && !dmk) Log.w(TAG, "safety key removed")
        dmk = dmkLatched
        if (keyOut && Session.isMoving(session)) {
            accumulatedMs += SystemClock.elapsedRealtime() - activeSince
            session = Session.PAUSED
            phaseEndsAt = 0L
            targetKph = 0.0
            // Nothing gradual survives the safety key. The belt is already
            // stopped by the machine itself; a wind-down still counting down
            // towards a stop it has been beaten to is only in the way.
            stopping = false
            // Deliberately *not* remembered for the resume ramp. Someone pulled
            // the safety key; whatever happens next should start from a
            // standstill and be asked for explicitly.
            pausedKph = 0.0
            rampTo = 0.0
            rampReason = ""
        }

        val rawDistance = v[FitPro.Field.DISTANCE] ?: 0.0
        // The run is measured in true metres; the idle-belt safety net below
        // stays on the raw counter, which only has to say whether it moved.
        val distance = trueOdometer(rawDistance)
        val rawCalories = v[FitPro.Field.CALORIES] ?: 0.0
        if (armBaseline) {
            baseDistance = distance
            baseCalories = rawCalories
            armBaseline = false
            Log.i(TAG, "session baseline: d=$baseDistance c=$baseCalories")
        }

        val actual = v[FitPro.Field.ACTUAL_KPH] ?: 0.0
        lastActualKph = actual
        // Must come before the "confirmed stopped" check below, which is about
        // the belt rather than about ActualKph and has to see this frame's
        // verdict, not the previous one's.
        idleBeltSpeed(rawDistance)
        // Both sources, because "stopped" has to be true of the belt and not
        // merely of the field that never populates. ActualKph reading zero was
        // enough to declare the belt stopped after a single nag, which retired
        // the nag counter without anything having stopped.
        if (beltStillKph() < STOPPED_KPH && stopNags > 0) {
            Log.i(TAG, "belt confirmed stopped after $stopNags nag(s)")
            val ran = (SystemClock.elapsedRealtime() - runawayAtUptime) / 1000
            recordIncident("belt stopped after ${ran}s unattended, " +
                    "peak ${"%.1f".format(runawayPeakKph)} km/h, $stopNags nag(s)")
            runawayPeakKph = 0.0
            stopNags = 0
        }
        val incline = v[FitPro.Field.ACTUAL_INCLINE] ?: 0.0
        lastActualGrade = incline
        if (levelNags > 0 && Math.abs(incline) < LEVEL_GRADE) {
            Log.i(TAG, "deck confirmed level after $levelNags nag(s)")
            levelNags = 0
        }

        // ActualKph reads 0.00 on this board at every speed — see beltSpeed().
        if (Session.isMoving(session) && targetKph > 0.0 && actual <= 0.0) {
            missingSpeedPolls++
            if (missingSpeedPolls > 25 && !speedProbed) { speedProbed = true; probeSpeed() }
        } else if (actual > 0.0) {
            missingSpeedPolls = 0
        }

        // The dial shows the setpoint. See Snapshot.speed for why, at length —
        // the short version is that the estimate below is built on a whole-metre
        // odometer, wanders by a few tenths whenever the deck tilts, and made a
        // 0.1 button press land two tenths away.
        //
        // The estimate is still computed, still corrected, and still allowed to
        // disagree; it just does not draw anything. It is carried as beltKph so
        // a belt that cannot reach the commanded pace still shows up — see
        // Snapshot.slipping — and so this stays diagnosable if the board ever
        // starts filling ActualKph in.
        val derived = beltSpeed(distance)
        val beltKph = when {
            // The board's reading is in the board's speed; the dial is true
            // speed. Compared untranslated, a calibrated belt would read as
            // slipping by exactly its calibration. See BeltCalibration.
            actual > 0.0 -> calib.fromBelt(actual)   // FitPro 2 answers; FitPro 1 reads 0
            // Not "zero because no workout is running". This field answers
            // "what is the belt doing", and a belt turning in manual mode is
            // turning whether or not STRIDE calls it a session. idleBeltSpeed
            // is derived from the odometer for exactly this case, and it is
            // what an FTMS client is asking for when it asks a treadmill how
            // fast it is going.
            !Session.isMoving(session) -> idleBeltKph
            derived != null -> derived      // model, corrected by the odometer
            else -> targetKph
        }
        val speed = if (Session.isMoving(session)) targetKph else 0.0

        val pulse = pulseNow(v[FitPro.Field.PULSE]?.toInt() ?: 0)

        if (Session.isMoving(session)) {
            sessionDistance = (distance - baseDistance).coerceAtLeast(0.0)
            sessionCalories = (rawCalories - baseCalories).coerceAtLeast(0.0)
            if (speed > maxSpeed) maxSpeed = speed
            if (incline > maxIncline) maxIncline = incline
            speedSum += speed
            inclineSum += incline
            samples++

            // Rise over run, against ground actually covered. Guarded against
            // the odometer jumping backwards, which it does when the board
            // resets its own counter mid-session.
            val ran = sessionDistance - lastClimbMetres
            if (ran > 0.0 && ran < 100.0) climbM += ran * incline / 100.0
            lastClimbMetres = sessionDistance

            // Zero is "no reading", never "no pulse" — see pulseNow.
            if (pulse > 0) {
                if (pulse > maxPulse) maxPulse = pulse
                pulseSum += pulse
                pulseSamples++
                if (runnerHrMax > 0) {
                    val nowMs = SystemClock.elapsedRealtime()
                    // Only credit time we were actually reading through. A gap
                    // longer than a couple of polls is a strap dropout, and the
                    // seconds inside it belong to no zone.
                    if (lastZoneAt > 0L && nowMs - lastZoneAt < ZONE_MAX_GAP_MS) {
                        val z = zoneIndex(pulse.toDouble() / runnerHrMax)
                        zoneSecs[z] += (nowMs - lastZoneAt) / 1000.0
                    }
                    lastZoneAt = nowMs
                }
            } else {
                lastZoneAt = 0L
            }
        }

        val elapsedNow = elapsedSec()
        if (Session.isMoving(session)) {
            // A route is ground, not a timetable — see routeTick.
            when {
                workoutRunner != null -> workoutTick()
                route != null -> routeTick(sessionDistance)
            }
        }
        val step = currentStep()
        val foot = podNow(speed, incline)
        val calLive = calTick(foot.kph)

        return Snapshot(
            speed = speed,
            beltKph = beltKph,
            rpm = v[FitPro.Field.RPM] ?: 0.0,
            incline = incline,
            targetSpeed = targetKph,
            targetIncline = targetGrade,
            distance = sessionDistance,
            elapsed = elapsedSec(),
            calories = sessionCalories,
            pulse = pulse,
            cadence = foot.cadence,
            power = foot.watts,
            strideM = foot.strideM,
            podKph = foot.kph,
            climbM = climbM,
            fan = fanState,
            session = session,
            workout = workout,
            dmk = dmk,
            ramping = if (rampTo > 0.0) rampReason else "",
            phaseLeft = phaseLeftSec(),
            boardMode = boardMode ?: -1,
            // Ground covered over time on the belt, not the average of a
            // sampled estimate. This is the one speed figure that can be
            // measured rather than modelled, and it is exact: both halves come
            // off counters the board keeps itself.
            avgSpeed = avgPace(),
            maxSpeed = maxSpeed,
            avgIncline = if (samples > 0) inclineSum / samples else 0.0,
            maxIncline = maxIncline,
            avgPulse = if (pulseSamples > 0) (pulseSum / pulseSamples).toInt() else 0,
            maxPulse = maxPulse,
            hrMax = runnerHrMax,
            zoneSecs = if (runnerHrMax > 0) zoneSecs.map { Math.round(it).toInt() }
                       else emptyList(),
            achievements = earned,
            who = runner,
            whoId = cfg.person(runner)?.id ?: "",
            plan = planName,
            segment = if (step != null) stepIndex + 1 else 0,
            segments = planSteps.size,
            segmentLabel = step?.label ?: "",
            // Against plan time, not session time — on a circuit those differ
            // by however many laps have gone by.
            // Seconds on a workout, **metres** on a route — the steps of a
            // route carry distance in the same fields, which is what let the
            // HUD render a 275 m opening stretch as "4:35 left". The UI is
            // told which it is rather than being left to guess.
            segmentLeft = when {
                step == null -> 0.0
                route != null -> (step.endSec - sessionDistance).coerceAtLeast(0.0)
                else -> (step.endSec - planElapsed).coerceAtLeast(0.0)
            },
            segmentLeftIsDistance = route != null,
            // On a circuit the "next" segment after the last one is the first
            // one again, because the ground comes round rather than running out.
            nextLabel = followingStep(stepIndex)?.label ?: "",
            nextIncline = followingStep(stepIndex)?.incline ?: 0.0,
            planTotalSec = planSteps.lastOrNull()?.endSec ?: 0.0,
            // A route's steps are in metres, so its ascent is real and
            // measurable. A workout's are in seconds and its climb depends on
            // how fast it is run, so it does not claim one.
            planClimbM = route?.climbM ?: 0.0,
            planPeakIncline = planSteps.maxOfOrNull { it.incline } ?: 0.0,
            trailmate = if (session == Session.SUMMARY) trailmate.summaryState() else "",
            planElapsed = planElapsed,
            inclineAuto = inclineAuto,
            boardLocked = boardLocked,
            calib = calLive,
            workoutStep = if (workoutRunner != null) workoutView else null,
        )
    }

    /** Everything the HUD needs to draw the path ahead. Sent once per plan. */
    private fun planJson(): String {
        val arr = org.json.JSONArray()
        for (s in planSteps) {
            arr.put(org.json.JSONObject()
                .put("start", Math.round(s.startSec))
                .put("end", Math.round(s.endSec))
                .put("incline", s.incline)
                .put("label", s.label))
        }
        return org.json.JSONObject()
            .put("name", planName)
            // Route steps are metres, workout steps are seconds. They share
            // the field names (`startSec`/`endSec`) for historical reasons, so
            // the drawing cannot tell them apart without being told — and it
            // has to, because only one of the two can be integrated into an
            // elevation profile. See profile() in stride-core.js.
            .put("byDistance", route != null)
            .put("steps", arr)
            .toString()
    }

    /**
     * Belt speed in km/h.
     *
     * `ActualKph` (field 16) reads 0.00 on this board at every speed. It is not
     * a framing bug — `ActualIncline` decodes correctly from the two bytes
     * immediately after it, a bare single-field read of it returns the expected
     * 7-byte frame, and devices 2 and 65 answer the same way. The board simply
     * never fills it in.
     *
     * `Distance` *is* live and truthful though, so the belt tells us its speed
     * whether or not the firmware will say so.
     *
     * **What was wrong with reading it straight off the odometer.** Distance
     * arrives in whole metres, which is far too coarse to differentiate between
     * two polls, so it used to be differentiated across a four-second window.
     * That window is the bug. It reports the average of the last four seconds,
     * so the instant the pace changes the number is describing the pace you
     * *were* running, and the whole-metre quantisation puts about ±0.5 km/h of
     * hash on top of it. A settle band hid all of that at a steady pace by
     * switching the readout over to the commanded speed — which meant the
     * moment you pressed a button the readout dropped out of the band, stopped
     * showing 6.0 and started showing the four-second average with the hash
     * back on it. Reported from the belt as "6 to 4.5 and then it slowly
     * settles", repeatedly, and quite right.
     *
     * **What it does instead.** Two halves that fail in opposite directions:
     *
     *  * [modelKph] — the belt chasing the commanded pace at a bounded rate.
     *    Instant and smooth, and wrong whenever the belt does not obey.
     *  * [trimKph] — the difference the odometer has actually accumulated,
     *    integrated slowly. Late and coarse, and the only thing here that has
     *    measured any real ground.
     *
     * The model carries the change, so pressing 7 at 6 km/h climbs from 6 to 7
     * and stops there. The trim carries the truth, so a belt that will not
     * reach 7 is shown at what it is doing within about ten seconds, and a
     * treadmill unplugged from its motor reads zero however hard the console
     * asks for 7. Neither half alone is honest; the readout is the sum.
     *
     * Returns null when there is no run in progress.
     */
    private fun beltSpeed(rawDistance: Double): Double? {
        val now = SystemClock.elapsedRealtime()
        if (!Session.isMoving(session)) {
            modelKph = 0.0; trimKph = 0.0; trimResidual = 0.0; lastEstimateAt = 0L
            return null
        }

        // First frame of a run, a poll gap long enough that integrating across
        // it would be invention, or a board that has reset its odometer: seed
        // and say nothing new. `+ 0.5` throughout because Distance is whole
        // metres rounded down, and a half-metre bias would read as a permanent
        // 0.2 km/h of shortfall at running pace.
        val gap = now - lastEstimateAt
        if (lastEstimateAt == 0L || gap > MAX_STEP_MS || rawDistance + 0.5 < modelMetres - 5.0) {
            modelMetres = rawDistance + 0.5
            lastEstimateAt = now
            return (modelKph + trimKph).coerceIn(0.0, maxKph)
        }
        lastEstimateAt = now
        val dt = gap / 1000.0

        // Predict: the belt chases what it was told, no faster than a belt can.
        val up = BELT_UP_KPH_PER_SEC * dt
        val down = BELT_DOWN_KPH_PER_SEC * dt
        modelKph += (targetKph - modelKph).coerceIn(-down, up)

        val kph = (modelKph + trimKph).coerceAtLeast(0.0)
        modelMetres += kph / 3.6 * dt

        // Correct: how far off the ground says we are. Part goes straight back
        // into position, so the residual measures the speed error rather than
        // accumulating for ever; the rest is smoothed and integrated into the
        // speed, which is the only path by which the odometer can overrule the
        // number the console asked for.
        val residual = (rawDistance + 0.5) - modelMetres
        modelMetres += TRIM_POSITION * residual

        // But only while the model has arrived.
        //
        // The model climbs at BELT_UP_KPH_PER_SEC, deliberately slower than the
        // machine. While it is still climbing, the ground disagreeing with it
        // says nothing about how fast the belt is going — only that the model
        // has not caught up yet. Integrating that is integrating a known lag,
        // and it winds up: pressing + from 3 to 8 km/h on 2026-08-10 put five
        // km/h of climb into the correction, and the readout reached 8, kept
        // going to 9, and then crept back down as the trim unwound. Exactly
        // the wobble the estimator's own notes set out to avoid, arriving by
        // the one route they did not consider.
        //
        // So the correction is frozen — not reset — for the couple of seconds
        // the model spends catching up, and resumes untouched once it has.
        // This costs nothing that matters: the model always converges on the
        // target regardless of what the belt does, so a belt that genuinely
        // cannot reach the commanded pace still ends up arrived, still gets
        // corrected, and the odometer still outvotes the setpoint. That was
        // the behaviour worth protecting and it is untouched.
        val arrived = Math.abs(targetKph - modelKph) <= TRIM_ARRIVED_KPH
        if (arrived) {
            trimResidual += TRIM_SMOOTH * (residual - trimResidual)
            trimKph += TRIM_SPEED * trimResidual / dt * 3.6
        }

        // A small disagreement is noise or belt calibration. Let it bleed away
        // rather than sit there moving the last digit — see TRIM_SETTLE_KPH.
        if (Math.abs(trimKph) < TRIM_SETTLE_KPH) {
            val bleed = TRIM_SETTLE_PER_SEC * dt
            trimKph -= trimKph.coerceIn(-bleed, bleed)
        }
        trimKph = trimKph.coerceIn(-TRIM_MAX_KPH, TRIM_MAX_KPH)

        return (modelKph + trimKph).coerceIn(0.0, maxKph)
    }

    /**
     * How fast the belt is turning while no workout is running.
     *
     * [enforceStopped] is the net that catches a belt running with nobody
     * driving it, and it was fed [lastActualKph] — which this board reports as
     * 0.00 at every speed, as [probeSpeed] and [beltSpeed] both say at length.
     * A net whose input is always zero can never fire, so on this hardware the
     * one failure the net exists for was completely unguarded. On the morning of
     * 2026-08-28 the belt was found running on the welcome screen, and there is
     * not one "belt still moving" line in the log for the twenty-three hours
     * before it: the check ran every poll and returned at the first `if` every
     * time.
     *
     * Distance is the signal that works. It is whole metres and monotonic, it is
     * already polled every [POLL_MS], and it only advances when the belt turns —
     * so it says nothing about how fast, but it is decisive about *whether*,
     * which is the entire question the net asks.
     *
     * [beltSpeed] cannot serve here: it returns null unless a run is in
     * progress, which is precisely when this is not needed.
     */
    private fun idleBeltSpeed(rawDistance: Double) {
        if (Session.isMoving(session)) {
            idleOdoMetres = -1.0
            idleBeltKph = 0.0
            return
        }
        val now = SystemClock.elapsedRealtime()
        // First idle frame, or an odometer that has gone backwards because the
        // board reseeded it: anchor here and claim nothing.
        if (idleOdoMetres < 0.0 || rawDistance < idleOdoMetres) {
            idleOdoMetres = rawDistance
            idleOdoAt = now
            idleBeltKph = 0.0
            return
        }
        val moved = rawDistance - idleOdoMetres
        val dt = now - idleOdoAt
        if (moved >= IDLE_ODO_METRES) {
            idleBeltKph = if (dt > 0L) moved / (dt / 1000.0) * 3.6 else 0.0
            idleOdoMetres = rawDistance
            idleOdoAt = now
        } else if (moved <= 0.0 && dt > IDLE_STILL_MS) {
            // Nothing has moved at all for long enough to call it still. Only
            // then is the anchor thrown away — a belt that has crawled one metre
            // keeps it, so slow movement still accumulates to a verdict instead
            // of being reset out of existence on every timeout.
            idleBeltKph = 0.0
            idleOdoMetres = rawDistance
            idleOdoAt = now
        }
    }

    /**
     * One-shot, read-only hunt for a live belt speed.
     *
     * Device 4 answers for everything else, but reports ActualKph as zero. The
     * device table has metrics as addressable devices in their own right
     * (SPEED = 65), so the reading may simply live somewhere else. Rpm comes
     * along because a motor tachometer would do just as well as a speedometer.
     */
    private fun probeSpeed() {
        // A FitPro 1 hunt through FitPro 1 devices. Never against a Gen 7 board.
        if (fp2 != null) { Log.i(TAG, "fp2: CURRENT_KPH reads 0 while the belt should move"); return }
        Log.i(TAG, "--- speed probe: ActualKph reads 0 while the belt is moving ---")
        for (dev in listOf(FitPro.Dev.TREADMILL, FitPro.Dev.MAIN, FitPro.Dev.SPEED)) {
            val reply = conn.exchange(FitPro.readWrite(dev, SPEED_PROBE))
            if (reply == null) { Log.i(TAG, "  dev $dev: no reply"); continue }
            val why = FitPro.rejectReason(reply, SPEED_PROBE)
            if (why != null) { Log.i(TAG, "  dev $dev: rejected ($why) ${FitPro.hex(reply)}"); continue }
            val p = FitPro.parse(reply, SPEED_PROBE)
            Log.i(TAG, "  dev $dev: rpm=${p[FitPro.Field.RPM]} " +
                    "actualKph=${p[FitPro.Field.ACTUAL_KPH]}  raw=${FitPro.hex(reply)}")
            Thread.sleep(100)
        }
        Log.i(TAG, "--- end speed probe (target was ${"%.1f".format(targetKph)} km/h) ---")
    }

    private fun pushPlan() {
        val json = planJson()
        runOnUiThread { web.evaluateJavascript("window.plan($json)", null) }
    }

    /** Hand a state snapshot to the page. */
    private fun push(s: Snapshot) {
        // Nothing to draw on a dark panel; leaveStandby repaints on the way out.
        if (standby) return
        val json = s.toJson()
        runOnUiThread {
            web.evaluateJavascript("window.render($json)", null)
            // The run is over. A summary is not for reading in a strip over a
            // film, so STRIDE comes back to the front for it.
            if (overApp.showing && (session == Session.SUMMARY || session == Session.WELCOME)) overApp.close()
        }
    }

    /**
     * Redraw now, on the strength of a button press, without waiting for the
     * board to answer.
     *
     * Which screen the console shows is decided entirely by our own session
     * state — but it only ever *changed* on the back of a good board frame,
     * because [pollLoop] is the only thing that pushed. So every screen
     * transition was queued behind a USB exchange, and when the board is slow
     * or unhappy that is not 200 ms. A dropped frame costs a poll; a board
     * that does not answer at all costs the full [FitProConnection] read
     * timeout, one second, every attempt; a board refusing frames repaints the
     * *previous* snapshot, which still says SUMMARY. Reported from the belt as
     * DONE taking ages to react, and it is the same wait behind PAUSE and STOP.
     *
     * The board owns the numbers. It does not get a vote on which screen the
     * person in front of it is looking at.
     *
     * The poll loop uses it too, with [boardOk] false, for the frames where
     * there is no new telemetry to draw. Those used to repaint [lastSnap]
     * verbatim, which meant a session change made on a WebView thread was
     * undone a fifth of a second later by a snapshot from before it.
     *
     * Deliberately does not write [lastSnap]: this runs on a WebView thread and
     * the poll thread owns that field. It is a repaint, not a state change —
     * the authoritative frame is along in a fifth of a second either way.
     */
    private fun repaint(boardOk: Boolean = true) {
        val base = lastSnap ?: return
        val steps = planSteps
        push(base.copy(
            boardOk = boardOk,
            session = session,
            workout = workout,
            dmk = dmk,
            plan = planName,
            segments = steps.size,
            // Same rule accumulate() uses, so a repaint between two polls
            // cannot show a segment number from the run before this one.
            segment = if (steps.isEmpty() || stepIndex < 0) 0 else stepIndex + 1,
            targetSpeed = targetKph,
            targetIncline = targetGrade,
            elapsed = elapsedSec(),
            phaseLeft = phaseLeftSec(),
            ramping = if (rampTo > 0.0) rampReason else "",
            // The panel opens and closes on a tap, not on the next poll. The
            // numbers in it are the last poll's; the note is now.
            calib = if (calOn) (base.calib?.copy(note = calNote) ?: calPending()) else null,
        ))
    }

    /** The panel's first frame, before a poll has measured anything. */
    private fun calPending() = CalibrationLive(
        kph = targetKph, belt = beltFor(targetKph), tableBelt = calib.toBelt(targetKph),
        podKph = 0.0, podSecs = 0.0, ready = false, pod = pod.connected,
        miles = !cfg.metric(), points = calib.points, note = calNote,
    )

    private fun resolveDeviceId(): Boolean {
        val probe = listOf(FitPro.Field.ACTUAL_KPH)
        for (candidate in listOf(FitPro.Dev.TREADMILL, FitPro.Dev.MAIN)) {
            val reply = conn.exchange(FitPro.readWrite(candidate, probe))
            if (reply != null && FitPro.rejectReason(reply, probe) == null) {
                deviceId = candidate
                return true
            }
            Thread.sleep(200)
        }
        return false
    }

    /**
     * Authenticate with the board.
     *
     * A locked board answers *every* ReadWriteData with securityBlock — reads
     * included — so this must succeed before the poll loop can do anything at
     * all. It is not one-off setup: the board re-locks on its own schedule,
     * across power cycles and idle days, and ICON's console re-runs the same
     * sequence every time it sees a securityBlock.
     *
     * Identity comes off the board itself rather than being configured, so a
     * different machine needs no changes: DeviceInfo gives the serial number,
     * SystemInfo the model and part number, VersionInfo the library version
     * that seeds the secret key.
     *
     * Returns true if the board accepted the challenge.
     */
    private fun unlockBoard(): Boolean {
        val dev = FitPro.Dev.MAIN

        val idReply = conn.exchange(FitPro.command(dev, FitPro.Cmd.DEVICE_INFO))
        val id = idReply?.let { FitPro.parseDeviceInfo(it) }
        if (id == null) { Log.w(TAG, "unlock: no DeviceInfo from the board"); return false }

        // ICON only unlocks above software version 75; below that the board has
        // no security to satisfy and VerifySecurity is not supported.
        if (id.softwareVersion <= 75) {
            Log.i(TAG, "unlock: board sw ${id.softwareVersion} predates security — nothing to do")
            boardLocked = false
            return true
        }

        val sysReply = conn.exchange(FitPro.command(dev, FitPro.Cmd.SYSTEM_INFO, byteArrayOf(0, 0)))
        val sys = sysReply?.let { FitPro.parseSystemInfo(it) }
        if (sys == null) { Log.w(TAG, "unlock: no SystemInfo from the board"); return false }

        val verReply = conn.exchange(FitPro.command(dev, FitPro.Cmd.VERSION_INFO, byteArrayOf(0, 0)))
        val mlv = verReply?.let { FitPro.parseMasterLibraryVersion(it) }
        if (mlv == null) { Log.w(TAG, "unlock: no VersionInfo from the board"); return false }

        val hash = FitPro.securityHash(id.serialNumber, sys.partNumber, sys.model)
        val reply = conn.exchange(FitPro.verifySecurity(dev, hash, mlv))
        if (reply == null || !FitPro.isValid(reply)) {
            Log.w(TAG, "unlock: no answer to VerifySecurity"); return false
        }
        val status = reply[3].toInt() and 0xFF
        val ok = status == FitPro.Status.DONE
        boardLocked = !ok
        // The serial, part and model ARE the unlock secret — with the public
        // hash algorithm, those three numbers authenticate this specific board.
        // So the log confirms they were read (non-zero) without printing them;
        // the identity never leaves the device. If you need the raw values for
        // debugging, read them off the board yourself, do not paste a log.
        val gotIdentity = id.serialNumber != 0 && sys.partNumber != 0 && sys.model != 0
        Log.i(TAG, "unlock: identity ${if (gotIdentity) "read" else "MISSING"}, " +
                   "mlv=$mlv -> ${FitPro.Status.name(status)}")
        return ok
    }

    /**
     * Unlock, retrying a few times before giving up on this attempt.
     *
     * The board can answer a command with nothing at all while it is settling
     * after a power cycle, and one silent frame should not cost a run.
     */
    private fun unlockWithRetries(attempts: Int = 3): Boolean {
        for (i in 1..attempts) {
            if (unlockBoard()) {
                if (i > 1) Log.i(TAG, "unlock: succeeded on attempt $i")
                return true
            }
            Thread.sleep(300)
        }
        Log.w(TAG, "unlock: failed after $attempts attempts")
        return false
    }

    /**
     * Read the fan back off the board, so the physical buttons show on screen.
     *
     * FAN_STATE is writable and we have been writing it since the fan tile
     * existed, but it was never in the read list — so pressing the console's
     * own fan button changed the machine and the HUD never found out. The soft
     * tile and the hardware disagreed, and the tile was the one that was wrong.
     *
     * Deliberately its own exchange rather than another entry in TELEMETRY.
     * FAN_STATE is field 98, which widens the read bitmask from 4 bytes to 13,
     * and if this board turns out not to report it then a sentinel or a length
     * mismatch would reject *every* frame — losing speed, incline and the whole
     * HUD to a cosmetic feature. Today already showed what a board refusing
     * every frame looks like. On its own exchange the worst case is a fan tile
     * that does not track, which is exactly where we are now.
     */
    private fun readFan() {
        // FitPro 2's fan encoding is not known yet; the tile stays local.
        if (fp2 != null) fanReadable = false
        if (fanReadable == false) return
        val reply = conn.exchange(FitPro.readWrite(deviceId, FAN_READ)) ?: return
        val why = FitPro.rejectReason(reply, FAN_READ)
        if (why != null) {
            if (fanReadable == null) {
                fanReadable = false
                Log.i(TAG, "fan: board will not report FAN_STATE ($why) — tile stays local")
            }
            return
        }
        val v = FitPro.parse(reply, FAN_READ)[FitPro.Field.FAN_STATE] ?: return
        if (fanReadable == null) {
            fanReadable = true
            Log.i(TAG, "fan: board reports FAN_STATE — tile now follows the hardware")
        }
        // Same settle rule as speed: our own write owns the value until it lands.
        if (SystemClock.elapsedRealtime() - lastWriteMs <= FOLLOW_SETTLE_MS) return
        val level = v.toInt().coerceIn(0, 4)
        if (level != fanState) {
            fanState = level
            Log.i(TAG, "fan: board says $level")
        }
    }

    /* ---------------------------------------------------------------- *
     * Sleep
     * ---------------------------------------------------------------- *
     *
     * Two things on this console sleep, and only one of them was ever ours.
     *
     * The panel dims itself after five idle minutes and comes back on a tap —
     * each UI owns that, since each owns its own sleep screen. The control
     * board runs a separate idle timer that STRIDE neither sets nor is told
     * about, and when it expires the machine goes dormant: [FitPro.Mode.SLEEP].
     * Come back after a week away and the Android side is perfectly fine, the
     * HUD draws, every button answers — and the belt will not move for
     * anything, because the hardware behind it is asleep. Until now the only
     * known cure was the switch on the wall.
     *
     * iFit's own console had the step this restores. A tap woke the display,
     * and then it asked, separately and deliberately, whether to wake the
     * machine as well. That separation is the right one and not just history:
     * waking the board spins a motor controller up in a dark room, and
     * somebody running past to read the clock has not asked for that.
     */

    /**
     * True when the board is up and talking.
     *
     * Both halves matter and they fail differently. A board that has stopped
     * answering may be asleep or may be off the bus; a board that answers
     * [FitPro.Mode.SLEEP] is plainly asleep and saying so.
     */
    private fun boardAwake(): Boolean =
        lastReplyMs > 0L &&
        SystemClock.elapsedRealtime() - lastReplyMs < SILENCE_MS &&
        lastBoardMode != FitPro.Mode.SLEEP

    /** Where the wake step has got to, for the page that is asking. */
    private fun wakeState(): String = when {
        boardAwake() -> "awake"
        wakeAskedAt == 0L -> "asleep"
        SystemClock.elapsedRealtime() - wakeAskedAt < WAKE_WAIT_MS -> "waking"
        else -> "unreachable"
    }

    /**
     * Ask the machine to come back.
     *
     * Writing [FitPro.Mode.IDLE] is the transition ICON's own console makes to
     * bring a board out of any state that is not idle, and idle is the state a
     * workout starts from — so this both wakes the machine and leaves it where
     * the START button expects to find it.
     *
     * Queued rather than sent from here: one thread owns the USB pipe (see
     * FitProConnection.exchange), and the mode is queued alone because the
     * board rejects a whole frame over one field it will not accept. The
     * enforcers that outrank a queued write are all about a belt or a deck
     * that is doing something it should not be, and a sleeping machine is
     * doing nothing at all, so none of them can starve this.
     */
    private fun wakeBoard() {
        wakeAskedAt = SystemClock.elapsedRealtime()
        Log.i(TAG, "wake: asked for the machine — board is ${
            if (lastBoardMode == null) "not answering" else FitPro.Mode.name(lastBoardMode!!)
        }")
        // Somebody is standing in front of it: worth an attempt at the
        // transport now rather than at the end of the retry gap.
        lastReacquireMs = 0L
        pendingWrite = mapOf(FitPro.Field.WORKOUT_MODE to FitPro.Mode.IDLE.toDouble())
    }

    /**
     * Rebuild the connection to the board without restarting the console.
     *
     * [acquireBoard] runs once, at startup, and stops the moment the poll loop
     * starts — so a board that left the bus afterwards was never looked for
     * again. This is that same search, from the poll thread, rate-limited by
     * [REACQUIRE_MS].
     *
     * Note the order: find the device *before* closing what we have. A board
     * that is merely asleep is still enumerated, and throwing away a working
     * handle to go looking for one would be the more expensive mistake.
     */
    private fun reacquire(): Boolean {
        pollBusy = true
        try { return reacquireBoard() } finally { pollBusy = false }
    }

    private fun reacquireBoard(): Boolean {
        lastReacquireMs = SystemClock.elapsedRealtime()
        sim?.let { s ->
            conn.openSim(s)
            val board = FitPro2Board(conn, ::physicalKey)
            if (!board.setup()) return false
            fp2 = board
            Log.i(TAG, "simulated board is answering again")
            lastReplyMs = SystemClock.elapsedRealtime()
            return true
        }
        val device = conn.findDevice()
        if (device == null) {
            Log.w(TAG, "board silent and not on the USB bus — waiting for it to re-enumerate")
            return false
        }
        if (!conn.hasPermission(device)) {
            Log.w(TAG, "board is back on the bus but USB permission is gone — needs a relaunch")
            return false
        }
        conn.close()
        val err = conn.open(device)
        if (err != null) { Log.w(TAG, "board silent — reopen failed: $err"); return false }
        if (conn.isFitPro2) {
            // A fresh subscription; there is no lock to undo on FitPro 2.
            val board = FitPro2Board(conn, ::physicalKey)
            if (!board.setup()) { Log.w(TAG, "board silent — reopened, but FitPro 2 setup failed"); return false }
            fp2 = board
            Log.i(TAG, "FitPro 2 board is answering again")
            lastReplyMs = SystemClock.elapsedRealtime()
            return true
        }
        fp2 = null
        if (!resolveDeviceId()) {
            Log.w(TAG, "board silent — reopened, but it answers on neither 4 nor 2")
            return false
        }
        Log.i(TAG, "board is answering again on device $deviceId")
        lastReplyMs = SystemClock.elapsedRealtime()
        // A board that has been away has usually re-locked while it was gone.
        unlockWithRetries()
        return true
    }

    /**
     * What the board's own idle timer is set to, read once and logged.
     *
     * Nothing reads these back: they are here because the machine going to
     * sleep is a decision the hardware makes on its own, and this is the only
     * account of that decision we can get. All three are writable on the board
     * and none of them is written — waking is a mode change, and changing how
     * long the machine stays awake is a different question that nobody has
     * asked.
     *
     * One exchange each, the way [readFan] is. The board rejects a whole frame
     * over a single field it does not support, and one missing value should
     * not take the other two down with it.
     */
    private fun readSleepConfig() {
        for (f in SLEEP_FIELDS) {
            val one = listOf(f)
            val reply = conn.exchange(FitPro.readWrite(deviceId, one))
            if (reply == null) { Log.i(TAG, "sleep: no answer for ${f.name}"); continue }
            val why = FitPro.rejectReason(reply, one)
            if (why != null) { Log.i(TAG, "sleep: board will not report ${f.name} ($why)"); continue }
            Log.i(TAG, "sleep: ${f.name} = ${FitPro.parse(reply, one)[f]}")
        }
    }

    /**
     * Bring up a Gen 7 board: product info, feature list, subscribe, limits.
     *
     * No unlock — FitPro 2 has no VerifySecurity — and no sleep config, which
     * is a FitPro 1 field set. The limits arrive with the subscription.
     */
    private fun startFitPro2(): Boolean {
        val board = FitPro2Board(conn, ::physicalKey)
        if (!board.setup()) return false
        fp2 = board
        when (val r = board.cycle(null, minKph)) {
            is FitPro2Board.Result.Values -> applyLimits(r.v)
            else -> {
                Log.w(TAG, "fp2: no limits from the board — keeping defaults")
                strap.logRadioCapabilities()
                ftms.start()
            }
        }
        lastReplyMs = SystemClock.elapsedRealtime()
        return true
    }

    private fun readLimits() {
        val reply = conn.exchange(FitPro.readWrite(deviceId, LIMITS)) ?: return
        applyLimits(FitPro.parse(reply, LIMITS))
    }

    private fun applyLimits(v: Map<FitPro.Field, Double>) {
        v[FitPro.Field.MAX_KPH]?.let { if (it > 0) maxKph = it }
        v[FitPro.Field.MIN_KPH]?.let { if (it > 0) minKph = it }
        v[FitPro.Field.MAX_GRADE]?.let { if (it != 0.0) maxGrade = it }
        v[FitPro.Field.MIN_GRADE]?.let { minGrade = it }
        Log.i(TAG, "limits: $minKph..$maxKph km/h, $minGrade..$maxGrade %")
        strap.logRadioCapabilities()
        ftms.start()
    }

    override fun onDestroy() {
        overApp.reclaim()
        running = false
        ftms.stop()
        conn.close()
        try { unregisterReceiver(permissionReceiver) } catch (_: IllegalArgumentException) {}
        super.onDestroy()
    }
}
