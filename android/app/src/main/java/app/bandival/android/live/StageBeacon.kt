package app.bandival.android.live

import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertisingSet
import android.bluetooth.le.AdvertisingSetCallback
import android.bluetooth.le.AdvertisingSetParameters
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.roundToInt

/**
 * "Bühnen-Funk": the click leader broadcasts its beat as connectionless BLE advertisements.
 * No pairing, no Wi-Fi, no internet – every Bandival app (and Bandival Pulse wearable) in range just listens.
 *
 * Payload (manufacturer data, company 0xFFFF, little-endian, 18 bytes):
 *   0  'B' 'V'          magic
 *   2  version (1)
 *   3  session (u16)    random per leader phone
 *   5  generation (u16) changes on every click start / tempo change – newest generation leads
 *   7  flags            bit0 running
 *   8  bpm × 10 (u16)
 *  10  beats per bar, 11 beat unit
 *  12  beat index (u16) beats since the grid start (incl. count-in), updated exactly on every beat
 *  14  setlist hash (u16), 16 song index, 17 count-in beats
 *
 * Followers estimate the beat phase from the receive timestamps: every packet with beat index n received at r
 * means beat n happened at r − delay, delay ≥ 0. The minimum of (r − n·period) over a few seconds converges to the
 * true phase (+ a small, fairly constant radio latency that is compensated).
 */
@SuppressLint("MissingPermission") // runtime permissions are requested by the live screen
class StageBeacon(context: Context) {
    data class Payload(
        val session: Int,
        val generation: Int,
        val running: Boolean,
        val bpm: Double,
        val beatsPerBar: Int,
        val beatUnit: Int,
        val beatIndex: Int,
        val setlistHash: Int,
        val songIndex: Int,
        val countInBeats: Int,
    )

    private val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter
    private var advertisingSet: AdvertisingSet? = null
    private var pendingPayload: Payload? = null
    private var scanning = false
    private var scanCallback: ScanCallback? = null
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    val available: Boolean get() = adapter?.isEnabled == true

    private val advertisingCallback = object : AdvertisingSetCallback() {
        override fun onAdvertisingSetStarted(advertisingSet: AdvertisingSet?, txPower: Int, status: Int) {
            if (status == ADVERTISE_SUCCESS) {
                this@StageBeacon.advertisingSet = advertisingSet
                pendingPayload?.let { update(it) }
            } else {
                _error.value = "Bühnen-Funk konnte nicht senden ($status)."
            }
        }

        override fun onAdvertisingSetStopped(advertisingSet: AdvertisingSet?) {
            this@StageBeacon.advertisingSet = null
        }
    }

    private fun data(payload: Payload): AdvertiseData =
        AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .setIncludeTxPowerLevel(false)
            .addManufacturerData(COMPANY_ID, encode(payload))
            .build()

    /** Starts or updates the broadcast. Call on every beat with the new beat index. */
    fun broadcast(payload: Payload) {
        pendingPayload = payload
        val set = advertisingSet
        if (set != null) {
            update(payload)
            return
        }
        val advertiser = adapter?.bluetoothLeAdvertiser ?: run {
            _error.value = "Dieses Handy kann nicht per Bluetooth senden – die anderen können ihm aber folgen."
            return
        }
        if (starting) return
        starting = true
        val parameters = AdvertisingSetParameters.Builder()
            .setLegacyMode(true)
            .setConnectable(false)
            .setScannable(false)
            .setInterval(AdvertisingSetParameters.INTERVAL_MIN)
            .setTxPowerLevel(AdvertisingSetParameters.TX_POWER_HIGH)
            .build()
        runCatching { advertiser.startAdvertisingSet(parameters, data(payload), null, null, null, advertisingCallback) }
            .onFailure { _error.value = it.message }
        starting = false
    }

    @Volatile private var starting = false

    private fun update(payload: Payload) {
        runCatching { advertisingSet?.setAdvertisingData(data(payload)) }
    }

    fun stopBroadcast() {
        pendingPayload = null
        runCatching { adapter?.bluetoothLeAdvertiser?.stopAdvertisingSet(advertisingCallback) }
        advertisingSet = null
    }

    fun startListening(onPayload: (Payload, Long) -> Unit) {
        if (scanning) return
        val scanner = adapter?.bluetoothLeScanner ?: return
        val callback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                val bytes = result.scanRecord?.getManufacturerSpecificData(COMPANY_ID) ?: return
                decode(bytes)?.let { onPayload(it, result.timestampNanos) }
            }

            override fun onBatchScanResults(results: MutableList<ScanResult>) = results.forEach { onScanResult(0, it) }

            override fun onScanFailed(errorCode: Int) {
                scanning = false
                _error.value = "Bühnen-Funk: Bluetooth-Empfang fehlgeschlagen ($errorCode)."
            }
        }
        val filter = ScanFilter.Builder()
            .setManufacturerData(COMPANY_ID, byteArrayOf(MAGIC_0, MAGIC_1), byteArrayOf(0xff.toByte(), 0xff.toByte()))
            .build()
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
            .setReportDelay(0)
            .build()
        runCatching {
            scanner.startScan(listOf(filter), settings, callback)
            scanCallback = callback
            scanning = true
        }.onFailure { _error.value = it.message }
    }

    fun stopListening() {
        scanCallback?.let { callback -> runCatching { adapter?.bluetoothLeScanner?.stopScan(callback) } }
        scanCallback = null
        scanning = false
    }

    fun close() {
        stopBroadcast()
        stopListening()
    }

    companion object {
        const val COMPANY_ID = 0xFFFF
        private const val MAGIC_0 = 'B'.code.toByte()
        private const val MAGIC_1 = 'V'.code.toByte()
        const val VERSION = 1
        /** Typical delay between the beat and the first packet carrying it (radio + stack), subtracted by followers. */
        const val RADIO_LATENCY_MS = 6.0

        fun encode(payload: Payload): ByteArray = ByteBuffer.allocate(18).order(ByteOrder.LITTLE_ENDIAN).apply {
            put(MAGIC_0)
            put(MAGIC_1)
            put(VERSION.toByte())
            putShort(payload.session.toShort())
            putShort(payload.generation.toShort())
            put((if (payload.running) 1 else 0).toByte())
            putShort((payload.bpm * 10).roundToInt().coerceIn(200, 4000).toShort())
            put(payload.beatsPerBar.coerceIn(1, 16).toByte())
            put(payload.beatUnit.coerceIn(1, 16).toByte())
            putShort(payload.beatIndex.toShort())
            putShort(payload.setlistHash.toShort())
            put(payload.songIndex.coerceIn(0, 255).toByte())
            put(payload.countInBeats.coerceIn(0, 64).toByte())
        }.array()

        fun decode(bytes: ByteArray): Payload? {
            if (bytes.size < 18 || bytes[0] != MAGIC_0 || bytes[1] != MAGIC_1 || bytes[2].toInt() != VERSION) return null
            val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
            return Payload(
                session = buffer.getShort(3).toInt() and 0xffff,
                generation = buffer.getShort(5).toInt() and 0xffff,
                running = (bytes[7].toInt() and 1) == 1,
                bpm = (buffer.getShort(8).toInt() and 0xffff) / 10.0,
                beatsPerBar = bytes[10].toInt() and 0xff,
                beatUnit = bytes[11].toInt() and 0xff,
                beatIndex = buffer.getShort(12).toInt() and 0xffff,
                setlistHash = buffer.getShort(14).toInt() and 0xffff,
                songIndex = bytes[16].toInt() and 0xff,
                countInBeats = bytes[17].toInt() and 0xff,
            )
        }

        fun setlistHash(setlistId: String): Int = setlistId.hashCode() and 0xffff
    }
}

/**
 * Follower side: estimates the leader's beat grid from received broadcasts (minimum filter over a sliding window).
 * Returns the grid start (beat 0) in local wall-clock milliseconds.
 */
class BeaconGridEstimator {
    private var key: Pair<Int, Int>? = null
    private var lastIndex = -1
    private var unwrapped = 0L
    /** receive time (elapsed ms), upper bound of the phase, lower bound of the phase */
    private val samples = ArrayDeque<Triple<Double, Double, Double>>()

    fun reset() {
        key = null
        lastIndex = -1
        unwrapped = 0
        samples.clear()
    }

    /** @return grid start in wall-clock ms (or null while still collecting) */
    fun add(payload: StageBeacon.Payload, receivedElapsedNanos: Long, elapsedToWallMs: Double): Double? {
        val current = payload.session to payload.generation
        if (key != current) {
            reset()
            key = current
        }
        if (lastIndex >= 0) {
            var delta = payload.beatIndex - lastIndex
            if (delta < -32768) delta += 65536
            if (delta > 32768) delta -= 65536
            unwrapped += delta
        } else {
            unwrapped = payload.beatIndex.toLong()
        }
        lastIndex = payload.beatIndex
        val received = receivedElapsedNanos / 1e6
        val period = 60_000.0 / payload.bpm
        // Beat n happened before this packet (upper bound); beat n+1 had not happened yet (lower bound).
        samples.addLast(Triple(received, received - unwrapped * period, received - (unwrapped + 1) * period))
        while (samples.isNotEmpty() && received - samples.first().first > 12_000) samples.removeFirst()
        if (samples.size < 3) return null
        val upper = samples.minOf { it.second }
        val lower = samples.maxOf { it.third }
        val phase = (if (lower <= upper) (upper + lower) / 2 else upper) - StageBeacon.RADIO_LATENCY_MS
        return phase + elapsedToWallMs
    }

    val sampleCount: Int get() = samples.size
}
