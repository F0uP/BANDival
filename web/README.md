# Bandival Web

Next.js-App (Frontend + API) von Bandival. Überblick, Deployment und Konfiguration: siehe [README im Repository-Root](../README.md).

## Struktur

| Pfad | Inhalt |
| --- | --- |
| `src/app/api/` | API-Routen (Route Handlers) |
| `src/app/app/` | App-Seiten (Übersicht, Songs, Setlists, Kalender, Band, Aktivität, Einstellungen) |
| `src/components/ui/` | Design-System (Button, Dialog, Formular, Navigation, …) |
| `src/components/<feature>/` | Feature-Komponenten |
| `src/lib/` | Server-Logik (Auth, Rechte, Verfügbarkeit, Kalender-Sync, Storage, PDF) |
| `src/lib/client/` | Client-Helfer (API-Client, SWR-Hooks, Formatierung, Theme) |
| `prisma/` | Schema und Migrationen |
| `scripts/migrate.mjs` | Robuste Migration beim Container-Start (inkl. Baseline für Alt-Datenbanken) |
| `tests/e2e/` | Playwright-API-Tests |

## Befehle

```bash
npm ci
npm run db:migrate   # DATABASE_URL muss gesetzt sein
npm run dev
npm run lint && npm run typecheck
npm run build
E2E_BASE_URL=http://localhost:3000 npm run test:e2e
```
