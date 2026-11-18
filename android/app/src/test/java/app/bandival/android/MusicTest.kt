package app.bandival.android

import app.bandival.android.live.PulseProtocol
import app.bandival.android.music.SheetLine
import app.bandival.android.music.meterFor
import app.bandival.android.music.parseChordSheet
import app.bandival.android.music.transposeChord
import app.bandival.android.music.transposeRoot
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MusicTest {
    @Test
    fun transposesRootsAndSlashChords() {
        assertEquals("A", transposeRoot("G", 2))
        assertEquals("A#m", transposeRoot("Am", 1)) // same spelling as the web lead sheet
        assertEquals("F#m7", transposeRoot("Em7", 2))
        assertEquals("A/C#", transposeChord("G/B", 2))
        assertEquals("Eb", transposeRoot("F", -2))
        assertEquals("C", transposeRoot("C", 12))
    }

    @Test
    fun parsesChordPro() {
        val lines = parseChordSheet("{title: Test}\n{soc}\n[Am]Hello [G]world\n{eoc}\n\nPlain line", 2)
        assertTrue(lines.first() is SheetLine.Section)
        val lyric = lines.filterIsInstance<SheetLine.Lyrics>().first()
        assertEquals("Bm", lyric.segments[0].chord)
        assertEquals("Hello ", lyric.segments[0].text)
        assertEquals("A", lyric.segments[1].chord)
        assertTrue(lines.any { it is SheetLine.Lyrics && it.segments.size == 1 && it.segments[0].text == "Plain line" })
    }

    @Test
    fun detectsChordOverLyricsLines() {
        val lines = parseChordSheet("Am   G   F\nSome words here", 0)
        assertTrue(lines[0] is SheetLine.ChordsOnly)
        assertTrue(lines[1] is SheetLine.Lyrics)
        val transposed = parseChordSheet("Am   G/B   F", 2)
        assertEquals("Bm   A/C#   G", (transposed[0] as SheetLine.ChordsOnly).chords)
    }

    @Test
    fun metersForMetronome() {
        assertEquals(4, meterFor("4/4").beatsPerBar)
        assertEquals(2, meterFor("6/8").beatsPerBar)
        assertEquals(3, meterFor("6/8").subdivision)
        assertEquals(3, meterFor("3/4").beatsPerBar)
        assertEquals(4, meterFor(null).beatsPerBar)
    }

    @Test
    fun encodesPulseCommandsLikeTheWebApp() {
        // Same bytes as web/src/lib/pulse/protocol.ts encodeStart({bpm: 120.5, 4/4, sub 1, mask 1, 1500 ms, 1 bar})
        val start = PulseProtocol.start(120.5, 4, 4, 1, 1, 1500, 1)
        assertArrayEquals(byteArrayOf(0x01, 0xB5.toByte(), 0x04, 4, 4, 1, 1, 0, 0xDC.toByte(), 0x05, 0, 0, 1), start)
        assertArrayEquals(byteArrayOf(0x03, 0xB0.toByte(), 0x04), PulseProtocol.tempo(120.0))
        assertArrayEquals(byteArrayOf(0x02), PulseProtocol.stop())
        val status = PulseProtocol.decodeStatus(byteArrayOf(0x81.toByte(), 87, 1, 0xB0.toByte(), 0x04, 1, 2))
        assertEquals(PulseProtocol.Status.State(87, true, 120.0, "1.2"), status)
    }
}
