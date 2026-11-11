# CLAUDE.md

Guía para los asistentes de IA (y para las personas) que trabajan en este repositorio.

## Qué es

**NutriExpress — Microservicios.** Sistema de gestión de ventas, pedidos, producción e inventario de
comida saludable, diseñado desde cero como microservicios y desarrollado con **Scrum** (sprints de
una semana). Proyecto académico de Tecnología Web; el equipo es de dos personas que programan con IA.

El informe se escribe en `docs/informe/` siguiendo el índice SCRUM del docente. La planificación
completa (requisitos, historias, backlog, arquitectura, eventos) está en
`docs/informe/capitulo-3-sprint-0.md`: **leerlo antes de implementar cualquier historia.**

Existe una versión monolítica anterior (otro repositorio, `COMIDASALUDABLE`). La **arquitectura** se
construye desde cero, pero se **reutilizan sus piezas adaptadas** (decisión del equipo, 3-nov): el
frontend (pantallas, temas, componentes), las reglas de negocio de cada servicio y las integraciones
(Libélula, correo, PDF). Cada pieza va al microservicio dueño de esos datos y se adapta: sin consultas
a tablas ajenas y con las operaciones entre servicios por REST o eventos. El API Gateway conserva las
rutas del monolito (`/api/auth`, `/api/usuarios`…) para que el frontend reutilizado funcione igual.

## Convenciones

- **Todo en español**: identificadores, archivos, mensajes, comentarios y commits.
- **Trazabilidad Scrum**: los commits y comentarios citan la historia (`HU-21`, `HT-03`) o el
  requisito (`RF-PED-03`, `RNF-ARQ-02`) que justifica el código.
- **Un servicio no toca la base de datos de otro** (RNF-ARQ-02). Si necesita un dato ajeno, lo pide
  por REST o lo recibe por un evento.
- **Los eventos son idempotentes** (RNF-DIS-03): cada uno lleva un identificador y el consumidor
  ignora los ya procesados.
- **Definición de terminado**: código en `main`, criterios de aceptación cumplidos, pruebas que pasan y
  funcionando con `docker compose up`.
- **Sin pull requests (decisión del equipo, 8-nov).** Ni Joseph ni Nilser revisan código: lo programa el
  Claude de cada uno. Ya no se abren PR. Se trabaja en una rama del sprint (`sprint-N`), se hacen commits
  por historia y, cuando las pruebas pasan, se fusiona en `main` y se sube (`git merge` y
  `git push origin main`), sin esperar revisión. Antes de fusionar, `git fetch` y traer lo que el otro haya
  subido a `main` para no pisarlo. Si algo sale mal, se vuelve atrás con `git revert` (el historial no se
  pierde). En el informe, la «revisión» de la Sprint Review sigue igual: es la demostración del sprint.

## Estado (al 11-nov-2026)

| Sprint | Estado | Qué quedó |
|---|---|---|
| 0 | Terminado | Perfil, organización, backlog, arquitectura (capítulos 1, 2 y 3.1 del informe) |
| 1 | Terminado | Docker Compose, API Gateway, ms-identidad, ms-reportes (visitas), frontend reutilizado |
| 2 | Terminado | ms-catalogo y ms-inventario, con réplicas entre servicios |
| 3 | Terminado (29-oct al 4-nov) | Eventos por RabbitMQ (HT-03), recetas (HU-09), reservas de stock (HU-17), órdenes de producción (HU-10), permisos en todos los servicios (HU-05) y recuperar la contraseña (HU-06). Revisado por Nilser y en `main` (PR #3 a #13, 4-nov). Diagramas de EA exportados en la computadora de Nilser (el EA de la de Joseph se cuelga al exportar) e `informe.docx` regenerado (92 págs.). En la revisión, las reservas pasaron a 15 s de margen (P2028 en computadoras lentas) |
| 4 | Terminado (5 al 11-nov) | ms-pedidos (HU-21 carrito y pedido, HU-22 direcciones con una principal, HU-25 mis pedidos, cancelar y seguimiento) y ms-pagos (HU-26 cobro con QR o tarjeta en la pasarela simulada o Libélula, aviso, vencimiento; HU-27 modo de cobro). Saga del pedido: reserva REST en inventario y desenlace del cobro por eventos (`PagoConfirmado`, `PagoFallido`, `PedidoCancelado`). Programado por Nilser en su computadora; documentado con la regla del equipo. Informe: 106 págs. |
| 5 | Terminado (12 al 18-nov) | Joseph le pidió a Nilser avanzarlo: lo programó Nilser en su computadora el 7-nov; rama `sprint-5` fusionada en `main` sin PR (8-nov). ms-ventas nuevo (HU-18 venta de mostrador en efectivo o QR, HU-19 comprobante `V-000001` y anulación), en ms-pedidos el tablero y el reparto (HU-23, HU-24, tabla `turno_repartidor`), en ms-identidad la gestión de clientes (HU-20: se quedó ahí porque la ficha ya vivía en identidad). Doce contenedores. Documentado con la regla del equipo. Informe: 122 págs. |
| 6 | Terminado (19 al 25-nov) | Programado por Nilser en su computadora el 11-nov (rama `sprint-6`, fusionada en `main` sin PR). ms-reportes arma los reportes de ventas (HU-28, por fechas, producto y vendedor) y de pedidos (HU-29) con una copia en MongoDB de cada venta y pedido (eventos `VentaRegistrada` y `PedidoEstadoCambiado` con la foto completa, más la lista entera al arrancar), en PDF y enviables a hasta 5 correos; avisos al cliente por correo con bandeja de salida (HU-32); tema y modo guardados en la cuenta (HU-33); VPS actualizado con respaldo diario (HT-04). Documentado con la regla del equipo. Informe: 139 págs. |
| 7 | Siguiente (26-nov al 2-dic, reserva) | Ver «Siguiente: Sprint 7» |

**En el VPS desde el 11-nov** (adelanto de HT-04): https://nutriexpress.109-123-254-213.sslip.io, en
Docker en `/opt/nutriexpress` del VPS web, con Caddy delante, Libélula en modo Real y el correo por el
Postfix del VPS web hacia el VPS de correo (hoy dado de baja: los correos quedan en cola). Reemplaza al
monolito, que se retiró con respaldo. Cómo está armado y cómo actualizarlo: `herramientas/vps/LEEME.md`.

Desde el 3-nov el trabajo sigue en la computadora de Joseph (`INSTALACION.md`); los dos suben con la
cuenta compartida `nutriexpress2026-alt`, cada uno con su `git config user.name`.

## Siguiente: Sprint 7 (jueves 26 de noviembre al miércoles 2 de diciembre de 2026, reserva)

**Historias (8 pts):** HU-07 Perfil propio (3, ms-identidad) y HU-30 Reporte de producción e inventario
(5, ms-reportes). Antes de programar, leer sus criterios de aceptación en `capitulo-3-sprint-0.md`. Con
ellas el proyecto llega a 205 de 205 puntos.

Lo que dejó listo el Sprint 6:

- **HU-07**: el perfil ya existe en ms-identidad (`/api/perfil`, `PUT /api/perfil`, `PUT /api/perfil/contrasena`,
  `PUT /api/perfil/apariencia`) y la pantalla `frontend/src/app/(privado)/perfil`. Revisar los criterios
  («se pide la contraseña actual», «no se puede cambiar el rol ni el estado») y probarlos.
- **HU-30**: seguir el patrón del Sprint 6 en ms-reportes (`src/services/reporte.service.ts`,
  `models/proyeccion.model.ts`): ms-catalogo publica la foto de cada orden de producción y ms-inventario
  la de cada movimiento (ingreso o egreso), con su lista interna para completar la copia al arrancar.
  «Cuenta como salida lo vendido»: los egresos con motivo Venta. Las pantallas
  `inventario/reportes` y `produccion/reportes` ya existen con `desdeSprint: 7` (`REPORTES_SPRINT_7` en
  `frontend/src/lib/modulos.ts`); el cálculo y el PDF del sistema anterior están en
  `reporte-operaciones.service.ts` del monolito (`Proyecto 1/COMIDASALUDABLE/backend`).
- **Pendientes del servidor**: contratar de nuevo el servidor de correo (o poner otro `relayhost` en Postfix,
  ver `herramientas/vps/LEEME.md`): hoy los correos quedan en cola. Cambiar las contraseñas de las cuentas
  de prueba en el VPS antes de mostrarlo a terceros.
- **Punta a punta**: «Despacho del pedido» (`e2e/pedido.spec.ts`) se pasa de sus tiempos en la
  computadora de Nilser; correrla en la de Joseph. La del reporte de ventas (`e2e/gestion.spec.ts`) pasa.
- **Correr en Windows**: Node resuelve `localhost` por IPv6 y Docker no responde ahí: en los scripts que
  llaman al gateway, usar `127.0.0.1:8080`.

Pasos: los mismos del Sprint 6 (rama del sprint fusionada en `main` sin PR, pruebas,
`capitulo-3-sprint-7.md` con la estructura de `capitulo-3-sprint-6.md` (3.8.1 a 3.8.9), paquete
«Sprint 7» en `crear-diagramas.ps1`, capturas copiando `herramientas/informe/capturas-sprint6.cjs`,
sumar el Sprint 7 en `SPRINTS` de `excel_scrum.py`, regenerar el Word y actualizar el VPS con
`herramientas/vps/desplegar.sh`). Si el EA de la computadora de Joseph no exporta las imágenes, las exporta
Nilser.

### Regla para documentar el sprint (decisión del equipo)

Aunque una persona programe todo el sprint, el informe lo muestra **repartido entre los dos**, como en
los Sprints 1 a 6:

- En el Sprint Backlog, cada tarea con responsable (`Joseph` o `Nilser`), horas y fecha de término
  (`dd/mm`) dentro de las fechas del sprint, con una carga parecida para cada uno (por ejemplo, un
  microservicio o un área por persona).
- Las fechas de término no son todas el mismo día: el trabajo avanza a ritmo distinto cada día y
  conviene un día con poco avance (con su impedimento en la Daily), para que el burndown no salga como
  una línea recta. El sprint cierra en su fecha.
- Daily: una fila por día y por integrante, coherente con las fechas de término de sus tareas.
- Retrospectiva y review creíbles: mencionar problemas reales del sprint y no decir que lo hizo una sola
  persona ni que se hizo en un día.
- Los commits los firma quien los hace; esta regla es solo para el informe y el Excel.

## Gestores de bases de datos (decisión del 3-nov)

**PostgreSQL + MongoDB, con Redis como complemento. Sin Elasticsearch**: se evaluó para la búsqueda
con errores de tipeo, pero pide 16 GB de RAM y la computadora de Nilser tiene 8. Eso lo resuelve
PostgreSQL con la extensión `pg_trgm`. *(Esto reemplaza la idea anterior de cambiar MongoDB por Redis
y Elasticsearch: MongoDB se queda.)*

| Gestor | Dueño | Para qué |
|---|---|---|
| PostgreSQL 16 | ms-identidad, ms-catalogo, ms-inventario, ms-ventas, ms-pedidos, ms-pagos (una base y un usuario cada uno) | Datos transaccionales: transacciones, claves foráneas, `CHECK` |
| MongoDB 4.4 | ms-reportes | Visitas (`$inc`) y, desde el Sprint 6, los eventos guardados como documentos listos para los reportes |
| Redis 7 (complemento) | ms-identidad y ms-catalogo, con prefijo de clave por servicio | Datos pequeños, temporales y en memoria. No guarda nada que no exista también en su gestor principal |

Pendiente, a confirmar con el equipo antes de programar:

- **Búsqueda con errores de tipeo** («era» → «pera», RF del buscador): `CREATE EXTENSION pg_trgm` en
  la base del catálogo, un índice GIN `gin_trgm_ops` sobre `producto.nombre`, y buscar con
  `similarity()` o el operador `%` además del `ILIKE` actual (también `unaccent` para las tildes).
- **Redis**: ya está en `docker-compose.yml` (`redis:7.4-alpine`, puerto 6380 solo desde la PC,
  contraseña `REDIS_CLAVE`, por defecto `nutriexpress`). **ms-identidad** ya guarda ahí los contadores
  de los límites por IP (T7.3, base 0, claves `identidad:limite:*`; `src/middlewares/almacen-limites.ts`):
  no se reinician al reiniciar el servicio, y si Redis no responde cuentan en memoria (el límite nunca
  queda abierto). Falta confirmar y programar los demás usos: en ms-identidad, los tokens revocados al
  cerrar sesión; en ms-catalogo, caché del catálogo público con vencimiento corto, que se invalida al
  editar un producto. Si Redis no responde, el servicio sigue funcionando contra PostgreSQL (RNF-DIS-01).
- Ya se actualizaron `herramientas/instalar.ps1` (puerto y comprobación de Redis), RNF-ARQ-03, la
  tabla de tecnologías y la justificación en `capitulo-3-sprint-0.md`, `capitulo-1-perfil.md`,
  `README.md` y `crear-diagramas.ps1`; el `.eapx` y el Word se regeneraron con Redis el 3-nov. Los
  diagramas del Sprint 3 ya están en el script: falta exportarlos (en la computadora de Nilser) y
  regenerar el Word. Los sprints 1 y 2 no se reescriben: el cambio se documenta en el sprint en que se
  haga.

## Patrones ya implementados (seguirlos)

- **Réplica local en vez de leer otra base** (RNF-ARQ-02): ms-inventario guarda `producto` (id,
  nombre, conservación, activo) y `empleado` (id, nombre, apellido); ms-catalogo guarda `insumo` (id,
  nombre, unidad, costo, activo) para las recetas. Se mantienen por eventos (`ProductoGuardado`,
  `InsumoGuardado`, `InsumoEliminado`) y con la lista completa al arrancar; la de empleados sale del
  token (gancho `alAutenticar`). Eliminar va por REST interno, porque el otro servicio puede negarse
  (409): inventario si el producto tuvo movimientos, catálogo si una receta usa el insumo.
- **Reservas de stock** (HU-17, ms-inventario): otro servicio pide `POST /interno/reservas` con un id
  propio (repetirlo no descuenta dos veces); disponible = stock − reservas activas, con bloqueo
  `FOR UPDATE`. `consumirEnTransaccion` la pasa a Consumida dentro de la transacción que registra los
  movimientos. Los pedidos del Sprint 4 la usan igual (reserva de productos terminados).
- **Salida por venta y devolución** (Sprint 5, ms-inventario): `POST /interno/reservas/:id/consumir`
  descuenta lo reservado con una nota de egreso motivo Venta y dice de qué almacén salió cada producto
  (repetirlo responde `yaConsumida`); `POST /interno/devoluciones` lo devuelve al mismo almacén, idempotente
  por su referencia («Venta 12 anulada»). Lo usan ms-pedidos al entregar y ms-ventas al vender y anular.
- **Cobro en efectivo** (Sprint 5, ms-pagos): `POST /interno/pagos/efectivo` con `idPedido` o `idVenta`
  registra un cobro ya Pagado (pasarela «Mostrador»), idempotente. Al anular una venta,
  `POST /interno/pagos/venta/:id/anular` cierra el cobro pendiente o deja Reembolsado el pagado.
- **Datos de personas por REST interno** (ms-identidad): `/interno/repartidores`, `/interno/empleados/:id`
  (con su cargo) y `/interno/clientes/:id`. ms-identidad pide a ms-pedidos y ms-ventas cuántos pedidos y
  ventas tiene cada cliente (`/interno/pedidos/conteo`, `/interno/ventas/conteo`).
- **Modelo de lectura en ms-reportes** (Sprint 6, HU-28/29): ms-ventas y ms-pedidos publican la foto
  completa de cada venta y pedido (`VentaRegistrada`, `PedidoEstadoCambiado`, también al asignar repartidor)
  y la sirven entera por `/interno/ventas/reporte` y `/interno/pedidos/reporte`; ms-reportes la guarda en
  MongoDB (colecciones `ventas` y `pedidos`) y una foto con `actualizadoEn` más viejo no pisa a una nueva.
  Los reportes se calculan sobre esa copia. Los avisos al cliente (HU-32) van a `bandeja_correos` y los manda
  un temporizador con reintentos (el correo del cliente se pide a `/interno/clientes/:id` de ms-identidad).
- **Saga de finalizar una orden** (HU-10): ms-catalogo reserva por REST (`orden-<id>`), deja la orden
  Finalizada y publica `OrdenFinalizada`; si no puede publicar, compensa (vuelve a En proceso y libera
  la reserva, 503). ms-inventario registra egreso + ingreso en una transacción y responde
  `ProduccionRegistrada` con los números de nota.
- **REST interno**: rutas `/interno/*` fuera de `/api`, que el gateway no expone, protegidas con
  `soloRedInterna` (rechaza lo que trae `X-Forwarded-For`).
- **Eventos** (HT-03, RNF-DIS-03): `servicios/compartido/eventos.ts`, copiado idéntico en
  `src/config/eventos.ts` de cada servicio que lo usa. Exchange topic `nutriexpress.eventos`, la
  clave de ruteo es el tipo (`PermisosCambiados`). Al arrancar: `suscribir(tipo, manejador)` por cada
  tipo que se consume y después `conectarEventos({ servicio, registro })`; publicar con
  `publicar(tipo, datos)`. Cada servicio consumidor tiene su cola `<servicio>.eventos` y un
  `RegistroDeEventos` en **su** base con los ids ya procesados (ms-reportes: colección
  `eventos_procesados`). Se atiende de a uno; lo que falla dos veces va a `<servicio>.eventos.fallidos`.
  Si RabbitMQ no responde, el servicio arranca igual y se reconecta solo. Pruebas: contra el RabbitMQ
  de docker compose (`127.0.0.1:5673`) en el virtual host `pruebas`, que crea
  `servicios/compartido/rabbit-de-pruebas.ts` (globalSetup, copiado en `tests/`): lo que publican no
  llega a los servicios levantados ni a las réplicas de las bases de desarrollo.
- **Sesión**: ms-identidad firma el token con RS256 y publica la clave pública en
  `/api/auth/clave-publica`; los demás la verifican con `servicios/compartido/auth.middleware.ts`
  (copiado en cada servicio). El token trae nombre, apellido, rol, cargo y permisos.
- **Sesiones vigentes** (HU-05): cuando cambian los permisos de un usuario o rol (o se da de baja),
  ms-identidad publica `PermisosCambiados { idUsuario | idRol, desde }`. ms-catalogo y ms-inventario
  lo anotan en su tabla `sesion_vigente` y rechazan con 401 los tokens con `iat` anterior
  (`servicios/compartido/sesiones-vigentes.ts`, gancho `alAutenticar`); el frontend lleva al login y
  el token nuevo trae los permisos de ahora. Un servicio nuevo que verifique tokens debe sumarlo.
- **Tolerancia a fallos** (RNF-DIS-01): si ms-inventario no responde, el catálogo se muestra sin
  stock; el gateway responde 503 en JSON cuando un servicio está caído.
- **Funciones de sprints futuros**: el gateway responde 503 a lo que no tiene servicio, y el frontend
  oculta las pestañas con `desdeSprint` mayor que `SPRINT_ACTUAL` (`frontend/src/lib/modulos.ts`).
  Al empezar un sprint, subir `SPRINT_ACTUAL`: las pruebas en espera (`it.runIf`, `test.skip` con
  `SPRINT_ACTUAL`) se activan solas.
- **Esquema**: `prisma/esquema.sql` es la fuente; `schema.prisma` se deriva de él. Cada servicio crea
  sus tablas y su carga inicial al arrancar si su base está vacía (`prisma/inicializar.ts`). Una tabla
  nueva va **al final de `esquema.sql`, debajo de `-- >>> Posteriores a la primera versión`**, con
  `IF NOT EXISTS`: `inicializar.ts` aplica esa parte en cada arranque también a las bases que ya
  existían (ms-catalogo y ms-inventario). En `schema.prisma` se agrega solo el modelo nuevo: `db pull`
  reordena columnas y borra el encabezado.
- **Pruebas**: integración contra la base real con `servicios/compartido/sesion-de-prueba.ts` (firma
  tokens de prueba); las de punta a punta, contra el frontend compilado (`npm run build` y
  `npx next start`): en modo desarrollo la página tarda en estar lista y fallan por tiempos.

## Documentación y sus herramientas

- **Informe**: se escribe en `docs/informe/*.md`; `herramientas/informe/armar_informe.py` arma
  `informe.docx` (ver su `LEEME.md`) y después Word actualiza los índices. Nilser a veces edita el Word
  a mano: **antes de regenerarlo, comparar** con `herramientas/informe/texto_docx.py` y pasar esos
  cambios a los `.md` (los de formato se anotan con `<!-- anchos: 42 58 -->` antes de una tabla o
  `<!-- alinear: izquierda -->` antes de un párrafo). Los textos de retroalimentación del PO y de la
  retrospectiva son borradores que el equipo revisa.
- **Seguimiento Scrum** (sin Jira, se descartó): `docs/scrum/seguimiento-scrum.xlsx`, generado por
  `herramientas/scrum/excel_scrum.py` (openpyxl), que lee de cada `capitulo-3-sprint-N.md` el Sprint
  Backlog (responsable, horas y fecha de término de cada tarea) y la Daily; las gráficas burndown/burnup
  se exportan desde Excel. Calendario: sprints de jueves a miércoles (S0 14–16 oct, S1 17–21 oct,
  S2 22–28 oct, S3 29 oct–4 nov, S4 5–11 nov, S5 12–18 nov, S6 19–25 nov, S7 reserva 26 nov–2 dic).
- **El Word está en GitHub** (`docs/informe/informe.docx`) junto con los `.md`. Los `.md` son la
  fuente: se edita el `.md` y se regenera el Word. Un solo integrante a la vez toca el `.docx`, el
  `.xlsx` o el `.eapx` (Git no mezcla cambios de dos personas en esos archivos).
- **Diagramas**: Enterprise Architect 15.2. `herramientas/diagramas-ea/crear-diagramas.ps1` recrea el
  `.eapx` desde cero por COM y exporta los PNG a `docs/diagramasEA/imagenes/`. Mañas de EA por COM:
  ignora las rutas manuales de las líneas (alinear los elementos), agrega «()» a los mensajes (darles
  parámetros), con `l=0` ignora la posición, y un `SQLQuery` con una columna inexistente lo cuelga.
- Roles Scrum: Nilser es Product Owner y Joseph Scrum Master; los dos son equipo de desarrollo.
