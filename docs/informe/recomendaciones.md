# RECOMENDACIONES

1. **Volver a contratar el servidor de correo** (o configurar otro destino en el Postfix del servidor
   web) antes de usar el sistema con clientes reales: hoy los avisos y los reportes por correo quedan en
   cola. La guía para cambiarlo está en `herramientas/vps/LEEME.md`.

2. **Cambiar las contraseñas de las cuentas de prueba** en el servidor (`admin`, `vendedor`,
   `repartidor` y las demás). Son las del repositorio, a la vista de cualquiera que lo lea.

3. **Usar una appkey propia de Libélula.** El dinero de los cobros llega al titular de la appkey
   configurada; para cobrar en nombre del negocio hace falta la propia, con su NIT y su contrato.

4. **Agregar la búsqueda tolerante a errores de tipeo** con la extensión `pg_trgm` de PostgreSQL en la
   base del catálogo, como se evaluó en el Sprint 3. Resuelve lo que se pensaba hacer con Elasticsearch
   sin su costo en memoria.

5. **Llevar las pruebas a un servidor de integración continua** (por ejemplo, GitHub Actions) que corra
   las suites de cada servicio en cada cambio. En una computadora de 8 GB, con los doce contenedores
   encendidos, las pruebas de integración y las de punta a punta se pasan de sus tiempos.

6. **Observar el sistema en producción.** Centralizar los registros de los servicios y vigilar las
   colas de eventos fallidos (`<servicio>.eventos.fallidos`) y la bandeja de correos: hoy se revisan a mano
   con `docker compose logs`.

7. **Pasar del Docker Compose a un orquestador** (Docker Swarm o Kubernetes) si el negocio crece. Es lo
   que permitiría escalar solo el servicio con más carga, por ejemplo pedidos a la hora del almuerzo, y
   reiniciar un servicio sin que los usuarios lo noten.

8. **Para un próximo proyecto con microservicios,** acordar en el Sprint 0 cómo se cierra una historia
   técnica que dura varios sprints, y fijar desde el primer día qué puertos publica cada contenedor en el
   servidor.
