#!/usr/bin/env sh
set -eu

COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.yml}

# Pull newest image and replace running container in-place.
docker compose -f "$COMPOSE_FILE" pull web

docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

# Keep disk usage bounded on long-running hosts.
docker image prune -f >/dev/null 2>&1 || true

echo "Bandival deploy finished."
