# Instalación en una computadora nueva

Guía para tener NutriExpress Microservicios funcionando en otra computadora (Windows 10/11), igual que
en la de Nilser. Lleva entre 30 minutos y una hora la primera vez, casi todo esperando descargas.

## 1. Instalar los programas (una sola vez)

| Programa | Para qué | Dónde |
|---|---|---|
| **Git** | Descargar el repositorio y subir cambios | https://git-scm.com/download/win (dejar las opciones por defecto) |
| **Node.js 22 LTS** (o más nuevo) | Frontend y pruebas | https://nodejs.org |
| **Docker Desktop** | Levanta las bases de datos y los microservicios | https://www.docker.com/products/docker-desktop |
| Google Chrome | Las pruebas de punta a punta lo usan | (opcional) |
| Enterprise Architect 15, Word, Excel | Diagramas, informe y seguimiento Scrum | (solo para la documentación) |
| Python 3 con `pip install openpyxl` | Regenerar el Excel y armar el Word | https://www.python.org (marcar «Add to PATH») |

Docker Desktop pide **WSL 2**. Si al abrirlo avisa que falta, abrir PowerShell **como administrador**,
ejecutar `wsl --install` y reiniciar la computadora.

Antes de seguir:

- Abrir **Docker Desktop** y esperar a que abajo a la izquierda diga **Engine running**.
- Tener **al menos 10 GB libres** en el disco C: (con menos, Docker falla de formas raras).
- Memoria: con 8 GB de RAM alcanza (el proyecto no usa Elasticsearch, justamente por eso).

## 2. Descargar el repositorio

En PowerShell, ir a la carpeta donde se quiere guardar (por ejemplo el Escritorio) y clonar:

```powershell
cd $HOME\Desktop
git clone https://github.com/nutriexpress2026-alt/nutriexpress-microservicios.git
cd nutriexpress-microservicios
```

## 3. Poner todo en marcha

```powershell
powershell -ExecutionPolicy Bypass -File herramientas\instalar.ps1
```

El script comprueba los programas, levanta los nueve contenedores (PostgreSQL, MongoDB, Redis,
RabbitMQ, los cuatro microservicios y el API Gateway), instala y compila el frontend, y al final
verifica que cada servicio responda. Si algo falta, dice qué y cómo resolverlo; se corrige y se vuelve a ejecutar. La primera vez
tarda de 5 a 15 minutos en el paso 3.

Al terminar, abrir el sistema:

```powershell
cd frontend
npx next start
```

y entrar a **http://localhost:3000**. Para cerrarlo, `Ctrl + C` en esa ventana.

## 4. Usuarios de prueba

| Usuario | Contraseña | Rol | Cargo |
|---|---|---|---|
| admin | Admin1234! | Administrador | Administrador |
| almacenero | Almacen2026! | Empleado | Almacenero |
| cocinero | Cocinero2026! | Empleado | Cocinero |
| vendedor | Vendedor2026! | Empleado | Vendedor |
| repartidor | Reparto1234! | Empleado | Repartidor |
| cliente | Cliente2026! | Cliente | — |

Los cuatro empleados comparten el rol Empleado y tienen los mismos permisos; el cargo solo cambia lo
que destaca su pantalla de inicio. El administrador además gestiona usuarios y roles, y el cliente
entra al portal (catálogo y búsqueda). Tres contraseñas incorrectas seguidas bloquean la cuenta un
minuto.

## 5. El día a día

| Para… | Comando (en la carpeta del repositorio) |
|---|---|
| Traer lo último que subió el otro integrante | `git pull` y después volver a ejecutar `herramientas\instalar.ps1` |
| Apagar los contenedores al terminar | `docker compose stop` |
| Volver a encenderlos | `docker compose start` |
| Ver qué contenedores están corriendo | `docker compose ps` |
| Ver el registro de un servicio | `docker compose logs ms-inventario` |
| Editar pantallas viendo los cambios al instante | `cd frontend` y `npm run dev` (más lento; ver «Problemas frecuentes») |

Los datos quedan guardados entre un apagado y otro. **Cerrar Docker Desktop antes de apagar la
computadora**: un apagado brusco dejó una vez a Docker sin poder arrancar.

## 6. Pruebas

Con los contenedores encendidos:

| Suite | Comando |
|---|---|
| Un microservicio (integración contra PostgreSQL o MongoDB reales) | `cd servicios\ms-inventario`, `npm install` y `npm test` |
| Componentes del frontend | `cd frontend` y `npm test` |
| De punta a punta (un Chrome real recorre el sistema) | con `npx next start` corriendo en otra ventana: `cd frontend` y `npm run test:e2e` |

Las pruebas de punta a punta gastan 3 intentos fallidos de inicio de sesión a propósito, y la API
tolera 10 por dirección cada 15 minutos: si se corren más de tres veces seguidas, reiniciar
ms-identidad con `docker compose restart ms-identidad`.

## 7. Subir cambios a GitHub

Los dos integrantes suben con **la misma cuenta de GitHub del proyecto** (`nutriexpress2026-alt`), así
que no hace falta invitar a nadie.

1. La primera vez que se ejecute `git push`, Windows abre una ventana para iniciar sesión en GitHub:
   entrar con la cuenta `nutriexpress2026-alt`. Queda guardada y no vuelve a pedirla.
2. Cada integrante configura **su propio nombre** una sola vez. La cuenta es compartida, pero así cada
   commit dice quién lo hizo, que es lo que muestra el trabajo de cada uno en el sprint:

   ```powershell
   git config --global user.name "Joseph Flores García"
   git config --global user.email "su-correo@ejemplo.com"
   ```

3. Antes de empezar a trabajar, `git pull`, para no partir de una versión vieja.
4. Cada historia en su rama y entra a `main` por *pull request* revisado por el otro integrante
   (ver `CLAUDE.md`):

   ```powershell
   git checkout -b hu-17-recetas
   git add .
   git commit -m "HU-17: recetas de los productos"
   git push -u origin hu-17-recetas
   ```

   y en GitHub, **Compare & pull request**.

Quien programe con Claude Code: el asistente lee `CLAUDE.md` solo y sigue sus convenciones.

## 8. Documentación

- **Diagramas:** `docs/diagramasEA/NutriExpress_Microservicios.eapx` se abre con Enterprise Architect.
  Lo regenera `herramientas/diagramas-ea/crear-diagramas.ps1`, que **lo crea de cero**: lo editado a
  mano en EA se pierde si se vuelve a ejecutar.
- **Seguimiento Scrum:** `docs/scrum/seguimiento-scrum.xlsx`. Se editan las celdas amarillas (estado,
  fecha de término, Daily) y las gráficas se actualizan solas.
- **Informe:** los capítulos se escriben en `docs/informe/*.md` y `informe.docx` se arma con
  `herramientas/informe/armar_informe.py` (ver su `LEEME.md`). Si se edita el Word a mano, avisar al otro
  integrante antes de que lo regenere, porque regenerarlo borra esos cambios.
- Para no pisarse, **un solo integrante a la vez** edita el `.eapx`, el `.xlsx` o el `.docx`, y lo sube
  enseguida: Git no puede mezclar cambios de dos personas en esos archivos.

## Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| El script dice que Docker está apagado | Abrir Docker Desktop y esperar *Engine running*. |
| Docker Desktop no arranca después de un apagado brusco | En PowerShell: `wsl --shutdown` y volver a abrir Docker Desktop. Si sigue igual, reiniciar la computadora. |
| Errores de «read-only file system» o «no space left» | Disco C: casi lleno. Liberar espacio (al menos 10 GB) y repetir. |
| «El puerto 5433 / 5673 / 6380 / 8080 / 27018 / 3000 lo usa otro programa» | Otra base de datos u otro proyecto está usando ese puerto. Cerrarlo y repetir. |
| `npm ci` falla con `ECONNRESET` al construir los contenedores | Se cortó la conexión mientras descargaba paquetes. Repetir el script: lo ya descargado no se vuelve a bajar. |
| `npm run build` falla al descargar las fuentes de Google | Conexión inestable: repetir el script. |
| Con `npm run dev`, el inicio de sesión vuelve a la misma página | En modo desarrollo la página tarda en estar lista: esperar a que termine de cargar antes de pulsar Entrar, o usar `npx next start`. |
| Una pantalla dice «Este módulo todavía no está disponible» | Es normal: ese módulo llega en un sprint posterior. |
