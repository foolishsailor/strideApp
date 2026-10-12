package dev.stride.hud

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.ResolveInfo
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.Region
import android.os.Build
import android.provider.Settings as AndroidSettings
import android.util.Base64
import android.util.Log
import android.view.Gravity
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.view.WindowManager
import android.webkit.WebView
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.lang.reflect.Proxy

/**
 * Another app on the console — Netflix, mostly — with the walk over the top.
 *
 * The walk screen already docks everything to an edge: numbers along the top,
 * the rails down the sides, the controls along the bottom. So while another app
 * is open, STRIDE's page moves out of the activity and into a see-through
 * window over it. The backdrop and hero go, the numbers and controls sit in
 * drawers on a translucent panel, and the film plays in the middle. Each
 * drawer slides off its edge and back from a handle.
 *
 * **The same WebView, moved.** Not a second page: the one the activity was
 * showing is taken off the activity and added to the window manager, and given
 * back in [reclaim]. Nothing in it reloads, and everything Kotlin pushes at
 * poll rate keeps arriving, so the belt never stops being watched or driven.
 * The poll loop does not care that the activity is stopped; it never did.
 *
 * **Touches go through wherever there is no drawer.** The window covers the
 * screen, but only the parts the page reports through [touchable] — drawers,
 * handles, an open menu — take touches. The rest reach the app underneath, so
 * a programme can be picked or paused with the walk still on top. Two things
 * make that work, and both are why this is the one file that reaches past the
 * SDK:
 *
 * - The touchable region is `ViewTreeObserver.OnComputeInternalInsetsListener`,
 *   the hook the keyboard and system bubbles use. Hidden, but on the light
 *   greylist and allowed at this targetSdk. If it can't be reached, the whole
 *   window takes touches: the drawers still work, and BACK reaches the app.
 * - From Android 12, a touch passing through another app's overlay is dropped
 *   unless that overlay is at most 80 % opaque ([PASS_THROUGH_ALPHA]). The
 *   walk is drawn at that opacity over the app, which the panel under it
 *   makes no harder to read.
 *
 * Needs "display over other apps", which tools/unchain.sh already grants for
 * the boot start (see the manifest). Without it the app still opens; STRIDE
 * just isn't drawn over it.
 */
class OverApp(
    private val activity: Activity,
    private val web: () -> WebView,
    /** Tells the page whether it is over another app; for window.overApp. */
    private val onState: (Boolean) -> Unit,
) {

    companion object {
        private val TAG = FitProConnection.TAG

        const val ICON_PX = 96

        /** InputManager's default maximum obscuring opacity, Android 12 on. */
        const val PASS_THROUGH_ALPHA = 0.8f

        /** Listed first, in this order, when they are installed. Everything
         *  else launchable follows, by name. */
        val FIRST = listOf(
            "com.netflix.mediaclient", "com.netflix.ninja",
            "com.google.android.youtube", "com.google.android.youtube.tv",
            "com.amazon.avod.thirdpartyclient", "com.amazon.amazonvideo.livingroom",
            "com.disney.disneyplus", "com.wbd.stream", "com.hbo.hbonow",
            "com.apple.atve.androidtv.appletv", "com.spotify.music",
        )
    }

    private val wm = activity.applicationContext
        .getSystemService(Context.WINDOW_SERVICE) as WindowManager

    /** Only touched on the UI thread. */
    var showing = false
        private set

    /** On the way back to STRIDE. Asked at poll rate otherwise. */
    private var closing = false

    private var listed: String? = null

    // --- the list ---------------------------------------------------------------

    /** Launchable apps as JSON: [{pkg, name, icon}], icon a PNG data URL.
     *  Built once — icons take a moment, and the list doesn't change mid-walk. */
    @Synchronized
    fun list(): String = listed ?: build().also { listed = it }

    private fun build(): String {
        val pm = activity.packageManager
        val found = LinkedHashMap<String, ResolveInfo>()
        for (category in listOf(Intent.CATEGORY_LAUNCHER, Intent.CATEGORY_LEANBACK_LAUNCHER)) {
            val q = Intent(Intent.ACTION_MAIN).addCategory(category)
            for (ri in pm.queryIntentActivities(q, 0)) {
                val pkg = ri.activityInfo.packageName
                if (pkg != activity.packageName && pkg !in found) found[pkg] = ri
            }
        }
        val named = found.map { (pkg, ri) -> Triple(pkg, ri.loadLabel(pm).toString(), ri) }
            .sortedWith(compareBy(
                { FIRST.indexOf(it.first).let { i -> if (i < 0) Int.MAX_VALUE else i } },
                { it.second.lowercase() },
            ))
        return JSONArray().apply {
            for ((pkg, name, ri) in named) put(JSONObject()
                .put("pkg", pkg)
                .put("name", name)
                .put("icon", icon(ri)))
        }.toString()
    }

    private fun icon(ri: ResolveInfo): String = try {
        val d = ri.loadIcon(activity.packageManager)
        val bmp = Bitmap.createBitmap(ICON_PX, ICON_PX, Bitmap.Config.ARGB_8888)
        d.setBounds(0, 0, ICON_PX, ICON_PX)
        d.draw(Canvas(bmp))
        val out = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.PNG, 100, out)
        "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    } catch (e: Exception) {
        ""
    }

    // --- over and back ------------------------------------------------------------

    /** Open [pkg] and put the walk over it. UI thread. */
    fun open(pkg: String) {
        val pm = activity.packageManager
        val launch = pm.getLaunchIntentForPackage(pkg) ?: pm.getLeanbackLaunchIntentForPackage(pkg)
        if (launch == null) {
            Log.w(TAG, "apps: nothing to launch in $pkg")
            return
        }
        val over = AndroidSettings.canDrawOverlays(activity)
        if (!over) Log.w(TAG, "apps: no 'display over other apps' — opening $pkg without the walk on top")
        try {
            activity.startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: Exception) {
            Log.w(TAG, "apps: $pkg would not open", e)
            return
        }
        Log.i(TAG, "apps: opened $pkg")
        if (over) show()
    }

    private fun show() {
        if (showing) return
        val w = web()
        (w.parent as? ViewGroup)?.removeView(w)
        w.setBackgroundColor(Color.TRANSPARENT)
        // Everything, until the page says otherwise: a window that takes no
        // touches at all would strand the controls.
        region.setEmpty()
        whole = true
        // Detached now, so this is the view's own observer, merged into the
        // overlay's when it attaches — not the activity's.
        listenForInsets(w.viewTreeObserver)
        try {
            wm.addView(w, params())
        } catch (e: Exception) {
            // Refused after all: the page goes back where it was, so the
            // console is never left with no screen at all.
            Log.w(TAG, "apps: overlay refused", e)
            stopListening(w.viewTreeObserver)
            giveBack(w)
            return
        }
        showing = true
        onState(true)
    }

    /** Back to STRIDE full screen, from the overlay's own button or because
     *  the walk ended. [reclaim] does the rest when the activity resumes. */
    fun close() {
        if (!showing || closing) return
        closing = true
        activity.startActivity(Intent(activity, activity.javaClass)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT))
    }

    /** The activity is in front again, by whatever road: take the page back. */
    fun reclaim() {
        closing = false
        if (!showing) return
        val w = web()
        stopListening(w.viewTreeObserver)
        try { wm.removeViewImmediate(w) } catch (_: IllegalArgumentException) {}
        giveBack(w)
        showing = false
        onState(false)
    }

    private fun giveBack(w: WebView) {
        w.setBackgroundColor(MainActivity.FIELD)
        activity.setContentView(w)
    }

    private fun params() = WindowManager.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
        // Not focusable: keys, the back button and audio focus stay with the
        // app underneath. Touches inside the region still reach the page.
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
            // A window added by hand isn't accelerated unless asked, and a
            // WebView in a window that isn't draws nothing at all.
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
        PixelFormat.TRANSLUCENT,
    ).apply {
        gravity = Gravity.TOP or Gravity.START
        if (Build.VERSION.SDK_INT >= 31) alpha = PASS_THROUGH_ALPHA
    }

    // --- where touches land ------------------------------------------------------

    /** What takes touches, in screen pixels. UI thread. */
    private val region = Region()

    /** The whole window takes touches: before the page reports, and whenever
     *  something covering the screen (the pause question) is up. */
    private var whole = true

    /**
     * The page's touchable boxes, as JSON [[x, y, w, h], …] in screen pixels,
     * or "all" for the whole window. UI thread.
     */
    fun touchable(json: String) {
        if (!showing) return
        val w = web()
        if (json == "all") {
            whole = true
        } else {
            region.setEmpty()
            try {
                val boxes = JSONArray(json)
                for (i in 0 until boxes.length()) {
                    val b = boxes.getJSONArray(i)
                    val x = b.getDouble(0); val y = b.getDouble(1)
                    region.op(Rect(
                        x.toInt(), y.toInt(),
                        (x + b.getDouble(2)).toInt() + 1, (y + b.getDouble(3)).toInt() + 1,
                    ), Region.Op.UNION)
                }
                whole = false
            } catch (e: Exception) {
                Log.w(TAG, "apps: bad touchable region $json", e)
                whole = true
            }
        }
        // A layout pass is what asks the listener again.
        w.requestLayout()
    }

    private var insetsListener: Any? = null

    /** The listener, by reflection: see the class comment. Null when the
     *  platform won't hand it over, which leaves the whole window touchable. */
    private val hook: InsetsHook? by lazy {
        try {
            InsetsHook()
        } catch (e: Exception) {
            Log.w(TAG, "apps: no touchable region on this console — the app can't be touched under the walk", e)
            null
        }
    }

    private fun listenForInsets(vto: ViewTreeObserver) {
        val h = hook ?: return
        insetsListener = h.add(vto) { info ->
            if (whole) h.setWhole(info) else h.setRegion(info, region)
        }
    }

    private fun stopListening(vto: ViewTreeObserver) {
        val l = insetsListener ?: return
        hook?.remove(vto, l)
        insetsListener = null
    }

    /** The hidden ViewTreeObserver API, looked up once. */
    private class InsetsHook {
        private val listener = Class.forName("android.view.ViewTreeObserver\$OnComputeInternalInsetsListener")
        private val info = Class.forName("android.view.ViewTreeObserver\$InternalInsetsInfo")
        private val setInsets = info.getMethod("setTouchableInsets", Int::class.javaPrimitiveType)
        private val touchableRegion = info.getField("touchableRegion")
        private val byRegion = info.getField("TOUCHABLE_INSETS_REGION").getInt(null)
        /** TOUCHABLE_INSETS_FRAME. Its field is on the dark greylist (Android
         *  13 refuses it at this targetSdk) though the methods and the field
         *  above are not, so it is written out: 0 on every release since 1.
         *  The others are allowed up to targetSdk 30 — raising it past that
         *  turns this into the whole-window fallback. */
        private val byFrame = 0
        private val add = ViewTreeObserver::class.java.getMethod("addOnComputeInternalInsetsListener", listener)
        private val remove = ViewTreeObserver::class.java.getMethod("removeOnComputeInternalInsetsListener", listener)

        fun add(vto: ViewTreeObserver, compute: (Any) -> Unit): Any {
            val proxy = Proxy.newProxyInstance(listener.classLoader, arrayOf(listener)) { self, m, args ->
                when (m.name) {
                    "onComputeInternalInsets" -> { compute(args!![0]); null }
                    "equals" -> self === args?.get(0)
                    "hashCode" -> System.identityHashCode(self)
                    "toString" -> "OverApp.insets"
                    else -> null
                }
            }
            add.invoke(vto, proxy)
            return proxy
        }

        fun remove(vto: ViewTreeObserver, l: Any) {
            try { remove.invoke(vto, l) } catch (_: Exception) {}
        }

        fun setWhole(i: Any) { setInsets.invoke(i, byFrame) }

        fun setRegion(i: Any, r: Region) {
            setInsets.invoke(i, byRegion)
            (touchableRegion.get(i) as Region).set(r)
        }
    }
}
