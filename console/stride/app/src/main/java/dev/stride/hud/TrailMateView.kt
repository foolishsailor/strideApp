package dev.stride.hud

import org.json.JSONObject

/**
 * What the screens are told about a person's TrailMate data (spec 038): the
 * home screen's Today and Tomorrow, the Workouts picker, and My settings →
 * TrailMate profile. Puts the link's state ([TrailMate]) beside what has been
 * stored ([TrailMateStore]) in one shape, so no screen has to work it out.
 */
class TrailMateView(private val tm: TrailMate, private val store: TrailMateStore) {

    /**
     * `{ state, fetchedAt, from, scopes, zones, workouts }`.
     *
     * `state`, most pressing first:
     * - "unlinked": not connected to TrailMate
     * - "reconnect": TrailMate refused the link
     * - "scope": the link may not read the schedule (made before spec 038)
     * - "never", "ok", "error": how the last fetch went
     *
     * Workouts and zones are the last ones fetched, whatever the state.
     */
    fun person(personId: String): JSONObject {
        val sched = store.fetch(personId, "schedule")
        val state = when {
            !tm.linked(personId) -> "unlinked"
            tm.reconnectNeeded(personId) -> "reconnect"
            else -> (sched?.state ?: TrailMateStore.State.NEVER).key
        }
        return JSONObject()
            .put("state", state)
            .put("fetchedAt", sched?.fetchedAt ?: 0L)
            .put("from", sched?.detail ?: "")
            .put("scopes", store.scopes(personId))
            .put("zones", store.zonesJson(personId))
            .put("workouts", store.workoutsJson(personId))
    }

    /** For TrailMate.statusJson: scopes, and how each kind of fetch last went. */
    fun sync(personId: String): JSONObject {
        val o = JSONObject().put("scopes", store.scopes(personId))
        for (kind in listOf("schedule", "routes")) {
            val f = store.fetch(personId, kind)
            o.put(kind, JSONObject()
                .put("state", (f?.state ?: TrailMateStore.State.NEVER).key)
                .put("fetchedAt", f?.fetchedAt ?: 0L)
                .put("detail", f?.detail ?: ""))
        }
        return o
    }
}
