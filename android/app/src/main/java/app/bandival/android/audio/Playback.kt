package app.bandival.android.audio

import android.content.ComponentName
import android.content.Context
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.MediaController
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionToken
import app.bandival.android.BandivalApp
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** Background playback with lock screen / notification controls. Uses the shared OkHttp client (session cookie). */
class PlaybackService : MediaSessionService() {
    private var session: MediaSession? = null

    @OptIn(UnstableApi::class)
    override fun onCreate() {
        super.onCreate()
        val http = BandivalApp.from(this).repository.api.http
        val player = ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(OkHttpDataSource.Factory(http)))
            .setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
            .setHandleAudioBecomingNoisy(true)
            .build()
        session = MediaSession.Builder(this, player).build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    override fun onTaskRemoved(rootIntent: android.content.Intent?) {
        val player = session?.player
        if (player == null || !player.playWhenReady || player.mediaItemCount == 0) stopSelf()
    }

    override fun onDestroy() {
        session?.run {
            player.release()
            release()
        }
        session = null
        super.onDestroy()
    }
}

data class NowPlaying(val title: String, val subtitle: String?, val url: String, val playing: Boolean, val positionMs: Long, val durationMs: Long, val speed: Float)

/** Small façade over a MediaController for the Compose UI. */
class PlayerConnection(context: Context) {
    private val appContext = context.applicationContext
    private var future: ListenableFuture<MediaController>? = null
    private var controller: MediaController? = null
    private val _now = MutableStateFlow<NowPlaying?>(null)
    val now: StateFlow<NowPlaying?> = _now

    private val listener = object : Player.Listener {
        override fun onEvents(player: Player, events: Player.Events) = publish()
    }

    private fun connect(then: (MediaController) -> Unit) {
        controller?.let { return then(it) }
        val token = SessionToken(appContext, ComponentName(appContext, PlaybackService::class.java))
        val pending = MediaController.Builder(appContext, token).buildAsync()
        future = pending
        pending.addListener({
            val connected = runCatching { pending.get() }.getOrNull() ?: return@addListener
            controller = connected
            connected.addListener(listener)
            then(connected)
        }, MoreExecutors.directExecutor())
    }

    fun play(url: String, title: String, subtitle: String?) {
        connect { player ->
            val current = player.currentMediaItem?.localConfiguration?.uri?.toString()
            if (current == url) {
                if (player.isPlaying) player.pause() else player.play()
                return@connect
            }
            val item = MediaItem.Builder()
                .setUri(Uri.parse(url))
                .setMediaId(url)
                .setMediaMetadata(MediaMetadata.Builder().setTitle(title).setArtist(subtitle ?: "Bandival").build())
                .build()
            player.setMediaItem(item)
            player.prepare()
            player.play()
        }
    }

    fun toggle() = controller?.let { if (it.isPlaying) it.pause() else it.play() }
    fun seekTo(ms: Long) = controller?.seekTo(ms)
    fun seekBy(ms: Long) = controller?.let { it.seekTo((it.currentPosition + ms).coerceAtLeast(0)) }
    fun setSpeed(speed: Float) = controller?.setPlaybackParameters(PlaybackParameters(speed))

    fun stop() {
        controller?.stop()
        controller?.clearMediaItems()
        _now.value = null
    }

    /** Called periodically by the UI to update the position. */
    fun publish() {
        val player = controller ?: return
        val item = player.currentMediaItem
        _now.value = if (item == null) null else NowPlaying(
            title = item.mediaMetadata.title?.toString() ?: "",
            subtitle = item.mediaMetadata.artist?.toString(),
            url = item.mediaId,
            playing = player.isPlaying,
            positionMs = player.currentPosition,
            durationMs = player.duration.coerceAtLeast(0),
            speed = player.playbackParameters.speed,
        )
    }

    fun release() {
        controller?.removeListener(listener)
        future?.let { MediaController.releaseFuture(it) }
        controller = null
    }
}
