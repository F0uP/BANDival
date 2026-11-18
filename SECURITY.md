# Sicherheit

## Sicherheitslücken melden

Bitte **keine öffentlichen Issues** für Sicherheitslücken. Nutze die private Meldung über
GitHub (*Security → Report a vulnerability*) dieses Repositories. Wir antworten so schnell wie möglich
und veröffentlichen einen Fix, bevor Details öffentlich werden.

## Betrieb – Checkliste

1. **HTTPS** vor Bandival (Caddy, Traefik, nginx) und `COOKIE_SECURE=true`.
2. **`AUTH_SECRET`**: mindestens 32 zufällige Zeichen, z. B. `openssl rand -base64 48`. Daraus werden
   Session-Hashes, Token-Signaturen und der Schlüssel für gespeicherte 2FA-Secrets abgeleitet.
   Ein Wechsel meldet alle Geräte ab und macht eingerichtete 2FA-Apps und Wiederherstellungscodes ungültig.
3. **`TRUSTED_PROXY_COUNT`** passend zur Anzahl Reverse-Proxys setzen (Default 1) – sonst lässt sich das
   Login-Rate-Limit über gefälschte `X-Forwarded-For`-Header umgehen.
4. **`.env` niemals committen.** Ist eine `.env` je in die Git-Historie gelangt, gelten **alle** Werte darin als
   kompromittiert: `AUTH_SECRET`, Datenbank- und SMTP-Passwörter, API-Keys austauschen und die Historie bereinigen
   (`git filter-repo --path .env --invert-paths`, danach Force-Push und alle Klone neu ziehen).
5. Regelmäßig aktualisieren (`docker compose pull && docker compose up -d`) – Abhängigkeiten werden in der CI geprüft.

## Was Bandival schützt

| Bereich | Maßnahme |
| --- | --- |
| Anmeldung | Passkeys (WebAuthn, Benutzerverifikation Pflicht), bcrypt (Kosten 12), Passwortregeln nach NIST SP 800-63B, Abgleich mit Datenlecks per k-Anonymität |
| Zwei Faktoren | TOTP (RFC 6238) mit Replay-Schutz, Secret AES-256-GCM-verschlüsselt, Wiederherstellungscodes nur als Hash |
| Sessions | Zufällige 384-Bit-Tokens, in der Datenbank nur gehasht; `HttpOnly`, `SameSite=Lax`, `Secure`; gleitend 30 Tage, maximal 1 Jahr; Passwortwechsel meldet andere Geräte ab |
| Brute Force | Rate-Limits pro Konto und Adresse für Login, 2FA, Passkeys, Registrierung und Passwort-Reset |
| E-Mail | Bestätigung neuer Adressen (nur mit SMTP), Reset-Links einmalig und befristet |
| Web | Content-Security-Policy mit Nonce + `strict-dynamic`, HSTS, `nosniff`, `frame-ancestors`, Referrer-Policy, Permissions-Policy |
| Anfragen | CSRF Double Submit (zeitkonstanter Vergleich), Eingaben per zod validiert, Prisma ohne rohes SQL |
| Server-Anfragen | SSRF-Schutz (DNS-Rebinding-fest) für Kalender-Abos und ntfy, keine Anfragen an interne Netze |
| Dateien | Auslieferung nur an Berechtigte, Pfadprüfung gegen Traversal, `nosniff`, SVG gesperrt |
| Daten | Gleichzeitige Änderungen werden dreiwege-zusammengeführt (wie git) – Konflikte werden gemeldet, nichts wird still überschrieben |
| Android | Exakter Origin-Vergleich für die eingebettete WebView, optionale biometrische App-Sperre, Passkeys über den Credential Manager |
