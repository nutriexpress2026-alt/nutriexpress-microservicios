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

## Decisión pendiente de aplicar: PostgreSQL + Redis + Elasticsearch (3-nov)

El equipo decidió usar **tres gestores: PostgreSQL, Redis y Elasticsearch**, en lugar de PostgreSQL y
MongoDB. No se aplicó en la computadora de Nilser porque no tiene memoria para Elasticsearch. Hay que
hacerlo **antes del Sprint 3**, en una rama `ht-gestores-redis-elasticsearch`. Propuesta (confirmarla con
el equipo antes de programar):

| Gestor | Dueño | Para qué | Por qué ese gestor |
|---|---|---|---|
| PostgreSQL 16 | ms-identidad, ms-catalogo, ms-inventario, ms-ventas, ms-pedidos, ms-pagos (una base y un usuario cada uno, como ahora) | Datos transaccionales | Transacciones, claves foráneas y `CHECK` |
| Redis 7 | ms-identidad (base 0) y ms-reportes (base 1), con prefijo de clave por servicio | Identidad: intentos fallidos por IP, códigos de recuperación con vencimiento (TTL) y tokens revocados al cerrar sesión. Reportes: contador de visitas (`INCR`, atómico como el `$inc` de Mongo) | Datos pequeños, efímeros y con vencimiento, en memoria |
| Elasticsearch 8 | ms-reportes | Reemplaza a MongoDB como vista de lectura: indexa los eventos de ventas, pedidos y movimientos; los reportes son agregaciones (por fecha, producto, repartidor) y el buscador general consulta ese índice | Búsqueda de texto (sin tildes, con errores de tipeo) y agregaciones |

Qué tocar al aplicarlo:

- `docker-compose.yml`: quitar `mongo`; agregar `redis:7-alpine` y `elasticsearch:8.x` con
  `discovery.type=single-node`, `xpack.security.enabled=false`, `xpack.ml.enabled=false` y
  `ES_JAVA_OPTS=-Xms512m -Xmx512m`. Elasticsearch necesita una computadora con 16 GB de RAM (8 GB
  como mínimo) y Docker Desktop con al menos 4 GB asignados.
- `servicios/ms-reportes`: `src/config/mongo.ts` → Redis; `src/models/visita.model.ts` con
  `INCR` y la fecha de la primera visita con `SET NX`; mismas rutas `/api/visitas`, para que
  `frontend/src/components/ui/PieVisitas.tsx` no cambie. Adaptar `tests/visitas.test.ts`.
- `herramientas/instalar.ps1`: comprobar la memoria de Docker y que Redis y Elasticsearch respondan.
- Informe: RNF-ARQ-03 y la tabla de tecnologías en `capitulo-3-sprint-0.md` (y la justificación de
  cada gestor), la línea de los gestores en `capitulo-1-perfil.md`, `README.md`, y los diagramas C4 de
  `herramientas/diagramas-ea/crear-diagramas.ps1`. Los sprints 1 y 2 **no se reescriben**: cuentan lo
  que pasó (MongoDB); el cambio se documenta en el sprint en que se haga.

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
  cambios a los `.md`. Los textos de retroalimentación del PO y de la retrospectiva son borradores que
  el equipo revisa.
- **Seguimiento Scrum** (sin Jira, se descartó): `docs/scrum/seguimiento-scrum.xlsx`, generado por
  `herramientas/scrum/excel_scrum.py` (openpyxl); las gráficas burndown/burnup se exportan desde Excel.
- **Diagramas**: Enterprise Architect 15.2. `herramientas/diagramas-ea/crear-diagramas.ps1` recrea el
  `.eapx` desde cero por COM y exporta los PNG a `docs/diagramasEA/imagenes/`. Mañas de EA por COM:
  ignora las rutas manuales de las líneas (alinear los elementos), agrega «()» a los mensajes (darles
  parámetros), con `l=0` ignora la posición, y un `SQLQuery` con una columna inexistente lo cuelga.
- Roles Scrum: Nilser es Product Owner y Joseph Scrum Master; los dos son equipo de desarrollo.
