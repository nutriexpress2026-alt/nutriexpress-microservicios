# Servidor de correo de NutriExpress

Desde el 25-nov-2026 NutriExpress tiene otra vez su **servidor de correo**, como el sistema anterior:
un servidor web (donde corre la aplicación) y otro servidor solo para el correo.

```
ms-reportes ──SMTP──► Postfix del VPS web ──SMTP con TLS──► Postfix del VPS de correo ──► buzón (Dovecot)
 (Docker)              109.123.254.213                     45.140.200.61                 o internet
```

| | |
|---|---|
| Servidor | VPS `45.140.200.61` (Contabo, Ubuntu 24.04), alias SSH `saas-vps` (usuario `root`) |
| Dominio del correo | `correotecnoweb.45-140-200-61.sslip.io` (sslip.io da el registro MX y la dirección; no hay que comprar dominio) |
| Programas | Postfix 3.8 (envía y recibe, SMTP) y Dovecot 2.3 (buzones, IMAP y POP3), instalados con `apt`, **fuera de Docker** |
| Certificado TLS | Let's Encrypt, lo obtiene y renueva Caddy (`/etc/caddy/sitios/correo-nutriexpress.caddy`); `/etc/cron.weekly/correo-nutriexpress-certificado` recarga Postfix y Dovecot |
| Buzones | `soporte`, `ventas`, `gerencia` (usuarios del sistema sin acceso a la consola, como en el laboratorio) |
| Webmail | **Roundcube 1.6** en https://correotecnoweb.45-140-200-61.sslip.io (Docker en `/opt/correo-webmail`, solo `127.0.0.1:3200`, Caddy delante; base SQLite en `datos/`, ajustes en `config/nutriexpress.php`) |
| Alias | `no-responder`, `nutriexpress`, `postmaster` y `root` llegan a `soporte` |
| Remitente de NutriExpress | `NutriExpress <no-responder@correotecnoweb.45-140-200-61.sslip.io>` (`CORREO_REMITENTE` en `/opt/nutriexpress/.env` del VPS web) |

**Convivencia con lo que ya había en ese VPS.** El proyecto `americanescarbar` (Docker, puertos 3100 y
3101 solo por dentro) y Caddy (80 y 443) siguen igual: el correo usa otros puertos (25, 587, 993 y 995) y
solo se agregó un archivo propio en `/etc/caddy/sitios/`, sin tocar el del otro proyecto. Respaldos de la
configuración original: `/etc/postfix/main.cf.original` y `master.cf.original`.

## Seguridad

- **No es un relay abierto**: solo reenvía hacia otros dominios lo que llega del VPS web
  (`mynetworks = 127.0.0.0/8 109.123.254.213/32`) o de alguien que inicia sesión por el puerto 587.
  Comprobado: a un desconocido le responde «Relay access denied».
- El tramo VPS web → VPS de correo va cifrado (`smtp_tls_security_level = encrypt` en el VPS web).
- IMAP y POP3 solo con TLS (993 y 995); el puerto 587 exige TLS y usuario.
- Firewall (`ufw`): abiertos 25, 587, 993 y 995 además de lo que ya estaba.

## Leer el correo

El primer nombre fue `nutriexpress.45-140-200-61.sslip.io`; se cambió el mismo 25-nov y se sigue
recibiendo correo dirigido a él (está en `mydestination`).

1. Ponerle contraseña al buzón (una vez), entrando al VPS de correo:

   ```bash
   ssh saas-vps
   ```

   ```bash
   passwd soporte
   ```

2. **En el navegador (Roundcube):** abrir https://correotecnoweb.45-140-200-61.sslip.io y entrar con
   el usuario (`soporte`, o `soporte@correotecnoweb.45-140-200-61.sslip.io`) y esa contraseña.

3. O en Thunderbird, «Agregar cuenta de correo existente», configuración manual:

   | | Servidor | Puerto | Seguridad | Usuario |
   |---|---|---|---|---|
   | Entrante (IMAP) | `correotecnoweb.45-140-200-61.sslip.io` | 993 | SSL/TLS | `soporte` |
   | Saliente (SMTP) | `correotecnoweb.45-140-200-61.sslip.io` | 587 | STARTTLS | `soporte` |

   La dirección es `soporte@correotecnoweb.45-140-200-61.sslip.io`.

## Comandos (en `saas-vps`)

| Para qué | Comando |
|---|---|
| ¿Están encendidos? | `systemctl status postfix dovecot` |
| Roundcube: estado / reiniciar | `cd /opt/correo-webmail && docker compose ps` / `docker compose restart` |
| Reiniciarlos | `systemctl restart postfix dovecot` |
| Ver lo que pasa con el correo (salir con `Ctrl+C`) | `tail -f /var/log/mail.log` |
| Correos esperando en la cola | `mailq` |
| Reintentar ya la cola | `postqueue -f` |
| Correos que llegaron a un buzón | `ls /home/soporte/Maildir/new` |
| Mandar una prueba | `echo "Hola" \| mail -s "Prueba" soporte@correotecnoweb.45-140-200-61.sslip.io` |
| Crear otro buzón (por ejemplo `cocina`) | `adduser --disabled-password --gecos "" --shell /usr/sbin/nologin cocina` y después `passwd cocina` |
| Una lista que reparte a varios buzones | agregar `todos: soporte, ventas, gerencia` en `/etc/aliases` y correr `newaliases` |

En el VPS web, `sudo mailq` muestra lo que espera salir hacia el servidor de correo.

## Lo que falta para escribir a Gmail, Outlook y demás

Hacia los buzones de este dominio el correo llega siempre. **Hacia Gmail u Outlook puede ir a spam o ser
rechazado**: esos servicios piden que el dominio del remitente tenga registros SPF y DKIM (registros TXT
en el DNS), y sslip.io no permite agregar registros TXT. La solución es un **dominio propio** (unos
10 USD al año): con él se crean los registros MX, SPF, DKIM (con OpenDKIM) y DMARC, y se pide a Contabo
que el nombre inverso de la IP sea el del dominio.
