/**
 * German default texts for the legal pages. They are only templates: placeholders in [square brackets]
 * have to be replaced by the operator, and the texts should be checked – they are no legal advice.
 *
 * The privacy policy is generated from the current server configuration, so it only mentions the
 * services this instance actually uses (mail, AI, Spotify import, stem separation …).
 */

export type LegalSlug = "impressum" | "datenschutz" | "agb";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function today(): string {
  return new Date().toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

function instanceUrl(): string {
  return env("APP_BASE_URL") || "[Adresse dieser Bandival-Instanz]";
}

export function imprintTemplate(): string {
  return `# Impressum

## Angaben gemäß § 5 DDG
[Vor- und Nachname bzw. Name der Band / GbR / des Vereins]
[Straße und Hausnummer]
[PLZ Ort]
[Land]

## Vertreten durch
[Name der vertretungsberechtigten Person – nur bei GbR, Verein o. Ä., sonst Abschnitt löschen]

## Kontakt
Telefon: [Telefonnummer]
E-Mail: [E-Mail-Adresse]

## Umsatzsteuer-ID
Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz: [USt-IdNr. – falls keine vorhanden, Abschnitt löschen]

## Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV
[Vor- und Nachname]
[Anschrift wie oben]

## Verbraucherstreitbeilegung
Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.

## Haftung für Inhalte
Als Diensteanbieter sind wir für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Für Inhalte, die Nutzerinnen und Nutzer selbst einstellen (z. B. Songs, Aufnahmen, Dateien oder öffentliche Bandseiten), sind wir als Hosting-Anbieter erst ab Kenntnis einer konkreten Rechtsverletzung verantwortlich. Sobald uns eine solche bekannt wird, entfernen wir die betreffenden Inhalte umgehend.

## Haftung für Links
Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber verantwortlich. Bei Bekanntwerden von Rechtsverletzungen entfernen wir derartige Links umgehend.

## Öffentliche Bandseiten
Die öffentlichen Bandseiten unter ${instanceUrl()}/b/… werden von den jeweiligen Bands selbst gestaltet. Für deren Inhalte sind die jeweiligen Bands verantwortlich; sie geben dort – soweit erforderlich – ihre eigenen Kontaktdaten an.
`;
}

export function privacyTemplate(): string {
  const smtp = Boolean(env("SMTP_HOST"));
  const breachCheck = env("PASSWORD_BREACH_CHECK").toLowerCase() !== "false";
  const ai = env("AI_PROVIDER").toLowerCase();
  const spotifyImport = Boolean(env("SPOTIFY_CLIENT_ID"));
  const stems = Boolean(env("STEM_SEPARATION_URL"));
  const backups = env("BACKUP_ENABLED").toLowerCase() !== "false";
  const retention = env("BACKUP_RETENTION_DAYS") || "14";

  const sections: string[] = [];
  let number = 0;
  const section = (title: string, body: string) => {
    number += 1;
    sections.push(`## ${number}. ${title}\n${body.trim()}`);
  };

  section("Verantwortlicher", `
Verantwortlich für die Datenverarbeitung auf dieser Bandival-Instanz (${instanceUrl()}) ist:

[Vor- und Nachname bzw. Name der Organisation]
[Straße und Hausnummer]
[PLZ Ort]
E-Mail: [E-Mail-Adresse]

[Falls vorhanden: Kontaktdaten der/des Datenschutzbeauftragten]
`);

  section("Überblick", `
Bandival ist eine selbst gehostete Software zur Organisation von Bands (Songs, Setlists, Proben, Gigs, Bandkasse). Diese Instanz wird von dem oben genannten Verantwortlichen betrieben. Wir setzen **keine Analyse- oder Tracking-Tools** und **keine Werbung** ein und verkaufen keine Daten.

Wir verarbeiten personenbezogene Daten nur, soweit dies für den Betrieb und die von dir genutzten Funktionen erforderlich ist.
`);

  section("Hosting und Server-Logfiles", `
Die Instanz läuft auf [eigener Server / Name und Anschrift des Hosting-Anbieters]. Beim Aufruf der Seiten verarbeitet der Webserver technisch notwendige Daten: IP-Adresse, Datum und Uhrzeit, aufgerufene Adresse, übertragene Datenmenge, Browser und Betriebssystem (User-Agent).

Zweck ist die Auslieferung der Seiten sowie die Sicherheit des Systems (z. B. Abwehr von Angriffen, Begrenzung fehlgeschlagener Anmeldeversuche). Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Logfiles werden nach [7] Tagen gelöscht.

[Falls ein Hosting-Anbieter eingesetzt wird: Mit ihm besteht ein Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO.]
`);

  section("Benutzerkonto", `
Für die Registrierung verarbeiten wir deine E-Mail-Adresse, deinen Namen und dein Passwort. Das Passwort wird ausschließlich als sicherer Hash (bcrypt) gespeichert. Optional kommen hinzu: Profilbild, Instrument, ein ntfy-Topic für Benachrichtigungen, Passkeys (wir speichern nur den öffentlichen Schlüssel) und ein Schlüssel für die Zwei-Faktor-Anmeldung (verschlüsselt gespeichert).

Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Bereitstellung des Dienstes). Du kannst dein Konto jederzeit in den Einstellungen selbst löschen; die Daten werden dann entfernt, soweit keine gesetzlichen Aufbewahrungspflichten bestehen.
`);

  section("Inhalte in Bands", `
In Bands werden die Inhalte verarbeitet, die Mitglieder selbst anlegen: Songs, Lead Sheets, Noten, Aufnahmen und Dateien, Setlists, Termine, Zu- und Absagen, Verfügbarkeiten, Diskussionen, Aufgaben, Buchungen der Bandkasse und Rechnungen. Diese Inhalte sind nur für die Mitglieder der jeweiligen Band sichtbar; Gäste sehen ausschließlich die mit ihnen geteilten Setlists. Änderungen werden in einem Aktivitätsprotokoll der Band festgehalten.

Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO. Inhalte bleiben gespeichert, bis sie gelöscht werden oder die Band gelöscht wird. Gestellte Rechnungen unterliegen gesetzlichen Aufbewahrungsfristen (§ 147 AO, § 14b UStG) und können deshalb nicht vorzeitig gelöscht werden.
`);

  section("Cookies und lokaler Speicher", `
Wir verwenden ausschließlich technisch notwendige Cookies (§ 25 Abs. 2 Nr. 2 TDDDG, Art. 6 Abs. 1 lit. b und f DSGVO):

- **bandival_session** – hält dich angemeldet (bis zu 30 Tage ohne Nutzung, höchstens ein Jahr)
- **bandival_csrf** – schützt Formulare vor Cross-Site-Request-Forgery
- **bandival_locale** – merkt sich die gewählte Sprache (ein Jahr)
- **bandival_consent** – speichert deine Auswahl im Cookie-Hinweis (ein Jahr)

Zusätzlich speichert die App Einstellungen wie das Farbschema sowie offline vorgenommene Änderungen im lokalen Speicher deines Browsers, damit sie nach dem nächsten Verbindungsaufbau synchronisiert werden können. Diese Daten verlassen dein Gerät nur bei der Synchronisation mit dieser Instanz.
`);

  section("Externe Medien (Spotify, YouTube)", `
Songs und öffentliche Bandseiten können Player von Spotify (Spotify AB, Regeringsgatan 19, 111 53 Stockholm, Schweden) oder YouTube (Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland) enthalten. Diese Player werden **erst nach deiner Einwilligung** geladen. Dabei werden insbesondere deine IP-Adresse und Browserdaten an den jeweiligen Anbieter übertragen; der Anbieter kann Cookies setzen und Daten auch in den USA verarbeiten. Die Anbieter sind nach dem EU-US Data Privacy Framework zertifiziert.

Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO, § 25 Abs. 1 TDDDG). Du kannst sie jederzeit über „Cookie-Einstellungen“ am Ende dieser Seite widerrufen.
`);

  if (smtp) {
    section("E-Mail-Versand", `
Wir versenden E-Mails zur Bestätigung deiner E-Mail-Adresse, zum Zurücksetzen des Passworts, für Einladungen in Bands und – sofern du es aktivierst – Erinnerungen und Wochenübersichten. Der Versand erfolgt über [Name des E-Mail-Anbieters / eigener Mailserver]. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO. Benachrichtigungs-Mails kannst du in den Einstellungen jederzeit abbestellen.
`);
  }

  section("Push-Benachrichtigungen", `
Wenn du Push-Benachrichtigungen aktivierst, speichern wir die von deinem Browser erzeugte Push-Adresse. Die Nachrichten werden über den Push-Dienst deines Browserherstellers zugestellt (z. B. Google Firebase Cloud Messaging, Mozilla Push Service oder Apple Push Notification Service); der Inhalt ist dabei Ende-zu-Ende verschlüsselt. Optional kannst du ein ntfy-Topic hinterlegen – Benachrichtigungen werden dann an den von dir gewählten ntfy-Server gesendet.

Rechtsgrundlage ist Art. 6 Abs. 1 lit. a DSGVO. Du kannst Push jederzeit in den Einstellungen oder im Browser deaktivieren.
`);

  if (breachCheck) {
    section("Prüfung auf geleakte Passwörter", `
Bei der Registrierung und bei Passwortänderungen prüfen wir, ob das gewählte Passwort in bekannten Datenlecks vorkommt. Dazu wird nach dem k-Anonymitäts-Verfahren nur **der Anfang eines Hashwerts** (5 Zeichen des SHA-1-Hashes) an den Dienst „Have I Been Pwned“ (api.pwnedpasswords.com) übermittelt – weder das Passwort selbst noch deine E-Mail-Adresse. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (Schutz deines Kontos).
`);
  }

  if (ai === "openai" || ai === "gemini" || ai === "ollama") {
    const provider = ai === "openai"
      ? "OpenAI (OpenAI Ireland Ltd., 1st Floor, The Liffey Trust Centre, 117–126 Sheriff Street Upper, Dublin 1, Irland; Verarbeitung auch in den USA möglich)"
      : ai === "gemini"
        ? "Google Gemini (Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland; Verarbeitung auch in den USA möglich)"
        : "ein von uns selbst betriebenes Sprachmodell (Ollama) – die Daten verlassen dabei unseren Server nicht";
    section("KI-Funktionen", `
Einige Funktionen sind optional KI-gestützt (z. B. Lead Sheets in ChordPro umwandeln, Setlists ordnen, Sprachmemos transkribieren, Texte für die Bandseite formulieren). Nur wenn du eine solche Funktion ausdrücklich auslöst, werden die dafür nötigen Inhalte (z. B. Liedtext, Songliste oder Audioaufnahme) an ${provider} übermittelt. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.
`);
  }

  if (spotifyImport) {
    section("Spotify-Import", `
Beim Import einer Playlist oder eines Albums ruft unser Server die öffentlichen Titelinformationen über die Spotify Web API ab. Dabei wird nur der von dir eingefügte Link verwendet; es werden keine Daten deines Spotify-Kontos abgefragt.
`);
  }

  section("Kalender-Synchronisation", `
Wenn du einen privaten Kalender verbindest, ruft unser Server die von dir angegebene iCal-Adresse regelmäßig ab. Gespeichert werden nur die belegten Zeiträume – keine Titel, Orte oder Teilnehmenden. Deine Band sieht lediglich „belegt“. Über die persönliche Abo-Adresse kannst du Band-Termine in deiner Kalender-App abonnieren; diese Adresse ist geheim und kann jederzeit zurückgesetzt werden. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.
`);

  if (stems) {
    section("Spurtrennung", `
Für die Trennung von Aufnahmen in Einzelspuren wird die betreffende Audiodatei an einen von uns betriebenen Dienst [Anbieter/Standort ergänzen] übermittelt und dort nach der Verarbeitung gelöscht.
`);
  }

  section("Öffentliche Bandseiten", `
Bands können eine öffentliche Seite mit Bio, Fotos, Konzertterminen und freigegebenen Songs veröffentlichen. Dort erscheinen nur Inhalte, die die Band ausdrücklich freigibt. Beim Besuch einer Bandseite verarbeiten wir lediglich die unter „Hosting und Server-Logfiles“ genannten Daten.
`);

  if (backups) {
    section("Datensicherung", `
Zur Absicherung gegen Datenverlust erstellen wir nächtliche Sicherungen der Banddaten, die nach ${retention} Tagen automatisch gelöscht werden. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (Datensicherheit).
`);
  }

  section("Datensicherheit", `
Die Übertragung erfolgt verschlüsselt (TLS). Passwörter werden nur gehasht gespeichert, Geheimnisse für die Zwei-Faktor-Anmeldung verschlüsselt. Zugriff auf Bandinhalte haben nur Mitglieder der jeweiligen Band.
`);

  section("Deine Rechte", `
Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) sowie Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21). Erteilte Einwilligungen kannst du jederzeit mit Wirkung für die Zukunft widerrufen (Art. 7 Abs. 3 DSGVO).

Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO), z. B. bei der Behörde deines Wohnorts oder der für uns zuständigen Behörde: [zuständige Aufsichtsbehörde].
`);

  return `# Datenschutzerklärung\n\nStand: ${today()}\n\n${sections.join("\n\n")}\n`;
}

export function termsTemplate(): string {
  return `# Allgemeine Geschäftsbedingungen

Nutzungsbedingungen für die Bandival-Instanz unter ${instanceUrl()}

Stand: ${today()}

## 1. Geltungsbereich
Diese Bedingungen gelten für die Nutzung der Bandival-Instanz, die von [Name des Betreibers] („Betreiber“) bereitgestellt wird. Mit der Registrierung erklärst du dich mit diesen Bedingungen einverstanden.

## 2. Leistungen
Bandival ist eine Plattform zur Organisation von Bands: Songs, Lead Sheets, Noten, Aufnahmen, Setlists, Proben, Gigs, Bandkasse und Rechnungen. Die Nutzung ist [kostenlos / zu den gesondert vereinbarten Konditionen möglich]. Ein Anspruch auf eine bestimmte Verfügbarkeit oder auf bestimmte Funktionen besteht nicht; Wartungsarbeiten und Weiterentwicklungen können den Dienst vorübergehend einschränken.

## 3. Registrierung und Konto
Du musst bei der Registrierung wahrheitsgemäße Angaben machen und mindestens 16 Jahre alt sein. Halte deine Zugangsdaten geheim und informiere den Betreiber, wenn du einen Missbrauch deines Kontos vermutest. Ein Konto ist persönlich und nicht übertragbar.

## 4. Deine Inhalte
Alle Rechte an Inhalten, die du hochlädst (z. B. Songs, Texte, Noten, Aufnahmen, Fotos), bleiben bei dir bzw. den Berechtigten. Du räumst dem Betreiber nur die Rechte ein, die für den Betrieb nötig sind – also Inhalte zu speichern, für die Mitglieder deiner Band anzuzeigen, zu sichern und auf der öffentlichen Bandseite darzustellen, sofern deine Band sie dort freigibt.

Du versicherst, dass du die erforderlichen Rechte an hochgeladenen Inhalten besitzt und dass diese keine Rechte Dritter (insbesondere Urheber-, Leistungsschutz- und Persönlichkeitsrechte) und keine Gesetze verletzen.

## 5. Bands, Rollen und Gäste
Wer eine Band anlegt, wird Owner und ist dafür verantwortlich, wen die Band einlädt und welche Rollen vergeben werden. Inhalte, die innerhalb einer Band erstellt werden, stehen allen Mitgliedern der Band zur Verfügung und bleiben auch nach dem Austritt einzelner Mitglieder in der Band erhalten.

## 6. Öffentliche Bandseiten
Für Inhalte auf einer öffentlichen Bandseite ist die jeweilige Band verantwortlich. Soweit gesetzlich erforderlich, gibt sie dort eigene Kontaktdaten bzw. ein eigenes Impressum an.

## 7. Rechnungen und Bandkasse
Die Rechnungs- und Kassenfunktionen sind Hilfsmittel. Für die inhaltliche, steuerliche und rechtliche Richtigkeit von Rechnungen und Buchungen sowie für die Einhaltung von Aufbewahrungspflichten ist die jeweilige Band verantwortlich. Bandival ersetzt keine Steuerberatung.

## 8. Unzulässige Nutzung
Untersagt sind insbesondere: rechtswidrige Inhalte, das Versenden unerwünschter Einladungen (Spam), Angriffe auf die Instanz, das Umgehen von Sicherheits- oder Zugriffsbeschränkungen sowie automatisierte Massenabfragen, die den Betrieb beeinträchtigen.

## 9. Sperrung und Kündigung
Du kannst dein Konto jederzeit in den Einstellungen löschen. Der Betreiber kann die Nutzung mit einer Frist von vier Wochen beenden oder den Dienst einstellen; du erhältst dann rechtzeitig die Möglichkeit, deine Daten über die Backup-Funktion zu exportieren. Bei schwerwiegenden Verstößen gegen diese Bedingungen kann der Betreiber ein Konto sofort sperren.

## 10. Datensicherung
Der Betreiber erstellt regelmäßig Sicherungen, kann aber nicht garantieren, dass Daten nie verloren gehen. Erstelle für wichtige Inhalte deshalb zusätzlich eigene Exporte über die Backup-Funktion.

## 11. Haftung
Der Betreiber haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei Verletzung von Leben, Körper oder Gesundheit sowie nach dem Produkthaftungsgesetz. Bei leichter Fahrlässigkeit haftet der Betreiber nur bei Verletzung einer wesentlichen Vertragspflicht, deren Erfüllung die ordnungsgemäße Durchführung des Vertrags überhaupt erst ermöglicht und auf deren Einhaltung du regelmäßig vertrauen darfst; die Haftung ist dann auf den vorhersehbaren, vertragstypischen Schaden begrenzt. [Bei unentgeltlicher Nutzung ergänzen: Im Übrigen haftet der Betreiber nur für Vorsatz und grobe Fahrlässigkeit.]

## 12. Änderungen dieser Bedingungen
Der Betreiber kann diese Bedingungen mit Wirkung für die Zukunft ändern. Über Änderungen informiert er mindestens vier Wochen vor ihrem Inkrafttreten per E-Mail oder in der App. Widersprichst du nicht innerhalb dieser Frist, gelten die Änderungen als angenommen; auf diese Folge wird in der Mitteilung gesondert hingewiesen. Im Fall eines Widerspruchs können beide Seiten die Nutzung beenden.

## 13. Schlussbestimmungen
Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts. Bist du Verbraucher, gilt diese Rechtswahl nur, soweit dir dadurch nicht der Schutz zwingender Bestimmungen des Staates entzogen wird, in dem du deinen gewöhnlichen Aufenthalt hast. Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.
`;
}

export function legalTemplate(slug: LegalSlug): string {
  if (slug === "impressum") return imprintTemplate();
  if (slug === "datenschutz") return privacyTemplate();
  return termsTemplate();
}
