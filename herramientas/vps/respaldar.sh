#!/usr/bin/env bash
# Respaldo diario de NutriExpress en el VPS (HT-04, RNF-DIS-02). Lo corre cron a
# las 03:00 (/etc/cron.d/nutriexpress-respaldo, lo instala desplegar.sh):
#
#   bash /opt/nutriexpress/herramientas/vps/respaldar.sh
#
# Guarda las seis bases de PostgreSQL (pg_dumpall) y la de MongoDB (mongodump) en
# /opt/respaldos-nutriexpress/AAAA-MM-DD/, y borra los de más de 7 días.
# Restaurar: ver herramientas/vps/LEEME.md.
set -euo pipefail
cd "$(dirname "$0")/../.."

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)
DESTINO=/opt/respaldos-nutriexpress/$(date +%F)
mkdir -p "$DESTINO"
chmod 700 /opt/respaldos-nutriexpress "$DESTINO"

"${COMPOSE[@]}" exec -T postgres pg_dumpall -U postgres | gzip > "$DESTINO/postgres.sql.gz"
"${COMPOSE[@]}" exec -T mongo mongodump --quiet --archive --gzip --db reportes > "$DESTINO/mongo-reportes.archive.gz"
chmod 600 "$DESTINO"/*

find /opt/respaldos-nutriexpress -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +
echo "$(date '+%F %T') respaldo listo en $DESTINO ($(du -sh "$DESTINO" | cut -f1))"
