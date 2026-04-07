# BANDival

Modernes Band-Management mit Fokus auf Songs, Setlists, Kalender, Diskussionen und Rehearsal-Workflows.

## Highlights

- Song-Workspace mit Metadaten, Audio-Versionen, Attachments, ChordPro und Diskussionen
- Setlist-Workspace mit Drag-and-Drop, Vorschlaegen, Rehearsal-Helfern und PDF-Export
- Kalender mit Verfuegbarkeiten, Konfliktanzeige und Serien-Terminen
- Rollen/Berechtigungen, Einladungen, Audit-Log und Notifications
- Docker-first Setup mit PostgreSQL + Next.js + Prisma

## Tech Stack

- Next.js 16 (App Router), React 19, TypeScript
- Prisma ORM + PostgreSQL
- Tailwind/PostCSS + Custom CSS
- Zod fuer Validation
- Playwright fuer E2E Tests

## Repository Struktur

- `docker-compose.yml` - App + Datenbank Orchestrierung
- `web/` - Next.js Anwendung
- `web/prisma/` - Prisma Schema und Migrationen
- `web/src/app/api/` - API Routes
- `web/src/components/` - UI/Workspaces/Panels
- `web/src/hooks/` - Daten- und UI-Logik

## Schnellstart (Docker)

Voraussetzungen:

- Docker + Docker Compose
- Root `.env` gepflegt

Start:

```bash
sudo docker compose up -d --build
```

Logs:

```bash
sudo docker logs -f bandival-web
sudo docker logs -f bandival-db
```

Stop:

```bash
sudo docker compose down
```

## Lokaler Dev Start (ohne Docker)

Voraussetzungen:

- Node.js 22+
- PostgreSQL 16+

Im Web-Projekt:

```bash
cd web
npm ci
npx prisma generate
npx prisma db push
npm run dev
```

Build/Checks:

```bash
npm run lint
npm run build
```

## Environment Variablen

Die Root-Datei `.env` enthaelt die Compose-Variablen.
Wichtige Keys:

- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `AUTH_SECRET`
- `APP_PORT`
- `COOKIE_SECURE`
- `APP_BASE_URL`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

Hinweis:

- In Produktionsumgebungen immer HTTPS verwenden und `COOKIE_SECURE=true` setzen.

## Datenpersistenz

Compose nutzt benannte Volumes:

- `bandival_db_data`
- `bandival_uploads_data`
- `bandival_exports_data`

Damit bleiben Daten bei Neustarts erhalten. Songs/Dateien verschwinden typischerweise nur dann, wenn auf ein anderes/neu initialisiertes DB-Volume gestartet wurde.

## Uploads und Dateizugriff

Dateien werden in `public/uploads` und `public/exports` gespeichert.
Zusatzrouten fuer robustes Serving:

- `/uploads/[...filePath]`
- `/exports/[...filePath]`

Das sorgt dafuer, dass Audio, Cover, Avatar und Exportdateien auch in restriktiven Container-Setups konsistent ausgeliefert werden.

## Troubleshooting

### 1) Container startet, aber Bilder/Audio laden nicht

- Sicherstellen, dass `docker compose up -d --build` nach den letzten Aenderungen ausgefuehrt wurde
- Web-Logs pruefen: `sudo docker logs -f bandival-web`
- API Route testen, z. B. `GET /uploads/...` direkt im Browser

### 2) PDF-Export scheint nicht zu funktionieren

- Nach Export wird Datei unter `/exports/...` bereitgestellt
- Pfad in DevTools/Network pruefen
- Web-Logs auf Schreibfehler von `public/exports` pruefen

### 3) Nach Loeschen von Setlist/Album treten Zugriffsfehler auf

- UI aktualisiert Selektionen inzwischen defensiv
- Falls noch Altzustand sichtbar ist: Hard Refresh oder erneut laden

### 4) Passwort-Warnung im Browser

- Bei `http://` ist die Warnung korrekt
- Fuer echte Nutzung auf HTTPS wechseln

## Sicherheitshinweise

- `AUTH_SECRET` lang und zufaellig waehlen
- Keine Produktivdaten mit `COOKIE_SECURE=false`
- SMTP-Credentials nicht committen

## Lizenz

Siehe `LICENSE`.
