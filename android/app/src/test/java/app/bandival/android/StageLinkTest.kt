package app.bandival.android

import app.bandival.android.live.BeaconGridEstimator
import app.bandival.android.live.StageBeacon
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.random.Random

class StageLinkTest {
    private val payload = StageBeacon.Payload(
        session = 4242, generation = 777, running = true, bpm = 128.5, beatsPerBar = 4, beatUnit = 4,
        beatIndex = 65535, setlistHash = 1234, songIndex = 7, countInBeats = 4,
    )

    @Test
    fun beaconRoundTrip() {
        val bytes = StageBeacon.encode(payload)
        assertEquals(18, bytes.size)
        assertEquals(payload, StageBeacon.decode(bytes))
        assertEquals(null, StageBeacon.decode(bytes.copyOf(10)))
    }

    /**
     * Simulates a leader updating the broadcast on every beat and advertising every 100 ms; each packet arrives
     * with a random radio delay. The estimated grid must converge to the true grid within a few milliseconds.
     */
    @Test
    fun estimatorConvergesDespiteRadioJitter() {
        val random = Random(7)
        val bpm = 120.0
        val period = 60_000.0 / bpm
        val trueGridElapsedMs = 10_000.0 // beat 0 in the leader's (and our) elapsed clock
        val estimator = BeaconGridEstimator()
        var estimate: Double? = null
        var advertisingTime = trueGridElapsedMs
        while (advertisingTime < trueGridElapsedMs + 10_000) {
            advertisingTime += 100 + random.nextDouble(0.0, 10.0) // advertising interval + random advDelay
            val beatIndex = ((advertisingTime - trueGridElapsedMs) / period).toInt()
            val received = advertisingTime + StageBeacon.RADIO_LATENCY_MS + random.nextDouble(0.0, 4.0)
            estimate = estimator.add(payload.copy(bpm = bpm, beatIndex = beatIndex), (received * 1e6).toLong(), 0.0) ?: estimate
        }
        assertNotNull(estimate)
        val error = abs(estimate!! - trueGridElapsedMs)
        assertTrue("grid error was $error ms", error < 8)
    }

    @Test
    fun estimatorResetsOnNewGeneration() {
        val estimator = BeaconGridEstimator()
        repeat(5) { estimator.add(payload.copy(beatIndex = it), (it * 500L + 1000) * 1_000_000, 0.0) }
        assertEquals(5, estimator.sampleCount)
        estimator.add(payload.copy(generation = 778, beatIndex = 0), 9_000_000_000, 0.0)
        assertEquals(1, estimator.sampleCount)
    }
}
