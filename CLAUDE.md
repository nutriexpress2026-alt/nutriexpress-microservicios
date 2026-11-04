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
| 3 | Siguiente | Recetas y órdenes de producción; eventos por RabbitMQ (las réplicas pasan a eventos) |

Desde el 3-nov el trabajo sigue en la computadora de Joseph (`INSTALACION.md`); los dos suben con la
cuenta compartida `nutriexpress2026-alt`, cada uno con su `git config user.name`.

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
- **Redis**: agregar `redis:7-alpine` a `docker-compose.yml` (gasta muy poca memoria). En ms-identidad,
  los contadores de `express-rate-limit` (`src/middlewares/seguridad.middleware.ts`) pasan a Redis, así
  no se reinician al reiniciar el servicio, y también los tokens revocados al cerrar sesión. En
  ms-catalogo, caché del catálogo público con vencimiento corto, que se invalida al editar un producto.
  Si Redis no responde, el servicio sigue funcionando contra PostgreSQL (RNF-DIS-01).
- Al aplicarlo: actualizar `herramientas/instalar.ps1`, RNF-ARQ-03 y la tabla de tecnologías en
  `capitulo-3-sprint-0.md`, `README.md` y los diagramas C4 (`crear-diagramas.ps1`). Los sprints 1 y 2
  no se reescriben: el cambio se documenta en el sprint en que se haga.

## Patrones ya implementados (seguirlos)

- **Réplica local en vez de leer otra base** (RNF-ARQ-02): ms-inventario guarda `producto` (id,
  nombre, conservación, activo) y `empleado` (id, nombre, apellido). La de productos la mantiene
  ms-catalogo por REST interno (y la lista completa al arrancar); la de empleados sale del token
  (gancho `alAutenticar`). En el Sprint 3 la de productos pasa a eventos de RabbitMQ.
- **REST interno**: rutas `/interno/*` fuera de `/api`, que el gateway no expone, protegidas con
  `soloRedInterna` (rechaza lo que trae `X-Forwarded-For`).
- **Sesión**: ms-identidad firma el token con RS256 y publica la clave pública en
  `/api/auth/clave-publica`; los demás la verifican con `servicios/compartido/auth.middleware.ts`
  (copiado en cada servicio). El token trae nombre, apellido, rol, cargo y permisos.
- **Tolerancia a fallos** (RNF-DIS-01): si ms-inventario no responde, el catálogo se muestra sin
  stock; el gateway responde 503 en JSON cuando un servicio está caído.
- **Funciones de sprints futuros**: el gateway responde 503 a lo que no tiene servicio, y el frontend
  oculta las pestañas con `desdeSprint` mayor que `SPRINT_ACTUAL` (`frontend/src/lib/modulos.ts`).
  Al empezar un sprint, subir `SPRINT_ACTUAL`: las pruebas en espera (`it.runIf`, `test.skip` con
  `SPRINT_ACTUAL`) se activan solas.
- **Esquema**: `prisma/esquema.sql` es la fuente; `schema.prisma` se deriva de él. Cada servicio crea
  sus tablas y su carga inicial al arrancar si su base está vacía (`prisma/inicializar.ts`).
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
  S2 22–28 oct, S3 29 oct–4 nov…); las tareas se reparten entre Joseph y Nilser.
- **Diagramas**: Enterprise Architect 15.2. `herramientas/diagramas-ea/crear-diagramas.ps1` recrea el
  `.eapx` desde cero por COM y exporta los PNG a `docs/diagramasEA/imagenes/`. Mañas de EA por COM:
  ignora las rutas manuales de las líneas (alinear los elementos), agrega «()» a los mensajes (darles
  parámetros), con `l=0` ignora la posición, y un `SQLQuery` con una columna inexistente lo cuelga.
- Roles Scrum: Nilser es Product Owner y Joseph Scrum Master; los dos son equipo de desarrollo.
