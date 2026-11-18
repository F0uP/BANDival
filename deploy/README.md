# Bandival – Server-Deployment ohne Git-Checkout

Minimales Paket für einen Server, der nur fertige Release-Images zieht.

## Inhalt

- `docker-compose.yml` – PostgreSQL + Bandival-Image aus GHCR
- `.env.example` – alle Variablen mit sicheren Produktions-Defaults (`COOKIE_SECURE=true`)
- `deploy.sh` – Update in einem Schritt

## Einrichtung

```bash
mkdir -p /opt/bandival && cd /opt/bandival
# docker-compose.yml, .env.example und deploy.sh hierher kopieren
cp .env.example .env
nano .env                       # Passwörter, AUTH_SECRET, APP_BASE_URL setzen
docker compose pull
docker compose up -d
```

Ist das Image privat: einmalig `docker login ghcr.io`.

Bandival sollte hinter einem Reverse-Proxy mit HTTPS laufen (z. B. Caddy, Traefik oder nginx). Beispiel Caddy:

```
bandival.meine-band.de {
  reverse_proxy localhost:3000
  request_body {
    max_size 260MB
  }
}
```

## Update

```bash
sh deploy.sh
```

Migrationen laufen beim Container-Start automatisch. Auch Datenbanken älterer Versionen (angelegt per `prisma db push`) werden erkannt und übernommen.

Feste Version statt `latest`: in `.env` `BANDIVAL_TAG=2.0.0` setzen und `sh deploy.sh` ausführen.

## Rollback

Alten Tag in `.env` setzen und `sh deploy.sh` ausführen. Migrationen sind nur vorwärts gerichtet – vor Updates deshalb ein Backup anlegen:

```bash
docker exec bandival-db pg_dump -U "$POSTGRES_USER" bandival > backup-$(date +%F).sql
```

## Health-Check

`GET /api/health` liefert `{"app":"bandival","ok":true}`, wenn App und Datenbank laufen. Der Container nutzt ihn als Docker-Healthcheck.

## Optionale Dienste

| Profil | Start | Zweck |
| --- | --- | --- |
| `ai` | `docker compose --profile ai up -d` | Spurtrennung (Demucs) – danach in `.env`: `STEM_SEPARATION_URL=http://stem-splitter:8000` |
| `ollama` | `docker compose --profile ollama up -d` | Lokales Sprachmodell – `docker exec bandival-ollama ollama pull llama3.1`, dann `AI_PROVIDER=ollama`, `AI_BASE_URL=http://ollama:11434` |

Nächtliche Backups landen im Volume `bandival_backups_data` (abrufbar unter Einstellungen → Backup).
