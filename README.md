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

## Schnellstart (Docker, Release-Image)

Voraussetzungen:

- Docker + Docker Compose
- Root `.env` gepflegt

Start:

```bash
sudo docker compose pull
sudo docker compose up -d
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

Lokaler Docker-Build aus dem Repo (ohne Registry-Image):

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

## Fast Deploy (State of the Art)

Ziel: Kein manueller Git-Checkout auf dem Server. Der Server zieht nur signierte Release-Images aus der Registry.

1. CI baut und published automatisch nach GHCR:
	- Workflow: `.github/workflows/release-image.yml`
	- Image: `ghcr.io/<owner>/bandival-web`
2. Server hat nur:
	- `docker-compose.yml`
	- `.env`
3. Deployment auf neue Version:

```bash
sudo docker compose pull web
sudo docker compose up -d --remove-orphans
```

Optional fuer feste Releases in `.env`:

```bash
BANDIVAL_IMAGE=ghcr.io/<owner>/bandival-web
BANDIVAL_TAG=v1.2.0
```

Dann wieder:

```bash
sudo docker compose pull web
sudo docker compose up -d --remove-orphans
```

Hinweis: Beim Container-Start werden Prisma-Migrationen mit `prisma migrate deploy` ausgefuehrt (produktionssicherer als `db push`).

Repo-loses Server-Paket:

- Siehe `deploy/README.md`
- Enthalten: `deploy/docker-compose.yml`, `deploy/.env.example`, `deploy/deploy.sh`

## Environment Variablen

Die Root-Datei `.env` enthaelt die Compose-Variablen.
Wichtige Keys:

- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `AUTH_SECRET`
- `APP_PORT`
- `BANDIVAL_IMAGE`
- `BANDIVAL_TAG`
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

- Sicherstellen, dass `docker compose pull && docker compose up -d` nach dem letzten Update ausgefuehrt wurde
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
