package app.bandival.android.ui.screens

import app.bandival.android.security.Passkeys
import androidx.compose.ui.platform.LocalContext
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.outlined.Fingerprint
import androidx.compose.material3.OutlinedButton
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import app.bandival.android.BandivalApp
import app.bandival.android.R
import app.bandival.android.data.ServerConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
private fun AuthFrame(title: String, subtitle: String, content: @Composable () -> Unit) {
    Column(
        Modifier.fillMaxSize().systemBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Spacer(Modifier.height(32.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Image(painterResource(R.drawable.ic_splash), contentDescription = null, modifier = Modifier.size(44.dp))
            Text("Bandival", style = MaterialTheme.typography.titleLarge)
        }
        Spacer(Modifier.height(8.dp))
        Text(title, style = MaterialTheme.typography.headlineMedium)
        Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        content()
    }
}

@Composable
fun SetupScreen(app: BandivalApp, onDone: () -> Unit) {
    var input by remember { mutableStateOf(app.serverUrl.orEmpty()) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    val connect = {
        val url = ServerConfig.normalize(input)
        if (url == null) {
            error = "Bitte eine gültige Adresse eingeben."
        } else {
            busy = true
            error = null
            scope.launch {
                when (val result = withContext(Dispatchers.IO) { ServerConfig.check(url) }) {
                    is ServerConfig.CheckResult.Ok -> {
                        app.changeServer(url)
                        onDone()
                    }
                    is ServerConfig.CheckResult.Error -> error = result.message
                }
                busy = false
            }
        }
    }

    AuthFrame("Mit deinem Server verbinden", "Bandival ist self-hosted. Gib die Adresse eurer Bandival-Instanz ein.") {
        OutlinedTextField(
            value = input,
            onValueChange = { input = it },
            label = { Text("Server-Adresse") },
            placeholder = { Text("bandival.meine-band.de") },
            supportingText = { Text(error ?: "z. B. bandival.meine-band.de oder http://192.168.0.10:3000") },
            isError = error != null,
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go),
            keyboardActions = KeyboardActions(onGo = { connect() }),
            modifier = Modifier.fillMaxWidth(),
        )
        Button(onClick = { connect() }, enabled = !busy, modifier = Modifier.fillMaxWidth().height(52.dp)) {
            if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) else Text("Verbinden")
        }
    }
}

@Composable
fun LoginScreen(app: BandivalApp, onLoggedIn: () -> Unit, onChangeServer: () -> Unit) {
    val repository = app.repository
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var challenge by remember { mutableStateOf<String?>(null) }
    var code by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var forgotOpen by remember { mutableStateOf(false) }
    var info by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val activity = LocalContext.current as? android.app.Activity

    fun submit() {
        busy = true
        error = null
        scope.launch {
            try {
                val pending = challenge
                if (pending != null) {
                    repository.loginTwoFactor(pending, code)
                    onLoggedIn()
                } else {
                    val result = repository.login(email, password)
                    if (result.twoFactorRequired && result.challenge != null) challenge = result.challenge else onLoggedIn()
                }
            } catch (failure: Exception) {
                error = failure.message
            } finally {
                busy = false
            }
        }
    }

    AuthFrame(
        if (challenge != null) "Bestätigungscode" else "Willkommen zurück",
        if (challenge != null) "Code aus deiner Authenticator-App oder ein Wiederherstellungscode." else app.serverUrl.orEmpty(),
    ) {
        if (challenge == null) {
            OutlinedTextField(
                value = email, onValueChange = { email = it }, label = { Text("E-Mail") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = password, onValueChange = { password = it }, label = { Text("Passwort") }, singleLine = true,
                visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                trailingIcon = {
                    IconButton(onClick = { showPassword = !showPassword }) {
                        Icon(if (showPassword) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility, contentDescription = "Passwort anzeigen")
                    }
                },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { submit() }),
                modifier = Modifier.fillMaxWidth(),
            )
        } else {
            OutlinedTextField(
                value = code, onValueChange = { code = it }, label = { Text("Code") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { submit() }),
                modifier = Modifier.fillMaxWidth(),
            )
        }
        if (error != null) Text(error!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
        if (info != null) Text(info!!, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodyMedium)
        Button(onClick = { submit() }, enabled = !busy && (if (challenge == null) email.isNotBlank() && password.isNotEmpty() else code.length >= 6), modifier = Modifier.fillMaxWidth().height(52.dp)) {
            if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) else Text(if (challenge == null) "Anmelden" else "Bestätigen")
        }
        if (challenge == null && activity != null) {
            OutlinedButton(
                onClick = {
                    busy = true
                    error = null
                    scope.launch {
                        try {
                            Passkeys.signIn(activity, repository)
                            onLoggedIn()
                        } catch (failure: Exception) {
                            error = Passkeys.message(failure)
                        } finally {
                            busy = false
                        }
                    }
                },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth().height(52.dp),
            ) {
                Icon(Icons.Outlined.Fingerprint, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("Mit Passkey anmelden")
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            TextButton(onClick = { if (challenge != null) challenge = null else forgotOpen = true }) {
                Text(if (challenge != null) "Zurück" else "Passwort vergessen?")
            }
            TextButton(onClick = onChangeServer) { Text("Server ändern") }
        }
        Text(
            "Noch kein Account? Registrieren und Einladungen annehmen geht im Browser – danach hier anmelden.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }

    if (forgotOpen) {
        var resetEmail by remember { mutableStateOf(email) }
        AlertDialog(
            onDismissRequest = { forgotOpen = false },
            title = { Text("Passwort vergessen") },
            text = {
                OutlinedTextField(value = resetEmail, onValueChange = { resetEmail = it }, label = { Text("E-Mail") }, singleLine = true)
            },
            confirmButton = {
                TextButton(onClick = {
                    forgotOpen = false
                    scope.launch {
                        runCatching { repository.forgotPassword(resetEmail) }
                            .onSuccess { info = "Falls ein Account existiert, ist ein Link unterwegs." }
                            .onFailure { error = it.message }
                    }
                }) { Text("Link anfordern") }
            },
            dismissButton = { TextButton(onClick = { forgotOpen = false }) { Text("Abbrechen") } },
        )
    }
}
