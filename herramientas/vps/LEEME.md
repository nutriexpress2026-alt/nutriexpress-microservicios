# Despliegue en el VPS (HT-04)

NutriExpress (microservicios) corre en el VPS desde el 11-nov-2026, en
**https://nutriexpress.109-123-254-213.sslip.io**, en lugar del monolito.

## Cómo está armado

Igual que el monolito, en dos servidores: un **servidor web** y un **servidor de correo**.

```
Internet ──HTTPS──► Caddy (VPS web, 80/443, certificado Let's Encrypt)
                      ├─ /api/*  ─► 127.0.0.1:8090  API Gateway (nginx) ─► 7 microservicios
                      └─ resto   ─► 127.0.0.1:3000  portal Next.js
ms-reportes ──SMTP 25──► Postfix del VPS web ──relayhost──► VPS de correo
ms-pagos ◄── aviso de pago (callback) ── Libélula, por /api/pagos/notificacion
```

- **VPS web**: `109.123.254.213` (Contabo, alias SSH `chatbot-vps`). Lo comparte con otros proyectos
  (chatbot UAGRM, Moodle, tienda de ropa); cada uno tiene su bloque en `/etc/caddy/Caddyfile`.
- **Proyecto**: `/opt/nutriexpress`, en Docker (`docker-compose.yml` + `docker-compose.prod.yml`).
  Solo el gateway (8090) y el portal (3000) publican puertos, y solo hacia `127.0.0.1`. PostgreSQL,
  MongoDB, Redis y RabbitMQ no se ven desde afuera.
- **`.env` del servidor** (`/opt/nutriexpress/.env`, permisos 600, nunca al repositorio):
  contraseñas al azar de las bases, RabbitMQ y Redis, el secreto de los avisos de pago y las
  credenciales de Libélula (copiadas del monolito).
- **Correo**: ms-reportes entrega al Postfix del VPS web (`host.docker.internal:25`, sin TLS porque no sale
  de la máquina); Postfix lo reenvía al **VPS de correo** (`relayhost`). Ese VPS se dejó de pagar
  (`vmi3558418.contaboserver.net` ya no existe): hoy los correos quedan **en cola** (`sudo mailq`). Al
  contratar otro, basta con `sudo postconf -e "relayhost = [nombre-o-ip]:25"` y
  `sudo systemctl reload postfix` (el servidor de correo debe aceptar a este por IP en `mynetworks`); la
  cola sale sola. Postfix escucha en todas las interfaces, pero el firewall (`ufw`) solo deja entrar al
  25 desde la red de Docker (`172.16.0.0/12`).
- **Libélula**: modo de cobro **Real** activado el 11-nov-2026 (se cambia en el perfil del administrador,
  HU-27). Probado: registra la deuda y devuelve su página de pago en `pagos.libelula.bo`. El dinero llega
  a la cuenta del titular de la appkey.

## Actualizar el servidor con lo último de `main`

Desde la PC (Git Bash), en la raíz del repositorio:

```bash
git ls-files -co --exclude-standard | grep -v "^docs/" > /tmp/lista.txt
tar czf /tmp/nutriexpress.tgz -T /tmp/lista.txt
scp /tmp/nutriexpress.tgz chatbot-vps:/tmp/
ssh chatbot-vps 'tar xzf /tmp/nutriexpress.tgz -C /opt/nutriexpress && cd /opt/nutriexpress && bash herramientas/vps/desplegar.sh'
```

Los `.sh` tienen fin de línea LF también en Windows (`.gitattributes`): corren tal cual en el VPS.

`desplegar.sh` reconstruye de a una imagen (todas juntas agotan la descarga de npm), cambia las
contraseñas de los usuarios de PostgreSQL por las del `.env` y levanta todo. No borra datos. Los
contenedores vuelven solos si el VPS se reinicia (`restart: unless-stopped`). El gateway se reinicia en
cada despliegue, para que lea su `nginx.conf` nuevo.

## Respaldos (RNF-DIS-02)

Todos los días a las 03:00 (`/etc/cron.d/nutriexpress-respaldo`) `herramientas/vps/respaldar.sh`
guarda las seis bases de PostgreSQL (`pg_dumpall`) y la de MongoDB (`mongodump`) en
`/opt/respaldos-nutriexpress/AAAA-MM-DD/`, y borra los de más de 7 días. Registro:
`/tmp/nutriexpress-respaldo.log`.

Restaurar (en `/opt/nutriexpress`, con los contenedores levantados):

```bash
C="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
zcat /opt/respaldos-nutriexpress/AAAA-MM-DD/postgres.sql.gz | $C exec -T postgres psql -U postgres
$C exec -T mongo mongorestore --archive --gzip --drop < /opt/respaldos-nutriexpress/AAAA-MM-DD/mongo-reportes.archive.gz
```

## El monolito que había antes

Se retiró el 11-nov-2026 para liberar memoria y disco (servicios `nutriexpress-api` y `nutriexpress-web`,
la carpeta `/opt/nutriexpress` anterior, su base en el PostgreSQL del sistema, que quedó apagado). Respaldo
completo en `/opt/respaldos-manuales/monolito-nutriexpress-20261111/` (solo root): la base
(`pg_dump`), su `.env`, los servicios de systemd, el Caddyfile y el `main.cf` de Postfix anteriores y el
código sin `node_modules`. El código también está en GitHub (`Proyecto1TecnoWeb`, rama `master`).

## Pendiente

- Las cuentas de prueba (`admin / Admin1234!`, etc.) son las del repositorio: cambiar sus contraseñas
  antes de mostrarlo a terceros.
- La base arrancó vacía: solo hay 3 «Jugo verde detox» cargados para probar Libélula.
