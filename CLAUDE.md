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
- **Definición de terminado**: código en `main` revisado por el otro integrante, criterios de
  aceptación cumplidos, pruebas que pasan y funcionando con `docker compose up`.
- Ramas: `main` es estable; cada historia en su rama `hu-XX-descripcion` y entra por *pull request*.

## Estado (al 7-nov-2026)

| Sprint | Estado | Qué quedó |
|---|---|---|
| 0 | Terminado | Perfil, organización, backlog, arquitectura (capítulos 1, 2 y 3.1 del informe) |
| 1 | Terminado | Docker Compose, API Gateway, ms-identidad, ms-reportes (visitas), frontend reutilizado |
| 2 | Terminado | ms-catalogo y ms-inventario, con réplicas entre servicios |
| 3 | Terminado (29-oct al 4-nov) | Eventos por RabbitMQ (HT-03), recetas (HU-09), reservas de stock (HU-17), órdenes de producción (HU-10), permisos en todos los servicios (HU-05) y recuperar la contraseña (HU-06). Revisado por Nilser y en `main` (PR #3 a #13, 4-nov). Diagramas de EA exportados en la computadora de Nilser (el EA de la de Joseph se cuelga al exportar) e `informe.docx` regenerado (92 págs.). En la revisión, las reservas pasaron a 15 s de margen (P2028 en computadoras lentas) |
| 4 | Terminado (5 al 11-nov) | ms-pedidos (HU-21 carrito y pedido, HU-22 direcciones con una principal, HU-25 mis pedidos, cancelar y seguimiento) y ms-pagos (HU-26 cobro con QR o tarjeta en la pasarela simulada o Libélula, aviso, vencimiento; HU-27 modo de cobro). Saga del pedido: reserva REST en inventario y desenlace del cobro por eventos (`PagoConfirmado`, `PagoFallido`, `PedidoCancelado`). Programado por Nilser en su computadora; documentado con la regla del equipo. Informe: 106 págs. |
| 5 | Terminado (12 al 18-nov) | Joseph le pidió a Nilser avanzarlo: lo programó Nilser en su computadora el 7-nov (rama `sprint-5`). ms-ventas nuevo (HU-18 venta de mostrador en efectivo o QR, HU-19 comprobante `V-000001` y anulación), en ms-pedidos el tablero y el reparto (HU-23, HU-24, tabla `turno_repartidor`), en ms-identidad la gestión de clientes (HU-20: se quedó ahí porque la ficha ya vivía en identidad). Doce contenedores. Documentado con la regla del equipo. Informe: 122 págs. |
| 6 | Siguiente (19 al 25-nov) | Ver «Siguiente: Sprint 6» |

Desde el 3-nov el trabajo sigue en la computadora de Joseph (`INSTALACION.md`); los dos suben con la
cuenta compartida `nutriexpress2026-alt`, cada uno con su `git config user.name`.

## Siguiente: Sprint 6 (jueves 19 al miércoles 25 de noviembre de 2026)

**Objetivo:** reportes, correo al cliente, temas y despliegue. Historias (28 pts, del Product Backlog en
`capitulo-3-sprint-0.md`): HU-28 Reporte de ventas (8), HU-29 Reporte de pedidos (5), HU-32
Notificaciones por correo (5), HU-33 Temas y modo día/noche (5) y HT-04 Despliegue en el VPS (5). Antes
de programar, leer sus criterios de aceptación. El Sprint 7 (26-nov al 2-dic) queda de reserva: HU-07
Perfil propio y HU-30 Reporte de producción e inventario.

Lo que dejó listo el Sprint 5 para este sprint:

- **Eventos para ms-reportes** (MongoDB): `VentaRegistrada { idVenta, estado (Pagado, Pendiente o
  Anulado), tipoVenta, metodoPago, total, idCliente, fecha }` sale al vender, al acreditarse el QR y al
  anular (HU-28: «las anuladas no suman»); `PedidoEstadoCambiado { idPedido, idUsuario, cliente, estado,
  motivo, metodoPago, total, fecha }` sale en cada cambio de estado. Para HU-29 («por repartidor»,
  «distingue asignados de entregados») hay que sumarle `idRepartidor` y `repartidorNombre` en
  `avisarEstado` de `ms-pedidos/src/services/pedido.service.ts`.
- **Correo (HU-32)**: ms-reportes consume `PedidoEstadoCambiado` y manda el correo (adaptar el envío del
  sistema anterior); el correo del cliente se pide a ms-identidad por REST interno (hay que sumar la ruta)
  o viaja en el evento. Subir `SPRINT_ACTUAL` a 6 activa en el comprobante el aviso «Le enviamos una
  copia a su correo» (`DialogoComprobante.tsx`) y sus pruebas en espera.
- **Frontend**: las pestañas «Reportes» tienen `desdeSprint: 6` en `frontend/src/lib/modulos.ts`; el
  `e2e/gestion.spec.ts` tiene una prueba en espera hasta el Sprint 6.
- **Pendiente del Sprint 5**: la prueba de punta a punta «Despacho del pedido» (`e2e/pedido.spec.ts`) se
  pasa de sus tiempos en la computadora de Nilser (el navegador tarda en salir del login con doce
  contenedores); correrla en la de Joseph. El recorrido se verificó por la API y con las capturas.
- **Docker en computadoras lentas**: construir las imágenes de a una (`docker compose build <servicio>`);
  las siete a la vez agotan la descarga de npm (`EIDLETIMEOUT`).

Pasos: los mismos del Sprint 5 (rama y PR, pruebas de integración, componentes y punta a punta,
`capitulo-3-sprint-6.md` con la estructura de `capitulo-3-sprint-5.md` (3.7.1 a 3.7.9), paquete
«Sprint 6» en `crear-diagramas.ps1`, capturas copiando `herramientas/informe/capturas-sprint5.cjs`,
sumar el Sprint 6 en `SPRINTS` de `excel_scrum.py` y regenerar el Word). Si el EA de la computadora de
Joseph no exporta las imágenes, las exporta Nilser.

### Regla para documentar el sprint (decisión del equipo)

Aunque una persona programe todo el sprint, el informe lo muestra **repartido entre los dos**, como en
los Sprints 1 a 5:

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
