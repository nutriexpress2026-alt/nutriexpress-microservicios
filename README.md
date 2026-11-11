# NutriExpress — Microservicios

Sistema de información web para la gestión de ventas, pedidos, producción e inventario de
comida saludable, **diseñado desde cero con arquitectura de microservicios** y desarrollado con
**Scrum**. Proyecto de la materia Tecnología Web (UAGRM – Facultad Integral del Norte).

Integrantes: Nilser Rodrigo Condori Ortiz · Joseph Flores García.
Docente: Ing. Edwin Calle Terrazas.

## Estado

| Sprint | Fechas (2026) | Objetivo | Estado |
|---|---|---|---|
| Sprint 0 | 14-oct – 16-oct | Planificación: perfil, organización, backlog, arquitectura | Terminado |
| Sprint 1 | 17-oct – 21-oct | Infraestructura base + Identidad (inicio de sesión) | Terminado |
| Sprint 2 | 22-oct – 28-oct | Catálogo de productos e inventario básico | Terminado |
| Sprint 3 | 29-oct – 04-nov | Recetas, producción y eventos entre servicios | Terminado |
| Sprint 4 | 05-nov – 11-nov | Pedidos a domicilio y pago en línea (saga) | Terminado |
| Sprint 5 | 12-nov – 18-nov | Gestión de pedidos, reparto y ventas de mostrador | Terminado |
| Sprint 6 | 19-nov – 25-nov | Reportes, temas, despliegue y pruebas | Terminado |
| Sprint 7 | 26-nov – 02-dic | Reserva: perfil propio, reportes de producción e inventario y cierre del informe | Terminado |

## Instalación

Para tenerlo funcionando en otra computadora: [`INSTALACION.md`](INSTALACION.md). En resumen, con
Git, Node.js 22 y Docker Desktop instalados:

```powershell
git clone https://github.com/nutriexpress2026-alt/nutriexpress-microservicios.git
cd nutriexpress-microservicios
powershell -ExecutionPolicy Bypass -File herramientas\instalar.ps1
```

## Estructura del repositorio

```
docs/
  informe/                 Contenido del informe (formato SCRUM del docente)
    capitulo-1-perfil.md
    capitulo-2-organizacion.md
    capitulo-3-sprint-0.md
    informe.docx           Informe en Word generado desde los capítulos
  diagramasEA/             Proyecto de Enterprise Architect y sus diagramas exportados (imagenes/)
  scrum/                   Excel de seguimiento: backlog, sprints, daily, Burndown y Burnup
herramientas/informe/      Scripts que arman el Word
herramientas/diagramas-ea/ Scripts que dibujan los diagramas en Enterprise Architect
servicios/                 Un microservicio por carpeta (desde el Sprint 1)
frontend/                  Aplicación web Next.js (desde el Sprint 1)
gateway/                   Puerta de entrada única (desde el Sprint 1)
docker-compose.yml         Levanta todo el sistema (desde el Sprint 1)
```

## Microservicios

| Servicio | Responsabilidad | Base de datos |
|---|---|---|
| `ms-identidad` | Usuarios, roles, permisos, inicio de sesión y fichas de clientes | PostgreSQL (+ Redis) |
| `ms-catalogo` | Productos, recetas, órdenes de producción, información del negocio | PostgreSQL (+ Redis) |
| `ms-inventario` | Insumos, almacenes, notas de ingreso y egreso, stock, lotes | PostgreSQL |
| `ms-ventas` | Ventas de mostrador y comprobantes | PostgreSQL |
| `ms-pedidos` | Pedidos a domicilio, ubicaciones, reparto y seguimiento | PostgreSQL |
| `ms-pagos` | Cobros en línea (Libélula y pasarela simulada) | PostgreSQL |
| `ms-reportes` | Reportes parametrizados en PDF, envío por correo, contador de visitas | MongoDB |

Redis es un complemento en memoria de los servicios marcados (+ Redis), para datos pequeños y
temporales como los límites de intentos o una caché del catálogo. Detalle y justificación en
[`docs/informe/capitulo-3-sprint-0.md`](docs/informe/capitulo-3-sprint-0.md).
