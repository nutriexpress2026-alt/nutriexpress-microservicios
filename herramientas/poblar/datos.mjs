/**
 * Datos de la poblada de NutriExpress. Los productos, sus fotos (carpeta fotos/),
 * las descripciones y los valores nutricionales vienen del sistema anterior
 * (monolito, respaldo del 11-nov-2026); las recetas se completaron con los
 * ingredientes que dice cada descripción.
 *
 * Cantidades: kg, L o unidades (u), con hasta tres decimales (0.120 kg = 120 g).
 */

/** Insumos: unidad, costo de compra (Bs), stock mínimo, conservación, si se controla el vencimiento (lote) y en cuántos días vence. */
export const INSUMOS = [
  // Los diez de la carga inicial
  { nombre: 'Pechuga de pollo', unidad: 'kg', costo: 34.5, minimo: 5, conservacion: 'Refrigerado', vence: 5 },
  { nombre: 'Lechuga romana', unidad: 'kg', costo: 12.5, minimo: 3, conservacion: 'Refrigerado', vence: 6 },
  { nombre: 'Tomate', unidad: 'kg', costo: 9, minimo: 4, conservacion: 'Refrigerado', vence: 8 },
  { nombre: 'Limon', unidad: 'kg', costo: 9.5, minimo: 3, conservacion: 'Refrigerado', vence: 15 },
  { nombre: 'Yogur griego natural', unidad: 'L', costo: 22, minimo: 4, conservacion: 'Refrigerado', vence: 14 },
  { nombre: 'Quinua real', unidad: 'kg', costo: 28, minimo: 5, conservacion: 'Seco' },
  { nombre: 'Aceite de oliva', unidad: 'L', costo: 48, minimo: 2, conservacion: 'Seco' },
  { nombre: 'Avena en hojuelas', unidad: 'kg', costo: 14, minimo: 5, conservacion: 'Seco' },
  { nombre: 'Almendras', unidad: 'kg', costo: 68, minimo: 2, conservacion: 'Seco' },
  { nombre: 'Harina integral', unidad: 'kg', costo: 11.5, minimo: 6, conservacion: 'Seco' },
  // Los que se suman
  { nombre: 'Espinaca', unidad: 'kg', costo: 12, minimo: 1, conservacion: 'Refrigerado', vence: 5 },
  { nombre: 'Pepino', unidad: 'kg', costo: 6, minimo: 1, conservacion: 'Refrigerado', vence: 8 },
  { nombre: 'Palta', unidad: 'kg', costo: 18, minimo: 1, conservacion: 'Refrigerado', vence: 6 },
  { nombre: 'Frutilla', unidad: 'kg', costo: 20, minimo: 1, conservacion: 'Refrigerado', vence: 5 },
  { nombre: 'Brócoli', unidad: 'kg', costo: 14, minimo: 1, conservacion: 'Refrigerado', vence: 7 },
  { nombre: 'Albahaca', unidad: 'kg', costo: 40, minimo: 0.1, conservacion: 'Refrigerado', vence: 5 },
  { nombre: 'Zanahoria', unidad: 'kg', costo: 5, minimo: 2, conservacion: 'Refrigerado' },
  { nombre: 'Manzana verde', unidad: 'kg', costo: 12, minimo: 1, conservacion: 'Refrigerado', vence: 20 },
  { nombre: 'Apio', unidad: 'kg', costo: 8, minimo: 0.5, conservacion: 'Refrigerado', vence: 10 },
  { nombre: 'Hierbabuena', unidad: 'kg', costo: 30, minimo: 0.1, conservacion: 'Refrigerado', vence: 5 },
  { nombre: 'Maracuyá', unidad: 'kg', costo: 15, minimo: 1, conservacion: 'Refrigerado', vence: 10 },
  { nombre: 'Aceitunas negras', unidad: 'kg', costo: 40, minimo: 0.5, conservacion: 'Refrigerado', vence: 60 },
  { nombre: 'Queso fresco', unidad: 'kg', costo: 38, minimo: 1, conservacion: 'Refrigerado', vence: 12 },
  { nombre: 'Leche descremada', unidad: 'L', costo: 8, minimo: 3, conservacion: 'Refrigerado', vence: 10 },
  { nombre: 'Huevo', unidad: 'u', costo: 1, minimo: 24, conservacion: 'Refrigerado', vence: 21 },
  { nombre: 'Trucha', unidad: 'kg', costo: 45, minimo: 1, conservacion: 'Refrigerado', vence: 4 },
  { nombre: 'Naranja', unidad: 'kg', costo: 6, minimo: 4, conservacion: 'Seco' },
  { nombre: 'Papa', unidad: 'kg', costo: 4, minimo: 5, conservacion: 'Seco' },
  { nombre: 'Arroz integral', unidad: 'kg', costo: 12, minimo: 3, conservacion: 'Seco' },
  { nombre: 'Miel de abeja', unidad: 'kg', costo: 45, minimo: 0.5, conservacion: 'Seco' },
  { nombre: 'Tortilla integral', unidad: 'u', costo: 2, minimo: 10, conservacion: 'Seco' },
  { nombre: 'Uva pasa', unidad: 'kg', costo: 10.5, minimo: 1, conservacion: 'Seco' },
  { nombre: 'Jengibre', unidad: 'kg', costo: 25, minimo: 0.2, conservacion: 'Seco' },
  { nombre: 'Semillas de girasol', unidad: 'kg', costo: 35, minimo: 0.5, conservacion: 'Seco' },
  { nombre: 'Canela molida', unidad: 'kg', costo: 60, minimo: 0.1, conservacion: 'Seco' },
  { nombre: 'Gelatina sin sabor', unidad: 'kg', costo: 90, minimo: 0.1, conservacion: 'Seco' },
];

const ENSALADAS = 'Ensaladas';
const PLATOS = 'Platos principales';
const BEBIDAS = 'Bebidas naturales';
const POSTRES = 'Postres saludables';

/**
 * Productos. `stock` es cuántos se quieren en existencia al terminar: los que
 * tienen receta se producen con órdenes de producción; los que no (agua, yogur
 * bebible) se compran ya hechos. `nutricion`: calorías, proteínas, carbohidratos,
 * grasas y fibra (g). `receta`: rendimiento (porciones por corrida), minutos,
 * si se puede hacer por partes y los insumos de UNA corrida.
 */
export const PRODUCTOS = [
  {
    nombre: 'Ensalada Cesar con pollo', categoria: ENSALADAS, precio: 35, conservacion: 'Refrigerado', foto: 'ensalada-cesar-con-pollo.jpg', stock: 14,
    descripcion: 'Lechuga romana, pollo a la plancha, crutones integrales y aderezo ligero.',
    nutricion: [320, 28, 12, 18, 3.5],
    receta: { rendimiento: 1, minutos: 15, instrucciones: 'Lavar y cortar la lechuga. Sellar la pechuga y laminarla. Mezclar el yogur con limón y aceite para el aderezo y servir.',
      insumos: { 'Lechuga romana': 0.15, 'Pechuga de pollo': 0.12, 'Yogur griego natural': 0.03, 'Limon': 0.01, 'Aceite de oliva': 0.01 } },
  },
  {
    nombre: 'Ensalada mediterranea', categoria: ENSALADAS, precio: 32, conservacion: 'Refrigerado', foto: 'ensalada-mediterranea.jpg', stock: 12,
    descripcion: 'Tomate, pepino, aceitunas, queso fresco y aceite de oliva.',
    nutricion: [280, 9, 20, 17, 5.2],
    receta: { rendimiento: 1, minutos: 12, instrucciones: 'Cortar tomate y pepino en cubos, agregar lechuga, aceitunas y queso fresco desmenuzado. Aliñar con aceite de oliva.',
      insumos: { 'Lechuga romana': 0.1, 'Tomate': 0.1, 'Pepino': 0.08, 'Queso fresco': 0.05, 'Aceitunas negras': 0.03, 'Aceite de oliva': 0.015 } },
  },
  {
    nombre: 'Ensalada de quinua y palta', categoria: ENSALADAS, precio: 35, conservacion: 'Refrigerado', foto: 'ensalada-de-quinua-y-palta.jpg', stock: 12,
    descripcion: 'Quinua real, palta, tomate y limón.',
    nutricion: [340, 9, 38, 17, 8],
    receta: { rendimiento: 1, minutos: 20, instrucciones: 'Cocer la quinua y enfriarla. Agregar palta y tomate en cubos, aliñar con limón y aceite.',
      insumos: { 'Quinua real': 0.08, 'Palta': 0.08, 'Tomate': 0.06, 'Limon': 0.02, 'Aceite de oliva': 0.01 } },
  },
  {
    nombre: 'Ensalada caprese', categoria: ENSALADAS, precio: 30, conservacion: 'Refrigerado', foto: 'ensalada-caprese.jpg', stock: 10,
    descripcion: 'Tomate, queso fresco y albahaca con aceite de oliva.',
    nutricion: [260, 13, 8, 20, 2],
    receta: { rendimiento: 1, minutos: 10, instrucciones: 'Cortar el tomate y el queso en rodajas, alternarlos con hojas de albahaca y rociar aceite de oliva.',
      insumos: { 'Tomate': 0.15, 'Queso fresco': 0.08, 'Albahaca': 0.005, 'Aceite de oliva': 0.012 } },
  },
  {
    nombre: 'Ensalada de espinaca con huevo', categoria: ENSALADAS, precio: 28, conservacion: 'Refrigerado', foto: 'ensalada-de-espinaca-con-huevo.jpg', stock: 10,
    descripcion: 'Espinaca, huevo duro, queso fresco y tomate.',
    nutricion: [220, 13, 6, 16, 3],
    receta: { rendimiento: 1, minutos: 15, instrucciones: 'Cocer el huevo 10 minutos. Lavar la espinaca, agregar tomate, queso y el huevo en cuartos. Aliñar con aceite.',
      insumos: { 'Espinaca': 0.08, 'Huevo': 1, 'Queso fresco': 0.03, 'Tomate': 0.04, 'Aceite de oliva': 0.01 } },
  },
  {
    nombre: 'Bowl de quinua y verduras', categoria: PLATOS, precio: 42, conservacion: 'Refrigerado', foto: 'bowl-de-quinua-y-verduras.jpg', stock: 12,
    descripcion: 'Quinua real, verduras salteadas, palta y semillas de girasol.',
    nutricion: [450, 16, 62, 14, 8.1],
    receta: { rendimiento: 1, minutos: 20, instrucciones: 'Cocer la quinua. Saltear tomate y zanahoria. Servir en bowl con palta y semillas de girasol.',
      insumos: { 'Quinua real': 0.1, 'Tomate': 0.08, 'Zanahoria': 0.05, 'Palta': 0.06, 'Semillas de girasol': 0.015, 'Aceite de oliva': 0.01 } },
  },
  {
    nombre: 'Pechuga a la plancha con pure', categoria: PLATOS, precio: 48, conservacion: 'Refrigerado', foto: 'pechuga-a-la-plancha-con-pure.jpg', stock: 12,
    descripcion: 'Pechuga de pollo, pure de papa nativa y ensalada de estacion.',
    nutricion: [520, 42, 38, 20, 4],
    receta: { rendimiento: 1, minutos: 30, instrucciones: 'Cocer la papa y hacer el puré con leche. Cocinar la pechuga a la plancha. Servir con lechuga y tomate.',
      insumos: { 'Pechuga de pollo': 0.2, 'Papa': 0.25, 'Leche descremada': 0.05, 'Lechuga romana': 0.04, 'Tomate': 0.05, 'Aceite de oliva': 0.01 } },
  },
  {
    nombre: 'Wrap integral de pollo', categoria: PLATOS, precio: 38, conservacion: 'Refrigerado', foto: 'wrap-integral-de-pollo.jpg', stock: 12,
    descripcion: 'Tortilla integral, pollo desmenuzado, vegetales frescos y yogur natural.',
    nutricion: [410, 30, 40, 13, 6],
    receta: { rendimiento: 1, minutos: 15, instrucciones: 'Desmenuzar el pollo cocido. Calentar la tortilla, rellenar con pollo, lechuga, tomate, palta y yogur, y enrollar.',
      insumos: { 'Tortilla integral': 1, 'Pechuga de pollo': 0.12, 'Lechuga romana': 0.04, 'Tomate': 0.05, 'Palta': 0.04, 'Yogur griego natural': 0.03 } },
  },
  {
    nombre: 'Trucha a la plancha con verduras', categoria: PLATOS, precio: 55, conservacion: 'Refrigerado', foto: 'trucha-a-la-plancha-con-verduras.jpg', stock: 8,
    descripcion: 'Trucha a la plancha con brócoli y zanahoria al vapor.',
    nutricion: [380, 35, 14, 20, 5],
    receta: { rendimiento: 1, minutos: 25, instrucciones: 'Cocinar la trucha a la plancha con limón. Cocer al vapor el brócoli y la zanahoria.',
      insumos: { 'Trucha': 0.25, 'Brócoli': 0.1, 'Zanahoria': 0.08, 'Limon': 0.02, 'Aceite de oliva': 0.01 } },
  },
  {
    nombre: 'Arroz integral con pollo y brócoli', categoria: PLATOS, precio: 40, conservacion: 'Refrigerado', foto: 'arroz-integral-con-pollo-y-brocoli.jpg', stock: 10,
    descripcion: 'Arroz integral, pechuga de pollo, brócoli y zanahoria.',
    nutricion: [480, 38, 52, 12, 6],
    receta: { rendimiento: 1, minutos: 35, instrucciones: 'Cocer el arroz integral. Saltear el pollo en cubos con brócoli y zanahoria, y mezclar.',
      insumos: { 'Arroz integral': 0.1, 'Pechuga de pollo': 0.15, 'Brócoli': 0.1, 'Zanahoria': 0.05, 'Aceite de oliva': 0.01 } },
  },
  {
    nombre: 'Tortilla de espinaca', categoria: PLATOS, precio: 28, conservacion: 'Refrigerado', foto: 'tortilla-de-espinaca.jpg', stock: 10,
    descripcion: 'Tres huevos, espinaca y queso fresco.',
    nutricion: [310, 22, 4, 23, 2],
    receta: { rendimiento: 1, minutos: 12, instrucciones: 'Batir los huevos, agregar espinaca picada y queso. Cocinar a fuego bajo por ambos lados.',
      insumos: { 'Huevo': 3, 'Espinaca': 0.06, 'Queso fresco': 0.04, 'Aceite de oliva': 0.008 } },
  },
  {
    nombre: 'Jugo verde detox', categoria: BEBIDAS, precio: 18, conservacion: 'Refrigerado', foto: 'jugo-verde-detox.jpg', stock: 15,
    descripcion: 'Espinaca, manzana verde, apio y jengibre, sin azucar anadida.',
    nutricion: [120, 2, 26, 0.5, 3.8],
    receta: { rendimiento: 1, minutos: 8, instrucciones: 'Licuar la espinaca, la manzana, el apio y el jengibre con agua fría y limón. Servir sin colar.',
      insumos: { 'Espinaca': 0.05, 'Manzana verde': 0.15, 'Apio': 0.05, 'Jengibre': 0.005, 'Limon': 0.02 } },
  },
  {
    nombre: 'Limonada con hierbabuena', categoria: BEBIDAS, precio: 15, conservacion: 'Refrigerado', foto: 'limonada-con-hierbabuena.jpg', stock: 16,
    descripcion: 'Limon exprimido, hierbabuena fresca y endulzante natural.',
    nutricion: [90, 0.4, 23, 0.2, 0.6],
    receta: { rendimiento: 2, minutos: 5, instrucciones: 'Exprimir los limones, licuar con agua fría, hierbabuena y miel. Sale una jarra de dos vasos.',
      insumos: { 'Limon': 0.2, 'Hierbabuena': 0.01, 'Miel de abeja': 0.02 } },
  },
  {
    nombre: 'Batido de frutilla y avena', categoria: BEBIDAS, precio: 16, conservacion: 'Refrigerado', foto: 'batido-de-frutilla-y-avena.jpg', stock: 12,
    descripcion: 'Frutilla fresca, leche descremada, avena y un toque de miel.',
    nutricion: [230, 8, 38, 4, 4.2],
    receta: { rendimiento: 1, minutos: 6, instrucciones: 'Licuar la frutilla con la leche, la avena y la miel.',
      insumos: { 'Frutilla': 0.12, 'Leche descremada': 0.25, 'Avena en hojuelas': 0.03, 'Miel de abeja': 0.01 } },
  },
  {
    nombre: 'Jugo de naranja natural', categoria: BEBIDAS, precio: 12, conservacion: 'Refrigerado', foto: 'jugo-de-naranja-natural.jpg', stock: 15,
    descripcion: 'Naranja exprimida al momento, sin azúcar.',
    nutricion: [110, 1.7, 26, 0.5, 0.5],
    receta: { rendimiento: 1, minutos: 5, instrucciones: 'Exprimir las naranjas y servir frío.', insumos: { 'Naranja': 0.5 } },
  },
  {
    nombre: 'Yogur bebible de frutilla', categoria: BEBIDAS, precio: 10, conservacion: 'Refrigerado', foto: 'yogur-bebible-de-frutilla.jpg', stock: 18,
    descripcion: 'Botella de 330 ml.', nutricion: [180, 7, 28, 4, 0], compra: 6,
  },
  {
    nombre: 'Agua natural', categoria: BEBIDAS, precio: 7, conservacion: 'Refrigerado', foto: 'agua-natural.jpg', stock: 24,
    descripcion: 'Botella de 900 ml.', nutricion: [0, 0, 0, 0, 0], compra: 3.5,
  },
  {
    nombre: 'Agua mineral con gas', categoria: BEBIDAS, precio: 8, conservacion: 'Seco', foto: 'agua-mineral-con-gas.jpg', stock: 24,
    descripcion: 'Botella de 500 ml.', nutricion: [0, 0, 0, 0, 0], compra: 4,
  },
  {
    nombre: 'Mousse de maracuya light', categoria: POSTRES, precio: 16, conservacion: 'Refrigerado', foto: 'mousse-de-maracuya-light.jpg', stock: 16,
    descripcion: 'Postre de maracuya con yogur griego, sin azucar anadida.',
    nutricion: [150, 5, 18, 6, 1.2],
    receta: { rendimiento: 4, minutos: 30, divisible: false, instrucciones: 'Hidratar la gelatina. Batir el yogur con la pulpa de maracuyá y la miel, integrar la gelatina y refrigerar dos horas en un molde de 4 porciones.',
      insumos: { 'Yogur griego natural': 0.5, 'Maracuyá': 0.3, 'Gelatina sin sabor': 0.015, 'Miel de abeja': 0.04 } },
  },
  {
    nombre: 'Barra de avena y almendras', categoria: POSTRES, precio: 12, conservacion: 'Seco', foto: 'barra-de-avena-y-almendras.jpg', stock: 24,
    descripcion: 'Barra horneada de avena, almendras y miel de abeja.',
    nutricion: [210, 6, 24, 10, 4.4],
    receta: { rendimiento: 12, minutos: 45, divisible: false, instrucciones: 'Mezclar avena, almendras y harina; agregar la miel tibia, prensar en una bandeja y hornear 25 minutos. Cortar 12 barras.',
      insumos: { 'Avena en hojuelas': 0.48, 'Almendras': 0.16, 'Harina integral': 0.12, 'Miel de abeja': 0.15 } },
  },
  {
    nombre: 'Galletas de avena sin azucar', categoria: POSTRES, precio: 14, conservacion: 'Seco', foto: 'galletas-de-avena-sin-azucar.jpg', stock: 20,
    descripcion: 'Galletas integrales endulzadas con pasas y canela.',
    nutricion: [180, 4, 26, 7, 3.1],
    receta: { rendimiento: 10, minutos: 40, divisible: false, instrucciones: 'Mezclar avena, harina, pasas y canela con el huevo y el aceite. Formar las galletas y hornear 15 minutos. Salen 10 bolsitas.',
      insumos: { 'Avena en hojuelas': 0.4, 'Harina integral': 0.15, 'Uva pasa': 0.125, 'Canela molida': 0.01, 'Huevo': 2, 'Aceite de oliva': 0.05 } },
  },
];

/** Nombre de la versión de receta que crea la poblada. */
export const NOMBRE_RECETA = 'Porción estándar';
