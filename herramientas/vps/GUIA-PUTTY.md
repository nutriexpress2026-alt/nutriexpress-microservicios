# Guía rápida: manejar NutriExpress en el VPS desde PuTTY

Para la defensa o cuando la PC está cargada (Docker, WhatsApp, Meet): todo se hace en el servidor y la
PC solo abre una consola.

## 1. Conectarse con PuTTY (una sola vez se prepara)

1. **Convertir la llave** (PuTTY no usa el formato de OpenSSH): abrir **PuTTYgen** → *Load* → elegir
   `C:\Users\nilser\.ssh\vps_chatbot` (en el selector, elegir «All files») → *Save private key* →
   guardarla como `C:\Users\nilser\.ssh\vps_chatbot.ppk`.
2. **Abrir PuTTY** y llenar:
   - *Session › Host Name*: `109.123.254.213`, *Port*: `22`.
   - *Connection › Data › Auto-login username*: `nilser`.
   - *Connection › SSH › Auth › Credentials › Private key file*: el `.ppk` del paso 1.
   - Volver a *Session*, escribir `NutriExpress VPS` en *Saved Sessions* y **Save**.
3. Desde entonces: doble clic en `NutriExpress VPS`.

## 2. Preparar el atajo `nx` (una sola vez)

En el VPS siempre hay que usar los **dos** archivos de Docker (`docker-compose.yml` y
`docker-compose.prod.yml`). Con el comando corto de la PC, las bases quedarían abiertas a internet. Este
atajo lo hace siempre bien. Pegar en PuTTY (clic derecho pega):

```bash
echo "alias nx='docker compose --project-directory /opt/nutriexpress -f /opt/nutriexpress/docker-compose.yml -f /opt/nutriexpress/docker-compose.prod.yml'" >> ~/.bashrc && source ~/.bashrc
```

Desde ahí, `nx` reemplaza a todo ese comando largo.

## 3. Comandos

| Para qué | Comando |
|---|---|
| Ver todos los contenedores y su estado | `nx ps` |
| Ver memoria y CPU de cada uno (salir con `Ctrl+C`) | `docker stats` |
| Apagar un microservicio | `nx stop ms-ventas` |
| Encenderlo | `nx start ms-ventas` |
| Reiniciarlo | `nx restart ms-ventas` |
| Ver lo que va diciendo (salir con `Ctrl+C`) | `nx logs -f --tail 30 ms-ventas` |
| Encender todo lo que esté apagado | `nx up -d` |
| ¿Responde el gateway? | `curl -s http://127.0.0.1:8090/api/health` |
| ¿Responde la página pública? | `curl -s -o /dev/null -w "%{http_code}\n" https://nutriexpress.109-123-254-213.sslip.io/login` (200 = bien) |

Los nombres para los comandos: `ms-identidad`, `ms-catalogo`, `ms-inventario`, `ms-ventas`,
`ms-pedidos`, `ms-pagos`, `ms-reportes`, `gateway`, `frontend`, `postgres`, `mongo`, `redis`,
`rabbitmq`.

**No usar nunca** `nx down -v` (**borra las bases de datos**). `stop`, `start` y `restart` no borran nada.
No tocar otros contenedores (`chatbot-uagrm-*`, `moodle-*`, `tienda-ropa-*`): son de otros proyectos.

## 4. Orden para encender y apagar

`nx up -d` respeta el orden solo. A mano:

- **Encender:** 1) `postgres mongo redis rabbitmq` → 2) `ms-identidad` → 3) los otros seis
  microservicios → 4) `gateway` → 5) `frontend`.
- **Apagar:** al revés (frontend, gateway, microservicios, datos).

Por ejemplo, para encender por grupos:

```bash
nx start postgres mongo redis rabbitmq
nx start ms-identidad
nx start ms-catalogo ms-inventario ms-ventas ms-pedidos ms-pagos ms-reportes
nx start gateway frontend
```

## 5. Si apago un contenedor, ¿qué deja de funcionar?

Lo que depende de un servicio apagado muestra el aviso «Este servicio no responde en este momento.
Intente de nuevo en unos minutos.»; lo demás sigue funcionando. Al encenderlo, vuelve solo.

| Apagado | Deja de funcionar | Sigue funcionando |
|---|---|---|
| **ms-identidad** | Iniciar sesión, registrarse, usuarios, roles, perfil, clientes; asignar repartidor; vender a un cliente con nombre. Los correos al cliente esperan. | **Quien ya inició sesión** sigue usando catálogo, inventario, ventas, pedidos y reportes: cada servicio verifica la sesión por su cuenta. |
| **ms-catalogo** | Catálogo del portal, productos, recetas, órdenes de producción. Confirmar pedidos y ventas (no hay precios). Reporte de producción. | Inventario, historial de ventas, tablero de pedidos, reportes de ventas y pedidos. |
| **ms-inventario** | Stock, notas, insumos, almacenes, lotes. Confirmar pedidos y ventas (no se puede reservar). Reporte de inventario. | El catálogo **se ve, pero sin stock** (a propósito). Pedidos ya hechos, tablero, reportes de ventas y pedidos. |
| **ms-ventas** | Punto de venta e historial de ventas. | Todo lo demás, incluidos los pedidos a domicilio. |
| **ms-pedidos** | Confirmar pedidos, Mis pedidos, tablero, Mis entregas. | Venta de mostrador, inventario, catálogo, reportes. |
| **ms-pagos** | Pagar con QR o tarjeta (el pedido se deshace y el sistema sugiere efectivo); registrar una entrega en efectivo; el modo de cobro. | Pedidos y ventas en efectivo, todo lo demás. |
| **ms-reportes** | Los reportes y el contador de visitas. Los avisos de ventas y pedidos **esperan en RabbitMQ** y se procesan al encenderlo (no se pierden). | Todo lo demás. |
| **rabbitmq** | Los avisos entre servicios (pago confirmado, pedido cancelado, venta registrada…) no viajan; al volver, los servicios se reconectan solos. | Lo que se responde en el momento: iniciar sesión, catálogo, stock. |
| **redis** | Nada visible: los intentos de inicio de sesión se cuentan en memoria. | Todo. |
| **mongo** | Reportes y contador de visitas. | Todo lo demás. |
| **postgres** | Casi todo (es la base de 6 de los 7 servicios). | Nada útil: no apagarlo en una demostración. |
| **gateway** | Toda la API: la página carga pero no trae datos. | Nada útil: no apagarlo en una demostración. |
| **frontend** | La página web. | Los servicios siguen, pero no hay pantalla. |

## 6. Demostración sugerida para el docente («demuéstreme que son microservicios»)

1. `nx ps`: los 13 contenedores separados, cada uno con su base.
2. `nx stop ms-ventas` → en la página, el Punto de venta avisa que no responde, pero **los pedidos a
   domicilio, el inventario y los reportes siguen**. `nx start ms-ventas` → vuelve solo.
3. `nx stop ms-identidad` → nadie nuevo puede entrar, pero quien ya estaba dentro sigue trabajando.
   `nx start ms-identidad`.
4. `nx stop ms-reportes` → hacer una venta en efectivo → `nx start ms-reportes` → la venta aparece en el
   reporte: el aviso esperó en la cola de RabbitMQ y no se perdió.
5. `nx stop ms-inventario` → el catálogo del portal sigue, sin stock. `nx start ms-inventario`.

Al terminar, `nx ps` para confirmar que todo quedó encendido (o `nx up -d`).

## 7. Carpetas en el VPS

| Qué | Dónde |
|---|---|
| El proyecto (copia para que corra; no es el repositorio de Git) | `/opt/nutriexpress` |
| Contraseñas y llaves del servidor (no se comparten) | `/opt/nutriexpress/.env` |
| Respaldos diarios (03:00, 7 días) | `/opt/respaldos-nutriexpress/` |
| Respaldo del monolito retirado | `/opt/respaldos-manuales/monolito-nutriexpress-20261111/` (solo root) |
| Caddy (HTTPS) | `/etc/caddy/Caddyfile` |
| Más detalle del despliegue | `herramientas/vps/LEEME.md` |
| Servidor de correo (otro VPS, `45.140.200.61`) | `herramientas/vps/CORREO.md` |
