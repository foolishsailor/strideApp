package dev.stride.hud

/**
 * The NordicTrack's speed limit on a steep decline, applied to the speeds a
 * workout drives (heart-rate control, pace steps) so they never ask for more
 * than the board will give.
 *
 * The board does not advertise it (its MAX_KPH stays put); it just slows the
 * belt. Seen on 17 Oct 2026: at -6 % STRIDE asked for 9.9 km/h and the belt
 * ran 9.15, while at -3.5 to -4.5 % it ran 10-11 km/h freely. The runner's
 * account is "about 6 mph past a certain decline". So: at or below
 * [FROM_GRADE], no more than [MAX_KPH]. Both numbers are a first measurement;
 * move them if the machine says otherwise. Pure, so it is tested on the JVM.
 */
object DeclineLimit {
    /** Steeper than this (more negative) and the cap applies. */
    const val FROM_GRADE = -5.0
    /** Just under 6 mph (9.656 km/h), so a rounding never lands above it. */
    const val MAX_KPH = 9.6

    /**
     * [kph], capped if the deck is or is heading onto a steep decline: the
     * steeper of where it is ([actualGrade]) and where it is going
     * ([targetGrade]), so the belt is slowed before the board does it.
     */
    fun cap(kph: Double, actualGrade: Double, targetGrade: Double): Double =
        if (minOf(actualGrade, targetGrade) <= FROM_GRADE) minOf(kph, MAX_KPH) else kph
}
