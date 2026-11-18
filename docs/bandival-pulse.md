# Bandival Pulse – das fühlbare Metronom

> **Status: in Entwicklung.** Die Software-Seite ist fertig: Protokoll, Android-App, Web-App, Simulator.
> Die Hardware gibt es noch nicht. Dieses Dokument ist die Spezifikation für Firmware und Prototypen.

Bandival Pulse ist ein kleines Gerät am Handgelenk, am Gürtel oder am Drum-Hocker, das im Takt vibriert
statt zu klicken – für Drummer:innen ohne In-Ear, Bläser:innen, Sänger:innen oder alle, die keinen Klick
im Ohr wollen. Es wird aus dem Bandival-Live-Modus gesteuert und wechselt das Tempo automatisch pro Song.

## Zwei Wege zum Gerät

| Weg | Kopplung | Wofür |
|---|---|---|
| **Bühnen-Funk (Broadcast)** | keine – Gerät hört einfach zu | Normalfall auf der Bühne: alle Pulse-Geräte im Raum folgen dem Handy, das den Click gestartet hat |
| **Direktverbindung (GATT)** | einmal „Verbinden“ im Live-Modus | Akku/Firmware anzeigen, Intensität einstellen, eigenes Tempo ohne Band |

Beides ist Bluetooth Low Energy, braucht **kein WLAN und kein Internet**.

---

## 1. Bühnen-Funk – Broadcast-Format (v1)

Das Leader-Handy (wer im Live-Modus „Start“ drückt) sendet **nicht verbindbare BLE-Advertisements**
(`ADV_NONCONN_IND`, Intervall ≈ 100 ms). Jedes Bandival-Handy im Live-Modus und jedes Pulse-Gerät empfängt sie.

Manufacturer Specific Data, Company ID `0xFFFF`, 18 Bytes, little-endian:

| Offset | Typ | Feld | Bedeutung |
|---|---|---|---|
| 0 | 2 × u8 | Magic | `'B' 'V'` (0x42 0x56) |
| 2 | u8 | Version | `1` |
| 3 | u16 | Session | Zufallszahl pro Leader-Handy |
| 5 | u16 | Generation | ändert sich bei jedem Click-Start/Tempowechsel – **die neuere Generation führt** |
| 7 | u8 | Flags | Bit 0 = läuft |
| 8 | u16 | BPM × 10 | 200 … 4000 (20,0 … 400,0 BPM) |
| 10 | u8 | Schläge pro Takt | z. B. 4 (bei 6/8: 2 punktierte Viertel) |
| 11 | u8 | Notenwert | 4 = Viertel, 8 = Achtel |
| 12 | u16 | Schlagindex | Schläge seit Grid-Start (inkl. Einzähler), wird **exakt auf dem Schlag** aktualisiert |
| 14 | u16 | Setlist-Hash | gleiche Setlist → Songs blättern mit |
| 16 | u8 | Song-Index | Position in der Setlist |
| 17 | u8 | Einzähler-Schläge | Schläge vor Takt 1 |

### Phase schätzen (Empfänger)

Der Schlagindex wird beim Schlag gesetzt, gesendet wird beim nächsten Advertising-Ereignis. Daraus folgt
für jedes empfangene Paket mit Index *n* zur Zeit *r* (Empfangszeitstempel, Periode *T* = 60000 / BPM):

* Obergrenze: Schlag *n* war **vor** *r* → Phase φ ≤ *r* − *n*·*T*
* Untergrenze: Schlag *n+1* war **noch nicht** → φ > *r* − (*n*+1)·*T*

Über ein Fenster von ~12 s: φ = (min Obergrenze + max Untergrenze) / 2 − Funklatenz (~6 ms).
Das konvergiert nach wenigen Sekunden auf einige Millisekunden – siehe `BeaconGridEstimator`
in `android/…/live/StageBeacon.kt` und den Unit-Test mit Jitter-Simulation.

Bei Generations- oder Session-Wechsel wird das Fenster verworfen. Kommt > 3 s nichts mehr oder ist Bit 0 = 0,
stoppt das Gerät.

---

## 2. Direktverbindung – GATT-Protokoll (v1)

| UUID | Eigenschaft | Richtung |
|---|---|---|
| `6e0b0001-b5a3-4c7a-9a1d-62616e646976` | Service | – |
| `6e0b0002-b5a3-4c7a-9a1d-62616e646976` | Control: write / write without response | App → Gerät |
| `6e0b0003-b5a3-4c7a-9a1d-62616e646976` | Status: read / notify | Gerät → App |

Gerätename beginnt mit `Bandival Pulse`. Alle Zahlen little-endian.

### Befehle (Control)

| Op | Name | Payload |
|---|---|---|
| `0x00` | HELLO | u8 Protokollversion |
| `0x01` | START | u16 BPM×10, u8 Schläge/Takt, u8 Notenwert, u8 Unterteilung (1–4), u16 Akzent-Maske, u32 Start in ms, u8 Einzähler-Takte |
| `0x02` | STOP | – |
| `0x03` | TEMPO | u16 BPM×10 (ab dem nächsten Takt) |
| `0x04` | INTENSITY | u8 normal (0–255), u8 Akzent (0–255), u8 Pulslänge ms |
| `0x05` | PING | u32 Zeitwert → Gerät antwortet mit PONG |
| `0x06` | SONG | u8 Länge, UTF-8-Titel (max. 40 Bytes) – für Geräte mit Display |
| `0x07` | BEAT | u8 Schlag im Takt, u8 Flags (Bit 0 Akzent, Bit 1 Unterteilung) – *Stream-Modus* für einfache Firmware ohne eigene Uhr |

**Normalfall:** Das Gerät bekommt `START` mit einer Startverzögerung und läuft dann mit eigener Uhr (Quarz).
Es braucht keinen Funkverkehr pro Schlag.

### Status (Notify)

| Op | Name | Payload |
|---|---|---|
| `0x81` | STATE | u8 Akku %, u8 läuft (0/1), u16 BPM×10, u8 FW major, u8 FW minor |
| `0x85` | PONG | u32 Zeitwert aus PING |
| `0x8F` | ERROR | u8 Fehlercode |

Die Referenz-Implementierungen sind `web/src/lib/pulse/protocol.ts` und `android/…/live/PulseProtocol.kt`.
Ein Unit-Test stellt sicher, dass beide byte-identisch kodieren.

---

## 3. Hardware-Vorschlag (Prototyp)

* **MCU:** nRF52840 (z. B. Seeed XIAO nRF52840) oder ESP32-C3/S3 – BLE 5, Deep Sleep, USB-C-Laden
* **Aktor:** LRA-Vibrationsmotor (schnelle, präzise Pulse) mit Treiber **DRV2605L** (I²C, fertige Wellenformen);
  einfacher: ERM-Münzmotor über MOSFET
* **Akku:** LiPo 150–400 mAh, Ladechip auf dem Board
* **Bedienung:** ein Taster (an/aus, Intensität), eine LED (Status/Akku)
* **Gehäuse:** Armband (Smartwatch-Band 20 mm), Clip oder Klett für den Hocker

### Firmware-Ablauf

1. Dauerhaft passiv nach dem Bühnen-Funk scannen (Filter auf Company ID `0xFFFF` + Magic `BV`).
2. Phase nach Abschnitt 1 schätzen, lokalen Timer auf das Grid setzen und weich nachführen.
3. Auf Schlag 1 stärker/länger vibrieren (Akzent), sonst kürzer.
4. Parallel als GATT-Peripheral verbindbar bleiben (Abschnitt 2) – eine direkte Verbindung hat Vorrang.

## 4. Ausprobieren ohne Hardware

* **Handy-Vibration:** Im Live-Modus der Android-App „Vibration im Takt“ einschalten – jedes Handy in der Band
  wird so zum Pulse. Im Browser gibt es dafür „Einstellungen → Geräte → Handy-Vibration“ (Android Chrome).
* **Simulator:** „Einstellungen → Geräte → Simulator“ zeigt jeden Befehl dekodiert an und blinkt im Takt.
