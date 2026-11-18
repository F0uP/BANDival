package app.bandival.android.live

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothStatusCodes
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.util.concurrent.ConcurrentLinkedQueue

data class HapticSettings(val enabled: Boolean = false, val intensity: Int = 170, val accentIntensity: Int = 255, val pulseMs: Int = 45)

/** Vibration motor of this phone as a silent metronome. */
class PhoneHaptics(context: Context) {
    private val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }

    val available: Boolean get() = vibrator?.hasVibrator() == true

    fun pulse(accent: Boolean, settings: HapticSettings) {
        val motor = vibrator ?: return
        val duration = (settings.pulseMs * if (accent) 1.6 else 1.0).toLong().coerceIn(10, 300)
        val strength = if (accent) settings.accentIntensity else settings.intensity
        val amplitude = if (motor.hasAmplitudeControl()) strength.coerceIn(1, 255) else VibrationEffect.DEFAULT_AMPLITUDE
        motor.vibrate(VibrationEffect.createOneShot(duration, amplitude))
    }
}

/**
 * Bandival Pulse wearable over BLE (protocol v1). The device runs its own clock:
 * START with a start delay keeps it in sync with the audio click.
 */
@SuppressLint("MissingPermission") // permissions are requested by the UI before scan/connect
class PulseBle(private val context: Context) {
    enum class Status { Idle, Scanning, Connecting, Connected, NotFound, Error }
    data class State(val status: Status = Status.Idle, val name: String? = null, val battery: Int? = null, val firmware: String? = null, val error: String? = null)

    private val handler = Handler(Looper.getMainLooper())
    private val manager = context.getSystemService(BluetoothManager::class.java)
    private var gatt: BluetoothGatt? = null
    private var control: BluetoothGattCharacteristic? = null
    private val queue = ConcurrentLinkedQueue<ByteArray>()
    @Volatile private var writing = false

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state

    val supported: Boolean get() = manager?.adapter != null

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            stopScan()
            connect(result.device)
        }

        override fun onScanFailed(errorCode: Int) {
            _state.value = State(Status.Error, error = "Bluetooth-Suche fehlgeschlagen ($errorCode)")
        }
    }

    fun scanAndConnect() {
        val adapter = manager?.adapter
        if (adapter == null || !adapter.isEnabled) {
            _state.value = State(Status.Error, error = "Bluetooth ist ausgeschaltet.")
            return
        }
        val scanner = adapter.bluetoothLeScanner ?: return
        _state.value = State(Status.Scanning)
        val filters = listOf(ScanFilter.Builder().setServiceUuid(ParcelUuid(PulseProtocol.SERVICE)).build())
        scanner.startScan(filters, ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), scanCallback)
        handler.postDelayed({
            if (_state.value.status == Status.Scanning) {
                stopScan()
                _state.value = State(Status.NotFound, error = "Kein Bandival-Pulse-Gerät gefunden. Das Gerät ist noch in Entwicklung.")
            }
        }, 12_000)
    }

    private fun stopScan() {
        runCatching { manager?.adapter?.bluetoothLeScanner?.stopScan(scanCallback) }
    }

    private fun connect(device: BluetoothDevice) {
        _state.value = State(Status.Connecting, name = device.name)
        gatt = device.connectGatt(context, false, object : BluetoothGattCallback() {
            override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    gatt.requestConnectionPriority(BluetoothGatt.CONNECTION_PRIORITY_HIGH)
                    gatt.discoverServices()
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    control = null
                    _state.value = _state.value.copy(status = Status.Idle)
                }
            }

            override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
                val service = gatt.getService(PulseProtocol.SERVICE)
                control = service?.getCharacteristic(PulseProtocol.CONTROL)
                if (control == null) {
                    _state.value = State(Status.Error, error = "Gerät spricht nicht das Bandival-Pulse-Protokoll.")
                    return
                }
                service.getCharacteristic(PulseProtocol.STATUS)?.let { status ->
                    gatt.setCharacteristicNotification(status, true)
                    status.getDescriptor(PulseProtocol.CCCD)?.let { descriptor ->
                        if (Build.VERSION.SDK_INT >= 33) {
                            gatt.writeDescriptor(descriptor, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
                        } else {
                            @Suppress("DEPRECATION")
                            descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                            @Suppress("DEPRECATION")
                            gatt.writeDescriptor(descriptor)
                        }
                    }
                }
                _state.value = State(Status.Connected, name = gatt.device.name ?: PulseProtocol.NAME_PREFIX)
                send(PulseProtocol.hello())
            }

            @Deprecated("Deprecated in Java")
            override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
                @Suppress("DEPRECATION")
                handleStatus(characteristic.value ?: return)
            }

            override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray) {
                handleStatus(value)
            }

            override fun onCharacteristicWrite(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
                writing = false
                drain()
            }

            override fun onDescriptorWrite(gatt: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
                writing = false
                drain()
            }
        })
    }

    private fun handleStatus(bytes: ByteArray) {
        when (val status = PulseProtocol.decodeStatus(bytes)) {
            is PulseProtocol.Status.State -> _state.value = _state.value.copy(battery = status.battery, firmware = status.firmware)
            is PulseProtocol.Status.Error -> _state.value = _state.value.copy(error = "Gerätefehler ${status.code}")
            else -> Unit
        }
    }

    fun send(bytes: ByteArray) {
        if (control == null) return
        queue.add(bytes)
        drain()
    }

    @Synchronized
    private fun drain() {
        if (writing) return
        val target = control ?: return
        val connection = gatt ?: return
        val next = queue.poll() ?: return
        writing = true
        val ok = if (Build.VERSION.SDK_INT >= 33) {
            connection.writeCharacteristic(target, next, BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE) == BluetoothStatusCodes.SUCCESS
        } else {
            @Suppress("DEPRECATION")
            target.value = next
            target.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
            @Suppress("DEPRECATION")
            connection.writeCharacteristic(target)
        }
        if (!ok) writing = false
        // Write-without-response may not trigger a callback on every stack – release the queue after a short delay.
        handler.postDelayed({ if (writing) { writing = false; drain() } }, 30)
    }

    fun start(config: MetronomeConfig, firstBeatEpochMs: Long, title: String?, settings: HapticSettings) {
        if (_state.value.status != Status.Connected) return
        send(PulseProtocol.intensity(settings.intensity, settings.accentIntensity, settings.pulseMs))
        title?.let { send(PulseProtocol.song(it)) }
        send(PulseProtocol.start(config.bpm, config.beatsPerBar, config.beatUnit, 1, PulseProtocol.accentMask(config.beatsPerBar), (firstBeatEpochMs - System.currentTimeMillis()).coerceAtLeast(0), config.countInBars))
    }

    fun tempo(bpm: Double) = send(PulseProtocol.tempo(bpm))
    fun stop() = send(PulseProtocol.stop())

    fun disconnect() {
        stopScan()
        gatt?.disconnect()
        gatt?.close()
        gatt = null
        control = null
        _state.value = State()
    }
}
