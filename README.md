# NutriExpress — Microservicios

Sistema de información web para la gestión de ventas, pedidos, producción e inventario de
comida saludable, **diseñado desde cero con arquitectura de microservicios** y desarrollado con
**Scrum**. Proyecto de la materia Tecnología Web (UAGRM – Facultad Integral del Norte).

Integrantes: Nilser Rodrigo Condori Ortiz · Joseph Flores García.
Docente: Ing. Edwin Calle Terrazas.

## Estado

| Sprint | Fechas (2026) | Objetivo | Estado |
|---|---|---|---|
| Sprint 0 | 20-oct – 25-oct | Planificación: perfil, organización, backlog, arquitectura | En curso |
| Sprint 1 | 26-oct – 01-nov | Infraestructura base + Identidad (inicio de sesión) | Pendiente |
| Sprint 2 | 02-nov – 08-nov | Catálogo de productos e inventario básico | Pendiente |
| Sprint 3 | 09-nov – 15-nov | Recetas, producción y eventos entre servicios | Pendiente |
| Sprint 4 | 16-nov – 22-nov | Pedidos a domicilio y pago en línea (saga) | Pendiente |
| Sprint 5 | 23-nov – 29-nov | Gestión de pedidos, reparto y ventas de mostrador | Pendiente |
| Sprint 6 | 30-nov – 06-dic | Reportes, temas, despliegue y pruebas | Pendiente |
| Sprint 7 | 07-dic – 13-dic | Reserva: ajustes y cierre del informe | Pendiente |

## Estructura del repositorio

```
docs/
  informe/                 Contenido del informe (formato SCRUM del docente)
    capitulo-1-perfil.md
    capitulo-2-organizacion.md
    capitulo-3-sprint-0.md
    informe.docx           Informe en Word generado desde los capítulos
  diagramasEA/             Proyecto de Enterprise Architect y sus diagramas exportados (imagenes/)
  jira/                    Backlog para importar en Jira (backlog-jira.csv) y guía de uso
herramientas/informe/      Scripts que arman el Word
herramientas/diagramas-ea/ Scripts que dibujan los diagramas en Enterprise Architect
herramientas/jira/         Genera el CSV de Jira desde el Product Backlog
servicios/                 Un microservicio por carpeta (desde el Sprint 1)
frontend/                  Aplicación web Next.js (desde el Sprint 1)
gateway/                   Puerta de entrada única (desde el Sprint 1)
docker-compose.yml         Levanta todo el sistema (desde el Sprint 1)
```

## Microservicios

| Servicio | Responsabilidad | Base de datos |
|---|---|---|
| `ms-identidad` | Usuarios, roles, permisos, inicio de sesión | PostgreSQL |
| `ms-catalogo` | Productos, recetas, órdenes de producción, información del negocio | PostgreSQL |
| `ms-inventario` | Insumos, almacenes, notas de ingreso y egreso, stock, lotes | PostgreSQL |
| `ms-ventas` | Ventas de mostrador y comprobantes | PostgreSQL |
| `ms-pedidos` | Pedidos a domicilio, ubicaciones, reparto y seguimiento | PostgreSQL |
| `ms-pagos` | Cobros en línea (Libélula y pasarela simulada) | PostgreSQL |
| `ms-reportes` | Reportes parametrizados en PDF, envío por correo, contador de visitas | MongoDB |

Detalle y justificación en [`docs/informe/capitulo-3-sprint-0.md`](docs/informe/capitulo-3-sprint-0.md).
