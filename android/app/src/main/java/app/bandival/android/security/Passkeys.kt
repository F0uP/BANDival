package app.bandival.android.security

import android.app.Activity
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import app.bandival.android.data.Repository

/**
 * Passkeys through Android's Credential Manager – the same passkeys as in the browser
 * (Google Password Manager or another provider syncs them). The server must publish
 * /.well-known/assetlinks.json for this app (ANDROID_CERT_SHA256) and run on https with a domain.
 */
object Passkeys {
    suspend fun signIn(activity: Activity, repository: Repository) {
        val (challengeId, requestJson) = repository.passkeyLoginOptions()
        val result = CredentialManager.create(activity).getCredential(
            activity,
            GetCredentialRequest(listOf(GetPublicKeyCredentialOption(requestJson))),
        )
        val credential = result.credential as? PublicKeyCredential ?: throw IllegalStateException("Kein Passkey ausgewählt.")
        repository.passkeyLoginVerify(challengeId, credential.authenticationResponseJson)
    }

    suspend fun register(activity: Activity, repository: Repository) {
        val (challengeId, requestJson) = repository.passkeyAddOptions()
        val response = CredentialManager.create(activity).createCredential(activity, CreatePublicKeyCredentialRequest(requestJson))
        val json = (response as? CreatePublicKeyCredentialResponse)?.registrationResponseJson ?: throw IllegalStateException("Passkey konnte nicht angelegt werden.")
        repository.passkeyAddVerify(challengeId, json, "Bandival-App auf ${android.os.Build.MODEL}")
    }

    fun message(error: Throwable): String = when (error) {
        is GetCredentialCancellationException, is CreateCredentialCancellationException -> "Abgebrochen."
        is NoCredentialException -> "Auf diesem Gerät ist noch kein Passkey für Bandival gespeichert – lege ihn unter „Mehr“ an oder melde dich im Browser an."
        is GetCredentialException, is CreateCredentialException ->
            "Passkeys brauchen einen Server mit https-Domain und eingerichteter App-Verknüpfung (ANDROID_CERT_SHA256). ${error.message.orEmpty()}".trim()
        else -> error.message ?: "Passkey fehlgeschlagen."
    }
}
