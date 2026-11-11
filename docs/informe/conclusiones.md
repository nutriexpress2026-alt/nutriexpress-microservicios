# CONCLUSIONES

Se cumplió el objetivo general: NutriExpress quedó como un sistema de información web basado en
microservicios que gestiona las ventas, los pedidos, la producción y el inventario del negocio. Se
desarrolló con Scrum en un Sprint 0 de planificación y siete sprints de una semana, y está publicado
en https://nutriexpress.109-123-254-213.sslip.io. Sobre cada objetivo específico:

1. **Requisitos e historias.** Los requisitos del negocio se expresaron en 34 historias de usuario y 5
   historias técnicas, ordenadas en un Product Backlog de 205 puntos. Los 39 elementos quedaron hechos,
   cada uno en el sprint para el que se planificó (sección 3.9.1).

2. **Arquitectura.** La arquitectura se diseñó con el modelo C4 y se mantuvo hasta el final: un API
   Gateway como única entrada, siete microservicios con su responsabilidad y sus datos delimitados, y un
   portal web. El diseño de dueños de datos (RNF-ARQ-02) obligó a resolver de forma explícita cada
   necesidad entre servicios: con réplicas mínimas, rutas internas o eventos.

3. **Bases de datos.** Se usaron dos gestores principales y un complemento, cada uno donde conviene:
   PostgreSQL para los datos transaccionales de seis servicios (una base y un usuario por servicio),
   MongoDB para los documentos de los reportes y Redis para los contadores en memoria de los límites de
   acceso. Elasticsearch se descartó por la memoria que exige; la búsqueda tolerante a errores de tipeo
   quedó como recomendación con PostgreSQL.

4. **Microservicios y comunicación.** Se implementaron los siete microservicios. Se comunican por API
   REST cuando necesitan la respuesta en el momento (reservar stock, abrir un cobro, consultar un
   empleado) y por eventos en RabbitMQ cuando avisan algo que ya ocurrió (un pago confirmado, un pedido
   cancelado, un cambio de permisos). Los eventos son idempotentes y los procesos que tocan varios
   servicios (el pedido pagado en línea, la orden de producción) se resolvieron como sagas con
   compensación.

5. **Portal y escritorio.** El portal del cliente (catálogo, carrito, pago, seguimiento del pedido) y
   el escritorio del personal (siete módulos según los permisos) están completos, con tres temas
   visuales, modo día/noche según la hora, contador de visitas y buscador general. El frontend del
   sistema anterior se reutilizó adaptándolo a la nueva API.

6. **Pruebas.** Se automatizaron tres tipos de pruebas: de integración de cada microservicio contra
   su base real, de componentes del frontend y de punta a punta en el navegador. Al cierre pasan 499
   pruebas de integración y de componentes, además de los recorridos de punta a punta.

7. **Despliegue.** El sistema corre en un VPS con Docker detrás de Caddy (HTTPS con Let's Encrypt), sin
   puertos de datos expuestos, con la pasarela Libélula en modo real y un respaldo diario de las bases.
   Reemplazó al sistema monolítico anterior, que se retiró con un respaldo completo.

Más allá de los objetivos, el proyecto dejó tres aprendizajes. Primero, separar un sistema en
microservicios no lo simplifica: mueve la complejidad a las fronteras entre servicios, y cada frontera
pide una decisión (copiar, preguntar o avisar). Segundo, la tolerancia a fallos se diseña: que un
servicio caído no detenga a los demás requirió compensaciones, reintentos y mensajes claros en cada
caso. Tercero, Scrum ayudó a sostener el ritmo: los sprints cortos, la Daily y la retrospectiva hicieron
visibles los problemas a tiempo, como la falta de memoria de una computadora de desarrollo o un puerto de
base de datos que quedaba expuesto, y permitieron corregirlos sin atrasar la entrega.
