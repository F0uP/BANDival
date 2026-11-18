package app.bandival.android.live

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTimestamp
import android.media.AudioTrack
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.sin

data class MetronomeConfig(
    val bpm: Double,
    val beatsPerBar: Int = 4,
    val beatUnit: Int = 4,
    val subdivision: Int = 1,
    val countInBars: Int = 1,
    val sound: Boolean = true,
    val volume: Float = 0.9f,
)

/** [index] counts beats since the grid start (including count-in) – broadcast to followers. */
data class Beat(val beat: Int, val bar: Int, val accent: Boolean, val countIn: Boolean, val epochMs: Long, val index: Long = 0)

/**
 * Sample-accurate metronome: clicks are mixed into a continuous PCM stream on a dedicated thread.
 * The beat grid is defined in wall-clock time; the real output latency is measured with
 * AudioTrack timestamps so that several phones (live sync) click together within a few milliseconds.
 */
class Metronome {
    private val sampleRate = 48_000
    private val handler = Handler(Looper.getMainLooper())
    private val accentClick = click(1760.0, 0.05)
    private val normalClick = click(1175.0, 0.04)
    private val subClick = click(1175.0, 0.025, 0.35)

    @Volatile private var config: MetronomeConfig? = null
    @Volatile private var running = false
    private var thread: Thread? = null

    private val _beats = MutableSharedFlow<Beat>(extraBufferCapacity = 16)
    val beats: SharedFlow<Beat> = _beats
    private val _state = MutableStateFlow<MetronomeConfig?>(null)
    val state: StateFlow<MetronomeConfig?> = _state
    private val _measuredLatencyMs = MutableStateFlow<Int?>(null)
    /** Measured latency of this phone's audio output (without [outputDelayMs]). */
    val measuredLatencyMs: StateFlow<Int?> = _measuredLatencyMs

    /** Extra delay of the listening path, e.g. Bluetooth speaker or wireless in-ears (manual, ms). */
    @Volatile var outputDelayMs: Int = 0

    /** Wall-clock time of the first beat of the grid (including count-in) – shared via live sync. */
    @Volatile var gridStartEpochMs: Long = 0
        private set

    val isRunning: Boolean get() = running

    private fun click(frequency: Double, seconds: Double, gain: Double = 1.0): ShortArray {
        val length = (sampleRate * seconds).toInt()
        return ShortArray(length) { index ->
            val t = index.toDouble() / sampleRate
            val envelope = exp(-t * 90) * gain
            (sin(2 * PI * frequency * t) * envelope * Short.MAX_VALUE * 0.8).toInt().toShort()
        }
    }

    /**
     * Starts the click. With [alignToEpochMs] (grid start from the leader, already in local wall-clock time)
     * the grid is aligned to it; late joiners skip into the running grid and keep the bar position.
     */
    fun start(newConfig: MetronomeConfig, alignToEpochMs: Long? = null) {
        stop()
        config = newConfig
        running = true
        _state.value = newConfig
        val worker = Thread({ loop(alignToEpochMs) }, "bandival-metronome")
        worker.priority = Thread.MAX_PRIORITY
        thread = worker
        worker.start()
    }

    @Volatile private var pendingAlignEpochMs: Long? = null

    /** Smoothly moves the running grid to a new start time (follower fine-tuning, no restart/gap). */
    fun align(gridStartEpochMs: Long) {
        if (running) pendingAlignEpochMs = gridStartEpochMs
    }

    fun update(bpm: Double? = null, sound: Boolean? = null) {
        val current = config ?: return
        config = current.copy(bpm = bpm ?: current.bpm, sound = sound ?: current.sound)
        _state.value = config
    }

    fun stop() {
        running = false
        thread?.join(300)
        thread = null
        handler.removeCallbacksAndMessages(null)
        _state.value = null
    }

    private fun loop(alignToEpochMs: Long?) {
        val startConfig = config ?: return
        val minBuffer = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val track = AudioTrack.Builder()
            .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            .setAudioFormat(AudioFormat.Builder().setSampleRate(sampleRate).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
            .setBufferSizeInBytes(max(minBuffer, sampleRate / 10 * 2))
            .setTransferMode(AudioTrack.MODE_STREAM)
            .setPerformanceMode(AudioTrack.PERFORMANCE_MODE_LOW_LATENCY)
            .build()
        val chunk = ShortArray(sampleRate / 100) // 10 ms
        val timestamp = AudioTimestamp()
        val countInBeats = startConfig.countInBars * startConfig.beatsPerBar

        // Estimated latency until the real one is measured from AudioTrack timestamps.
        var latencyFrames = max(minBuffer / 2, sampleRate / 20).toDouble()
        val startEpoch = System.currentTimeMillis()
        val startNanos = System.nanoTime()
        fun outputDelayFrames() = outputDelayMs * sampleRate / 1000.0
        /** Wall clock when written frame [frame] becomes audible. */
        fun audibleEpoch(frame: Double) = startEpoch + (frame + latencyFrames + outputDelayFrames()) * 1000.0 / sampleRate

        var frame = 0L
        var beatCounter = 0L
        var framesPerBeat = sampleRate * 60.0 / startConfig.bpm
        var nextBeatFrame = sampleRate * 0.12
        if (alignToEpochMs != null) {
            val firstFrame = (alignToEpochMs - startEpoch) * sampleRate / 1000.0 - latencyFrames - outputDelayFrames()
            if (firstFrame > sampleRate * 0.05) {
                nextBeatFrame = firstFrame
            } else {
                val skipped = ceil((sampleRate * 0.05 - firstFrame) / framesPerBeat).toLong()
                nextBeatFrame = firstFrame + skipped * framesPerBeat
                beatCounter = skipped
            }
        }
        val initialCounter = beatCounter
        gridStartEpochMs = (audibleEpoch(nextBeatFrame) - initialCounter * 60_000.0 / startConfig.bpm).toLong()

        var activeClick: ShortArray? = null
        var clickPosition = 0
        val subFrames = ArrayDeque<Double>()
        var chunksSinceCalibration = 0

        track.play()
        try {
            while (running) {
                val current = config ?: break
                framesPerBeat = sampleRate * 60.0 / current.bpm
                pendingAlignEpochMs?.let { target ->
                    pendingAlignEpochMs = null
                    // Frame at which beat #beatCounter must be written so that it is heard on the new grid.
                    val periodMs = 60_000.0 / current.bpm
                    var desired = (target + beatCounter * periodMs - startEpoch) * sampleRate / 1000.0 - latencyFrames - outputDelayFrames()
                    while (desired < frame) {
                        desired += framesPerBeat
                        beatCounter += 1
                    }
                    while (desired - framesPerBeat > frame && beatCounter > 0) {
                        desired -= framesPerBeat
                        beatCounter -= 1
                    }
                    subFrames.clear()
                    nextBeatFrame = desired
                    gridStartEpochMs = target
                }
                for (index in chunk.indices) {
                    if (frame >= nextBeatFrame) {
                        val isCountIn = beatCounter < countInBeats
                        val beatInBar = (beatCounter % current.beatsPerBar).toInt()
                        val accent = beatInBar == 0
                        activeClick = if (accent) accentClick else normalClick
                        clickPosition = 0
                        val bar = ((beatCounter - countInBeats) / current.beatsPerBar).toInt()
                        val epoch = audibleEpoch(nextBeatFrame).toLong()
                        val delayMs = max(0L, epoch - System.currentTimeMillis())
                        val beat = Beat(beatInBar, bar, accent, isCountIn, epoch, beatCounter)
                        handler.postAtTime({ _beats.tryEmit(beat) }, SystemClock.uptimeMillis() + delayMs)
                        if (!isCountIn) for (sub in 1 until current.subdivision) subFrames.addLast(nextBeatFrame + framesPerBeat * sub / current.subdivision)
                        beatCounter += 1
                        nextBeatFrame += framesPerBeat
                    }
                    if (subFrames.isNotEmpty() && frame >= subFrames.first()) {
                        subFrames.removeFirst()
                        activeClick = subClick
                        clickPosition = 0
                    }
                    val click = activeClick
                    var sample = 0
                    if (click != null) {
                        if (current.sound) sample = (click[clickPosition] * current.volume).toInt()
                        clickPosition += 1
                        if (clickPosition >= click.size) activeClick = null
                    }
                    chunk[index] = sample.toShort()
                    frame += 1
                }
                track.write(chunk, 0, chunk.size)

                // Every ~0.5 s: measure the real output latency and keep the clicks on the wall-clock grid.
                chunksSinceCalibration += 1
                if (chunksSinceCalibration >= 50 && track.getTimestamp(timestamp)) {
                    chunksSinceCalibration = 0
                    val nowNanos = System.nanoTime()
                    val playedNow = timestamp.framePosition + (nowNanos - timestamp.nanoTime) * sampleRate / 1e9
                    val measured = frame - playedNow
                    // Wall clock and nanoTime drift apart slowly; re-anchor the estimate to elapsed time.
                    val elapsedFrames = (nowNanos - startNanos) * sampleRate / 1e9
                    val drift = (frame - measured) - elapsedFrames
                    val corrected = measured + drift
                    if (measured > 0 && measured < sampleRate) {
                        _measuredLatencyMs.value = (measured * 1000 / sampleRate).toInt()
                        val delta = corrected - latencyFrames
                        if (abs(delta) > sampleRate * 0.002) {
                            val step = delta.coerceIn(-framesPerBeat / 4, framesPerBeat / 4)
                            latencyFrames += step
                            // Same audible grid → write upcoming clicks earlier/later by the same amount.
                            nextBeatFrame -= step
                            for (position in subFrames.indices) subFrames[position] = subFrames[position] - step
                        }
                    }
                }
            }
        } finally {
            runCatching { track.pause(); track.flush(); track.stop() }
            track.release()
        }
    }
}
