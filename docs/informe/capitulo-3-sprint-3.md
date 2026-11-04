## 3.4 Sprint 3

### 3.4.1 Sprint Planning (objetivo del sprint)

**Objetivo del sprint:** recetas y producción, con los servicios comunicados por eventos. Cada
producto tiene su receta y su costo; el cocinero registra y finaliza órdenes de producción que
descuentan los insumos y suman el producto terminado; y los servicios se avisan por RabbitMQ: la
réplica de productos, la reserva de stock, los cambios de permisos y el correo con el código para
recuperar la contraseña.

**Fechas:** jueves 29 de octubre al miércoles 4 de noviembre de 2026.

**Gestores de bases de datos.** Al cerrar el Sprint 2, el equipo fijó los gestores:
PostgreSQL y MongoDB, con Redis como complemento en memoria de ms-identidad y ms-catalogo.
Elasticsearch se evaluó y se descartó (RNF-ARQ-03; justificación en la sección 3.1.7). El martes 3 de
noviembre se agregó Redis al Docker Compose (tarea T1.1); sus usos se programan con las historias que
los necesitan.

**Historias comprometidas:**

| ID | Historia | Microservicio | Pts |
|---|---|---|---|
| HT-03 | Eventos en RabbitMQ | Todos | 5 |
| HU-09 | Gestionar recetas | ms-catalogo | 5 |
| HU-10 | Órdenes de producción | ms-catalogo + ms-inventario | 8 |
| HU-17 | Reservar y liberar stock | ms-inventario | 8 |
| HU-05 | Permisos por usuario | ms-identidad | 3 |
| HU-06 | Recuperar contraseña | ms-identidad + ms-reportes | 5 |
| | **Total** | | **34** |

### 3.4.2 Sprint Backlog (tareas, responsables y tiempo)

| ID | Historia | Tarea | Responsable | Horas |
|---|---|---|---|---|
| T1.1 | RNF-ARQ-03 | Redis como complemento en Docker Compose, instalación e informe | Joseph | 2 |
| T2.1 | HT-03 | Módulo de eventos compartido: publicar y consumir en RabbitMQ con identificador único y registro de los ya procesados | Joseph | 3 |
| T2.2 | HT-03 | La réplica de productos de ms-inventario se actualiza por eventos (`ProductoGuardado`, `ProductoEliminado`) | Nilser | 2 |
| T3.1 | HU-09 | ms-catalogo: esquema de recetas y réplica de los insumos de inventario (por eventos) | Nilser | 2 |
| T3.2 | HU-09 | Adaptar recetas con sus insumos y cantidades, una sola activa por producto, y su costo | Nilser | 3 |
| T4.1 | HU-17 | ms-inventario: reservar y liberar stock a pedido de otro servicio; repetir una reserva no descuenta dos veces | Nilser | 3 |
| T5.1 | HU-10 | ms-catalogo: esquema y alta de órdenes de producción, con los insumos calculados según el rendimiento | Nilser | 2 |
| T5.2 | HU-10 | Finalizar la orden: reserva los insumos y publica `OrdenFinalizada`; inventario descuenta los insumos y suma el producto | Nilser | 3 |
| T5.3 | HU-10 | Habilitar la pestaña Órdenes en el menú y sus rutas en el API Gateway | Nilser | 1 |
| T6.1 | HU-05 | El cambio de permisos rige en la siguiente petición también en los demás servicios (evento `PermisosCambiados`) | Joseph | 2 |
| T7.1 | HU-06 | ms-identidad: pedir y canjear el código con su tabla en PostgreSQL (vence a los 15 minutos, sirve una vez) | Joseph | 3 |
| T7.2 | HU-06 | ms-reportes envía el código por correo al recibir `CodigoRecuperacionGenerado` (adaptar el envío del sistema anterior) | Joseph | 2 |
| T7.3 | HU-06 | Los contadores de intentos por IP de ms-identidad pasan a Redis, para que no se reinicien al reiniciar el servicio | Joseph | 1 |
| T8.1 | HT-05 | Pruebas de integración de los eventos, las recetas, las reservas y las órdenes | Nilser | 3 |
| T8.2 | HT-05 | Pruebas de integración de permisos y recuperación de contraseña; punta a punta de Órdenes | Joseph | 2 |
| T9.1 | Informe | Diagramas de clases de las tablas nuevas, diagramas C4 con los tres gestores y eventos en EA | Joseph | 2 |
| T9.2 | Informe | Documentar el Sprint 3 en el informe | Joseph | 2 |
| | | **Total** | | **38** |

Como se acordó en la retrospectiva del Sprint 2, Joseph toma un microservicio completo: ms-identidad
(HU-05 y HU-06), además del módulo de eventos, el envío del código por correo desde ms-reportes y el
informe del sprint. Nilser toma ms-catalogo y ms-inventario.

**Orden de trabajo.** El módulo de eventos (T2.1) va primero, porque lo usan casi todas las demás
tareas; lo hace Joseph, que necesita los eventos para HU-05 y HU-06. Después siguen la ruta del
código de recuperación (T7.1) y las tareas que publican o consumen eventos. HU-09 y HU-17 van antes de HU-10, porque una orden de producción usa la receta activa y
reserva los insumos al finalizarse. Guardar los eventos en MongoDB para los reportes queda para el
Sprint 6, con los reportes.

**Qué ya existe.** El panel de permisos por usuario (HU-05) llegó con el frontend reutilizado y
ms-identidad ya lo respeta en la petición siguiente; falta que lo respeten los demás servicios, que hoy
confían en los permisos del token hasta que vence. HU-06 tiene la pantalla, el límite de pedidos por
IP y su tabla `recuperacion_contrasena`, pero no la ruta.

El detalle diario de cada tarea (estado y fecha de término) está en la hoja *Sprint 3* de
`docs/scrum/seguimiento-scrum.xlsx`.

### 3.4.3 Diagramas de clase e interfaces

Pendiente: se completa durante el Sprint 3.

### 3.4.4 Daily Meeting

Pendiente: se completa durante el Sprint 3.

### 3.4.5 Scrumboard (To Do, Doing, Done)

Pendiente: se completa durante el Sprint 3.

### 3.4.6 Product Increment

Pendiente: se completa durante el Sprint 3.

### 3.4.7 Burndown y Burnup

Pendiente: se completa durante el Sprint 3.

### 3.4.8 Sprint Review

Pendiente: se completa durante el Sprint 3.

### 3.4.9 Sprint Retrospective

Pendiente: se completa durante el Sprint 3.
