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

## Estado (al 3-nov-2026)

| Sprint | Estado | Qué quedó |
|---|---|---|
| 0 | Terminado | Perfil, organización, backlog, arquitectura (capítulos 1, 2 y 3.1 del informe) |
| 1 | Terminado | Docker Compose, API Gateway, ms-identidad, ms-reportes (visitas), frontend reutilizado |
| 2 | Terminado | ms-catalogo y ms-inventario, con réplicas entre servicios |
| 3 | En curso | Recetas y órdenes de producción; eventos por RabbitMQ. Tareas en `capitulo-3-sprint-3.md`. **Hechas** (3-nov, en ramas apiladas sin unir a `main`): T1.1, T2.1 módulo de eventos (`ht-03-modulo-eventos`), T7.1–T7.3 HU-06 (`hu-06-recuperar-contrasena`), T6.1 HU-05 (`hu-05-permisos-en-servicios`). **Faltan**: T2.2, HU-09, HU-17, HU-10 (Nilser; el módulo de eventos ya está en ms-catalogo y ms-inventario), el punta a punta de Órdenes de T8.2 (cuando exista HU-10), T9.1 y T9.2 |

Desde el 3-nov el trabajo sigue en la computadora de Joseph (`INSTALACION.md`); los dos suben con la
cuenta compartida `nutriexpress2026-alt`, cada uno con su `git config user.name`.

## Siguiente: Sprint 3 (29 de octubre al miércoles 4 de noviembre de 2026)

Lo programa y documenta Joseph. **Objetivo:** recetas y producción, comunicando los servicios por
eventos. Historias (34 pts, del Product Backlog en `capitulo-3-sprint-0.md`): HT-03 Eventos en RabbitMQ
(5), HU-09 Gestionar recetas (5), HU-10 Órdenes de producción (8), HU-17 Reservar y liberar stock (8),
HU-05 Permisos por usuario (3) y HU-06 Recuperar contraseña (5). Antes de programar, leer sus criterios
de aceptación y la sección de eventos de `capitulo-3-sprint-0.md`.

Pasos:

1. Rama `sprint-3` (o una por historia) y subir `SPRINT_ACTUAL` a 3 en `frontend/src/lib/modulos.ts`:
   la pestaña Órdenes y sus pruebas en espera se activan solas.
2. Programar las historias siguiendo «Patrones ya implementados». La réplica de productos de
   ms-inventario pasa de REST interno a eventos de RabbitMQ, idempotentes (RNF-DIS-03). La búsqueda
   con `pg_trgm` y Redis (ver «Gestores») se pueden sumar en este sprint si alcanza el tiempo.
3. Pruebas de integración de cada servicio, de componentes y de punta a punta; todo funcionando con
   `docker compose up --build`.
4. Documentar en `docs/informe/capitulo-3-sprint-3.md` con la **misma estructura que
   `capitulo-3-sprint-2.md`** (3.4.1 a 3.4.9): planning, Sprint Backlog, diagramas de clases en EA (sumar
   el paquete «Sprint 3» en `crear-diagramas.ps1`), capturas (copiar `herramientas/informe/capturas-sprint2.cjs`),
   Daily, Scrumboard, Increment, burndown/burnup, review y retrospectiva.
5. Sumar el Sprint 3 en `SPRINTS` de `herramientas/scrum/excel_scrum.py`, regenerar el Excel, abrirlo con
   Excel para que calcule y exportar sus gráficas a `docs/informe/imagenes/sprint3/`. Regenerar
   `informe.docx` (antes, comparar ediciones a mano) y actualizar la tabla «Estado» de este archivo.

### Regla para documentar el sprint (decisión del equipo)

Aunque una persona programe todo el sprint, el informe lo muestra **repartido entre los dos**, como en
los Sprints 1 y 2:

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
  `README.md` y `crear-diagramas.ps1`; el `.eapx` y el Word ya están regenerados (3-nov). Los sprints
  1 y 2 no se reescriben: el cambio se documenta en el sprint en que se haga.

## Patrones ya implementados (seguirlos)

- **Réplica local en vez de leer otra base** (RNF-ARQ-02): ms-inventario guarda `producto` (id,
  nombre, conservación, activo) y `empleado` (id, nombre, apellido). La de productos la mantiene
  ms-catalogo por REST interno (y la lista completa al arrancar); la de empleados sale del token
  (gancho `alAutenticar`). En el Sprint 3 la de productos pasa a eventos de RabbitMQ.
- **REST interno**: rutas `/interno/*` fuera de `/api`, que el gateway no expone, protegidas con
  `soloRedInterna` (rechaza lo que trae `X-Forwarded-For`).
- **Eventos** (HT-03, RNF-DIS-03): `servicios/compartido/eventos.ts`, copiado idéntico en
  `src/config/eventos.ts` de cada servicio que lo usa. Exchange topic `nutriexpress.eventos`, la
  clave de ruteo es el tipo (`PermisosCambiados`). Al arrancar: `suscribir(tipo, manejador)` por cada
  tipo que se consume y después `conectarEventos({ servicio, registro })`; publicar con
  `publicar(tipo, datos)`. Cada servicio consumidor tiene su cola `<servicio>.eventos` y un
  `RegistroDeEventos` en **su** base con los ids ya procesados (ms-reportes: colección
  `eventos_procesados`). Se atiende de a uno; lo que falla dos veces va a `<servicio>.eventos.fallidos`.
  Si RabbitMQ no responde, el servicio arranca igual y se reconecta solo. Pruebas: contra RabbitMQ en
  `127.0.0.1:5673` (`ms-reportes/tests/eventos.test.ts`).
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
