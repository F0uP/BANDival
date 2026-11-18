# Bandival

**Self-hosted Band-Management** – Songs, Lead Sheets, Noten, Setlists, Proben und Gigs an einem Ort. Läuft im Browser, als installierbare PWA und als native Android-App.

> 🆕 **Demnächst: Bandival Pulse** – ein Metronom zum *Fühlen* statt Hören. Ein kleines Gerät am Handgelenk oder Drum-Hocker vibriert im Takt, gesteuert aus dem Live-Modus, ohne Kopplung, WLAN oder Internet. Die Software ist fertig (Protokoll, App, Simulator); jedes Android-Handy kann schon heute als Pulse mitvibrieren. → [Spezifikation & Hardware-Vorschlag](docs/bandival-pulse.md)

[![CI](https://github.com/F0uP/BANDival/actions/workflows/ci.yml/badge.svg)](https://github.com/F0uP/BANDival/actions/workflows/ci.yml)
[![Docker image](https://github.com/F0uP/BANDival/actions/workflows/release-image.yml/badge.svg)](https://github.com/F0uP/BANDival/actions/workflows/release-image.yml)
[![Android](https://github.com/F0uP/BANDival/actions/workflows/android.yml/badge.svg)](https://github.com/F0uP/BANDival/actions/workflows/android.yml)

## Funktionen

**Songs**
- Repertoire mit Status (Idee → In Arbeit → Bühnenreif → Archiv), Tonart, Tempo, Taktart, Dauer, Album
- **Lead Sheets** in ChordPro oder „Akkorde über Text“ – transponierbar, skalierbare Schrift, Akkorde ein/aus
- **Stimmen pro Instrument** (z. B. Bass-Tab, Drum-Pattern, Keys-Voicings) direkt neben dem Lead Sheet
- **Noteneditor** im Stil von MuseScore: Tastatur-Eingabe (A–G, Notenwerte 2–7, Punktierung, Triolen, Haltebögen), Bildschirm-Klavier und Drum-Pads, Akkordsymbole und Liedtext, Gitarren-/Bass-Tabulatur, Schlagzeugnotation, Transponieren, Wiedergabe mit Metronom/Einzähler, Export als MusicXML/MIDI/ABC/PDF, Import von MusicXML (z. B. aus MuseScore)
- Aufnahmen mit Versionsverlauf, globaler Player (läuft beim Navigieren weiter, Tempo, A/B-Loop)
- **Zeitmarken-Feedback**: Kommentare an einer Stelle der Aufnahme („bei 1:23 ist der Bass zu früh“) mit Wellenform
- **Übungsmixer** ohne KI: Gesang/Mitte, Stereo-Seiten, Bass & Höhen einer fertigen Aufnahme regeln (z. B. „ohne Gesang“, „ohne Bass“), Tempo mit gleicher Tonhöhe
- **Mehrspur (Stems)**: Einzelspuren hochladen und mit Mute/Solo/Lautstärke synchron üben
- **Import**: ChordPro-Dateien in Massen, Titellisten, Spotify-Playlists/Alben
- Noten & Dateien (PDF, MusicXML, Fotos), Diskussionen und Aufgaben pro Song, Alben mit Cover und Tracklist

**Ideen-Inbox**
- Riffs, Melodien und Textzeilen direkt im Browser oder in der App aufnehmen, anhören, kommentieren – und mit einem Klick zum Song machen

**Setlists**
- Drag & Drop (Maus, Touch, Tastatur), laufende Startzeit je Song, Gesamtdauer
- Übergangsnotizen, „Passt gut danach“-Vorschläge (Tempo, Tonart, Bühnenreife)
- Besetzung & Packliste, Probenmodus mit Timer und Notizen je Song
- **Live-Modus**:
  - großer Click mit Taktart, Einzähler, Beat-Blitz und Tap-Tempo; startet auf Wunsch bei jedem Song automatisch im richtigen Tempo
  - „Als nächstes“ mit Übergangsnotiz, Setlist-Übersicht zum Springen, Uhr, Set- und Song-Timer
  - Akkorde, Text, Noten oder die eigene Stimme; Auto-Scroll und Transponieren
  - Bluetooth-Fußpedal, Bildschirm bleibt an
- **Bühnen-Sync ohne Internet**: Wer Start drückt, gibt den Takt vor. Alle anderen Handys im Live-Modus laufen automatisch mit (Click/Vibration, Songwechsel):
  - in der Android-App per **Bluetooth-Broadcast**, ohne Kopplung, WLAN oder Server
  - im selben WLAN zusätzlich per UDP mit NTP-artigem Uhrenabgleich
  - im Browser über den Bandival-Server
  - Die Audio-Latenz jedes Geräts wird automatisch ausgeglichen.
- Ganze Setlists werden für offline vorgeladen; PDF-Export für die Bühne
- **Gäste/Aushilfen**: sehen nur freigegebene Setlists mit Lead Sheets, Noten und Aufnahmen

**Kalender**
- Proben, Gigs, Meetings – inkl. Serien, Ort mit Kartenlink, verknüpfter Setlist, Status
- Zu-/Absagen pro Termin, Übersicht „Wer kann?“, Urlaub/Abwesenheit für mehrere Tage
- **Kalender-Sync**: Google-, iCloud- oder Outlook-Kalender per geheimer iCal-Adresse verbinden (oder `.ics` hochladen) – belegte Zeiten blocken automatisch. Andere sehen nur „belegt“, keine Details.
- **Band-Kalender abonnieren**: persönlicher Abo-Link für Google/Apple/Outlook
- **Terminfinder**: schlägt Tage vor, an denen die meisten können
- **Probe**: Protokoll mit Anwesenheit, gespielten Songs und Bewertung; **Probenplaner** schlägt vor, was geübt werden sollte (nächster Gig, holprige Songs, lange nicht gespielt, offene Aufgaben)
- **Gig**: Veranstalter, Gage & Zahlungsstatus, Load-in/Soundcheck/Einlass, **Tech-Rider mit Stage-Plot als PDF**
- Erinnerungen 24 h vorher, Nachfrage bei fehlender Zusage, Wochenüberblick per Mail

**Band**
- Mehrere Bands pro Person, Rollen (Owner/Admin/Mitglied/Gast), Einladungen per Mail oder Link
- **Bandkasse**: Einnahmen/Ausgaben, Daueraufträge (z. B. Proberaummiete), bezahlte Gagen werden automatisch gebucht, Gagen-Aufteilung, CSV-Export
- **Öffentliche Bandseite / Pressekit** unter `/b/<name>`: Bio, Pressefoto, Konzerte (mit Kalender-Abo für Fans), freigegebene Songs zum Anhören, Booking-Kontakt
- Benachrichtigungen in der App, per **Web Push**, **ntfy** (auch ohne Google-Dienste) und E-Mail – pro Kategorie einstellbar
- Sicherheit: **Zwei-Faktor-Anmeldung** (TOTP + Wiederherstellungscodes), Passwort vergessen, E-Mail-Bestätigung, Registrierungsmodus (offen / nur Einladung / geschlossen)
- **Automatische nächtliche Backups**, Backup & Restore, Aktivitätsverlauf, Hell/Dunkel-Modus, Befehlspalette (`⌘K` / `Strg+K`)

**Optional: KI** (vom Server-Admin aktivierbar – ohne Konfiguration verlässt nichts den Server)
- **Spurtrennung** einer Aufnahme in Gesang, Drums, Bass und Rest mit dem selbst gehosteten Demucs-Dienst (kein Cloud-Dienst, siehe unten)
- mit OpenAI, Gemini oder lokal mit **Ollama**: „Akkorde über Text“ → ChordPro, Setlist-Dramaturgie vorschlagen, Band-Bio fürs Pressekit, Probenprotokolle zusammenfassen, Sprachmemos transkribieren (OpenAI/Gemini)

## Schnellstart mit Docker

Voraussetzungen: Docker mit Compose-Plugin.

```bash
cp .env.example .env        # Werte anpassen – mindestens POSTGRES_PASSWORD und AUTH_SECRET
docker compose pull
docker compose up -d
```

Danach läuft Bandival auf `http://localhost:3000`. Beim ersten Registrieren wird automatisch deine Band angelegt.

`AUTH_SECRET` erzeugen: `openssl rand -base64 48`

Für einen Server ohne Git-Checkout gibt es ein schlankes Paket unter [`deploy/`](deploy/README.md).

### Wichtige Variablen

| Variable | Bedeutung |
| --- | --- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD` | Datenbankzugang |
| `AUTH_SECRET` | Geheimer Schlüssel für Sitzungen, Einladungen und Kalender-Links (≥ 32 Zeichen) |
| `APP_BASE_URL` | Öffentliche URL, z. B. `https://bandival.meine-band.de` (für Links in Mails und Kalender-Abos) |
| `COOKIE_SECURE` | `true`, sobald HTTPS genutzt wird (Pflicht in Produktion) |
| `APP_TIMEZONE` | Standard-Zeitzone neuer Bands (Default `Europe/Berlin`) |
| `SMTP_*` | Optional: Mailversand für Einladungen und Benachrichtigungen |
| `CALENDAR_SYNC_ALLOW_PRIVATE` | `true` erlaubt Kalender-Import aus dem LAN (z. B. Nextcloud im selben Netz) |
| `REGISTRATION_MODE` | `open` (Default), `invite` (nur mit Einladung) oder `closed` – der allererste Account geht immer |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Optional: feste Web-Push-Schlüssel (sonst automatisch erzeugt und gespeichert) |
| `BACKUP_ENABLED`, `BACKUP_RETENTION_DAYS` | Nächtliche JSON-Backups pro Band ins Volume `bandival_backups_data` (Default: an, 14 Tage) |
| `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, `AI_BASE_URL` | Optional: `openai`, `gemini` oder `ollama` für KI-Funktionen |
| `STEM_SEPARATION_URL`, `STEM_SEPARATION_TOKEN` | Optional: selbst gehostete Spurtrennung (Compose-Profil `ai`) |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | Optional: Spotify-Playlists als Songs importieren |
| `TRUSTED_PROXY_COUNT` | Anzahl Reverse-Proxys vor Bandival (Default `1`, `0` ohne Proxy) – für das Login-Rate-Limit |
| `EMAIL_VERIFICATION` | `required` (Default), `optional` oder `off` – greift nur, wenn SMTP eingerichtet ist |
| `PASSWORD_BREACH_CHECK` | `true` (Default): Passwörter aus bekannten Datenlecks ablehnen (k-Anonymität), `false` für Offline-Instanzen |
| `LANDING_PAGE` | `false` blendet die Startseite aus – `/` führt dann direkt zum Login |
| `ANDROID_CERT_SHA256` | Fingerabdruck des APK-Signaturzertifikats – aktiviert Passkeys in der Android-App (`/.well-known/assetlinks.json`) |

### Optional: KI-Funktionen

```bash
# Spurtrennung (Demucs, läuft komplett auf eurem Server – CPU reicht, ein paar Minuten pro Song)
docker compose --profile ai up -d
#   .env: STEM_SEPARATION_URL=http://stem-splitter:8000  und ein STEM_SEPARATION_TOKEN

# Lokales Sprachmodell statt Cloud
docker compose --profile ollama up -d && docker exec bandival-ollama ollama pull llama3.1
#   .env: AI_PROVIDER=ollama  AI_BASE_URL=http://ollama:11434  AI_MODEL=llama3.1
```

Mit `AI_PROVIDER=openai` bzw. `gemini` (+ `AI_API_KEY`) gehen die jeweiligen Texte an den Anbieter. Die App weist darauf hin. Audio-Spurtrennung läuft immer nur lokal.

### Updates

```bash
docker compose pull web && docker compose up -d
```

Beim Start führt der Container die Datenbank-Migrationen automatisch aus. **Bestehende Installationen**, deren Datenbank früher per `prisma db push` angelegt wurde, werden dabei erkannt und automatisch übernommen (Baseline) – Daten bleiben erhalten:

- Tagesverfügbarkeiten werden in die neue persönliche Verfügbarkeit überführt,
- Instrumente/Equipment von Setlists und der Song-Status werden aus den alten Text-Feldern übernommen.

Vor größeren Updates empfiehlt sich ein Backup (Einstellungen → Backup) bzw. ein Dump des Volumes `bandival_db_data`.

### Daten

| Volume | Inhalt |
| --- | --- |
| `bandival_db_data` | PostgreSQL |
| `bandival_uploads_data` | Aufnahmen, Noten, Cover, Avatare, Ideen, Pressefotos |
| `bandival_backups_data` | Nächtliche JSON-Backups (Download unter Einstellungen → Backup) |

## Android-App

Die **native App** (Kotlin, Jetpack Compose) verbindet sich mit eurer Instanz. Download als APK unter [Releases](https://github.com/F0uP/BANDival/releases).

- **Live-Modus:** sample-genaues Metronom, Vibration im Takt, Bühnen-Funk per Bluetooth ohne Internet, Bandival Pulse, Bluetooth-Seitenwender
- **Proben-Alltag:** Übersicht mit Zusagen, Kalender, Songs mit transponierbaren Lead Sheets, Setlists
- **Aufnahmen & Ideen:** Wiedergabe im Hintergrund mit Sperrbildschirm-Steuerung, Ideen per Sprachmemo aufnehmen
- **Offline und Benachrichtigungen:** Offline-Cache, Benachrichtigungen
- **Desktop-Werkzeuge** (Noteneditor, Bandkasse, Einstellungen) laufen eingebettet und mit derselben Anmeldung.

Details, Signierung und Build: [`android/README.md`](android/README.md).

Alternativ lässt sich Bandival auf jedem Gerät als **PWA** installieren („Zum Startbildschirm hinzufügen“).

## Kalender-Sync einrichten

1. **Kalender → Kalender-Sync → Meine Termine blocken**
2. Anbieter wählen und der Anleitung folgen (bei Google: *Einstellungen → Kalender → „Privatadresse im iCal-Format“*)
3. Link einfügen – fertig. Die Kalender werden alle 30 Minuten (beim Öffnen des Kalenders) aktualisiert.

Für das Abo der Band-Termine (Tab **Band-Termine abonnieren**) muss der Server aus dem Internet erreichbar sein, da Google/Apple den Link selbst abrufen.

## Entwicklung

Voraussetzungen: Node.js 22, PostgreSQL 16.

```bash
cd web
npm ci
cp ../.env.example .env.local   # DATABASE_URL, AUTH_SECRET setzen
npm run db:migrate              # Migrationen anwenden
npm run dev
```

| Befehl | Zweck |
| --- | --- |
| `npm run lint` / `npm run typecheck` | Statische Prüfungen |
| `npm run build` | Produktions-Build |
| `npm run test:e2e` | API-Tests gegen einen laufenden Server (`E2E_BASE_URL`) |
| `npx prisma migrate dev --name …` | Neue Migration nach Schema-Änderung |

### Architektur

- **Next.js 16** (App Router, React 19), Tailwind CSS 4, SWR, lucide-Icons
- **Prisma 6** + PostgreSQL 16, Zod-Validierung, einheitliche Fehlerbehandlung (`src/lib/http.ts`)
- Auth: Session-Cookies (HttpOnly) + CSRF-Double-Submit im Proxy (`src/proxy.ts`), Rate-Limiting beim Login
- Rechte zentral in `src/lib/permissions.ts` (Server und Client)
- Uploads mit Range-Support (Spulen in mobilen Playern), Auslieferung nur an Bandmitglieder
- Kalender-Import mit `ical.js` (Serien, Ausnahmen, Zeitzonen), SSRF-geschützter Abruf

### CI/CD

| Workflow | Auslöser | Inhalt |
| --- | --- | --- |
| `ci.yml` | Push/PR | Lint, Typecheck, Migrationen (frisch, idempotent, Upgrade einer Alt-DB, Drift-Check), Build, E2E gegen PostgreSQL |
| `release-image.yml` | Push auf `main`, Tags `v*` | Docker-Images nach GHCR: `bandival-web` und `bandival-stem-splitter` (`latest`, `x.y.z`, `sha-…`) |
| `android.yml` | Änderungen in `android/`, Tags `v*` | Unit-Tests, Lint, APK/AAB bauen, bei Tags GitHub-Release mit signierter APK |

Release erstellen: `git tag v2.0.0 && git push origin v2.0.0`

## Sicherheit

Kurzfassung (Details und Meldeweg für Lücken: [SECURITY.md](SECURITY.md)):

- Immer HTTPS + `COOKIE_SECURE=true` in Produktion, `AUTH_SECRET` mit mindestens 32 zufälligen Zeichen (`openssl rand -base64 48`)
- `.env` niemals committen (ist in `.gitignore`) – wurde sie je committet, alle Secrets darin austauschen
- Anmeldung: Passkeys (WebAuthn, phishing-resistent), Passwörter nach NIST 800-63B inkl. Datenleck-Prüfung, TOTP-2FA mit Replay-Schutz und verschlüsseltem Secret, gleitende Sessions (30 Tage Inaktivität)
- Strenge Content-Security-Policy mit Nonce pro Anfrage, HSTS, CSRF-Schutz (Double Submit), SSRF-Schutz für Kalender-Import und ntfy
- Git-artiges Zusammenführen paralleler Änderungen – nichts wird still überschrieben
- Hochgeladene Dateien werden nur an Bandmitglieder ausgeliefert, mit `nosniff`; SVG-Uploads sind gesperrt

## Lizenz

AGPL-3.0 – siehe [LICENSE](LICENSE).
