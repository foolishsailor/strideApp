package dev.stride.hud

import android.annotation.SuppressLint
import android.bluetooth.BluetoothA2dp
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothClass
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothProfile
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.util.Log

/**
 * Bluetooth headphones, paired from the console's own Settings.
 *
 * The console runs as a kiosk, so Android's Bluetooth settings are out of
 * reach, and without this there is no way to hear the coach on headphones.
 * Once a pair are connected, nothing else here is needed: the coach's voice
 * plays on the media stream (see CoachVoice) and Android sends media to
 * connected headphones by itself.
 *
 * **Not BLE.** Headphones are classic Bluetooth, so this is nothing like
 * [BleSensor]: they are found by discovery rather than a scan, they have to
 * be bonded, and the audio link is the A2DP profile. Discovery lists only
 * audio devices (major class AUDIO_VIDEO), so the list is "headphones and
 * speakers", not every phone in the house.
 *
 * **A2DP connect and disconnect are hidden APIs**, reached by reflection.
 * They are on the light greylist and allowed for this app's targetSdk 28.
 * Most headphones connect themselves as soon as they are bonded, so if the
 * reflection fails it costs a manual reconnect, not the feature.
 */
class Headphones(private val context: Context) {

    companion object {
        private val TAG = FitProConnection.TAG

        /** Classic discovery runs about 12 s on its own; this is the cap. */
        const val DISCOVERY_MS = 12_000L
    }

    private val adapter: BluetoothAdapter? =
        (context.getSystemService(Context.BLUETOOTH_SERVICE)
            as? android.bluetooth.BluetoothManager)?.adapter

    private val seen = LinkedHashMap<String, BleSensor.Found>()
    @Volatile private var a2dp: BluetoothA2dp? = null
    /** The address to connect once bonding finishes; blank if none. */
    @Volatile private var bonding = ""

    @Volatile var scanning = false
        private set

    val available: Boolean get() = adapter?.isEnabled == true

    // --- finding --------------------------------------------------------------

    @SuppressLint("MissingPermission")
    fun scan() {
        val a = adapter ?: return
        if (scanning) return
        seen.clear()
        try {
            if (a.isDiscovering) a.cancelDiscovery()
            scanning = a.startDiscovery()
        } catch (e: SecurityException) {
            Log.w(TAG, "phones: no permission to discover (${e.message})")
            scanning = false
        }
    }

    @SuppressLint("MissingPermission")
    fun stopScan() {
        scanning = false
        try { adapter?.cancelDiscovery() } catch (e: SecurityException) { }
    }

    fun found(): List<BleSensor.Found> = seen.values.sortedByDescending { it.rssi }

    // --- pairing --------------------------------------------------------------

    /** Bond if need be, then connect the audio. */
    @SuppressLint("MissingPermission")
    fun pair(address: String) {
        val dev = device(address) ?: return
        stopScan()
        try {
            if (dev.bondState == BluetoothDevice.BOND_BONDED) {
                connect(address)
            } else {
                bonding = address
                val ok = dev.createBond()
                Log.i(TAG, "phones: bonding with $address (${if (ok) "started" else "refused"})")
            }
        } catch (e: SecurityException) {
            Log.w(TAG, "phones: no permission to bond")
        }
    }

    /** Connect A2DP to a bonded pair. Harmless if already connected. */
    fun connect(address: String) {
        if (address.isBlank()) return
        val dev = device(address) ?: return
        if (connected(address)) return
        call("connect", dev)
    }

    /** Let go of the audio link but stay paired, for the console's standby.
     *  [connect] brings it back. */
    fun release(address: String) {
        val dev = device(address) ?: return
        if (connected(address)) call("disconnect", dev)
    }

    /** Disconnect and unbond, so the headphones are forgotten both ways. */
    fun forget(address: String) {
        val dev = device(address) ?: return
        call("disconnect", dev)
        try {
            dev.javaClass.getMethod("removeBond").invoke(dev)
            Log.i(TAG, "phones: forgot $address")
        } catch (e: Exception) {
            Log.w(TAG, "phones: could not unbond $address: ${e.message}")
        }
    }

    @SuppressLint("MissingPermission")
    fun connected(address: String): Boolean {
        val dev = device(address) ?: return false
        return try {
            a2dp?.getConnectionState(dev) == BluetoothProfile.STATE_CONNECTED
        } catch (e: SecurityException) {
            false
        }
    }

    private fun device(address: String): BluetoothDevice? = try {
        if (address.isBlank()) null else adapter?.getRemoteDevice(address)
    } catch (e: IllegalArgumentException) {
        null
    }

    /** BluetoothA2dp.connect / disconnect, which are @hide. See the class note. */
    private fun call(method: String, dev: BluetoothDevice) {
        val p = a2dp ?: run { Log.w(TAG, "phones: A2DP proxy not ready for $method"); return }
        try {
            p.javaClass.getMethod(method, BluetoothDevice::class.java).invoke(p, dev)
            Log.i(TAG, "phones: $method ${dev.address}")
        } catch (e: Exception) {
            Log.w(TAG, "phones: $method failed: ${e.message}")
        }
    }

    private val receiver = object : BroadcastReceiver() {
        @SuppressLint("MissingPermission")
        override fun onReceive(c: Context, i: Intent) {
            when (i.action) {
                BluetoothDevice.ACTION_FOUND -> {
                    val dev = i.getParcelableExtra<BluetoothDevice>(BluetoothDevice.EXTRA_DEVICE) ?: return
                    val cls = i.getParcelableExtra<BluetoothClass>(BluetoothDevice.EXTRA_CLASS)
                        ?: try { dev.bluetoothClass } catch (e: SecurityException) { null }
                    if (cls?.majorDeviceClass != BluetoothClass.Device.Major.AUDIO_VIDEO) return
                    val name = try { dev.name } catch (e: SecurityException) { null } ?: return
                    val rssi = i.getShortExtra(BluetoothDevice.EXTRA_RSSI, Short.MIN_VALUE).toInt()
                    seen[dev.address] = BleSensor.Found(dev.address, name, rssi)
                }
                BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> scanning = false
                BluetoothDevice.ACTION_BOND_STATE_CHANGED -> {
                    val dev = i.getParcelableExtra<BluetoothDevice>(BluetoothDevice.EXTRA_DEVICE) ?: return
                    if (dev.address != bonding) return
                    when (i.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, -1)) {
                        BluetoothDevice.BOND_BONDED -> {
                            Log.i(TAG, "phones: bonded with ${dev.address}")
                            bonding = ""
                            connect(dev.address)
                        }
                        BluetoothDevice.BOND_NONE -> {
                            Log.w(TAG, "phones: bonding with ${dev.address} failed")
                            bonding = ""
                        }
                    }
                }
            }
        }
    }

    // Last, because it hands out [receiver], declared above.
    init {
        adapter?.getProfileProxy(context, object : BluetoothProfile.ServiceListener {
            override fun onServiceConnected(profile: Int, proxy: BluetoothProfile) {
                a2dp = proxy as? BluetoothA2dp
            }
            override fun onServiceDisconnected(profile: Int) {
                a2dp = null
            }
        }, BluetoothProfile.A2DP)

        val filter = IntentFilter().apply {
            addAction(BluetoothDevice.ACTION_FOUND)
            addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
            addAction(BluetoothDevice.ACTION_BOND_STATE_CHANGED)
        }
        context.registerReceiver(receiver, filter)
    }
}
