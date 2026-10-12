package dev.stride.hud

/**
 * A guided run: an ordered list of segments the console executes.
 *
 * The source of a plan is deliberately irrelevant to the thing running it.
 * Today these are four hand-written templates; later they could come from a
 * model, or from a real route exported out of Strava. All three produce the
 * same shape, which is why this file has no idea which it is holding.
 *
 * Two rules the plan cannot break, both enforced in `MainActivity`, not here:
 *
 * * **Incline is driven, speed is not.** The deck has no interlock and cannot
 *   run away underneath anyone, so the plan moves it. The belt can, so the pace
 *   is always the runner's own.
 * * **Everything is clamped against what the board says it can do.** A plan is
 *   a proposal. The machine's own reported limits win.
 */
object Plan {

    /**
     * One block of a run.
     *
     * @param share    fraction of the total run this segment occupies
     * @param incline  target grade, %, before clamping to the board's range
     */
    data class Segment(
        val share: Double,
        val incline: Double,
        val label: String,
    )

    data class Template(
        val id: String,
        val name: String,
        val blurb: String,
        val segments: List<Segment>,
    )

    /** A segment resolved against a real duration. */
    data class Step(
        val startSec: Double,
        val endSec: Double,
        val incline: Double,
        val label: String,
    ) {
        val seconds: Double get() = endSec - startSec
    }

    /**
     * Four shapes to run, deliberately different enough from each other to be
     * worth comparing.
     *
     * Written after the first full guided session, which found the originals
     * too timid: nothing went past 6% on a machine that does −3 to +12, and
     * every hill was the same shape as every other hill. Real ground is not
     * linear. These use uneven segment lengths, uneven heights, short sharp
     * spikes and the occasional genuine descent.
     *
     * Every one still opens with a flat settle and closes with a flat ease-down.
     */
    val TEMPLATES = listOf(
        Template(
            "steady", "Steady", "One long hill, honestly earned",
            listOf(
                Segment(0.14, 0.0, "Settle in"),
                Segment(0.12, 2.0, "Gentle rise"),
                Segment(0.22, 3.5, "The long middle"),
                Segment(0.10, 5.0, "A little steeper"),
                Segment(0.16, 3.0, "Back to steady"),
                Segment(0.12, 1.5, "Easing back"),
                Segment(0.14, 0.0, "Cool down"),
            ),
        ),
        Template(
            "rolling", "Rolling hills", "Uneven ground, no two the same",
            listOf(
                Segment(0.11, 0.0, "Settle in"),
                Segment(0.09, 4.0, "First rise"),
                Segment(0.07, -1.0, "Down the far side"),
                Segment(0.12, 6.5, "The long one"),
                Segment(0.06, 1.0, "Short recovery"),
                Segment(0.05, 9.5, "The wall"),
                Segment(0.09, 2.0, "Over the top"),
                Segment(0.08, 5.5, "One more"),
                Segment(0.07, -1.5, "Long descent"),
                Segment(0.12, 3.0, "The last drag"),
                Segment(0.14, 0.0, "Cool down"),
            ),
        ),
        Template(
            "pyramid", "Pyramid", "Up in steps, down in steps",
            listOf(
                Segment(0.12, 0.0, "Settle in"),
                Segment(0.09, 2.5, "First step"),
                Segment(0.09, 5.0, "Second step"),
                Segment(0.09, 7.5, "Third step"),
                Segment(0.06, 10.0, "The peak"),
                Segment(0.04, 11.5, "One more"),
                Segment(0.09, 7.0, "Over the top"),
                Segment(0.09, 4.0, "Coming down"),
                Segment(0.09, 1.5, "Nearly level"),
                Segment(0.12, 0.0, "Cool down"),
            ),
        ),
        Template(
            "climb", "The long climb", "One ascent, with a sting near the top",
            listOf(
                Segment(0.14, 0.0, "Settle in"),
                Segment(0.10, 3.0, "The approach"),
                Segment(0.13, 5.5, "Into it"),
                Segment(0.08, 4.5, "A brief flattening"),
                Segment(0.13, 7.5, "The steep part"),
                Segment(0.05, 11.0, "The sting"),
                Segment(0.09, 6.0, "Over the crest"),
                Segment(0.10, 2.5, "The long descent"),
                Segment(0.18, 0.0, "Cool down"),
            ),
        ),
    )

    fun byId(id: String): Template? = TEMPLATES.firstOrNull { it.id == id }

    /**
     * Resolve a template against a chosen duration.
     *
     * Shares are normalised rather than trusted to sum to 1, so a template can
     * be edited without arithmetic; and the last step is stretched to land
     * exactly on the requested duration, because a run advertised as thirty
     * minutes should end at thirty minutes.
     */
    fun resolve(template: Template, minutes: Int, minGrade: Double, maxGrade: Double): List<Step> {
        val total = minutes * 60.0
        val sum = template.segments.sumOf { it.share }
        val steps = ArrayList<Step>(template.segments.size)
        var at = 0.0
        for ((i, seg) in template.segments.withIndex()) {
            val length = total * (seg.share / sum)
            val end = if (i == template.segments.lastIndex) total else at + length
            steps += Step(
                startSec = at,
                endSec = end,
                incline = seg.incline.coerceIn(minGrade, maxGrade),
                label = seg.label,
            )
            at = end
        }
        return steps
    }
}
