package dev.stride.hud

/** A speed range, km/h, `minKph <= maxKph`. */
data class SpeedBand(val minKph: Double, val maxKph: Double) {
    init { require(minKph <= maxKph) { "band $minKph > $maxKph" } }
    val midKph: Double get() = (minKph + maxKph) / 2


    companion object {
        /** From m/s, the unit TrailMate sends. */
        fun ofMs(minMs: Double, maxMs: Double) = SpeedBand(minMs * 3.6, maxMs * 3.6)
    }
}

/** A heart-rate range, bpm. */
data class HrBand(val minBpm: Int, val maxBpm: Int) {
    init { require(minBpm <= maxBpm) { "band $minBpm > $maxBpm" } }
    operator fun contains(bpm: Double) = bpm >= minBpm && bpm <= maxBpm
}

/**
 * The speeds anything the console drives may use: the board's own range, and
 * the runner's workout speed limit beneath its top when they have set one.
 * The runner can still go faster by hand; only what the console chooses is
 * held to this.
 */
data class SpeedLimits(val minKph: Double, val maxKph: Double) {
    fun clamp(kph: Double): Double = kph.coerceIn(minKph, maxKph)
    fun clamp(band: SpeedBand): SpeedBand = SpeedBand(clamp(band.minKph), clamp(band.maxKph))

    companion object {
        /** [cap] of 0 means no workout speed limit. */
        fun of(boardMinKph: Double, boardMaxKph: Double, cap: Double): SpeedLimits {
            val top = if (cap > 0) minOf(boardMaxKph, cap) else boardMaxKph
            return SpeedLimits(boardMinKph, maxOf(boardMinKph, top))
        }
    }
}
