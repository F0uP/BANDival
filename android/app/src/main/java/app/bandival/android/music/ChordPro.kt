package app.bandival.android.music

/** Minimal ChordPro / "chords over lyrics" parser with transposition – mirrors the web lead sheet. */

data class Segment(val chord: String?, val text: String)

sealed interface SheetLine {
    data class Section(val label: String) : SheetLine
    data class Comment(val text: String) : SheetLine
    data class Lyrics(val segments: List<Segment>) : SheetLine
    data class ChordsOnly(val chords: String) : SheetLine
    data object Empty : SheetLine
}

private val SHARP = listOf("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
private val FLAT = listOf("C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B")
private val NOTE_INDEX = mapOf(
    "C" to 0, "B#" to 0, "C#" to 1, "Db" to 1, "D" to 2, "D#" to 3, "Eb" to 3, "E" to 4, "Fb" to 4, "F" to 5, "E#" to 5,
    "F#" to 6, "Gb" to 6, "G" to 7, "G#" to 8, "Ab" to 8, "A" to 9, "A#" to 10, "Bb" to 10, "B" to 11, "Cb" to 11, "H" to 11,
)
private val FLAT_KEYS = setOf("F", "Bb", "Eb", "Ab", "Db", "Gb")
private val CHORD_TOKEN = Regex("""^[A-H][#b]?(m|maj|min|dim|aug|sus|add|M|°|ø|\+|-)?[0-9]*(\([^)]*\))?([#b]?[0-9]+)*(/[A-H][#b]?)?$""")
private val SECTION_DIRECTIVES = mapOf(
    "start_of_chorus" to "Refrain", "soc" to "Refrain", "start_of_verse" to "Strophe", "sov" to "Strophe",
    "start_of_bridge" to "Bridge", "sob" to "Bridge", "start_of_tab" to "Tab", "sot" to "Tab",
)

/** Transposes a single note/key root ("F#", "Bb", "Am" …). */
fun transposeRoot(value: String, semitones: Int): String {
    if (semitones % 12 == 0) return value
    val match = Regex("""^([A-H])([#b]?)(.*)$""").find(value.trim()) ?: return value
    val (letter, accidental, rest) = match.destructured
    val root = (if (letter == "H") "B" else letter) + accidental
    val index = NOTE_INDEX[root] ?: return value
    val next = ((index + semitones) % 12 + 12) % 12
    val flats = accidental == "b" || root in FLAT_KEYS
    return (if (flats) FLAT else SHARP)[next] + rest
}

/** Transposes a chord symbol including slash bass ("G/B" → "A/C#"). */
fun transposeChord(chord: String, semitones: Int): String {
    if (semitones % 12 == 0) return chord
    val parts = chord.split("/", limit = 2)
    val main = transposeRoot(parts[0], semitones)
    return if (parts.size == 2) "$main/${transposeRoot(parts[1], semitones)}" else main
}

fun isChordLine(line: String): Boolean {
    val tokens = line.trim().split(Regex("\\s+")).filter { it.isNotEmpty() && it != "|" && it != "-" }
    return tokens.isNotEmpty() && tokens.all { CHORD_TOKEN.matches(it) || it.matches(Regex("""^\(?[A-H][^\s]*\)?$""")) && CHORD_TOKEN.matches(it.trim('(', ')')) }
}

private fun transposeChordLine(line: String, semitones: Int): String =
    if (semitones % 12 == 0) line else line.replace(Regex("""[A-H][#b]?[^\s/]*(/[A-H][#b]?)?""")) { transposeChord(it.value, semitones) }

fun parseChordSheet(text: String, semitones: Int = 0): List<SheetLine> {
    val result = mutableListOf<SheetLine>()
    for (raw in text.replace("\r\n", "\n").split("\n")) {
        val line = raw.trimEnd()
        val directive = Regex("""^\{\s*([a-zA-Z_]+)\s*(?::\s*(.*?))?\s*\}$""").find(line.trim())
        when {
            directive != null -> {
                val name = directive.groupValues[1].lowercase()
                val value = directive.groupValues[2]
                when {
                    name in SECTION_DIRECTIVES -> result += SheetLine.Section(value.ifBlank { SECTION_DIRECTIVES.getValue(name) })
                    name == "comment" || name == "c" || name == "comment_italic" || name == "ci" -> result += SheetLine.Comment(value)
                    name.startsWith("end_of") || name in setOf("eoc", "eov", "eob", "eot") -> result += SheetLine.Empty
                    else -> Unit // title, key, tempo … are shown in the header
                }
            }
            line.isBlank() -> result += SheetLine.Empty
            line.trim().startsWith("#") -> Unit
            Regex("""^\[?(Intro|Strophe|Verse|Refrain|Chorus|Bridge|Outro|Pre-?Chorus|Solo|Interlude|Vers|Zwischenspiel)[^\]]*\]?:?\s*$""", RegexOption.IGNORE_CASE).matches(line.trim()) && !line.contains("][") ->
                result += SheetLine.Section(line.trim().trim('[', ']', ':'))
            line.contains('[') -> {
                val segments = mutableListOf<Segment>()
                var chord: String? = null
                val buffer = StringBuilder()
                var index = 0
                while (index < line.length) {
                    val char = line[index]
                    if (char == '[') {
                        val end = line.indexOf(']', index)
                        if (end > index) {
                            if (buffer.isNotEmpty() || chord != null) segments += Segment(chord, buffer.toString())
                            buffer.clear()
                            chord = transposeChord(line.substring(index + 1, end).trim(), semitones)
                            index = end + 1
                            continue
                        }
                    }
                    buffer.append(char)
                    index += 1
                }
                if (buffer.isNotEmpty() || chord != null) segments += Segment(chord, buffer.toString())
                result += SheetLine.Lyrics(segments)
            }
            isChordLine(line) -> result += SheetLine.ChordsOnly(transposeChordLine(line, semitones))
            else -> result += SheetLine.Lyrics(listOf(Segment(null, line)))
        }
    }
    // Collapse multiple empty lines.
    return result.filterIndexed { position, item -> !(item is SheetLine.Empty && position > 0 && result[position - 1] is SheetLine.Empty) }
}

/** Metronome meter from a time signature; compound meters click dotted quarters with triplet feel. */
data class Meter(val beatsPerBar: Int, val beatUnit: Int, val subdivision: Int)

fun meterFor(timeSignature: String?): Meter {
    val match = Regex("""^(\d{1,2})/(\d{1,2})$""").find(timeSignature?.trim().orEmpty())
    val numerator = match?.groupValues?.get(1)?.toInt() ?: 4
    val denominator = match?.groupValues?.get(2)?.toInt() ?: 4
    if (denominator == 8 && numerator % 3 == 0 && numerator > 3) return Meter(numerator / 3, 8, 3)
    return Meter(numerator.coerceAtLeast(1), denominator, 1)
}
