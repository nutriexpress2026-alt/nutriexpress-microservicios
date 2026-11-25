# Poblada de NutriExpress

Llena el sistema con datos de demostración: 21 productos con foto y valor nutricional, 36 insumos
comprados (con lote y vencimiento los perecederos), una receta activa «Porción estándar» por producto
y órdenes de producción finalizadas para que haya stock moderado (de 8 a 24 por producto). Las aguas y
el yogur bebible se compran ya hechos.

- `datos.mjs`: los insumos, los productos, sus recetas y el stock que se quiere.
- `fotos/`: las fotos de los productos, recuperadas del respaldo del sistema anterior (monolito).
- `poblar.mjs`: lo carga todo **por la API del gateway**, como un administrador desde la pantalla, para
  que cada microservicio guarde lo suyo y las réplicas viajen por eventos (RNF-ARQ-02).

Se puede correr varias veces: lo que ya existe (por nombre) no se repite, y solo compra y produce lo
que falta para llegar al stock de `datos.mjs`. A los productos que ya existían no les cambia el precio.

## Correrla

En el VPS (Node 22 ya está instalado), después de subir esta carpeta a
`/opt/nutriexpress/herramientas/poblar`:

```bash
cd /opt/nutriexpress/herramientas/poblar && NX_URL=http://127.0.0.1:8090/api node poblar.mjs
```

En la PC, con `docker compose up`: `node herramientas/poblar/poblar.mjs` (usa
`http://127.0.0.1:8080/api`). Pide la contraseña del usuario `admin` (o el de `NX_USUARIO`).

Corrida en el VPS el 25-nov-2026: 26 insumos, 11 productos y 18 recetas nuevos, 21 fotos, una compra de
28 insumos y 18 órdenes de producción (números 3 a 20).
