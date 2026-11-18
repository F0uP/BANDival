package app.bandival.android.live

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID
import kotlin.math.roundToInt

/** Bandival Pulse BLE protocol v1 – identical to web/src/lib/pulse/protocol.ts and docs/bandival-pulse.md. */
object PulseProtocol {
    const val VERSION = 1
    val SERVICE: UUID = UUID.fromString("6e0b0001-b5a3-4c7a-9a1d-62616e646976")
    val CONTROL: UUID = UUID.fromString("6e0b0002-b5a3-4c7a-9a1d-62616e646976")
    val STATUS: UUID = UUID.fromString("6e0b0003-b5a3-4c7a-9a1d-62616e646976")
    val CCCD: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
    const val NAME_PREFIX = "Bandival Pulse"

    private const val OP_HELLO: Byte = 0x00
    private const val OP_START: Byte = 0x01
    private const val OP_STOP: Byte = 0x02
    private const val OP_TEMPO: Byte = 0x03
    private const val OP_INTENSITY: Byte = 0x04
    private const val OP_PING: Byte = 0x05
    private const val OP_SONG: Byte = 0x06
    private const val OP_BEAT: Byte = 0x07

    private fun tempo10(bpm: Double): Int = (bpm * 10).roundToInt().coerceIn(200, 4000)
    private fun byte(value: Int): Byte = value.coerceIn(0, 255).toByte()

    fun hello(): ByteArray = byteArrayOf(OP_HELLO, VERSION.toByte())

    fun start(bpm: Double, beatsPerBar: Int, beatUnit: Int, subdivision: Int, accentMask: Int, startInMs: Long, countInBars: Int): ByteArray =
        ByteBuffer.allocate(13).order(ByteOrder.LITTLE_ENDIAN).apply {
            put(OP_START)
            putShort(tempo10(bpm).toShort())
            put(byte(beatsPerBar))
            put(byte(beatUnit))
            put(byte(subdivision.coerceIn(1, 4)))
            putShort((accentMask and 0xffff).toShort())
            putInt(startInMs.coerceAtLeast(0).coerceAtMost(Int.MAX_VALUE.toLong()).toInt())
            put(byte(countInBars))
        }.array()

    fun stop(): ByteArray = byteArrayOf(OP_STOP)

    fun tempo(bpm: Double): ByteArray {
        val value = tempo10(bpm)
        return byteArrayOf(OP_TEMPO, (value and 0xff).toByte(), (value shr 8).toByte())
    }

    fun intensity(normal: Int, accent: Int, pulseMs: Int): ByteArray = byteArrayOf(OP_INTENSITY, byte(normal), byte(accent), byte(pulseMs))

    fun ping(value: Long): ByteArray = ByteBuffer.allocate(5).order(ByteOrder.LITTLE_ENDIAN).apply {
        put(OP_PING)
        putInt((value and 0xffffffffL).toInt())
    }.array()

    fun song(title: String): ByteArray {
        val bytes = title.toByteArray(Charsets.UTF_8).take(40).toByteArray()
        return byteArrayOf(OP_SONG, bytes.size.toByte()) + bytes
    }

    fun beat(index: Int, accent: Boolean): ByteArray = byteArrayOf(OP_BEAT, byte(index), if (accent) 1 else 0)

    fun accentMask(beatsPerBar: Int): Int = if (beatsPerBar > 0) 1 else 0

    sealed interface Status {
        data class State(val battery: Int, val running: Boolean, val bpm: Double, val firmware: String) : Status
        data class Pong(val value: Long) : Status
        data class Error(val code: Int) : Status
        data object Unknown : Status
    }

    fun decodeStatus(bytes: ByteArray): Status {
        if (bytes.isEmpty()) return Status.Unknown
        val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        return when (bytes[0].toInt() and 0xff) {
            0x81 -> if (bytes.size >= 7) Status.State(
                battery = bytes[1].toInt() and 0xff,
                running = bytes[2].toInt() == 1,
                bpm = (buffer.getShort(3).toInt() and 0xffff) / 10.0,
                firmware = "${bytes[5].toInt() and 0xff}.${bytes[6].toInt() and 0xff}",
            ) else Status.Unknown
            0x85 -> if (bytes.size >= 5) Status.Pong(buffer.getInt(1).toLong() and 0xffffffffL) else Status.Unknown
            0x8f -> if (bytes.size >= 2) Status.Error(bytes[1].toInt() and 0xff) else Status.Unknown
            else -> Status.Unknown
        }
    }
}
