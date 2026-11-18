package app.bandival.android.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.bandival.android.music.SheetLine
import app.bandival.android.music.parseChordSheet

/** Lead sheet with chords above the syllables; wraps on narrow screens. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ChordSheetView(text: String, transpose: Int, fontSize: Int, modifier: Modifier = Modifier, showChords: Boolean = true) {
    val lines = remember(text, transpose) { parseChordSheet(text, transpose) }
    val chordColor = MaterialTheme.colorScheme.primary
    Column(modifier.fillMaxWidth()) {
        for (line in lines) {
            when (line) {
                is SheetLine.Section -> Text(
                    line.label,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = (fontSize * 0.75).sp,
                    modifier = Modifier.padding(top = 14.dp, bottom = 4.dp),
                )
                is SheetLine.Comment -> Text(line.text, fontStyle = FontStyle.Italic, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = (fontSize * 0.85).sp)
                is SheetLine.ChordsOnly -> if (showChords) Text(line.chords, color = chordColor, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace, fontSize = (fontSize * 0.85).sp)
                is SheetLine.Empty -> Spacer(Modifier.height((fontSize * 0.6).dp))
                is SheetLine.Lyrics -> FlowRow(horizontalArrangement = Arrangement.Start) {
                    for (segment in line.segments) {
                        Column {
                            if (showChords && line.segments.any { it.chord != null }) {
                                Text(
                                    (segment.chord ?: "") + " ",
                                    color = chordColor,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = (fontSize * 0.85).sp,
                                    maxLines = 1,
                                )
                            }
                            Text(segment.text.ifEmpty { " " }, fontSize = fontSize.sp, lineHeight = (fontSize * 1.3).sp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun LyricsView(text: String, fontSize: Int, modifier: Modifier = Modifier) {
    Text(text.replace(Regex("""^#+\s*""", RegexOption.MULTILINE), ""), fontSize = fontSize.sp, lineHeight = (fontSize * 1.4).sp, modifier = modifier)
}
