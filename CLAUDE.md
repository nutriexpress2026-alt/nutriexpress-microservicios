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
