# Bandival Server Deploy (Repo-los)

Dieses Verzeichnis ist das minimale Deploy-Paket fuer einen Server ohne lokales Git-Checkout.

## Inhalt

- `docker-compose.yml` - Produktions-Compose mit Release-Image
- `.env.example` - Vorlage fuer alle benoetigten Variablen
- `deploy.sh` - Schnelles Update-Skript

## Erstes Setup auf dem Server

1. Verzeichnis anlegen, z. B. `/opt/bandival`.
2. Diese 3 Dateien in das Verzeichnis kopieren.
3. `.env.example` nach `.env` kopieren und Werte setzen.
4. Falls GHCR-Image privat ist, einmalig anmelden:

```bash
docker login ghcr.io
```

5. Starten:

```bash
docker compose pull
docker compose up -d
```

## Update auf neue Version

1. In `.env` den Tag aendern, z. B.:

```bash
BANDIVAL_TAG=v1.2.0
```

2. Update ausfuehren:

```bash
sh deploy.sh
```

## Rollback

1. Alten Tag in `.env` setzen.
2. Erneut `sh deploy.sh` ausfuehren.

## Hinweise

- Volumes behalten Daten bei: DB, Uploads, Exports.
- App startet mit `prisma migrate deploy` und fuehrt vorhandene Migrationen automatisch aus.
- Fuer Produktion HTTPS nutzen und `COOKIE_SECURE=true` lassen.
