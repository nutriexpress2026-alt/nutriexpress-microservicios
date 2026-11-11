#!/usr/bin/env bash
# Despliegue de NutriExpress en el VPS (HT-04). Se corre EN el servidor, dentro
# de la carpeta del proyecto (/opt/nutriexpress):
#
#   bash herramientas/vps/desplegar.sh
#
# Se puede repetir: la primera vez crea el .env con contraseñas al azar; las
# siguientes reconstruye lo que cambió y reinicia. No borra datos.
set -euo pipefail
cd "$(dirname "$0")/../.."

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)
URL_PUBLICA_POR_DEFECTO="https://nutriexpress.109-123-254-213.sslip.io"

# 1. El .env del servidor: contraseñas propias, nunca las de desarrollo.
if [ ! -f .env ]; then
  azar() { openssl rand -hex 24; }
  umask 077
  cat > .env <<EOF
# Generado por herramientas/vps/desplegar.sh el $(date +%F). No va al repositorio.
URL_PUBLICA=${URL_PUBLICA_POR_DEFECTO}

POSTGRES_PASSWORD=$(azar)
IDENTIDAD_CLAVE_BD=$(azar)
CATALOGO_CLAVE_BD=$(azar)
INVENTARIO_CLAVE_BD=$(azar)
VENTAS_CLAVE_BD=$(azar)
PEDIDOS_CLAVE_BD=$(azar)
PAGOS_CLAVE_BD=$(azar)
RABBITMQ_USUARIO=nutriexpress
RABBITMQ_CLAVE=$(azar)
REDIS_CLAVE=$(azar)

# Pasarela de pago (HU-26, HU-27). El modo Real lo activa el administrador desde su perfil.
PAGO_URL_PUBLICA=${URL_PUBLICA_POR_DEFECTO}
PAGO_SECRETO_AVISOS=$(azar)
LIBELULA_URL_BASE=https://api.libelula.bo
LIBELULA_API_KEY=
LIBELULA_EMAIL_COMERCIO=

# Correo: el Postfix de este servidor, que lo reenvía al servidor de correo.
CORREO_REMITENTE="NutriExpress <nutriexpress@tecnologia.web>"
EOF
  echo "Creado .env con contraseñas nuevas. Complete LIBELULA_API_KEY y LIBELULA_EMAIL_COMERCIO."
fi
# `desplegar.sh --solo-env`: crea el .env y se detiene, para completarlo antes de levantar.
[ "${1:-}" = "--solo-env" ] && exit 0
set -a; . ./.env; set +a

# 2. Construir de a una imagen: todas a la vez agotan la descarga de npm en
#    servidores modestos (EIDLETIMEOUT, visto en el Sprint 5).
for servicio in ms-identidad ms-catalogo ms-inventario ms-pedidos ms-pagos ms-ventas ms-reportes frontend; do
  echo "== construyendo $servicio"
  "${COMPOSE[@]}" build "$servicio"
done

# 3. PostgreSQL primero. Su script inicial crea los usuarios con las contraseñas
#    de desarrollo; aquí se cambian por las del .env (repetirlo no hace daño).
"${COMPOSE[@]}" up -d postgres
until "${COMPOSE[@]}" exec -T postgres pg_isready -U postgres >/dev/null 2>&1; do sleep 2; done
sleep 3
for par in identidad:IDENTIDAD_CLAVE_BD catalogo:CATALOGO_CLAVE_BD inventario:INVENTARIO_CLAVE_BD \
           ventas:VENTAS_CLAVE_BD pedidos:PEDIDOS_CLAVE_BD pagos:PAGOS_CLAVE_BD; do
  rol=${par%%:*}; variable=${par#*:}
  "${COMPOSE[@]}" exec -T postgres psql -q -U postgres -c "ALTER ROLE $rol PASSWORD '${!variable}'"
done

# 4. Todo lo demás. El gateway se reinicia siempre: su configuración es un archivo
#    montado, y al reemplazarlo (tar) el contenedor seguía leyendo el anterior.
"${COMPOSE[@]}" up -d
"${COMPOSE[@]}" restart gateway

# 5. Respaldo diario a las 03:00 (RNF-DIS-02). Repetirlo deja el mismo archivo.
if [ -d /etc/cron.d ]; then
  sudo mkdir -p /opt/respaldos-nutriexpress && sudo chown "$(id -un)" /opt/respaldos-nutriexpress
  echo "0 3 * * * $(id -un) bash $(pwd)/herramientas/vps/respaldar.sh >> /tmp/nutriexpress-respaldo.log 2>&1" \
    | sudo tee /etc/cron.d/nutriexpress-respaldo >/dev/null
fi
"${COMPOSE[@]}" ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
