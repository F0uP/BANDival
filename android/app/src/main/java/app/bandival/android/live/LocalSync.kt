package app.bandival.android.live

import android.content.Context
import android.net.wifi.WifiManager
import android.os.SystemClock
import app.bandival.android.data.AppJson
import app.bandival.android.data.LiveMetronomeState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.NetworkInterface

/**
 * Automatic Wi-Fi path of the stage link (no setup): if phones happen to share a Wi-Fi network, the leader's
 * state is broadcast via UDP and followers measure the clock offset NTP-style (best of the lowest round trips).
 * More precise than Bluetooth; silently does nothing when there is no shared network.
 */
class LocalSync(context: Context, private val session: Int, private val deviceName: String) {
    @Serializable
    data class Packet(
        val v: Int = 1,
        val type: String,
        val session: Int = 0,
        val generation: Int = 0,
        val setlistId: String? = null,
        val leader: String? = null,
        val index: Int = 0,
        val songId: String? = null,
        val metronome: LiveMetronomeState? = null,
        val message: String? = null,
        val seq: Long = 0,
        val t0: Long = 0,
        val t1: Double = 0.0,
    )

    /** A remote leader with its state converted to the local clock. */
    data class Remote(val packet: Packet, val gridStartLocalMs: Double?, val bestRttMs: Long?, val receivedAt: Long)

    private val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    private var multicastLock: WifiManager.MulticastLock? = null
    private var socket: DatagramSocket? = null
    private var scope: CoroutineScope? = null
    private var seq = 0L
    @Volatile private var leading: Packet? = null
    @Volatile private var leaderAddress: InetAddress? = null
    @Volatile private var leaderSession: Int? = null
    private val samples = ArrayDeque<Pair<Long, Double>>()
    @Volatile private var offsetMs = 0.0
    @Volatile private var bestRtt: Long? = null
    @Volatile private var lastState: Packet? = null

    var onRemote: ((Remote) -> Unit)? = null

    fun start() {
        if (scope != null) return
        val opened = runCatching {
            multicastLock = wifi.createMulticastLock("bandival-stage").apply {
                setReferenceCounted(false)
                acquire()
            }
            DatagramSocket(null).apply {
                reuseAddress = true
                broadcast = true
                bind(InetSocketAddress(PORT))
            }
        }.getOrNull() ?: return
        socket = opened
        val created = CoroutineScope(Dispatchers.IO + SupervisorJob())
        scope = created
        created.launch { receiveLoop(opened) }
        created.launch {
            while (isActive) {
                leading?.let { broadcast(it) }
                pingLeader()
                delay(if (leaderAddress != null && samples.size < 8) 250 else 500)
            }
        }
    }

    private fun receiveLoop(target: DatagramSocket) {
        val buffer = ByteArray(4096)
        while (scope?.isActive == true) {
            val datagram = DatagramPacket(buffer, buffer.size)
            try {
                target.receive(datagram)
            } catch (error: Exception) {
                if (scope?.isActive != true) return
                continue
            }
            val packet = runCatching { AppJson.decodeFromString(Packet.serializer(), String(datagram.data, 0, datagram.length)) }.getOrNull() ?: continue
            if (packet.session == session) continue
            when (packet.type) {
                "ping" -> if (leading != null) send(Packet(type = "pong", session = session, t0 = packet.t0, t1 = System.currentTimeMillis().toDouble()), datagram.address)
                "pong" -> onPong(packet)
                "state" -> onState(packet, datagram.address)
            }
        }
    }

    private fun onState(packet: Packet, address: InetAddress) {
        if (leaderSession != packet.session) {
            synchronized(samples) { samples.clear() }
            bestRtt = null
            leaderSession = packet.session
        }
        leaderAddress = address
        lastState = packet
        emit(packet)
    }

    private fun emit(packet: Packet) {
        val grid = packet.metronome?.takeIf { bestRtt != null }?.let { it.gridStartEpochMs - offsetMs }
        onRemote?.invoke(Remote(packet, grid, bestRtt, System.currentTimeMillis()))
    }

    private fun onPong(packet: Packet) {
        val rtt = SystemClock.elapsedRealtime() - packet.t0
        if (rtt !in 0..300) return
        val localAtMid = System.currentTimeMillis() - rtt / 2.0
        synchronized(samples) {
            samples.addLast(rtt to (packet.t1 - localAtMid))
            while (samples.size > 16) samples.removeFirst()
            val best = samples.sortedBy { it.first }.take(4)
            offsetMs = best.map { it.second }.average()
            bestRtt = best.first().first
        }
        lastState?.let { emit(it) }
    }

    private fun pingLeader() {
        val address = leaderAddress ?: return
        if (leading != null) return
        repeat(if (samples.size < 8) 3 else 1) {
            send(Packet(type = "ping", session = session, leader = deviceName, t0 = SystemClock.elapsedRealtime()), address)
        }
    }

    fun lead(setlistId: String, generation: Int, index: Int, songId: String?, metronome: LiveMetronomeState?, message: String?) {
        val packet = Packet(type = "state", session = session, generation = generation, setlistId = setlistId, leader = deviceName, index = index, songId = songId, metronome = metronome, message = message, seq = ++seq)
        leading = packet
        scope?.launch { broadcast(packet) }
    }

    fun stopLeading(setlistId: String, generation: Int) {
        val packet = Packet(type = "state", session = session, generation = generation, setlistId = setlistId, leader = deviceName, metronome = null, seq = ++seq)
        scope?.launch {
            repeat(3) {
                broadcast(packet)
                delay(150)
            }
        }
        leading = null
    }

    private fun broadcastTargets(): List<InetAddress> {
        val targets = mutableSetOf<InetAddress>()
        runCatching { targets += InetAddress.getByName("255.255.255.255") }
        runCatching {
            NetworkInterface.getNetworkInterfaces().toList()
                .filter { it.isUp && !it.isLoopback }
                .flatMap { it.interfaceAddresses }
                .mapNotNull { it.broadcast }
                .forEach { targets += it }
        }
        return targets.toList()
    }

    private fun broadcast(packet: Packet) = broadcastTargets().forEach { send(packet, it) }

    private fun send(packet: Packet, address: InetAddress) {
        val bytes = AppJson.encodeToString(Packet.serializer(), packet).toByteArray()
        runCatching { socket?.send(DatagramPacket(bytes, bytes.size, address, PORT)) }
    }

    fun stop() {
        scope?.cancel()
        scope = null
        runCatching { socket?.close() }
        socket = null
        multicastLock?.let { if (it.isHeld) it.release() }
        multicastLock = null
        leading = null
        leaderAddress = null
        leaderSession = null
    }

    companion object {
        const val PORT = 47821
    }
}
