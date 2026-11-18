# Bandival für Android

Native Android-App (Kotlin, Jetpack Compose, Material 3) für eure selbst gehostete Bandival-Instanz.

## Was die App kann

| Bereich | Nativ |
| --- | --- |
| Einrichtung | Server-Adresse eingeben (Prüfung per `/api/health`), Anmeldung mit **2FA**, Passwort vergessen, Bandwechsel |
| Übersicht & Kalender | anstehende Termine mit **Zu-/Absage**, Setlists, Songs in Arbeit |
| Songs | Suche & Filter, **Lead Sheets** (ChordPro / Akkorde über Text) transponierbar, Instrumentenstimmen, Aufnahmen |
| Aufnahmen | **Hintergrund-Wiedergabe** (Media3) mit Sperrbildschirm-/Kopfhörer-Steuerung, Tempo 50–100 %, ±10 s |
| Live-Modus | Songs wischen, **sample-genaues Metronom** (AudioTrack, Latenz automatisch kalibriert), Einzähler, Beat-Blitz, Tap-Tempo, Auto-Start pro Song, **Vibration im Takt**, Uhr, Set-/Song-Timer, „Als nächstes“, Setlist-Übersicht, Bluetooth-Seitenwender & Lautstärketasten |
| Bühnen-Sync | **Bühnen-Funk per Bluetooth-Broadcast** – ohne Kopplung, WLAN oder Internet; im selben WLAN zusätzlich UDP mit NTP-artigem Uhrenabgleich; online zusätzlich über den Server (für Browser) |
| Bandival Pulse | Protokoll v1 (BLE GATT) für das kommende Vibrations-Armband, siehe [`docs/bandival-pulse.md`](../docs/bandival-pulse.md) |
| Ideen | **Sprachmemos aufnehmen** (AAC), anhören, zum Song machen |
| Offline | alle geladenen Daten werden gecacht; der Live-Modus lädt die ganze Setlist vorab |
| Benachrichtigungen | Abruf alle 15 min (WorkManager); sofort und ohne Google-Dienste über ntfy |
| Desktop-Werkzeuge | Noteneditor, Bandkasse, Rider, Einstellungen laufen eingebettet – mit derselben Anmeldung (gemeinsamer Cookie-Speicher) |

LAN-Server (`http://192.168…`) und eigene Zertifikate (User-CAs) werden unterstützt.

### Berechtigungen

| Berechtigung | Wofür |
| --- | --- |
| Bluetooth (Suchen, Werben, Verbinden) | Bühnen-Funk und Bandival Pulse |
| Mikrofon | Ideen aufnehmen |
| Benachrichtigungen | Band-Neuigkeiten |
| Vibration | Metronom zum Fühlen |
| Standort (nur Android ≤ 11) | Vorgabe des Systems für Bluetooth-Suche, es wird kein Standort verwendet |

## Tests

```bash
gradle testDebugUnitTest      # ChordPro-Parser, Transponieren, Pulse-Protokoll, Bühnen-Funk (inkl. Jitter-Simulation)
```

## Bauen

Voraussetzungen: JDK 17, Android SDK (Platform 35). Am einfachsten: Ordner `android/` in Android Studio öffnen – Studio nutzt die Gradle-Version aus `gradle/wrapper/gradle-wrapper.properties` (8.11.1).

Auf der Kommandozeile mit installiertem Gradle 8.11.1 (oder einmalig `gradle wrapper` ausführen, um `./gradlew` zu erzeugen):

```bash
cd android
gradle assembleDebug          # app/build/outputs/apk/debug/
gradle assembleRelease        # signiert, wenn ein Keystore konfiguriert ist
```

## Release-Signierung

Einmalig einen Keystore erzeugen:

```bash
keytool -genkeypair -v -keystore bandival-release.jks -alias bandival \
  -keyalg RSA -keysize 4096 -validity 10000
```

**Lokal:** `android/keystore.properties` anlegen (wird nicht committet):

```properties
storeFile=/absoluter/pfad/bandival-release.jks
storePassword=…
keyAlias=bandival
keyPassword=…
```

**GitHub Actions:** Repository → Settings → Secrets and variables → Actions:

| Secret | Inhalt |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 bandival-release.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore-Passwort |
| `ANDROID_KEY_ALIAS` | z. B. `bandival` |
| `ANDROID_KEY_PASSWORD` | Key-Passwort |

Ohne Secrets baut die CI mit dem Debug-Schlüssel – gut zum Testen, aber Updates lassen sich dann nicht über eine bereits installierte Version installieren.

> Den Keystore unbedingt sicher aufbewahren: Ohne ihn können keine Updates für bereits installierte Apps veröffentlicht werden.

## Releases

- Jeder Push auf `main` (Änderungen in `android/`) baut eine APK als Workflow-Artefakt.
- Ein Git-Tag `v1.2.3` erzeugt ein GitHub-Release mit signierter APK (+ AAB für den Play Store).
- `versionCode` = Workflow-Lauf-Nummer, `versionName` = Tag ohne `v`.
