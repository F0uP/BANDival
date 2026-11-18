package app.bandival.android.ui.screens

import androidx.compose.material3.Button
import androidx.compose.material3.Switch
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Fingerprint
import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.Dns
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Lightbulb
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.MusicNote
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.OpenInBrowser
import androidx.compose.material.icons.outlined.Pause
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Savings
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Stop
import androidx.compose.material.icons.outlined.SwapHoriz
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import app.bandival.android.WebAppBridge
import app.bandival.android.data.IdeasResponse
import app.bandival.android.ui.AppScope
import app.bandival.android.ui.components.EmptyState
import app.bandival.android.ui.components.Label
import app.bandival.android.ui.components.ResourceView
import app.bandival.android.ui.components.SectionCard
import app.bandival.android.ui.components.formatDay
import app.bandival.android.ui.components.formatDuration
import app.bandival.android.ui.rememberResource
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.File

@Composable
private fun MoreItem(icon: ImageVector, title: String, subtitle: String? = null, onClick: () -> Unit) {
    ListItem(
        headlineContent = { Text(title) },
        supportingContent = subtitle?.let { { Text(it) } },
        leadingContent = { Icon(icon, null) },
        modifier = Modifier.clickable(onClick = onClick),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MoreScreen(scope: AppScope) {
    val me by scope.repository.me.collectAsState()
    val bandId by scope.repository.bandId.collectAsState()
    val coroutines = rememberCoroutineScope()
    var bandPicker by remember { mutableStateOf(false) }
    val band = me?.bands?.firstOrNull { it.id == bandId }
    val guest = band?.isGuest == true

    Column(Modifier.fillMaxSize()) {
        TopAppBar(title = { Text("Mehr") })
        LazyColumn {
            item {
                ListItem(
                    headlineContent = { Text(me?.displayName ?: "") },
                    supportingContent = { Text(me?.email ?: "") },
                    leadingContent = {
                        Box(Modifier.size(40.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
                            Text(me?.displayName?.take(1)?.uppercase() ?: "?", color = MaterialTheme.colorScheme.onPrimaryContainer)
                        }
                    },
                )
            }
            item {
                MoreItem(Icons.Outlined.SwapHoriz, band?.name ?: "Band wählen", if ((me?.bands?.size ?: 0) > 1) "Band wechseln" else band?.role?.let { "Rolle: $it" }) {
                    if ((me?.bands?.size ?: 0) > 1) bandPicker = true
                }
            }
            item { HorizontalDivider() }
            if (!guest) {
                item { MoreItem(Icons.Outlined.Lightbulb, "Ideen-Inbox", "Riffs & Sprachmemos aufnehmen") { scope.nav.navigate("ideas") } }
            }
            item { MoreItem(Icons.Outlined.Notifications, "Benachrichtigungen") { scope.nav.navigate("notifications") } }
            if (!guest) {
                item { MoreItem(Icons.Outlined.Groups, "Band & Mitglieder") { scope.openWeb("/app/band") } }
                item { MoreItem(Icons.Outlined.Savings, "Bandkasse") { scope.openWeb("/app/finance") } }
                item { MoreItem(Icons.Outlined.MusicNote, "Aktivität") { scope.openWeb("/app/activity") } }
            }
            item { MoreItem(Icons.Outlined.Settings, "Einstellungen", "Profil, 2FA, Push/ntfy, Bandival Pulse") { scope.openWeb("/app/settings") } }
            item { HorizontalDivider() }
            item { SecurityItems(scope) }
            item { HorizontalDivider() }
            item {
                MoreItem(Icons.Outlined.Dns, "Server", scope.app.serverUrl) {
                    coroutines.launch {
                        scope.repository.logout()
                        scope.app.changeServer(null)
                        scope.nav.navigate("setup") { popUpTo(0) }
                    }
                }
            }
            item {
                MoreItem(Icons.AutoMirrored.Outlined.Logout, "Abmelden") {
                    coroutines.launch {
                        scope.repository.logout()
                        scope.nav.navigate("login") { popUpTo(0) }
                    }
                }
            }
            item {
                Text(
                    "Bandival ${app.bandival.android.BuildConfig.VERSION_NAME}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(16.dp),
                )
            }
        }
    }

    if (bandPicker) {
        AlertDialog(
            onDismissRequest = { bandPicker = false },
            title = { Text("Band wählen") },
            text = {
                Column {
                    me?.bands.orEmpty().forEach { entry ->
                        ListItem(
                            headlineContent = { Text(entry.name) },
                            supportingContent = { Text(entry.role) },
                            modifier = Modifier.clickable {
                                scope.repository.selectBand(entry.id)
                                bandPicker = false
                            },
                        )
                    }
                }
            },
            confirmButton = { TextButton(onClick = { bandPicker = false }) { Text("Schließen") } },
        )
    }
}

/* ---------------- Ideas ---------------- */

private class VoiceRecorder(private val context: Context) {
    private var recorder: MediaRecorder? = null
    var file: File? = null
        private set
    private var startedAt = 0L

    fun start() {
        val target = File(context.cacheDir, "idea-${System.currentTimeMillis()}.m4a")
        val instance = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(context) else @Suppress("DEPRECATION") MediaRecorder()
        instance.setAudioSource(MediaRecorder.AudioSource.MIC)
        instance.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
        instance.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
        instance.setAudioEncodingBitRate(128_000)
        instance.setAudioSamplingRate(44_100)
        instance.setOutputFile(target.absolutePath)
        instance.prepare()
        instance.start()
        recorder = instance
        file = target
        startedAt = System.currentTimeMillis()
    }

    fun level(): Float = runCatching { (recorder?.maxAmplitude ?: 0) / 32767f }.getOrDefault(0f)

    /** Returns the duration in seconds. */
    fun stop(): Int {
        runCatching { recorder?.stop() }
        recorder?.release()
        recorder = null
        return ((System.currentTimeMillis() - startedAt) / 1000).toInt()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IdeasScreen(scope: AppScope) {
    val context = LocalContext.current
    val bandId by scope.repository.bandId.collectAsState()
    var refresh by remember { mutableIntStateOf(0) }
    val ideas = rememberResource(scope.repository, bandId?.let { "/api/ideas?bandId=$it" }, IdeasResponse.serializer(), refresh)
    val recorder = remember { VoiceRecorder(context) }
    var recording by remember { mutableStateOf(false) }
    var seconds by remember { mutableLongStateOf(0) }
    var level by remember { mutableStateOf(0f) }
    var draft by remember { mutableStateOf<Pair<File, Int>?>(null) }
    var title by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var uploading by remember { mutableStateOf(false) }
    val coroutines = rememberCoroutineScope()
    val now by scope.player.now.collectAsState()

    fun startRecording() {
        runCatching { recorder.start() }
            .onSuccess { recording = true; seconds = 0 }
            .onFailure { Toast.makeText(context, "Aufnahme nicht möglich: ${it.message}", Toast.LENGTH_LONG).show() }
    }

    val micPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startRecording() else Toast.makeText(context, "Ohne Mikrofon-Berechtigung keine Aufnahme.", Toast.LENGTH_LONG).show()
    }

    LaunchedEffect(recording) {
        while (recording) {
            level = recorder.level()
            seconds += 1
            delay(1000)
        }
    }
    DisposableEffect(Unit) { onDispose { if (recording) recorder.stop() } }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Ideen") },
                navigationIcon = { IconButton(onClick = { scope.back() }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Zurück") } },
            )
        },
    ) { padding ->
        Column(Modifier.padding(padding)) {
            SectionCard(Modifier.padding(16.dp)) {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    val pending = draft
                    if (pending == null) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                            Box(
                                Modifier.size(64.dp).clip(CircleShape).background(if (recording) Color(0xFFEF4444) else MaterialTheme.colorScheme.primary).clickable {
                                    if (recording) {
                                        val duration = recorder.stop()
                                        recording = false
                                        recorder.file?.let { draft = it to duration }
                                    } else if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                                        startRecording()
                                    } else {
                                        micPermission.launch(Manifest.permission.RECORD_AUDIO)
                                    }
                                },
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(if (recording) Icons.Outlined.Stop else Icons.Outlined.Mic, if (recording) "Stopp" else "Aufnehmen", tint = Color.White, modifier = Modifier.size(30.dp))
                            }
                            Column {
                                Text(if (recording) "Aufnahme läuft · ${formatDuration(seconds.toInt())}" else "Idee aufnehmen", style = MaterialTheme.typography.titleMedium)
                                Text(if (recording) "Tippen zum Stoppen" else "Riff, Melodie, Textzeile", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                if (recording) LinearProgressIndicator(progress = { level }, modifier = Modifier.padding(top = 6.dp))
                            }
                        }
                    } else {
                        Text("Aufnahme · ${formatDuration(pending.second)}", style = MaterialTheme.typography.titleMedium)
                        OutlinedTextField(value = title, onValueChange = { title = it }, label = { Text("Titel (optional)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(value = notes, onValueChange = { notes = it }, label = { Text("Notizen") }, modifier = Modifier.fillMaxWidth())
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            TextButton(onClick = { pending.first.delete(); draft = null }) { Text("Verwerfen") }
                            androidx.compose.material3.Button(enabled = !uploading && bandId != null, onClick = {
                                uploading = true
                                coroutines.launch {
                                    runCatching { scope.repository.uploadIdea(bandId!!, title.trim(), notes.trim(), pending.first, pending.second) }
                                        .onSuccess {
                                            pending.first.delete()
                                            draft = null
                                            title = ""
                                            notes = ""
                                            refresh += 1
                                        }
                                        .onFailure { Toast.makeText(context, it.message, Toast.LENGTH_LONG).show() }
                                    uploading = false
                                }
                            }) { Text(if (uploading) "Lädt hoch …" else "Speichern") }
                        }
                    }
                }
            }
            ResourceView(ideas, onRetry = { refresh += 1 }) { data ->
                if (data.ideas.isEmpty()) {
                    EmptyState(Icons.Outlined.Lightbulb, "Noch keine Ideen", "Nimm ein Riff auf – die ganze Band kann reinhören.")
                } else {
                    LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        item { Label("Inbox") }
                        items(data.ideas, key = { it.id }) { idea ->
                            SectionCard(padding = PaddingValues(12.dp)) {
                                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        if (idea.fileUrl != null) {
                                            val url = scope.repository.api.absolute(idea.fileUrl)
                                            IconButton(onClick = { scope.player.play(url, idea.title, "Idee") }) {
                                                Icon(if (now?.url == url && now?.playing == true) Icons.Outlined.Pause else Icons.Outlined.PlayArrow, "Abspielen")
                                            }
                                        }
                                        Column(Modifier.weight(1f)) {
                                            Text(idea.title, style = MaterialTheme.typography.titleMedium)
                                            Text("${idea.createdBy?.displayName ?: ""} · ${formatDay(idea.createdAt)}${idea.durationSeconds?.let { " · " + formatDuration(it) } ?: ""}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        }
                                        IconButton(onClick = {
                                            coroutines.launch {
                                                runCatching { scope.repository.deleteIdea(idea.id) }.onFailure { Toast.makeText(context, it.message, Toast.LENGTH_LONG).show() }
                                                refresh += 1
                                            }
                                        }) { Icon(Icons.Outlined.Delete, "Löschen") }
                                    }
                                    if (!idea.notes.isNullOrBlank()) Text(idea.notes, style = MaterialTheme.typography.bodyMedium, maxLines = 4)
                                    if (idea.song != null) {
                                        TextButton(onClick = { scope.openSong(idea.song.id) }) { Text("Song: ${idea.song.title}") }
                                    } else {
                                        TextButton(onClick = {
                                            coroutines.launch {
                                                runCatching { scope.repository.convertIdea(idea.id) }
                                                    .onSuccess { scope.openSong(it) }
                                                    .onFailure { Toast.makeText(context, it.message, Toast.LENGTH_LONG).show() }
                                            }
                                        }) { Text("Zum Song machen") }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/* ---------------- Embedded web screens ---------------- */

/**
 * Desktop-sized tools (notation editor, finance, settings …) run as embedded web views.
 * They share the session cookie with the native app.
 */
@SuppressLint("SetJavaScriptEnabled")
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WebScreen(scope: AppScope, path: String) {
    val context = LocalContext.current
    var title by remember { mutableStateOf("Bandival") }
    var progress by remember { mutableIntStateOf(0) }
    var webView by remember { mutableStateOf<WebView?>(null) }
    var fileCallback by remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }
    val base = scope.app.serverUrl.orEmpty()
    val chooser = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data))
        fileCallback = null
    }

    BackHandler(enabled = webView?.canGoBack() == true) { webView?.goBack() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title, maxLines = 1) },
                navigationIcon = { IconButton(onClick = { scope.back() }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Zurück") } },
                actions = {
                    IconButton(onClick = {
                        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(webView?.url ?: (base + path)))) }
                    }) { Icon(Icons.Outlined.OpenInBrowser, "Im Browser öffnen") }
                },
            )
        },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            AndroidView(
                factory = { ctx ->
                    WebView(ctx).apply {
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.mediaPlaybackRequiresUserGesture = false
                        CookieManager.getInstance().setAcceptThirdPartyCookies(this, false)
                        addJavascriptInterface(WebAppBridge(EmbeddedHost(ctx)), "BandivalAndroid")
                        webViewClient = object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                                val url = request.url
                                // Only our own server stays inside the web view (and sees the JS bridge) –
                                // exact scheme/host/port match, "startsWith" would also accept https://server.evil.example.
                                if (sameOrigin(url, base)) return false
                                runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, url)) }
                                return true
                            }

                            override fun onPageFinished(view: WebView, url: String?) {
                                title = view.title?.substringBefore(" · ")?.takeIf { it.isNotBlank() } ?: "Bandival"
                            }
                        }
                        webChromeClient = object : WebChromeClient() {
                            override fun onProgressChanged(view: WebView, newProgress: Int) {
                                progress = newProgress
                            }

                            override fun onPermissionRequest(request: PermissionRequest) {
                                if (sameOrigin(request.origin, base) && request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE) &&
                                    ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
                                ) {
                                    request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                                } else {
                                    request.deny()
                                }
                            }

                            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                                fileCallback?.onReceiveValue(null)
                                fileCallback = callback
                                return runCatching {
                                    chooser.launch(params.createIntent().apply {
                                        if (params.mode == FileChooserParams.MODE_OPEN_MULTIPLE) putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                                    })
                                    true
                                }.getOrElse {
                                    fileCallback = null
                                    false
                                }
                            }
                        }
                        setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
                            runCatching {
                                val fileName = URLUtil.guessFileName(url, contentDisposition, mimeType)
                                val request = DownloadManager.Request(Uri.parse(url)).apply {
                                    setMimeType(mimeType)
                                    addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url))
                                    addRequestHeader("User-Agent", userAgent)
                                    setTitle(fileName)
                                    setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                        setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "Bandival/$fileName")
                                    } else {
                                        setDestinationInExternalFilesDir(ctx, Environment.DIRECTORY_DOWNLOADS, fileName)
                                    }
                                }
                                (ctx.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
                                Toast.makeText(ctx, "Download gestartet: $fileName", Toast.LENGTH_SHORT).show()
                            }.onFailure { Toast.makeText(ctx, "Download fehlgeschlagen.", Toast.LENGTH_LONG).show() }
                        }
                        loadUrl(if (path.startsWith("http")) path else base + path)
                        webView = this
                    }
                },
                modifier = Modifier.fillMaxSize(),
            )
            if (progress in 1..99) LinearProgressIndicator(progress = { progress / 100f }, modifier = Modifier.fillMaxWidth())
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            webView?.destroy()
            webView = null
        }
    }
}

/** Bridge host for embedded web screens (keep screen on, vibration for the web live mode). */
private class EmbeddedHost(private val context: Context) : WebAppBridge.Host {
    private val haptics = app.bandival.android.live.PhoneHaptics(context)
    override fun keepScreenOn(on: Boolean) {
        (context as? android.app.Activity)?.runOnUiThread {
            val flag = android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            if (on) context.window.addFlags(flag) else context.window.clearFlags(flag)
        }
    }
    override fun applyDarkMode(dark: Boolean) = Unit
    override fun openServerSetup() = Unit
    override fun appVersion(): String = app.bandival.android.BuildConfig.VERSION_NAME
    override fun vibrate(durationMs: Long, amplitude: Int) {
        haptics.pulse(amplitude >= 200, app.bandival.android.live.HapticSettings(pulseMs = durationMs.toInt(), intensity = if (amplitude > 0) amplitude else 170))
    }
    override fun hasVibrator(): Boolean = haptics.available
}

/** Same scheme, host and (effective) port – the only safe way to decide whether a URL belongs to our server. */
internal fun sameOrigin(url: Uri, base: String): Boolean {
    val server = Uri.parse(base)
    fun port(uri: Uri) = if (uri.port != -1) uri.port else if (uri.scheme.equals("https", true)) 443 else 80
    return url.scheme.equals(server.scheme, ignoreCase = true) &&
        url.host.equals(server.host, ignoreCase = true) &&
        port(url) == port(server)
}

/** App lock with biometrics and a passkey for this phone (sign in without password next time). */
@Composable
private fun SecurityItems(scope: AppScope) {
    val context = LocalContext.current
    val activity = context as? android.app.Activity
    val fragmentActivity = context as? androidx.fragment.app.FragmentActivity
    val coroutines = rememberCoroutineScope()
    var lockEnabled by remember { mutableStateOf(app.bandival.android.security.AppLock.isEnabled(context)) }
    var message by remember { mutableStateOf<String?>(null) }
    val available = remember { app.bandival.android.security.AppLock.isAvailable(context) }

    Column {
        ListItem(
            headlineContent = { Text("App-Sperre") },
            supportingContent = { Text(if (available) "Beim Öffnen mit Fingerabdruck, Gesicht oder Geräte-PIN entsperren" else "Auf diesem Gerät ist keine Displaysperre eingerichtet") },
            leadingContent = { Icon(Icons.Outlined.Fingerprint, null) },
            trailingContent = {
                Switch(
                    checked = lockEnabled,
                    enabled = available,
                    onCheckedChange = { wanted ->
                        val host = fragmentActivity ?: return@Switch
                        // Confirm once with the biometric prompt so nobody locks themselves out by accident.
                        app.bandival.android.security.AppLock.prompt(host, if (wanted) "App-Sperre aktivieren" else "App-Sperre ausschalten") { ok ->
                            if (ok) {
                                app.bandival.android.security.AppLock.setEnabled(context, wanted)
                                lockEnabled = wanted
                            }
                        }
                    },
                )
            },
        )
        MoreItem(Icons.Outlined.Key, "Passkey für dieses Gerät anlegen", "Nächstes Mal ohne Passwort anmelden") {
            val host = activity ?: return@MoreItem
            coroutines.launch {
                message = try {
                    app.bandival.android.security.Passkeys.register(host, scope.repository)
                    "Passkey angelegt – ab jetzt kannst du dich damit anmelden."
                } catch (failure: Exception) {
                    app.bandival.android.security.Passkeys.message(failure)
                }
            }
        }
        message?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
        }
    }
}

/** Full-screen cover while the app is locked. */
@Composable
fun LockScreen(onUnlock: () -> Unit) {
    LaunchedEffect(Unit) { onUnlock() }
    Box(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).clickable(onClick = onUnlock),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Icon(Icons.Outlined.Fingerprint, contentDescription = null, modifier = Modifier.size(56.dp), tint = MaterialTheme.colorScheme.primary)
            Text("Bandival ist gesperrt", style = MaterialTheme.typography.titleLarge)
            Button(onClick = onUnlock) { Text("Entsperren") }
        }
    }
}
