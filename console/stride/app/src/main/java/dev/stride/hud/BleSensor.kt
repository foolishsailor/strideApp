package dev.stride.hud

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.os.SystemClock
import android.util.Log
import java.util.UUID

/**
 * A Bluetooth sensor the console reads directly: the heart-rate strap
 * ([HeartRate]) and the foot pod ([Footpod]).
 *
 * Everything here is about holding the link, and none of it is about what
 * the sensor says. Subclasses name the services to scan for, the
 * characteristics to subscribe to, and how to read a notification.
 *
 * Written for the strap and lifted out unchanged when the foot pod arrived, so
 * the dates and measurements in the comments below are the strap's.
 *
 * **These connections are the console's own.** They do not go through Home
 * Assistant and do not care whether the broker is up, for the same reason the
 * coach keeps a set of canned lines: a treadmill in a shed with no network is
 * still a treadmill.
 *
 * **Reconnection is left to `autoConnect = true`; the first connection is not.**
 * A sensor goes out of range every time its wearer walks off, and the
 * platform's own reconnect is both cheaper and better behaved than a retry loop
 * of ours. But `autoConnect` is a *background* connection: the controller looks
 * for the device on a slow duty cycle, and for an address it has never resolved
 * before that means minutes, not seconds. Pairing measured two minutes flat on
 * this console — long enough that the walk it was paired for had already
 * finished. So the first attempt is direct, and `autoConnect` takes over only
 * once there is a connection to re-establish.
 */
abstract class BleSensor(
    private val context: Context,
    /** Short name for the log: "hr", "pod". */
    private val tag: String,
    /** What a found device is called when it doesn't name itself. */
    private val fallbackName: String,
    /**
     * Scanning matches any of these services, which is what makes the list
     * "sensors of this kind" rather than "Bluetooth devices near a treadmill",
     * and a sensor nobody has heard of works on the day it is unboxed.
     */
    private val scanServices: List<UUID>,
    /**
     * True while the radio is committed elsewhere and a hunt would cost more
     * than it is worth. See [seek].
     */
    private val busy: () -> Boolean = { false },
) {

    companion object {
        val BATTERY_SERVICE: UUID = uuid16(0x180F)
        val BATTERY_LEVEL: UUID = uuid16(0x2A19)

        /** The descriptor every notify-capable characteristic carries. */
        val CCCD: UUID = uuid16(0x2902)

        const val SCAN_MS = 8_000L

        /**
         * How long to let the stack settle before asking for services.
         *
         * The platform starts its own discovery the moment a link comes up on a
         * device it has no GATT cache for, and it gets there before our
         * connection callback runs — measured at 14ms ahead on this console.
         * `discoverServices()` called into that window returns false, and a
         * refused discovery means `onServicesDiscovered` never fires, which
         * means the subscription below never happens. The sensor then sits
         * connected and silent forever, which is exactly the shape of bug that
         * looks like "the strap is broken".
         */
        const val DISCOVERY_DELAY_MS = 600L
        const val DISCOVERY_RETRY_MS = 1_000L
        const val DISCOVERY_TRIES = 5

        /**
         * How long to hunt for a sensor at full speed before going quiet.
         *
         * A seek is an active scan, so it is not free and must not run all day
         * on the chance that a strap in a drawer wakes up. A minute covers the
         * cases that matter — the strap slipping, the wearer stepping off the
         * back, a console restart mid-walk — and everything past that is
         * better served by the background connection, which costs nothing and
         * has all the time in the world.
         */
        const val SEEK_MS = 60_000L

        /**
         * How long to let a background connection sit before going back to an
         * active seek.
         *
         * `connectGatt(autoConnect = true)` hands back a client immediately and
         * then says nothing whether or not it ever finds the sensor, so a
         * background connection that will never land looks exactly like one
         * that is about to. Nothing times it out and no callback fires, which
         * left the console holding a dead client, believing it had a strap, and
         * declining to look for one — and the only way out was to forget the
         * strap and pair it again, because changing the address is the one
         * thing that got past the guard in [connect].
         *
         * So the background attempt is given a long but finite go, and then the
         * cheap-and-patient mode and the fast-and-expensive one simply take
         * turns for as long as a sensor is wanted. Five minutes because the
         * background connection usually does work and is much the kinder of the
         * two on the radio; the seek is what catches the strap that was in a
         * drawer when the walk started.
         */
        const val BACKGROUND_GIVE_UP_MS = 5 * 60_000L

        /**
         * A reading older than this is not a reading.
         *
         * Sensors notify about once a second. Ten seconds of silence means the
         * belt is running and the sensor is not connected, and showing the last
         * number it managed is worse than showing nothing — it is the same
         * class of mistake as a stale sensor holding yesterday's step count.
         */
        const val STALE_MS = 10_000L

        /** A Bluetooth SIG assigned number as a full UUID. */
        fun uuid16(id: Int): UUID =
            UUID.fromString(String.format("%08x-0000-1000-8000-00805f9b34fb", id))
    }

    data class Found(val address: String, val name: String, val rssi: Int)

    /**
     * The characteristics to subscribe to, as (service, characteristic), in
     * order. Any the device lacks are skipped.
     */
    protected abstract val subscriptions: List<Pair<UUID, UUID>>

    /** A notification from one of [subscriptions]. Called on a binder thread. */
    protected abstract fun onNotify(characteristic: UUID, data: ByteArray)

    /** The link went down or was let go: forget the readings. */
    protected abstract fun clearReadings()

    /** True if [at], an elapsedRealtime stamp, is recent enough to show. */
    protected fun fresh(at: Long): Boolean =
        at > 0L && SystemClock.elapsedRealtime() - at < STALE_MS

    protected fun log(msg: String) = Log.i(FitProConnection.TAG, "$tag: $msg")
    private fun warn(msg: String) = Log.w(FitProConnection.TAG, "$tag: $msg")

    private val handler = Handler(Looper.getMainLooper())
    private val adapter: BluetoothAdapter? =
        (context.getSystemService(Context.BLUETOOTH_SERVICE)
            as? android.bluetooth.BluetoothManager)?.adapter

    @Volatile private var gatt: BluetoothGatt? = null
    private val seen = LinkedHashMap<String, Found>()

    /** The address we are meant to be holding, blank when deliberately down. */
    @Volatile private var wanted = ""

    /** True while hunting for [wanted] to advertise — see [seek]. */
    @Volatile private var seeking = false

    /** Characteristics found but not yet subscribed to — see [subscribeNext]. */
    private val pending = ArrayDeque<BluetoothGattCharacteristic>()

    @Volatile var battery = -1
        private set
    @Volatile var connected = false
        private set
    @Volatile var scanning = false
        private set

    val available: Boolean get() = adapter?.isEnabled == true

    /**
     * What this console's radio can actually do, logged once at startup.
     *
     * Asked because somebody wanted FTMS: broadcasting the treadmill to Zwift
     * means being a BLE *peripheral*, and on cheap MediaTek parts that is
     * routinely absent while the central role this class already uses works
     * fine. Nothing here reads it yet. It is a fact worth having written down
     * before anyone designs against it.
     */
    fun logRadioCapabilities() {
        val a = adapter
        if (a == null) { Log.i(FitProConnection.TAG, "radio: no bluetooth adapter"); return }
        Log.i(FitProConnection.TAG, "radio: peripheral(multiAdvertisement)=${a.isMultipleAdvertisementSupported}" +
                " offloadedFilter=${a.isOffloadedFilteringSupported}" +
                " offloadedBatching=${a.isOffloadedScanBatchingSupported}" +
                " advertiser=${if (a.bluetoothLeAdvertiser != null) "present" else "null"}")
    }

    // --- scanning -------------------------------------------------------------

    @SuppressLint("MissingPermission")
    fun scan() {
        val scanner = adapter?.bluetoothLeScanner ?: return
        if (scanning) return
        seen.clear()
        scanning = true

        // Filtering on the service UUID is what makes this a list of sensors.
        // Several filters are OR'd: a device advertising any of them matches.
        val filters = scanServices.map {
            ScanFilter.Builder().setServiceUuid(ParcelUuid(it)).build()
        }
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()

        try {
            scanner.startScan(filters, settings, scanCallback)
        } catch (e: SecurityException) {
            warn("no scan permission (${e.message})")
            scanning = false
            return
        }
        handler.postDelayed({ stopScan() }, SCAN_MS)
    }

    @SuppressLint("MissingPermission")
    fun stopScan() {
        if (!scanning) return
        scanning = false
        try {
            adapter?.bluetoothLeScanner?.stopScan(scanCallback)
        } catch (e: SecurityException) {
            // Nothing to do; the scan stops on its own timeout anyway.
        }
    }

    private val scanCallback = object : ScanCallback() {
        @SuppressLint("MissingPermission")
        override fun onScanResult(type: Int, result: ScanResult) {
            val dev = result.device ?: return
            val name = try {
                dev.name ?: result.scanRecord?.deviceName ?: fallbackName
            } catch (e: SecurityException) {
                fallbackName
            }
            seen[dev.address] = Found(dev.address, name, result.rssi)
        }

        override fun onScanFailed(code: Int) {
            warn("scan failed ($code)")
            scanning = false
        }
    }

    fun found(): List<Found> = seen.values.sortedByDescending { it.rssi }

    // --- connecting -----------------------------------------------------------

    /**
     * Hold a connection to [address], reconnecting for as long as it is wanted.
     *
     * Asking again for the address already held is a no-op rather than a
     * restart: settings re-apply on changes that have nothing to do with the
     * sensor, and tearing a working link down to build the same one again
     * would lose a minute of readings each time.
     *
     * **A *working* link, though — not merely a client object.** This used to
     * hold off on `gatt != null`, which a background connection satisfies the
     * instant it is asked for and keeps satisfying whether or not it ever
     * reaches the sensor. Re-applying the settings then did nothing, every
     * time, and the only escape was to change the address — which is precisely
     * what forgetting the strap and pairing it again does. Keyed on [connected]
     * the guard still protects a live link and no longer protects a dead one.
     */
    @SuppressLint("MissingPermission")
    fun connect(address: String) {
        if (address.isBlank()) return
        if (address == wanted && (connected || seeking)) return
        disconnect()
        wanted = address
        seek()
    }

    /**
     * Find the sensor advertising, then connect to the device that found it.
     *
     * **This is not an optimisation, it is the fix for a failure.** A strap
     * uses a random static address — the Coospo's `DA:…` has the top two bits
     * set, which is what says so — and [BluetoothAdapter.getRemoteDevice] takes
     * a bare string, so it hands back a device the stack assumes is *public*.
     * Connecting to that guesses the address type wrong and fails with status
     * 133 a few seconds later, which is exactly what this console did on every
     * restart. A [ScanResult]'s device carries the real address type, so
     * connecting to *that* works first time.
     *
     * It is also much the faster path. Sensors advertise about once a second,
     * so a filtered scan finds one almost immediately, where the background
     * connection this used to fall back on took a measured 98–108 seconds.
     */
    @SuppressLint("MissingPermission")
    private fun seek() {
        val address = wanted
        if (address.isBlank() || seeking) return
        // Not while something is listening to the treadmill over Bluetooth.
        //
        // This console's radio cannot do both. Hunting for a strap is an
        // active scan followed by a background connect, and on 9 September
        // 2026 every single Zwift disconnection followed one: three sessions,
        // three `hr: looking` lines, three link supervision timeouts
        // (HCI 0x08) on the FTMS link within two minutes of each. A sensor that
        // is already connected costs nothing to keep, so this only blocks the
        // hunt, and only while a client is actually subscribed.
        //
        // Put the sensor on before pairing and you get both. Otherwise the
        // thing somebody is looking at wins over the thing that might be in a
        // drawer.
        if (gatt == null && busy()) return
        val scanner = adapter?.bluetoothLeScanner ?: return

        val filter = ScanFilter.Builder().setDeviceAddress(address).build()
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
        try {
            scanner.startScan(listOf(filter), settings, seekCallback)
        } catch (e: SecurityException) {
            warn("no scan permission to seek")
            return
        } catch (e: IllegalArgumentException) {
            warn("bad address $address")
            return
        }
        seeking = true
        log("looking for $address")

        // One start and one stop per seek. Android silently throttles an app
        // that starts more than five scans in thirty seconds, and a throttled
        // scan fails the same way an absent sensor does.
        handler.postDelayed({
            if (!seeking) return@postDelayed
            stopSeek()
            if (wanted.isNotBlank() && gatt == null && !busy()) {
                log("not advertising, waiting in the background")
                open(adapter?.getRemoteDevice(wanted), autoConnect = true)
            }
        }, SEEK_MS)
    }

    @SuppressLint("MissingPermission")
    private fun stopSeek() {
        if (!seeking) return
        seeking = false
        try {
            adapter?.bluetoothLeScanner?.stopScan(seekCallback)
        } catch (e: SecurityException) {
            // The scan times out on its own; nothing here is recoverable.
        }
    }

    private val seekCallback = object : ScanCallback() {
        @SuppressLint("MissingPermission")
        override fun onScanResult(type: Int, result: ScanResult) {
            if (!seeking || gatt != null) return
            stopSeek()
            open(result.device, autoConnect = false)
        }

        override fun onScanFailed(code: Int) {
            warn("seek failed ($code)")
            seeking = false
            // Failing here usually means throttling, which passes. The
            // background connection is the thing that does not give up.
            handler.postDelayed({
                if (wanted.isNotBlank() && gatt == null) {
                    open(adapter?.getRemoteDevice(wanted), autoConnect = true)
                }
            }, DISCOVERY_RETRY_MS)
        }
    }

    /** Open the GATT client against a device we have, however we came by it. */
    @SuppressLint("MissingPermission")
    private fun open(dev: BluetoothDevice?, autoConnect: Boolean) {
        if (dev == null || wanted.isBlank()) return
        gatt = try {
            dev.connectGatt(context, autoConnect, callback, BluetoothDevice.TRANSPORT_LE)
        } catch (e: SecurityException) {
            warn("no connect permission")
            null
        }
        log("opening ${if (autoConnect) "background" else "direct"} connection to ${dev.address}")
        if (autoConnect) giveBackgroundUpEventually(gatt)
    }

    /**
     * Put a clock on a background connection, because nothing else will.
     *
     * See [BACKGROUND_GIVE_UP_MS]. The client is closed rather than kept and
     * retried: a GATT that has sat unconnected is not a thing that starts
     * working, and holding it is what made the console think it already had a
     * strap.
     */
    @SuppressLint("MissingPermission")
    private fun giveBackgroundUpEventually(g: BluetoothGatt?) {
        if (g == null) return
        handler.postDelayed({
            // Superseded, no longer wanted, or it landed after all.
            if (g !== gatt || wanted.isBlank() || connected) return@postDelayed
            log("background connection never landed, looking again")
            try { g.close() } catch (e: SecurityException) { }
            gatt = null
            seek()
        }, BACKGROUND_GIVE_UP_MS)
    }

    @SuppressLint("MissingPermission")
    fun disconnect() {
        wanted = ""
        stopSeek()
        try {
            gatt?.close()
        } catch (e: SecurityException) {
            // Closing without permission is not recoverable and not worth a crash.
        }
        gatt = null
        connected = false
        clearReadings()
        battery = -1
    }

    /**
     * Ask for services, and keep asking.
     *
     * A refusal here is not rare and not fatal, but it is silent: the platform
     * returns false and simply never calls back. Retrying is the whole fix —
     * see [DISCOVERY_DELAY_MS].
     */
    @SuppressLint("MissingPermission")
    private fun discover(g: BluetoothGatt, attempt: Int) {
        handler.postDelayed({
            if (g !== gatt) return@postDelayed          // superseded by a newer link
            val ok = try { g.discoverServices() } catch (e: SecurityException) { false }
            if (ok) return@postDelayed
            if (attempt < DISCOVERY_TRIES) {
                log("discovery busy, retrying ($attempt)")
                discover(g, attempt + 1)
            } else {
                warn("service discovery refused $attempt times")
            }
        }, if (attempt == 1) DISCOVERY_DELAY_MS else DISCOVERY_RETRY_MS)
    }

    /**
     * Subscribe to the next characteristic in [pending].
     *
     * Subscribing is the descriptor write, not `setCharacteristicNotification`
     * — that call only tells the local stack to pass notifications on. Only
     * one GATT operation may be in flight, so each write waits for the last
     * to answer in onDescriptorWrite. Every one of these paths used to fail
     * silently, which is why a strap could report "Connected" and never a
     * single beat.
     */
    @SuppressLint("MissingPermission")
    private fun subscribeNext(g: BluetoothGatt) {
        val ch = pending.removeFirstOrNull() ?: return
        try {
            g.setCharacteristicNotification(ch, true)
            val d = ch.getDescriptor(CCCD) ?: run {
                warn("${ch.uuid} has no CCCD, cannot subscribe")
                subscribeNext(g)
                return
            }
            @Suppress("DEPRECATION")
            d.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
            @Suppress("DEPRECATION")
            val ok = g.writeDescriptor(d)
            if (ok) log("subscribing to ${ch.uuid}") else warn("subscribe to ${ch.uuid} refused by the stack")
        } catch (e: SecurityException) {
            return
        }
    }

    private val callback = object : BluetoothGattCallback() {

        @SuppressLint("MissingPermission")
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
            if (g !== gatt) return
            connected = newState == BluetoothProfile.STATE_CONNECTED
            log("${if (connected) "connected" else "disconnected"} (status $status)")

            if (connected) {
                discover(g, attempt = 1)
                return
            }

            clearReadings()
            if (wanted.isBlank()) return

            // Go looking again rather than retrying the address blind: a sensor
            // that dropped out mid-walk is usually back within seconds, and a
            // seek catches it as soon as it advertises. The client is reopened
            // rather than reused — a GATT that has errored never recovers, and
            // reusing it is how you get a strap that cannot reconnect until the
            // app restarts.
            try { g.close() } catch (e: SecurityException) { }
            gatt = null
            handler.postDelayed({ if (wanted.isNotBlank()) seek() }, DISCOVERY_RETRY_MS)
        }

        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                warn("service discovery failed (status $status)")
                return
            }
            pending.clear()
            for ((service, char) in subscriptions) {
                g.getService(service)?.getCharacteristic(char)?.let { pending.add(it) }
            }
            if (pending.isEmpty()) {
                warn("none of the expected characteristics")
                return
            }
            subscribeNext(g)
        }

        @SuppressLint("MissingPermission")
        override fun onDescriptorWrite(g: BluetoothGatt, d: BluetoothGattDescriptor, status: Int) {
            if (d.uuid != CCCD) return
            if (status != BluetoothGatt.GATT_SUCCESS) {
                warn("subscribe to ${d.characteristic.uuid} rejected by the sensor (status $status)")
            }
            if (pending.isNotEmpty()) { subscribeNext(g); return }
            // Battery is a nice-to-have and is read once, after the things that
            // matter are already subscribed. Concurrent GATT operations are not
            // allowed, which is why it waits until here.
            val ch = g.getService(BATTERY_SERVICE)?.getCharacteristic(BATTERY_LEVEL) ?: return
            try { g.readCharacteristic(ch) } catch (e: SecurityException) { }
        }

        @Suppress("DEPRECATION")
        override fun onCharacteristicChanged(g: BluetoothGatt, ch: BluetoothGattCharacteristic) {
            ch.value?.let { onNotify(ch.uuid, it) }
        }

        override fun onCharacteristicChanged(
            g: BluetoothGatt, ch: BluetoothGattCharacteristic, value: ByteArray
        ) {
            onNotify(ch.uuid, value)
        }

        @Suppress("DEPRECATION")
        override fun onCharacteristicRead(
            g: BluetoothGatt, ch: BluetoothGattCharacteristic, status: Int
        ) {
            if (ch.uuid == BATTERY_LEVEL) battery = ch.value?.firstOrNull()?.toInt() ?: -1
        }
    }
}
