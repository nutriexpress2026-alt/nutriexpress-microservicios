# Crea en Enterprise Architect los diagramas del informe (1.8, 2.4, 2.5, 3.1.2, 3.1.7, 3.2.3, 3.3.3,
# 3.4.3 y 3.5.3) y exporta cada uno como PNG a docs/diagramasEA/imagenes.
#
# Uso (PowerShell, con EA instalado):
#   Invoke-Expression (Get-Content -Raw -Encoding UTF8 .\crear-diagramas.ps1)
# EA de 32 bits: desde la PowerShell de 32 bits (C:\Windows\SysWOW64\WindowsPowerShell\v1.0).
#
# OJO: vuelve a crear NutriExpress_Microservicios.eapx desde cero. Si ya se editaron diagramas a
# mano en EA, guardar una copia antes.

if ($PSScriptRoot) { $raiz = (Resolve-Path "$PSScriptRoot\..\..").Path }
else { $raiz = "C:\Users\nilser\Desktop\Universidad\Tecnologia web\Proyecto 2\nutriexpress-microservicios" }
$carpeta = Join-Path $raiz "docs\diagramasEA"
$imagenes = Join-Path $carpeta "imagenes"
$archivo = Join-Path $carpeta "NutriExpress_Microservicios.eapx"
New-Item -ItemType Directory -Force $imagenes | Out-Null
Remove-Item $archivo -ErrorAction SilentlyContinue

$r = New-Object -ComObject EA.Repository

function Nuevo($pkg, $nombre, $tipo, $subtipo = $null, $estereotipo = $null, $notas = $null) {
  $e = $pkg.Elements.AddNew($nombre, $tipo)
  if ($subtipo -ne $null) { $e.Subtype = $subtipo }
  if ($estereotipo) { $e.Stereotype = $estereotipo }
  if ($notas) { $e.Notes = $notas }
  $e.Update() | Out-Null
  return $e
}

function Poner($diag, $el, $l, $t, $w, $h) {
  $o = $diag.DiagramObjects.AddNew("l=$l;r=$($l + $w);t=$t;b=$($t + $h);", "")
  $o.ElementID = $el.ElementID
  $o.Update() | Out-Null
  return $o
}

function Unir($a, $b, $tipo = "ControlFlow", $nombre = "", $guarda = "", $direccion = $null, $estereotipo = $null) {
  $c = $a.Connectors.AddNew($nombre, $tipo)
  $c.SupplierID = $b.ElementID
  if ($guarda) { $c.TransitionGuard = $guarda }
  if ($direccion) { $c.Direction = $direccion }
  if ($estereotipo) { $c.Stereotype = $estereotipo }
  $c.Update() | Out-Null
  return $c
}

# Carriles verticales de 200 px (angostos para que la letra no se achique al entrar en la hoja);
# los nodos se centran en su carril.
$ANCHO = 200
$ACCION = 150
function Accion($pkg, $diag, $carril, $t, $nombre) {
  $e = Nuevo $pkg $nombre "Action"
  Poner $diag $e ($carril * $ANCHO + ($ANCHO - $ACCION) / 2) $t $ACCION 50 | Out-Null
  return $e
}
function Decision($pkg, $diag, $carril, $t, $nombre) {
  $e = Nuevo $pkg $nombre "Decision"
  Poner $diag $e ($carril * $ANCHO + $ANCHO / 2 - 20) $t 40 40 | Out-Null
  return $e
}
function Inicio($pkg, $diag, $carril, $t) {
  $e = Nuevo $pkg "Inicio" "StateNode" 100
  Poner $diag $e ($carril * $ANCHO + $ANCHO / 2 - 12) $t 24 24 | Out-Null
  return $e
}
function Fin($pkg, $diag, $carril, $t) {
  $e = Nuevo $pkg "Fin" "StateNode" 101
  Poner $diag $e ($carril * $ANCHO + $ANCHO / 2 - 12) $t 24 24 | Out-Null
  return $e
}
function SinCompartimentos($diag) {
  $estilo = $diag.ExtendedStyle -replace 'HideAtts=\d;', '' -replace 'HideOps=\d;', ''
  $diag.ExtendedStyle = $estilo + "HideAtts=1;HideOps=1;"
  $diag.Update() | Out-Null
}
function Caja($pkg, $diag, $nombre, $l, $t, $w, $h, $estereotipo = $null) {
  $e = Nuevo $pkg $nombre "Class" -estereotipo $estereotipo
  Poner $diag $e $l $t $w $h | Out-Null
  return $e
}
function Linea($a, $b) {
  $c = $a.Connectors.AddNew("", "Association")
  $c.SupplierID = $b.ElementID
  $c.Direction = "Unspecified"
  $c.Update() | Out-Null
}

function Carriles($diag, $nombres) {
  $diag.SwimlaneDef.Orientation = 0
  foreach ($n in $nombres) { $diag.SwimlaneDef.Swimlanes.Add($n, $ANCHO) | Out-Null }
  $diag.Update() | Out-Null
}

try {
  if (-not $r.CreateModel(0, $archivo, 0)) { throw "No se pudo crear $archivo" }
  if (-not $r.OpenFile($archivo)) { throw "No se pudo abrir $archivo" }
  $modelo = $r.Models.GetAt(0)
  $modelo.Name = "NutriExpress Microservicios"; $modelo.Update() | Out-Null
  $sprint0 = $modelo.Packages.AddNew("Sprint 0", ""); $sprint0.Update() | Out-Null
  $negocio = $sprint0.Packages.AddNew("3.1.2 Modelo de negocio", ""); $negocio.Update() | Out-Null
  $arq = $sprint0.Packages.AddNew("3.1.7 Arquitectura", ""); $arq.Update() | Out-Null
  $diagramas = @()

  # ============================================================ Capitulos 1 y 2
  $cap1 = $modelo.Packages.AddNew("Capítulo 1", ""); $cap1.Update() | Out-Null
  $cap2 = $modelo.Packages.AddNew("Capítulo 2", ""); $cap2.Update() | Out-Null

  # ------------------------------------------------------------ 1.8 Alcance: microservicios y funciones
  $p = $cap1.Packages.AddNew("1.8 Alcance", ""); $p.Update() | Out-Null
  $d = $p.Diagrams.AddNew("Microservicios y funciones del sistema", "Component"); $d.Update() | Out-Null
  SinCompartimentos $d
  # El sistema es un marco que contiene a los microservicios (sin lineas que crucen las cajas).
  $raizSis = Nuevo $p "Sistema NutriExpress" "Component" -estereotipo "sistema de microservicios"
  $marcoSis = Poner $d $raizSis 5 20 885 450  # con l=0 EA ignora la posicion y lo deja chico
  $marcoSis.Sequence = 100; $marcoSis.Update() | Out-Null
  $alcance = @(
    @("ms-identidad", "PostgreSQL + Redis", @("Iniciar sesión", "Registrar cliente", "Gestionar usuarios", "Roles y permisos", "Recuperar contraseña", "Perfil propio")),
    @("ms-catalogo", "PostgreSQL + Redis", @("Gestionar productos", "Gestionar recetas", "Órdenes de producción", "Catálogo y búsqueda")),
    @("ms-inventario", "PostgreSQL", @("Gestionar insumos", "Gestionar almacenes", "Notas de ingreso", "Notas de egreso", "Stock y alertas", "Reservar stock")),
    @("ms-ventas", "PostgreSQL", @("Venta de mostrador", "Comprobante y anulación", "Gestionar clientes")),
    @("ms-pedidos", "PostgreSQL", @("Carrito y pedido", "Direcciones en mapa", "Tablero de pedidos", "Entregas del repartidor", "Seguimiento en vivo")),
    @("ms-pagos", "PostgreSQL", @("Pago con QR o tarjeta", "Modo de cobro")),
    @("ms-reportes", "MongoDB", @("Reporte de ventas", "Reporte de pedidos", "Reporte de producción", "Reporte de inventario", "PDF por correo", "Contador de visitas"))
  )
  $x = 15
  foreach ($s in $alcance) {
    $funciones = $s[2]
    $alto = 50 + $funciones.Count * 50 + 6
    $ms = Nuevo $p $s[0] "Component" -estereotipo "microservicio"
    $marco = Poner $d $ms $x 90 115 $alto
    $marco.Sequence = 50; $marco.Update() | Out-Null
    $y = 90 + 50
    foreach ($f in $funciones) {
      $e = Nuevo $p $f "Class"
      $o = Poner $d $e ($x + 8) $y 99 42
      $o.Sequence = 1; $o.Update() | Out-Null
      $y += 50
    }
    $x += 125
  }
  $diagramas += ,@($d, "1.8-alcance-microservicios.png")

  # ------------------------------------------------------------ 2.4 Ciclo de trabajo diario
  $p = $cap2.Packages.AddNew("2.4 Metodología de trabajo", ""); $p.Update() | Out-Null
  $d = $p.Diagrams.AddNew("Ciclo de trabajo diario", "Activity"); $d.Update() | Out-Null
  $ANCHO = 160; $ACCION = 130
  Carriles $d @("Almacenero", "Cocinero", "Vendedor", "Repartidor", "Administrador")
  $i = Inicio $p $d 0 50
  $a1 = Accion $p $d 0 100 "Compra los insumos"
  $a2 = Accion $p $d 0 180 "Guarda los insumos en el almacén"
  $a3 = Accion $p $d 1 180 "Elabora los productos según la receta"
  $k1 = Decision $p $d 2 185 "¿Canal de venta?"
  $a4 = Accion $p $d 2 270 "Atiende y cobra en el mostrador"
  $a5 = Accion $p $d 3 180 "Entrega el pedido y cobra"
  $a6 = Accion $p $d 4 360 "Revisa ventas, pedidos y stock"
  $k2 = Decision $p $d 4 450 "¿Faltan insumos?"
  $a7 = Accion $p $d 0 445 "Registra los insumos por reponer"
  $f1 = Fin $p $d 0 540
  $f2 = Fin $p $d 4 540
  Unir $i $a1 | Out-Null; Unir $a1 $a2 | Out-Null; Unir $a2 $a3 | Out-Null; Unir $a3 $k1 | Out-Null
  Unir $k1 $a4 -guarda "En el local" | Out-Null
  Unir $k1 $a5 -guarda "A domicilio" | Out-Null
  Unir $a4 $a6 | Out-Null; Unir $a5 $a6 | Out-Null; Unir $a6 $k2 | Out-Null
  Unir $k2 $a7 -guarda "Sí" | Out-Null
  Unir $k2 $f2 -guarda "No" | Out-Null
  Unir $a7 $f1 | Out-Null
  $nota = Nuevo $p "" "Note" -notas "El ciclo se repite cada jornada: los insumos por reponer son la compra del día siguiente."
  Poner $d $nota 180 590 300 45 | Out-Null
  $ANCHO = 200; $ACCION = 150
  $diagramas += ,@($d, "2.4-ciclo-de-trabajo.png")

  # ------------------------------------------------------------ 2.5 Estructura organizacional
  $p = $cap2.Packages.AddNew("2.5 Estructura organizacional", ""); $p.Update() | Out-Null
  $d = $p.Diagrams.AddNew("Organigrama de NutriExpress", "Logical"); $d.Update() | Out-Null
  SinCompartimentos $d
  $jefe = Caja $p $d "Propietario / Administrador (1)" 290 30 220 50
  $columnas = @(
    @("Área de ventas", "Vendedores (2)"),
    @("Área de cocina", "Cocineros (2)"),
    @("Área de almacén", "Almacenero (1)"),
    @("Área de reparto", "Repartidores (2)")
  )
  $x = 10
  foreach ($c in $columnas) {
    $area = Caja $p $d $c[0] $x 150 170 45
    $cargo = Caja $p $d $c[1] $x 250 170 45
    Linea $jefe $area
    Linea $area $cargo
    $x += 200
  }
  $diagramas += ,@($d, "2.5-organigrama.png")

  # ------------------------------------------------------------ Pedido a domicilio
  # Cuando una decision manda a otro carril, el destino queda a la misma altura: la flecha
  # sale horizontal y no cruza ninguna caja (EA ignora los codos creados por automatizacion).
  $p = $negocio.Packages.AddNew("Pedido a domicilio", ""); $p.Update() | Out-Null
  $d = $p.Diagrams.AddNew("Pedido a domicilio", "Activity"); $d.Update() | Out-Null
  Carriles $d @("Cliente", "Sistema", "Vendedor", "Repartidor")
  $i = Inicio $p $d 0 50
  $a1 = Accion $p $d 0 100 "Busca productos en el catálogo"
  $a2 = Accion $p $d 0 180 "Agrega productos al carrito"
  $a3 = Accion $p $d 0 260 "Indica la ubicación de entrega"
  $a4 = Accion $p $d 0 340 "Elige la forma de pago"
  $a5 = Accion $p $d 1 340 "Verifica y reserva el stock"
  $k1 = Decision $p $d 1 430 "¿Pago en línea?"
  $a6 = Accion $p $d 0 425 "Paga con QR o tarjeta"
  $k2 = Decision $p $d 1 520 "¿Pago confirmado?"
  $a7 = Accion $p $d 1 600 "Cancela el pedido y libera el stock"
  $f1 = Fin $p $d 1 690
  $a8 = Accion $p $d 2 515 "Prepara el pedido"
  $a9 = Accion $p $d 2 600 "Asigna el repartidor"
  $a10 = Accion $p $d 3 680 "Entrega el pedido y cobra si es en efectivo"
  $a11 = Accion $p $d 0 760 "Recibe el pedido"
  $f2 = Fin $p $d 0 850
  Unir $i $a1 | Out-Null; Unir $a1 $a2 | Out-Null; Unir $a2 $a3 | Out-Null; Unir $a3 $a4 | Out-Null
  Unir $a4 $a5 | Out-Null; Unir $a5 $k1 | Out-Null
  Unir $k1 $a6 -guarda "Sí" | Out-Null
  Unir $k1 $a8 -guarda "No, en efectivo" | Out-Null
  Unir $a6 $k2 | Out-Null
  Unir $k2 $a8 -guarda "Sí" | Out-Null
  Unir $k2 $a7 -guarda "No o vence" | Out-Null
  Unir $a7 $f1 | Out-Null
  Unir $a8 $a9 | Out-Null; Unir $a9 $a10 | Out-Null; Unir $a10 $a11 | Out-Null; Unir $a11 $f2 | Out-Null
  $diagramas += ,@($d, "3.1.2-pedido-a-domicilio.png")

  # ------------------------------------------------------------ Venta en el local
  $p = $negocio.Packages.AddNew("Venta en el local", ""); $p.Update() | Out-Null
  $d = $p.Diagrams.AddNew("Venta en el local", "Activity"); $d.Update() | Out-Null
  Carriles $d @("Vendedor", "Sistema", "Cocinero")
  $i = Inicio $p $d 0 50
  $a1 = Accion $p $d 0 100 "Registra los productos del cliente"
  $k1 = Decision $p $d 1 105 "¿Hay stock?"
  $a2 = Accion $p $d 2 100 "Elabora el producto según la receta"
  $a3 = Accion $p $d 0 230 "Cobra en efectivo o QR"
  $a4 = Accion $p $d 1 330 "Descuenta el stock y emite el comprobante"
  $a5 = Accion $p $d 0 430 "Entrega el pedido al cliente"
  $f = Fin $p $d 0 520
  Unir $i $a1 | Out-Null; Unir $a1 $k1 | Out-Null
  Unir $k1 $a2 -guarda "No" | Out-Null
  Unir $k1 $a3 -guarda "Sí" | Out-Null
  Unir $a2 $a3 | Out-Null; Unir $a3 $a4 | Out-Null; Unir $a4 $a5 | Out-Null; Unir $a5 $f | Out-Null
  $diagramas += ,@($d, "3.1.2-venta-en-el-local.png")

  # ------------------------------------------------------------ Produccion e inventario
  $p = $negocio.Packages.AddNew("Producción e inventario", ""); $p.Update() | Out-Null
  $d = $p.Diagrams.AddNew("Producción e inventario", "Activity"); $d.Update() | Out-Null
  Carriles $d @("Almacenero", "Cocinero", "Sistema")
  $i = Inicio $p $d 0 50
  $a1 = Accion $p $d 0 100 "Registra la compra de insumos"
  $a2 = Accion $p $d 1 180 "Crea la orden de producción"
  $k1 = Decision $p $d 2 280 "¿Alcanzan los insumos?"
  $a3 = Accion $p $d 0 275 "Compra los insumos que faltan"
  $a4 = Accion $p $d 1 360 "Elabora según la receta"
  $a5 = Accion $p $d 2 440 "Descuenta los insumos y suma el producto al stock"
  $k2 = Decision $p $d 2 520 "¿Insumo bajo el mínimo?"
  $a6 = Accion $p $d 0 515 "Recibe la alerta de reposición"
  $f = Fin $p $d 2 620
  Unir $i $a1 | Out-Null; Unir $a1 $a2 | Out-Null; Unir $a2 $k1 | Out-Null
  Unir $k1 $a3 -guarda "No" | Out-Null
  Unir $a3 $a2 | Out-Null
  Unir $k1 $a4 -guarda "Sí" | Out-Null
  Unir $a4 $a5 | Out-Null; Unir $a5 $k2 | Out-Null
  Unir $k2 $a6 -guarda "Sí" | Out-Null
  Unir $k2 $f -guarda "No" | Out-Null
  Unir $a6 $f | Out-Null
  $diagramas += ,@($d, "3.1.2-produccion-e-inventario.png")

  # ------------------------------------------------------------ C4 nivel 1: contexto
  $p = $arq.Packages.AddNew("C4 Nivel 1 - Contexto", ""); $p.Update() | Out-Null
  $d = $p.Diagrams.AddNew("C4 Nivel 1 - Contexto", "Component"); $d.Update() | Out-Null
  $cli = Nuevo $p "Cliente" "Actor" -notas "Pide comida a domicilio desde el portal."
  $emp = Nuevo $p "Empleado" "Actor" -notas "Vende, cocina, almacena y reparte según su cargo."
  $adm = Nuevo $p "Administrador" "Actor" -notas "Gestiona el sistema y analiza los reportes."
  $sis = Nuevo $p "Sistema NutriExpress" "Component" -estereotipo "sistema"
  $lib = Nuevo $p "Libélula" "Component" -estereotipo "sistema externo" -notas "Pasarela de pagos."
  $cor = Nuevo $p "Servidor de correo (Brevo / SMTP)" "Component" -estereotipo "sistema externo"
  $osm = Nuevo $p "OpenStreetMap" "Component" -estereotipo "sistema externo" -notas "Mapas."
  Poner $d $cli 115 40 50 90 | Out-Null
  Poner $d $emp 375 40 50 90 | Out-Null
  Poner $d $adm 635 40 50 90 | Out-Null
  Poner $d $sis 290 230 220 90 | Out-Null
  Poner $d $lib 40 430 200 70 | Out-Null
  Poner $d $cor 300 430 200 70 | Out-Null
  Poner $d $osm 560 430 200 70 | Out-Null
  Unir $cli $sis "Dependency" "pide y paga pedidos" | Out-Null
  Unir $emp $sis "Dependency" "vende, cocina, almacena, reparte" | Out-Null
  Unir $adm $sis "Dependency" "gestiona y analiza" | Out-Null
  Unir $sis $lib "Dependency" "cobra en línea" | Out-Null
  Unir $sis $cor "Dependency" "envía correos y reportes" | Out-Null
  Unir $sis $osm "Dependency" "muestra mapas" | Out-Null
  $diagramas += ,@($d, "3.1.7-c4-nivel-1-contexto.png")

  # ------------------------------------------------------------ C4 nivel 2: contenedores
  $p = $arq.Packages.AddNew("C4 Nivel 2 - Contenedores", ""); $p.Update() | Out-Null
  $d = $p.Diagrams.AddNew("C4 Nivel 2 - Contenedores", "Component"); $d.Update() | Out-Null
  $usr = Nuevo $p "Usuario (navegador)" "Actor"
  $web = Nuevo $p "Frontend Next.js" "Component" -estereotipo "contenedor web"
  $gw = Nuevo $p "API Gateway (Nginx)" "Component" -estereotipo "puerta de entrada"
  $mq = Nuevo $p "RabbitMQ" "Component" -estereotipo "broker de eventos"
  Poner $d $usr 395 20 50 90 | Out-Null
  Poner $d $web 320 150 200 60 | Out-Null
  Poner $d $gw 320 260 200 60 | Out-Null
  Poner $d $mq 620 260 190 60 | Out-Null
  Unir $usr $web "Dependency" "usa (HTTPS)" | Out-Null
  Unir $web $gw "Dependency" "REST / JSON" | Out-Null
  $servicios = @(
    @("ms-identidad", "identidad_db", "PostgreSQL + Redis"),
    @("ms-catalogo", "catalogo_db", "PostgreSQL + Redis"),
    @("ms-inventario", "inventario_db", "PostgreSQL"),
    @("ms-ventas", "ventas_db", "PostgreSQL"),
    @("ms-pedidos", "pedidos_db", "PostgreSQL"),
    @("ms-pagos", "pagos_db", "PostgreSQL"),
    @("ms-reportes", "reportes", "MongoDB")
  )
  $x = 20
  $ms = @{}
  foreach ($s in $servicios) {
    $e = Nuevo $p $s[0] "Component" -estereotipo "microservicio"
    # El gestor va en el nombre: como estereotipo no entraba en la caja («Postgre...»).
    $b = Nuevo $p "$($s[1]) ($($s[2]))" "Artifact"
    Poner $d $e $x 420 110 60 | Out-Null
    Poner $d $b $x 560 110 60 | Out-Null
    Unir $gw $e "Dependency" | Out-Null
    Unir $e $b "Dependency" | Out-Null
    $ms[$s[0]] = $e
    $x += 120
  }
  # Sprint 3: identidad publica (PermisosCambiados, CodigoRecuperacionGenerado) y catálogo también
  # consume (InsumoGuardado, ProduccionRegistrada, PermisosCambiados).
  foreach ($n in @("ms-identidad", "ms-ventas", "ms-pagos")) { Unir $ms[$n] $mq "Dependency" | Out-Null }
  foreach ($n in @("ms-catalogo", "ms-inventario", "ms-pedidos")) { Unir $ms[$n] $mq "Dependency" -direccion "Bi-Directional" | Out-Null }
  Unir $mq $ms["ms-reportes"] "Dependency" | Out-Null
  $nota = Nuevo $p "" "Note" -notas ("Líneas hacia RabbitMQ: eventos asíncronos. Publican identidad, ventas y pagos; " +
    "catálogo, inventario y pedidos publican y consumen; reportes solo consume. Cada microservicio tiene su propia " +
    "base de datos; Redis complementa a identidad y catálogo.")
  Poner $d $nota 560 20 300 115 | Out-Null
  $diagramas += ,@($d, "3.1.7-c4-nivel-2-contenedores.png")

  # ------------------------------------------------------------ Saga del pedido (secuencia)
  $p = $arq.Packages.AddNew("Saga del pedido a domicilio", ""); $p.Update() | Out-Null
  $d = $p.Diagrams.AddNew("Saga del pedido a domicilio", "Sequence"); $d.Update() | Out-Null
  $vidas = @(
    @("Cliente", "Actor"), @("ms-pedidos", "Sequence"), @("ms-inventario", "Sequence"),
    @("ms-pagos", "Sequence"), @("ms-reportes", "Sequence")
  )
  $L = @{}
  $x = 40
  foreach ($v in $vidas) {
    $e = Nuevo $p $v[0] $v[1]
    Poner $d $e $x 40 110 760 | Out-Null
    $L[$v[0]] = $e
    $x += 160
  }
  $mensajes = @(
    # llamada REST = sincrona; evento = senal asincrona; accion interna = senal; respuesta = retorno
    @("Cliente", "ms-pedidos", "confirmarPedido(carrito, ubicación)", "llamada"),
    @("ms-pedidos", "ms-pedidos", "cambiarEstado(Pendiente)", "interna"),
    @("ms-pedidos", "ms-inventario", "PedidoCreado(idPedido, ítems)", "evento"),
    @("ms-inventario", "ms-inventario", "reservarStock(ítems)", "interna"),
    @("ms-inventario", "ms-pedidos", "StockReservado(idPedido)", "evento"),
    @("ms-pedidos", "ms-pagos", "crearCobro(idPedido, monto) [REST]", "llamada"),
    @("ms-pagos", "Cliente", "datosDeCobro(QR o página de pago)", "retorno"),
    @("ms-pagos", "ms-pedidos", "PagoConfirmado(idPedido)", "evento"),
    @("ms-pedidos", "ms-pedidos", "cambiarEstado(Recibido)", "interna"),
    @("ms-pedidos", "ms-reportes", "PedidoEstadoCambiado(idPedido, Recibido)", "evento"),
    @("ms-pagos", "ms-pedidos", "PagoFallido(idPedido)", "evento"),
    @("ms-pedidos", "ms-pedidos", "cambiarEstado(Cancelado, Sin pago)", "interna"),
    @("ms-pedidos", "ms-inventario", "PedidoCancelado(idPedido, ítems)", "evento"),
    @("ms-inventario", "ms-inventario", "liberarReserva(idPedido)", "interna")
  )
  $n = 1
  foreach ($m in $mensajes) {
    $c = $L[$m[0]].Connectors.AddNew($m[2], "Sequence")
    $c.SupplierID = $L[$m[1]].ElementID
    $c.SequenceNo = $n
    $c.Update() | Out-Null
    $tipo = $m[3]
    if ($tipo -ne "llamada") { $c.Properties.Item("Kind").Value = "Signal" }
    $c.Properties.Item("IsAsync").Value = ($tipo -eq "evento")
    $c.Properties.Item("IsReturn").Value = ($tipo -eq "retorno")
    $c.Update() | Out-Null
    $n++
  }
  $alt = Nuevo $p "" "InteractionFragment" 0
  $op1 = $alt.Partitions.AddNew("pago confirmado", "")
  $op1.Size = 105
  $op2 = $alt.Partitions.AddNew("pago vencido o fallido", "")
  $alt.Update() | Out-Null
  Poner $d $alt 20 359 790 268 | Out-Null
  $nota = Nuevo $p "" "Note" -notas ("liberarReserva es la compensación de la saga: deshace la reserva de stock " +
    "porque el pago no se completó. Flechas abiertas: eventos asíncronos por RabbitMQ; flechas llenas: llamadas REST.")
  Poner $d $nota 180 650 420 60 | Out-Null
  $diagramas += ,@($d, "3.1.7-saga-del-pedido.png")


  # ============================================================ Sprint 1
  $sprint1 = $modelo.Packages.AddNew("Sprint 1", ""); $sprint1.Update() | Out-Null
  $p = $sprint1.Packages.AddNew("3.2.3 Clases de ms-identidad", ""); $p.Update() | Out-Null
  $d = $p.Diagrams.AddNew("Clases de ms-identidad", "Logical"); $d.Update() | Out-Null

  function Clase($nombre, $atributos, $l, $t, $w) {
    $e = $p.Elements.AddNew($nombre, "Class"); $e.Update() | Out-Null
    foreach ($a in $atributos) {
      $partes = $a.Split(':')
      $at = $e.Attributes.AddNew($partes[0].Trim(), $partes[1].Trim())
      $at.Visibility = "Private"
      $at.Update() | Out-Null
    }
    $e.Attributes.Refresh()
    $h = 32 + 15 * $atributos.Count
    Poner $d $e $l $t $w $h | Out-Null
    return $e
  }
  function Asociar($a, $b, $cardA, $cardB, $nombre = "") {
    $c = $a.Connectors.AddNew($nombre, "Association")
    $c.SupplierID = $b.ElementID
    $c.ClientEnd.Cardinality = $cardA
    $c.SupplierEnd.Cardinality = $cardB
    $c.Update() | Out-Null
  }

  $usuario = Clase "Usuario" @("idUsuario: int", "nombre: string", "apellido: string", "email: string", "telefono: string",
    "nombreUsuario: string", "contrasenaHash: string", "intentosFallidos: int", "bloqueado: bool", "fechaBloqueo: datetime",
    "vecesBloqueado: int", "activo: bool", "fechaRegistro: datetime", "ultimoAcceso: datetime") 300 40 190
  $rol = Clase "Rol" @("idRol: int", "nombre: string") 600 40 150
  $permiso = Clase "Permiso" @("idPermiso: int", "nombre: string") 880 40 150
  $rolPermiso = Clase "RolPermiso" @("idRolPermiso: int") 740 180 150
  $urp = Clase "UsuarioRolPermiso" @("idUsuarioRolPermiso: int") 560 300 170
  $empleado = Clase "Empleado" @("fechaIngreso: date", "disponible: bool") 200 360 160
  $cliente = Clase "Cliente" @("preferenciaAlimentaria: string", "restriccionDietetica: string") 390 360 200
  $cargo = Clase "Cargo" @("idCargo: int", "nombre: string", "salarioBase: decimal") 20 360 150
  $recup = Clase "RecuperacionContrasena" @("idRecuperacion: int", "codigoHash: string", "creadoEn: datetime",
    "expiraEn: datetime", "intentos: int", "usadoEn: datetime") 20 40 200

  foreach ($sub in @($empleado, $cliente)) {
    $g = $sub.Connectors.AddNew("", "Generalization"); $g.SupplierID = $usuario.ElementID; $g.Update() | Out-Null
  }
  Asociar $usuario $rol "0..*" "1" "tiene"
  Asociar $rolPermiso $rol "0..*" "1"
  Asociar $rolPermiso $permiso "0..*" "1"
  Asociar $urp $usuario "0..*" "1"
  Asociar $urp $rolPermiso "0..*" "1"
  Asociar $empleado $cargo "0..*" "1" "ocupa"
  Asociar $recup $usuario "0..*" "1" "solicita"
  $nota = Nuevo $p "" "Note" -notas ("Base identidad_db (PostgreSQL). Un usuario es Empleado o Cliente (subtipos). " +
    "Sus permisos son los de su rol que se le habilitaron (UsuarioRolPermiso); viajan en el token RS256.")
  Poner $d $nota 760 360 260 80 | Out-Null
  $diagramas += ,@($d, "3.2.3-clases-ms-identidad.png")

  # ============================================================ Sprint 2
  $sprint2 = $modelo.Packages.AddNew("Sprint 2", ""); $sprint2.Update() | Out-Null
  function Replica($e) { $e.Stereotype = "réplica"; $e.Update() | Out-Null }

  # --- 3.3.3 ms-catalogo
  $p = $sprint2.Packages.AddNew("3.3.3 Clases de ms-catalogo", ""); $p.Update() | Out-Null
  $d = $p.Diagrams.AddNew("Clases de ms-catalogo", "Logical"); $d.Update() | Out-Null
  $categoria = Clase "Categoria" @("idCategoria: int", "nombre: string") 20 40 150
  $producto = Clase "Producto" @("idProducto: int", "nombre: string", "descripcion: string", "precioVenta: decimal",
    "activo: bool", "tipoConservacion: string", "imagen: bytes", "imagenTipo: string", "imagenActualizadaEn: datetime") 250 40 210
  $nutricion = Clase "ValorNutricional" @("calorias: int", "proteinasG: decimal", "carbohidratosG: decimal",
    "grasasG: decimal", "fibraG: decimal") 540 40 190
  $config = Clase "Configuracion" @("clave: string", "valor: string", "descripcion: string", "actualizadoEn: datetime",
    "idUsuario: int") 250 260 210
  Asociar $producto $categoria "0..*" "1" "pertenece a"
  Asociar $nutricion $producto "0..1" "1" "describe"
  $nota = Nuevo $p "" "Note" -notas ("Base catalogo_db (PostgreSQL). Configuracion guarda la información del negocio " +
    "(horario, contacto). El stock no está aquí: se lo pide a ms-inventario por REST interno, y cada alta o cambio " +
    "de producto se le avisa para que actualice su réplica.")
  Poner $d $nota 540 220 260 100 | Out-Null
  $diagramas += ,@($d, "3.3.3-clases-ms-catalogo.png")

  # --- 3.3.3 ms-inventario
  $p = $sprint2.Packages.AddNew("3.3.3 Clases de ms-inventario", ""); $p.Update() | Out-Null
  $d = $p.Diagrams.AddNew("Clases de ms-inventario", "Logical"); $d.Update() | Out-Null
  $unidad = Clase "UnidadMedida" @("idUnidad: int", "nombre: string", "abreviatura: string") 20 20 160
  $insumo = Clase "Ingrediente" @("idIngrediente: int", "nombre: string", "stockMinimo: decimal", "costoUnitario: decimal",
    "activo: bool", "tipoConservacion: string", "controlaVencimiento: bool") 230 20 190
  $insumoAlm = Clase "IngredienteAlmacen" @("stockActual: decimal") 470 20 170
  $almacen = Clase "Almacen" @("idAlmacen: int", "nombre: string", "tipoConservacion: string", "ubicacionFisica: string",
    "preferido: bool") 690 20 180
  $prodAlm = Clase "ProductoAlmacen" @("stockActual: int") 960 20 160
  $prodRep = Clase "Producto" @("idProducto: int", "nombre: string", "tipoConservacion: string", "activo: bool") 1250 400 170
  Replica $prodRep
  $lote = Clase "Lote" @("idLote: int", "codigo: string", "fechaVencimiento: date", "fechaRegistro: datetime") 20 240 170
  $loteAlm = Clase "LoteAlmacen" @("stockActual: decimal") 20 420 170
  $detIngIns = Clase "DetalleIngresoInsumo" @("cantidad: decimal", "costoUnitario: decimal") 240 260 190
  $ingreso = Clase "NotaIngreso" @("idNotaIngreso: int", "fecha: datetime", "motivo: string", "proveedor: string",
    "numeroDocumento: string", "total: decimal") 500 260 190
  $detIngProd = Clase "DetalleIngresoProducto" @("cantidad: int", "costoUnitario: decimal") 1000 260 190
  $empRep = Clase "Empleado" @("idEmpleado: int", "nombre: string", "apellido: string") 760 420 170
  Replica $empRep
  $detEgrIns = Clase "DetalleEgresoInsumo" @("cantidad: decimal") 240 560 190
  $egreso = Clase "NotaEgreso" @("idNotaEgreso: int", "fecha: datetime", "motivo: string", "observacion: string") 500 560 190
  $detEgrProd = Clase "DetalleEgresoProducto" @("cantidad: int") 1000 560 190

  Asociar $insumo $unidad "0..*" "1" "se mide en"
  Asociar $insumoAlm $insumo "0..*" "1"
  Asociar $insumoAlm $almacen "0..*" "1"
  Asociar $prodAlm $almacen "0..*" "1"
  Asociar $prodAlm $prodRep "0..*" "1"
  Asociar $lote $insumo "0..*" "1" "de"
  Asociar $loteAlm $lote "0..*" "1"
  Asociar $detIngIns $ingreso "1..*" "1"
  Asociar $detIngIns $insumo "0..*" "1"
  Asociar $detIngIns $lote "0..1" "0..1" "abre"
  Asociar $detIngProd $ingreso "0..*" "1"
  Asociar $detIngProd $prodRep "0..*" "1"
  Asociar $detEgrIns $egreso "0..*" "1"
  Asociar $detEgrIns $insumo "0..*" "1"
  Asociar $detEgrProd $egreso "0..*" "1"
  Asociar $detEgrProd $prodRep "0..*" "1"
  Asociar $ingreso $empRep "0..*" "1" "registra"
  Asociar $egreso $empRep "0..*" "1" "registra"
  Asociar $egreso $ingreso "0..*" "0..1" "devuelve de"
  $nota = Nuevo $p "" "Note" -notas ("Base inventario_db (PostgreSQL). «réplica»: copia local con lo mínimo que este " +
    "servicio necesita (RNF-ARQ-02). Producto la mantiene ms-catalogo; Empleado sale del token de quien registra. " +
    "Un perecedero entra por lotes con vencimiento; la reposición indica su devolución y la devolución su compra.")
  Poner $d $nota 20 700 680 60 | Out-Null
  $diagramas += ,@($d, "3.3.3-clases-ms-inventario.png")

  # ============================================================ Sprint 3
  $sprint3 = $modelo.Packages.AddNew("Sprint 3", ""); $sprint3.Update() | Out-Null

  # --- 3.4.3 ms-catalogo: recetas y órdenes de producción (solo lo nuevo; el resto está en 3.3.3)
  $p = $sprint3.Packages.AddNew("3.4.3 Clases de ms-catalogo", ""); $p.Update() | Out-Null
  $d = $p.Diagrams.AddNew("Clases de ms-catalogo (Sprint 3)", "Logical"); $d.Update() | Out-Null
  $producto = Clase "Producto" @("idProducto: int", "nombre: string", "activo: bool", "tipoConservacion: string") 20 40 180
  $receta = Clase "Receta" @("idReceta: int", "nombre: string", "rendimiento: int", "tiempoPreparacionMinutos: int",
    "instrucciones: string", "divisible: bool", "activa: bool", "creadaEn: datetime") 280 40 230
  $detReceta = Clase "DetalleReceta" @("cantidadRequerida: decimal") 590 70 190
  $insumoRep = Clase "Insumo" @("idIngrediente: int", "nombre: string", "unidad: string", "costoUnitario: decimal",
    "activo: bool") 860 40 180
  Replica $insumoRep
  $orden = Clase "OrdenProduccion" @("idOrdenProduccion: int", "fecha: datetime", "estado: string", "cantidad: int",
    "idEmpleado: int", "empleadoNombre: string", "fechaFinalizacion: datetime", "cantidadObtenida: int",
    "costoTotal: decimal", "idAlmacenDestino: int", "almacenDestino: string", "idNotaEgreso: int",
    "idNotaIngreso: int") 280 280 230
  $detOrden = Clase "DetalleOrdenInsumo" @("idIngrediente: int", "nombre: string", "unidad: string",
    "cantidad: decimal", "costoUnitario: decimal") 590 300 190
  $eventoCat = Clase "EventoProcesado" @("idEvento: uuid", "tipo: string", "procesadoEn: datetime") 860 280 180
  $sesionCat = Clase "SesionVigente" @("clave: string", "desde: datetime") 860 420 180
  Asociar $receta $producto "0..*" "1" "versión de"
  Asociar $detReceta $receta "1..*" "1"
  Asociar $detReceta $insumoRep "0..*" "1"
  Asociar $orden $receta "0..*" "1" "se produce con"
  Asociar $detOrden $orden "0..*" "1" "consumió"
  $nota = Nuevo $p "" "Note" -notas ("Base catalogo_db (PostgreSQL), tablas del Sprint 3; Producto resumido (completo en " +
    "3.3.3). Una sola receta activa por producto. Insumo «réplica»: la mantiene ms-inventario con InsumoGuardado e " +
    "InsumoEliminado. DetalleOrdenInsumo guarda lo consumido al finalizar: cambiar la receta después no cambia la " +
    "orden. Las notas de egreso e ingreso llegan de ms-inventario con ProduccionRegistrada. EventoProcesado: los " +
    "eventos ya atendidos (RNF-DIS-03); SesionVigente: desde cuándo valen los tokens tras un cambio de permisos (HU-05).")
  Poner $d $nota 20 560 1020 60 | Out-Null
  $diagramas += ,@($d, "3.4.3-clases-ms-catalogo.png")

  # --- 3.4.3 ms-inventario: reservas de stock
  $p = $sprint3.Packages.AddNew("3.4.3 Clases de ms-inventario", ""); $p.Update() | Out-Null
  $d = $p.Diagrams.AddNew("Clases de ms-inventario (Sprint 3)", "Logical"); $d.Update() | Out-Null
  $ingr = Clase "Ingrediente" @("idIngrediente: int", "nombre: string", "costoUnitario: decimal", "activo: bool") 20 40 180
  $reserva = Clase "Reserva" @("idReserva: string", "origen: string", "estado: string", "creadaEn: datetime",
    "cerradaEn: datetime") 300 40 190
  $almRes = Clase "Almacen" @("idAlmacen: int", "nombre: string", "tipoConservacion: string", "preferido: bool") 600 40 190
  $detResIns = Clase "DetalleReservaInsumo" @("cantidad: decimal") 20 250 200
  $detResProd = Clase "DetalleReservaProducto" @("cantidad: int") 300 250 200
  $prodRes = Clase "Producto" @("idProducto: int", "nombre: string", "tipoConservacion: string", "activo: bool") 600 230 190
  Replica $prodRes
  $eventoInv = Clase "EventoProcesado" @("idEvento: uuid", "tipo: string", "procesadoEn: datetime") 870 40 180
  $sesionInv = Clase "SesionVigente" @("clave: string", "desde: datetime") 870 180 180
  Asociar $detResIns $reserva "0..*" "1"
  Asociar $detResIns $ingr "0..*" "1"
  Asociar $detResProd $reserva "0..*" "1"
  Asociar $detResProd $prodRes "0..*" "1"
  Asociar $reserva $almRes "0..*" "0..1" "destino de lo producido"
  $nota = Nuevo $p "" "Note" -notas ("Base inventario_db (PostgreSQL), tablas del Sprint 3; Ingrediente, Almacen y Producto " +
    "resumidos (completos en 3.3.3). Otro servicio pide la reserva por REST interno con su propio id: repetirla no " +
    "descuenta dos veces. Estado Activa, Liberada o Consumida; lo disponible es el stock menos lo reservado activo. " +
    "Al consumirse para una orden, en la misma transacción se registran la nota de egreso y la de ingreso.")
  Poner $d $nota 20 380 1030 60 | Out-Null
  $diagramas += ,@($d, "3.4.3-clases-ms-inventario.png")

  # --- 3.4.3 Finalizar una orden de producción (secuencia)
  $p = $sprint3.Packages.AddNew("3.4.3 Finalizar una orden de producción", ""); $p.Update() | Out-Null
  $d = $p.Diagrams.AddNew("Finalizar una orden de producción", "Sequence"); $d.Update() | Out-Null
  $L = @{}
  $x = 60
  foreach ($v in @(@("Cocinero", "Actor"), @("ms-catalogo", "Sequence"), @("ms-inventario", "Sequence"))) {
    $e = Nuevo $p $v[0] $v[1]
    Poner $d $e $x 40 110 640 | Out-Null
    $L[$v[0]] = $e
    $x += 300
  }
  $mensajes = @(
    @("Cocinero", "ms-catalogo", "finalizar(idOrden, cantidadObtenida)", "llamada"),
    @("ms-catalogo", "ms-inventario", "reservar(orden-id, insumos, destino) [REST]", "llamada"),
    @("ms-inventario", "ms-inventario", "crear reserva Activa", "interna"),
    @("ms-inventario", "ms-catalogo", "reserva(costo, almacén de destino)", "retorno"),
    @("ms-catalogo", "ms-catalogo", "cambiarEstado(Finalizada) y guardar lo consumido", "interna"),
    @("ms-catalogo", "ms-inventario", "OrdenFinalizada(idOrden, idReserva, cantidadObtenida)", "evento"),
    @("ms-catalogo", "Cocinero", "orden Finalizada (merma, costo)", "retorno"),
    @("ms-inventario", "ms-inventario", "consumir reserva y registrar notas", "interna"),
    @("ms-inventario", "ms-catalogo", "ProduccionRegistrada(idOrden, notas, costo real)", "evento"),
    @("ms-catalogo", "ms-catalogo", "guardar números de nota y costo real", "interna"),
    @("ms-catalogo", "ms-catalogo", "volver a En proceso", "interna"),
    @("ms-catalogo", "ms-inventario", "liberar(orden-id) [REST]", "llamada"),
    @("ms-catalogo", "Cocinero", "503: intente de nuevo", "retorno")
  )
  $n = 1
  foreach ($m in $mensajes) {
    $c = $L[$m[0]].Connectors.AddNew($m[2], "Sequence")
    $c.SupplierID = $L[$m[1]].ElementID
    $c.SequenceNo = $n
    $c.Update() | Out-Null
    $tipo = $m[3]
    if ($tipo -ne "llamada") { $c.Properties.Item("Kind").Value = "Signal" }
    $c.Properties.Item("IsAsync").Value = ($tipo -eq "evento")
    $c.Properties.Item("IsReturn").Value = ($tipo -eq "retorno")
    $c.Update() | Out-Null
    $n++
  }
  $alt = Nuevo $p "" "InteractionFragment" 0
  $op1 = $alt.Partitions.AddNew("el aviso sale", "")
  $op1.Size = 190
  $op2 = $alt.Partitions.AddNew("el aviso no sale", "")
  $alt.Update() | Out-Null
  Poner $d $alt 20 290 860 300 | Out-Null
  $nota = Nuevo $p "" "Note" -notas ("Saga de HU-10: si OrdenFinalizada no se puede publicar, la compensación deshace la " +
    "finalización y libera la reserva (por ejemplo, si RabbitMQ no responde). Si el evento llega dos veces, ms-inventario no registra la producción de nuevo. " +
    "Flechas abiertas: eventos por RabbitMQ; llenas: llamadas REST.")
  Poner $d $nota 160 700 480 60 | Out-Null
  $diagramas += ,@($d, "3.4.3-finalizar-orden.png")

  # ============================================================ Sprint 4
  $sprint4 = $modelo.Packages.AddNew("Sprint 4", ""); $sprint4.Update() | Out-Null

  # --- 3.5.3 ms-pedidos
  $p = $sprint4.Packages.AddNew("3.5.3 Clases de ms-pedidos", ""); $p.Update() | Out-Null
  $d = $p.Diagrams.AddNew("Clases de ms-pedidos", "Logical"); $d.Update() | Out-Null
  $ubic = Clase "Ubicacion" @("idUbicacion: int", "idUsuario: int", "etiqueta: string", "calle: string", "numero: string",
    "referencia: string", "latitud: decimal", "longitud: decimal", "principal: bool", "vigente: bool",
    "fechaRegistro: datetime") 20 40 190
  $ped = Clase "Pedido" @("idPedido: int", "fecha: datetime", "estadoPedido: string", "estadoPago: string",
    "metodoPago: string", "referenciaPago: string", "total: decimal", "fechaEntrega: datetime",
    "motivoCancelacion: string", "idUsuario: int", "clienteNombre: string", "idReserva: string", "idPago: int",
    "idRepartidor: int", "repartidorNombre: string") 320 40 220
  $detPed = Clase "DetallePedido" @("idProducto: int", "nombreProducto: string", "cantidad: int",
    "precioUnitario: decimal") 640 70 200
  $posic = Clase "PosicionRepartidor" @("idEmpleado: int", "latitud: decimal", "longitud: decimal", "precisionM: decimal",
    "actualizadaEn: datetime") 640 250 200
  $eventoPed = Clase "EventoProcesado" @("idEvento: uuid", "tipo: string", "procesadoEn: datetime") 900 40 180
  $sesionPed = Clase "SesionVigente" @("clave: string", "desde: datetime") 900 180 180
  Asociar $ped $ubic "0..*" "1" "se entrega en"
  Asociar $detPed $ped "1..*" "1"
  $nota = Nuevo $p "" "Note" -notas ("Base pedidos_db (PostgreSQL). Sin claves foráneas a otros servicios: el cliente " +
    "(idUsuario), el producto, la reserva (ms-inventario), el cobro (ms-pagos) y el repartidor se guardan por su número, " +
    "y el nombre y el precio del producto se copian al confirmar, para que la historia no cambie con el catálogo. " +
    "Una sola Ubicacion principal por cliente. PosicionRepartidor la escribe el repartidor (HU-24, Sprint 5).")
  Poner $d $nota 20 420 1060 60 | Out-Null
  $diagramas += ,@($d, "3.5.3-clases-ms-pedidos.png")

  # --- 3.5.3 ms-pagos
  $p = $sprint4.Packages.AddNew("3.5.3 Clases de ms-pagos", ""); $p.Update() | Out-Null
  $d = $p.Diagrams.AddNew("Clases de ms-pagos", "Logical"); $d.Update() | Out-Null
  $pago = Clase "Pago" @("idPago: int", "monto: decimal", "moneda: string", "metodo: string", "estado: string",
    "modo: string", "pasarela: string", "idTransaccionExt: string", "datosCobro: string", "tipoDatos: string",
    "fechaCreacion: datetime", "fechaExpiracion: datetime", "fechaConfirmacion: datetime", "idPedido: int",
    "idVenta: int") 20 40 220
  $evPago = Clase "EventoPago" @("idEvento: int", "tipo: string", "origen: string", "cuerpo: string",
    "recibidoEn: datetime") 340 40 200
  $config = Clase "Configuracion" @("clave: string", "valor: string", "actualizadoEn: datetime",
    "actualizadoPor: string") 340 230 200
  $eventoPag = Clase "EventoProcesado" @("idEvento: uuid", "tipo: string", "procesadoEn: datetime") 620 40 180
  $sesionPag = Clase "SesionVigente" @("clave: string", "desde: datetime") 620 180 180
  Asociar $evPago $pago "0..*" "1" "bitácora de"
  $nota = Nuevo $p "" "Note" -notas ("Base pagos_db (PostgreSQL). Un cobro es de un pedido (ms-pedidos) o de una venta " +
    "(ms-ventas, Sprint 5), por su número. modo congela si fue Simulado o Real (HU-27); Configuracion guarda el modo " +
    "vigente y quién lo cambió. EventoPago es la bitácora de todo lo que le pasó al cobro, avisos de la pasarela incluidos.")
  Poner $d $nota 20 330 780 60 | Out-Null
  $diagramas += ,@($d, "3.5.3-clases-ms-pagos.png")

  # --- 3.5.3 Saga del pedido pagado en línea (secuencia)
  $p = $sprint4.Packages.AddNew("3.5.3 Pago en línea de un pedido", ""); $p.Update() | Out-Null
  $d = $p.Diagrams.AddNew("Pago en línea de un pedido", "Sequence"); $d.Update() | Out-Null
  $L = @{}
  $x = 40
  foreach ($v in @(@("Cliente", "Actor"), @("ms-pedidos", "Sequence"), @("ms-catalogo", "Sequence"),
      @("ms-inventario", "Sequence"), @("ms-pagos", "Sequence"))) {
    $e = Nuevo $p $v[0] $v[1]
    Poner $d $e $x 40 110 760 | Out-Null
    $L[$v[0]] = $e
    $x += 240
  }
  $mensajes = @(
    @("Cliente", "ms-pedidos", "confirmar(items, dirección, QR)", "llamada"),
    @("ms-pedidos", "ms-catalogo", "precios(idsProductos) [REST]", "llamada"),
    @("ms-catalogo", "ms-pedidos", "precios(nombre, precio, activo)", "retorno"),
    @("ms-pedidos", "ms-inventario", "reservar(pedido-uuid, productos) [REST]", "llamada"),
    @("ms-inventario", "ms-pedidos", "reserva(Activa)", "retorno"),
    @("ms-pedidos", "ms-pedidos", "crear pedido(Pendiente de pago)", "interna"),
    @("ms-pedidos", "ms-pagos", "abrirCobro(idPedido, monto, QR) [REST]", "llamada"),
    @("ms-pagos", "ms-pedidos", "cobro(QR, vence en 15 min)", "retorno"),
    @("ms-pedidos", "Cliente", "pedido(cobro con QR)", "retorno"),
    @("Cliente", "ms-pagos", "consultarCobro(idPago)", "llamada"),
    @("ms-pagos", "ms-pedidos", "PagoConfirmado(idPedido, referencia)", "evento"),
    @("ms-pedidos", "ms-pedidos", "pasar a Recibido(Pagado)", "interna"),
    @("ms-pagos", "ms-pedidos", "PagoFallido(idPedido, Vencido)", "evento"),
    @("ms-pedidos", "ms-pedidos", "cancelar(Sin pago)", "interna"),
    @("ms-pedidos", "ms-inventario", "PedidoCancelado(idPedido, idReserva)", "evento")
  )
  $n = 1
  foreach ($m in $mensajes) {
    $c = $L[$m[0]].Connectors.AddNew($m[2], "Sequence")
    $c.SupplierID = $L[$m[1]].ElementID
    $c.SequenceNo = $n
    $c.Update() | Out-Null
    $tipo = $m[3]
    if ($tipo -ne "llamada") { $c.Properties.Item("Kind").Value = "Signal" }
    $c.Properties.Item("IsAsync").Value = ($tipo -eq "evento")
    $c.Properties.Item("IsReturn").Value = ($tipo -eq "retorno")
    $c.Update() | Out-Null
    $n++
  }
  $alt = Nuevo $p "" "InteractionFragment" 0
  $op1 = $alt.Partitions.AddNew("el cliente pagó", "")
  $op1.Size = 104
  $op2 = $alt.Partitions.AddNew("venció el plazo", "")
  $alt.Update() | Out-Null
  Poner $d $alt 20 446 1180 205 | Out-Null
  $nota = Nuevo $p "" "Note" -notas ("Saga coreografiada (HU-21, HU-26). Confirmar usa REST porque el cliente necesita la " +
    "respuesta en el momento (si hay stock y cuál es su QR); cada paso tiene su compensación. El desenlace del cobro " +
    "llega por eventos de RabbitMQ (flechas abiertas). En efectivo no hay cobro: el pedido nace Recibido.")
  Poner $d $nota 200 700 760 60 | Out-Null
  $diagramas += ,@($d, "3.5.3-pago-en-linea.png")

  # ============================================================ Sprint 5
  $sprint5 = $modelo.Packages.AddNew("Sprint 5", ""); $sprint5.Update() | Out-Null

  # --- 3.6.3 ms-ventas
  $p = $sprint5.Packages.AddNew("3.6.3 Clases de ms-ventas", ""); $p.Update() | Out-Null
  $d = $p.Diagrams.AddNew("Clases de ms-ventas", "Logical"); $d.Update() | Out-Null
  $venta = Clase "Venta" @("idVenta: int", "fecha: datetime", "tipoVenta: string", "metodoPago: string",
    "estadoPago: string", "total: decimal", "idCliente: int", "clienteNombre: string", "idEmpleado: int",
    "empleadoNombre: string", "empleadoApellido: string", "idReserva: string", "idNotaEgreso: int", "idPago: int",
    "motivoAnulacion: string", "anuladaEn: datetime") 20 40 220
  $detVenta = Clase "DetalleVenta" @("idProducto: int", "idAlmacen: int", "nombreProducto: string",
    "nombreAlmacen: string", "cantidad: int", "precioUnitario: decimal") 340 70 210
  $eventoVen = Clase "EventoProcesado" @("idEvento: uuid", "tipo: string", "procesadoEn: datetime") 640 40 180
  $sesionVen = Clase "SesionVigente" @("clave: string", "desde: datetime") 640 180 180
  Asociar $detVenta $venta "1..*" "1"
  $nota = Nuevo $p "" "Note" -notas ("Base ventas_db (PostgreSQL). El cliente (ms-identidad) es opcional: sin él es " +
    "consumidor final. Quien atendió sale del token. La venta guarda la reserva que consumió en ms-inventario, su nota " +
    "de egreso y, si se cobró con QR, el cobro de ms-pagos. DetalleVenta copia el nombre y el precio al vender y el " +
    "almacén del que salió, para devolver lo mismo al anular (HU-19).")
  Poner $d $nota 20 420 820 60 | Out-Null
  $diagramas += ,@($d, "3.6.3-clases-ms-ventas.png")

  # --- 3.6.3 ms-pedidos: el reparto
  $p = $sprint5.Packages.AddNew("3.6.3 Clases de ms-pedidos (reparto)", ""); $p.Update() | Out-Null
  $d = $p.Diagrams.AddNew("Clases de ms-pedidos (Sprint 5)", "Logical"); $d.Update() | Out-Null
  $pedR = Clase "Pedido" @("idPedido: int", "estadoPedido: string", "estadoPago: string", "metodoPago: string",
    "total: decimal", "fechaEntrega: datetime", "motivoCancelacion: string", "idReserva: string",
    "idRepartidor: int", "repartidorNombre: string") 20 40 210
  $turno = Clase "TurnoRepartidor" @("idEmpleado: int", "disponible: bool", "actualizadoEn: datetime") 340 40 200
  $posR = Clase "PosicionRepartidor" @("idEmpleado: int", "latitud: decimal", "longitud: decimal", "precisionM: decimal",
    "actualizadaEn: datetime") 340 200 200
  $nota = Nuevo $p "" "Note" -notas ("Pedido resumido (completo en 3.5.3). El repartidor es un empleado de ms-identidad " +
    "con cargo Repartidor: se consulta por REST interno y se guarda por su número y nombre. TurnoRepartidor dice si " +
    "está de turno (para sugerir a quién asignar); PosicionRepartidor la escribe él desde Mis entregas y se borra al " +
    "no quedarle pedidos en camino. Flujo: Recibido, En preparacion, En camino, Entregado o Cancelado.")
  Poner $d $nota 20 380 760 60 | Out-Null
  $diagramas += ,@($d, "3.6.3-clases-ms-pedidos-reparto.png")

  # --- 3.6.3 Venta de mostrador (secuencia)
  $p = $sprint5.Packages.AddNew("3.6.3 Venta de mostrador", ""); $p.Update() | Out-Null
  $d = $p.Diagrams.AddNew("Venta de mostrador", "Sequence"); $d.Update() | Out-Null
  $L = @{}
  $x = 40
  foreach ($v in @(@("Vendedor", "Actor"), @("ms-ventas", "Sequence"), @("ms-catalogo", "Sequence"),
      @("ms-inventario", "Sequence"), @("ms-pagos", "Sequence"))) {
    $e = Nuevo $p $v[0] $v[1]
    Poner $d $e $x 40 110 700 | Out-Null
    $L[$v[0]] = $e
    $x += 240
  }
  $mensajes = @(
    @("Vendedor", "ms-ventas", "vender(items, tipo, método, cliente)", "llamada"),
    @("ms-ventas", "ms-catalogo", "precios(idsProductos) [REST]", "llamada"),
    @("ms-catalogo", "ms-ventas", "precios(nombre, precio, activo)", "retorno"),
    @("ms-ventas", "ms-inventario", "reservar(venta-uuid, productos) [REST]", "llamada"),
    @("ms-ventas", "ms-inventario", "consumir(venta-uuid) [REST]", "llamada"),
    @("ms-inventario", "ms-ventas", "nota de egreso(Venta, almacenes)", "retorno"),
    @("ms-ventas", "ms-ventas", "crear venta y su detalle", "interna"),
    @("ms-ventas", "ms-pagos", "registrarEfectivo(idVenta, monto) [REST]", "llamada"),
    @("ms-ventas", "Vendedor", "venta Pagada y su comprobante", "retorno"),
    @("ms-ventas", "ms-pagos", "abrirCobro(idVenta, monto, QR) [REST]", "llamada"),
    @("ms-pagos", "ms-ventas", "cobro(QR)", "retorno"),
    @("ms-ventas", "Vendedor", "venta Pendiente con el QR", "retorno"),
    @("ms-pagos", "ms-ventas", "PagoConfirmado(idVenta)", "evento"),
    @("ms-ventas", "ms-ventas", "pasar a Pagado", "interna")
  )
  $n = 1
  foreach ($m in $mensajes) {
    $c = $L[$m[0]].Connectors.AddNew($m[2], "Sequence")
    $c.SupplierID = $L[$m[1]].ElementID
    $c.SequenceNo = $n
    $c.Update() | Out-Null
    $tipo = $m[3]
    if ($tipo -ne "llamada") { $c.Properties.Item("Kind").Value = "Signal" }
    $c.Properties.Item("IsAsync").Value = ($tipo -eq "evento")
    $c.Properties.Item("IsReturn").Value = ($tipo -eq "retorno")
    $c.Update() | Out-Null
    $n++
  }
  $alt = Nuevo $p "" "InteractionFragment" 0
  $op1 = $alt.Partitions.AddNew("en efectivo", "")
  $op1.Size = 80
  $op2 = $alt.Partitions.AddNew("con QR", "")
  $alt.Update() | Out-Null
  Poner $d $alt 20 330 1180 290 | Out-Null
  $nota = Nuevo $p "" "Note" -notas ("HU-18. El precio lo pone el catálogo y el stock se descuenta al confirmar: la " +
    "reserva se consume en el acto. Si falta stock, inventario responde 409 y no se crea la venta. Si ms-pagos no " +
    "puede abrir el QR, la venta se deshace y el stock vuelve. Anular (HU-19) devuelve el stock al mismo almacén.")
  Poner $d $nota 200 660 760 60 | Out-Null
  $diagramas += ,@($d, "3.6.3-venta-mostrador.png")

  # --- 3.6.3 Entregar un pedido (secuencia)
  $p = $sprint5.Packages.AddNew("3.6.3 Entregar un pedido", ""); $p.Update() | Out-Null
  $d = $p.Diagrams.AddNew("Entregar un pedido", "Sequence"); $d.Update() | Out-Null
  $L = @{}
  $x = 40
  foreach ($v in @(@("Repartidor", "Actor"), @("ms-pedidos", "Sequence"), @("ms-identidad", "Sequence"),
      @("ms-inventario", "Sequence"), @("ms-pagos", "Sequence"))) {
    $e = Nuevo $p $v[0] $v[1]
    Poner $d $e $x 40 110 700 | Out-Null
    $L[$v[0]] = $e
    $x += 240
  }
  $mensajes = @(
    @("ms-pedidos", "ms-identidad", "empleado(idRepartidor) [REST]", "llamada"),
    @("ms-identidad", "ms-pedidos", "empleado(cargo Repartidor, activo)", "retorno"),
    @("Repartidor", "ms-pedidos", "informarPosicion(latitud, longitud)", "llamada"),
    @("Repartidor", "ms-pedidos", "avanzarEstado(Entregado)", "llamada"),
    @("ms-pedidos", "ms-inventario", "consumir(idReserva) [REST]", "llamada"),
    @("ms-inventario", "ms-pedidos", "nota de egreso(Venta)", "retorno"),
    @("ms-pedidos", "ms-pagos", "registrarEfectivo(idPedido, monto) [REST]", "llamada"),
    @("ms-pedidos", "ms-pedidos", "pasar a Entregado(Pagado)", "interna"),
    @("ms-pedidos", "Repartidor", "pedido Entregado", "retorno"),
    @("Repartidor", "ms-pedidos", "avanzarEstado(Cancelado)", "llamada"),
    @("ms-pedidos", "ms-pedidos", "cancelar(No entregado)", "interna"),
    @("ms-pedidos", "ms-inventario", "PedidoCancelado(idPedido, idReserva)", "evento")
  )
  $n = 1
  foreach ($m in $mensajes) {
    $c = $L[$m[0]].Connectors.AddNew($m[2], "Sequence")
    $c.SupplierID = $L[$m[1]].ElementID
    $c.SequenceNo = $n
    $c.Update() | Out-Null
    $tipo = $m[3]
    if ($tipo -ne "llamada") { $c.Properties.Item("Kind").Value = "Signal" }
    $c.Properties.Item("IsAsync").Value = ($tipo -eq "evento")
    $c.Properties.Item("IsReturn").Value = ($tipo -eq "retorno")
    $c.Update() | Out-Null
    $n++
  }
  $alt = Nuevo $p "" "InteractionFragment" 0
  $op1 = $alt.Partitions.AddNew("entregado", "")
  $op1.Size = 180
  $op2 = $alt.Partitions.AddNew("no entregado", "")
  $alt.Update() | Out-Null
  Poner $d $alt 20 270 1180 330 | Out-Null
  $nota = Nuevo $p "" "Note" -notas ("HU-23 y HU-24. Al asignar, ms-pedidos comprueba en ms-identidad que el empleado " +
    "tenga cargo Repartidor. Solo el repartidor asignado (o quien tenga PEDIDO_CERRAR_AJENO) cierra la entrega. " +
    "Entregar consume la reserva del pedido y, si era en efectivo, registra el cobro; no entregar la libera.")
  Poner $d $nota 200 660 760 60 | Out-Null
  $diagramas += ,@($d, "3.6.3-entregar-pedido.png")

  # ============================================================ Sprint 6
  $sprint6 = $modelo.Packages.AddNew("Sprint 6", ""); $sprint6.Update() | Out-Null

  # --- 3.7.3 ms-reportes (MongoDB)
  $p = $sprint6.Packages.AddNew("3.7.3 Clases de ms-reportes", ""); $p.Update() | Out-Null
  $d = $p.Diagrams.AddNew("Clases de ms-reportes", "Logical"); $d.Update() | Out-Null
  $docVenta = Clase "Venta" @("_id: int", "fecha: datetime", "estado: string", "tipoVenta: string", "metodoPago: string",
    "total: decimal", "cliente: {id, nombre}", "vendedor: {id, nombre}", "actualizadoEn: datetime") 20 40 210
  $docPedido = Clase "Pedido" @("_id: int", "idUsuario: int", "cliente: string", "fechaPedido: datetime", "estado: string",
    "estadoPago: string", "motivo: string", "metodoPago: string", "total: decimal", "repartidor: {id, nombre}",
    "fechaEntrega: datetime", "direccion: string", "actualizadoEn: datetime") 300 40 220
  $linea = Clase "LineaVendida" @("idProducto: int", "nombre: string", "cantidad: int", "precioUnitario: decimal",
    "costoUnitario: decimal") 160 330 200
  $aviso = Clase "AvisoPendiente" @("_id: uuid", "tipo: string", "idUsuario: int", "estado: string", "intentos: int",
    "ultimoError: string", "creadoEn: datetime", "enviadoEn: datetime", "para: string") 600 40 200
  $visita = Clase "Visita" @("ruta: string", "total: int") 600 260 160
  $eventoRep = Clase "EventoProcesado" @("_id: uuid", "tipo: string", "procesadoEn: datetime") 860 40 180
  $sesionRep = Clase "SesionVigente" @("_id: string", "desde: datetime") 860 180 180
  # Composición: en EA va de la parte al todo (el rombo queda del lado del todo).
  foreach ($todo in @($docVenta, $docPedido)) {
    # Composición = agregación «Strong» en EA (rombo relleno).
    $c = $linea.Connectors.AddNew("items", "Aggregation"); $c.Subtype = "Strong"; $c.SupplierID = $todo.ElementID
    $c.ClientEnd.Cardinality = "1..*"; $c.SupplierEnd.Cardinality = "1"; $c.Update() | Out-Null
  }
  Asociar $aviso $docPedido "0..*" "1" "foto del pedido"
  $nota = Nuevo $p "" "Note" -notas ("Base reportes (MongoDB): documentos, no tablas. Venta y Pedido son la última «foto» que " +
    "publicaron ms-ventas y ms-pedidos (VentaRegistrada, PedidoEstadoCambiado), con sus líneas adentro: listas para " +
    "consultar por fechas sin leer bases ajenas (RNF-ARQ-02). actualizadoEn impide que una foto vieja pise a una nueva. " +
    "AvisoPendiente es la bandeja de salida de los correos al cliente (HU-32); Visita, el contador del Sprint 1.")
  Poner $d $nota 20 470 1020 60 | Out-Null
  $diagramas += ,@($d, "3.7.3-clases-ms-reportes.png")

  # --- 3.7.3 Aviso al cliente (secuencia)
  $p = $sprint6.Packages.AddNew("3.7.3 Aviso al cliente", ""); $p.Update() | Out-Null
  $d = $p.Diagrams.AddNew("Aviso al cliente cuando cambia su pedido", "Sequence"); $d.Update() | Out-Null
  $L = @{}
  $x = 40
  foreach ($v in @(@("Repartidor", "Actor"), @("ms-pedidos", "Sequence"), @("ms-reportes", "Sequence"),
      @("ms-identidad", "Sequence"), @("Postfix (servidor web)", "Sequence"))) {
    $e = Nuevo $p $v[0] $v[1]
    Poner $d $e $x 40 110 640 | Out-Null
    $L[$v[0]] = $e
    $x += 240
  }
  $mensajes = @(
    @("Repartidor", "ms-pedidos", "avanzarEstado(Entregado)", "llamada"),
    @("ms-pedidos", "ms-pedidos", "guardar Entregado y costos", "interna"),
    @("ms-pedidos", "ms-reportes", "PedidoEstadoCambiado(foto del pedido)", "evento"),
    @("ms-pedidos", "Repartidor", "pedido Entregado", "retorno"),
    @("ms-reportes", "ms-reportes", "guardar la foto (si es más nueva)", "interna"),
    @("ms-reportes", "ms-reportes", "anotar aviso en la bandeja", "interna"),
    @("ms-reportes", "ms-identidad", "cliente(idUsuario) [REST]", "llamada"),
    @("ms-identidad", "ms-reportes", "cliente(correo, nombre)", "retorno"),
    @("ms-reportes", "Postfix (servidor web)", "enviar(comprobante en PDF) [SMTP]", "llamada"),
    @("ms-reportes", "ms-reportes", "marcar Enviado", "interna")
  )
  $n = 1
  foreach ($m in $mensajes) {
    $c = $L[$m[0]].Connectors.AddNew($m[2], "Sequence")
    $c.SupplierID = $L[$m[1]].ElementID
    $c.SequenceNo = $n
    $c.Update() | Out-Null
    $tipo = $m[3]
    if ($tipo -ne "llamada") { $c.Properties.Item("Kind").Value = "Signal" }
    $c.Properties.Item("IsAsync").Value = ($tipo -eq "evento")
    $c.Properties.Item("IsReturn").Value = ($tipo -eq "retorno")
    $c.Update() | Out-Null
    $n++
  }
  # Subtipo 4 = loop (0 alt, 1 opt, 2 break, 3 par).
  $loop = Nuevo $p "" "InteractionFragment" 4
  $op = $loop.Partitions.AddNew("cada 20 s, mientras haya avisos pendientes", "")
  $loop.Update() | Out-Null
  Poner $d $loop 20 330 1180 250 | Out-Null
  $nota = Nuevo $p "" "Note" -notas ("HU-32. ms-pedidos publica y sigue: el correo sale aunque esté ocupado. Si ms-identidad " +
    "o el correo fallan, el aviso queda en la bandeja y se reintenta; la foto ya quedó guardada y el reporte, al día. " +
    "Postfix lo entrega al servidor de correo.")
  Poner $d $nota 200 620 760 60 | Out-Null
  $diagramas += ,@($d, "3.7.3-aviso-cliente.png")

  # --- 3.7.3 Despliegue (HT-04)
  $p = $sprint6.Packages.AddNew("3.7.3 Despliegue", ""); $p.Update() | Out-Null
  $d = $p.Diagrams.AddNew("Despliegue en el VPS", "Deployment"); $d.Update() | Out-Null
  $navegador = Nuevo $p "Navegador del cliente o del personal" "Node" -estereotipo "dispositivo"
  Poner $d $navegador 20 260 200 80 | Out-Null
  $libelula = Nuevo $p "Libélula (pasarela de pago)" "Node" -estereotipo "servicio externo"
  Poner $d $libelula 20 420 200 70 | Out-Null
  # El servidor y Docker como límites (Boundary): EA los dibuja siempre al fondo, con sus piezas encima.
  $vps = Nuevo $p "«servidor» Servidor web (VPS Contabo, Ubuntu)" "Boundary"
  Poner $d $vps 280 20 620 560 | Out-Null
  $caddy = Nuevo $p "Caddy (Let's Encrypt)" "Component" -estereotipo "proxy HTTPS"
  Poner $d $caddy 310 260 150 70 | Out-Null
  $docker = Nuevo $p "«contenedores» Docker (docker-compose.prod.yml)" "Boundary"
  Poner $d $docker 500 50 380 420 | Out-Null
  $gw = Nuevo $p "API Gateway (nginx)" "Component" -estereotipo "127.0.0.1:8090"
  Poner $d $gw 520 90 160 60 | Out-Null
  $portal = Nuevo $p "Portal (Next.js)" "Component" -estereotipo "127.0.0.1:3000"
  Poner $d $portal 700 90 160 60 | Out-Null
  $mss = Nuevo $p "7 microservicios" "Component" -estereotipo "identidad, catálogo, inventario, ventas, pedidos, pagos, reportes"
  Poner $d $mss 520 190 340 70 | Out-Null
  $datos = Nuevo $p "PostgreSQL · MongoDB · Redis · RabbitMQ" "Component" -estereotipo "sin puertos hacia afuera"
  Poner $d $datos 520 300 340 60 | Out-Null
  $respaldo = Nuevo $p "Respaldo diario (cron 03:00)" "Component" -estereotipo "7 días"
  Poner $d $respaldo 520 390 340 50 | Out-Null
  $postfix = Nuevo $p "Postfix" "Component" -estereotipo "relay SMTP"
  Poner $d $postfix 310 470 150 60 | Out-Null
  $correo = Nuevo $p "Servidor de correo (VPS)" "Node" -estereotipo "Postfix + Dovecot + BIND9"
  Poner $d $correo 960 460 220 80 | Out-Null
  Unir $navegador $caddy "Dependency" "HTTPS 443" | Out-Null
  Unir $libelula $caddy "Dependency" "aviso de pago (HTTPS)" | Out-Null
  Unir $caddy $gw "Dependency" "/api" | Out-Null
  Unir $caddy $portal "Dependency" "el resto" | Out-Null
  Unir $gw $mss "Dependency" "" | Out-Null
  Unir $mss $datos "Dependency" "" | Out-Null
  Unir $mss $postfix "Dependency" "SMTP 25 (ms-reportes)" | Out-Null
  Unir $postfix $correo "Dependency" "relayhost" | Out-Null
  $diagramas += ,@($d, "3.7.3-despliegue.png")

  # ============================================================ Sprint 7
  $sprint7 = $modelo.Packages.AddNew("Sprint 7", ""); $sprint7.Update() | Out-Null

  # --- 3.8.3 Reporte por composición de API (secuencia)
  $p = $sprint7.Packages.AddNew("3.8.3 Reporte de producción", ""); $p.Update() | Out-Null
  $d = $p.Diagrams.AddNew("Reporte de producción por composición de API", "Sequence"); $d.Update() | Out-Null
  $L = @{}
  $x = 40
  foreach ($v in @(@("Administrador", "Actor"), @("ms-reportes", "Sequence"), @("ms-catalogo", "Sequence"),
      @("ms-inventario", "Sequence"))) {
    $e = Nuevo $p $v[0] $v[1]
    Poner $d $e $x 40 110 600 | Out-Null
    $L[$v[0]] = $e
    $x += 280
  }
  $mensajes = @(
    @("Administrador", "ms-reportes", "reporteProduccion(desde, hasta, producto)", "llamada"),
    @("ms-reportes", "ms-catalogo", "ordenesFinalizadas(desde, hasta) [REST]", "llamada"),
    @("ms-catalogo", "ms-reportes", "órdenes con lo que consumió cada una", "retorno"),
    @("ms-reportes", "ms-reportes", "sumar obtenido, merma, costo e insumos", "interna"),
    @("ms-reportes", "Administrador", "reporte (o PDF)", "retorno"),
    @("Administrador", "ms-reportes", "reporteInventario(desde, hasta, ítem)", "llamada"),
    @("ms-reportes", "ms-inventario", "movimientos(desde, hasta) [REST]", "llamada"),
    @("ms-inventario", "ms-reportes", "movimientos y existencia de hoy", "retorno"),
    @("ms-reportes", "Administrador", "reporte, o 503 si inventario no responde", "retorno")
  )
  $n = 1
  foreach ($m in $mensajes) {
    $c = $L[$m[0]].Connectors.AddNew($m[2], "Sequence")
    $c.SupplierID = $L[$m[1]].ElementID
    $c.SequenceNo = $n
    $c.Update() | Out-Null
    $tipo = $m[3]
    if ($tipo -ne "llamada") { $c.Properties.Item("Kind").Value = "Signal" }
    $c.Properties.Item("IsReturn").Value = ($tipo -eq "retorno")
    $c.Update() | Out-Null
    $n++
  }
  $nota = Nuevo $p "" "Note" -notas ("HU-30. Composición por API: ms-reportes no guarda copia de producción ni de inventario; " +
    "pregunta al momento por REST interno y arma el reporte. Lo consumido por cada orden quedó guardado al finalizarla " +
    "(HU-10). «Cuenta como salida lo vendido»: las ventas y entregas dejan su nota de egreso con motivo Venta.")
  Poner $d $nota 160 640 760 60 | Out-Null
  $diagramas += ,@($d, "3.8.3-reporte-produccion.png")

  # ============================================================ Artefactos (cierre del proyecto)
  $cierre = $modelo.Packages.AddNew("Artefactos", ""); $cierre.Update() | Out-Null

  # --- 3.9 Diagrama de componentes
  $p = $cierre.Packages.AddNew("3.9 Componentes", ""); $p.Update() | Out-Null
  $d = $p.Diagrams.AddNew("Componentes del sistema", "Component"); $d.Update() | Out-Null
  $comp = @{}
  $piezas = @(
    @("Portal web (Next.js)", "frontend", 440, 20, 220, 60),
    @("API Gateway (nginx)", "entrada única", 440, 130, 220, 60),
    @("ms-identidad", "microservicio", 20, 250, 150, 60),
    @("ms-catalogo", "microservicio", 190, 250, 150, 60),
    @("ms-inventario", "microservicio", 360, 250, 150, 60),
    @("ms-ventas", "microservicio", 530, 250, 150, 60),
    @("ms-pedidos", "microservicio", 700, 250, 150, 60),
    @("ms-pagos", "microservicio", 870, 250, 150, 60),
    @("ms-reportes", "microservicio", 1040, 250, 150, 60),
    @("RabbitMQ", "eventos", 440, 380, 220, 60),
    @("PostgreSQL 16", "6 bases, una por servicio", 160, 500, 300, 60),
    @("MongoDB", "reportes y visitas", 860, 500, 200, 60),
    @("Redis", "complemento en memoria", 20, 500, 120, 60),
    @("Libélula", "pasarela de pago", 870, 380, 150, 60),
    @("Postfix y servidor de correo", "SMTP", 1040, 380, 180, 60)
  )
  foreach ($q in $piezas) {
    $e = Nuevo $p $q[0] "Component" -estereotipo $q[1]
    Poner $d $e $q[2] $q[3] $q[4] $q[5] | Out-Null
    $comp[$q[0]] = $e
  }
  Unir $comp["Portal web (Next.js)"] $comp["API Gateway (nginx)"] "Dependency" "HTTPS /api" | Out-Null
  foreach ($ms in @("ms-identidad", "ms-catalogo", "ms-inventario", "ms-ventas", "ms-pedidos", "ms-pagos", "ms-reportes")) {
    Unir $comp["API Gateway (nginx)"] $comp[$ms] "Dependency" "" | Out-Null
    Unir $comp[$ms] $comp["RabbitMQ"] "Dependency" "" | Out-Null
  }
  foreach ($ms in @("ms-identidad", "ms-catalogo", "ms-inventario", "ms-ventas", "ms-pedidos", "ms-pagos")) {
    Unir $comp[$ms] $comp["PostgreSQL 16"] "Dependency" "" | Out-Null
  }
  Unir $comp["ms-reportes"] $comp["MongoDB"] "Dependency" "" | Out-Null
  Unir $comp["ms-identidad"] $comp["Redis"] "Dependency" "" | Out-Null
  Unir $comp["ms-pagos"] $comp["Libélula"] "Dependency" "cobro" | Out-Null
  Unir $comp["ms-reportes"] $comp["Postfix y servidor de correo"] "Dependency" "correo" | Out-Null
  $nota = Nuevo $p "" "Note" -notas ("El navegador solo habla con el gateway (RNF-ARQ-04). Cada microservicio tiene su base " +
    "(RNF-ARQ-02) y se comunica con los demás por REST interno (/interno, cuando necesita la respuesta en el momento) " +
    "o por eventos en RabbitMQ (cuando avisa algo que ya pasó).")
  Poner $d $nota 20 600 1180 50 | Out-Null
  $diagramas += ,@($d, "3.9-componentes.png")

  # --- 3.9.2 Paquetes
  $p = $cierre.Packages.AddNew("3.9.2 Paquetes", ""); $p.Update() | Out-Null
  $d = $p.Diagrams.AddNew("Arquitectura del sistema (paquetes)", "Package"); $d.Update() | Out-Null
  function Paquete($nombre, $notas, $l, $t, $w, $h) {
    $np = $p.Packages.AddNew($nombre, ""); $np.Update() | Out-Null
    if ($notas) { $np.Element.Notes = $notas; $np.Element.Update() | Out-Null }
    Poner $d $np.Element $l $t $w $h | Out-Null
    return $np.Element
  }
  $pFront = Paquete "frontend (Next.js)" "" 420 20 260 70
  $pGw = Paquete "gateway (nginx)" "" 420 130 260 70
  $pSrv = @{}
  $x = 20
  foreach ($ms in @("ms-identidad", "ms-catalogo", "ms-inventario", "ms-ventas", "ms-pedidos", "ms-pagos", "ms-reportes")) {
    $pSrv[$ms] = Paquete $ms "" $x 250 150 60
    Unir $pGw $pSrv[$ms] "Dependency" "" | Out-Null
    $x += 165
  }
  Unir $pFront $pGw "Dependency" "HTTP" | Out-Null
  $pComp = Paquete "compartido" "" 420 370 260 70
  foreach ($ms in $pSrv.Keys) { Unir $pSrv[$ms] $pComp "Dependency" "copia" | Out-Null }
  $capas = Nuevo $p "Capas de cada microservicio" "Class" -estereotipo "estructura"
  foreach ($a in @("routes: rutas /api y /interno", "controllers: leen la petición", "services: reglas de negocio",
      "models: acceso a su base (Prisma o MongoDB)", "dtos: validación (Zod)", "clientes: REST a otros servicios",
      "config: entorno, eventos y base")) {
    $at = $capas.Attributes.AddNew($a, ""); $at.Update() | Out-Null
  }
  $capas.Attributes.Refresh()
  Poner $d $capas 760 370 330 150 | Out-Null
  $nota = Nuevo $p "" "Note" -notas ("frontend: app (pantallas), components, context (sesión, tema, carrito) y lib (api, módulos). " +
    "compartido: auth.middleware, eventos y sesiones-vigentes, copiados en cada servicio para que cada uno se construya solo.")
  Poner $d $nota 20 470 680 50 | Out-Null
  $diagramas += ,@($d, "3.9.2-paquetes.png")

  # --- 3.9.3 Modelo conceptual de datos
  $p = $cierre.Packages.AddNew("3.9.3 Modelo conceptual", ""); $p.Update() | Out-Null
  $d = $p.Diagrams.AddNew("Modelo conceptual de datos", "Logical"); $d.Update() | Out-Null
  $ent = @{}
  $limites = @(
    @("ms-identidad", 20, 20, 300, 230, @(@("Usuario", 40, 60), @("Rol", 180, 60), @("Permiso", 180, 130), @("Cliente", 40, 140), @("Empleado", 180, 200))),
    @("ms-catalogo", 340, 20, 300, 230, @(@("Producto", 360, 60), @("Receta", 500, 60), @("Insumo (réplica)", 500, 160), @("OrdenProduccion", 360, 160))),
    @("ms-inventario", 660, 20, 340, 230, @(@("Almacen", 680, 60), @("Ingrediente", 840, 60), @("NotaIngreso", 680, 130), @("NotaEgreso", 840, 130), @("Reserva", 680, 195), @("Producto (réplica) ", 840, 195))),
    @("ms-ventas", 20, 290, 300, 160, @(@("Venta", 40, 330), @("DetalleVenta", 40, 400))),
    @("ms-pedidos", 340, 290, 300, 160, @(@("Pedido", 360, 330), @("DetallePedido", 360, 400), @("Ubicacion", 500, 400))),
    @("ms-pagos", 660, 290, 170, 160, @(@("Pago", 680, 330), @("EventoPago", 680, 400))),
    @("ms-reportes (MongoDB)", 850, 290, 150, 160, @(@("Visita", 865, 330), @("Fotos de venta y pedido", 865, 400)))
  )
  foreach ($b in $limites) {
    $lim = Nuevo $p $b[0] "Boundary"
    Poner $d $lim $b[1] $b[2] $b[3] $b[4] | Out-Null
    foreach ($en in $b[5]) {
      $e = Nuevo $p $en[0] "Class"
      Poner $d $e $en[1] $en[2] 125 32 | Out-Null
      $ent[$en[0]] = $e
    }
  }
  foreach ($par in @(@("Usuario", "Rol"), @("Rol", "Permiso"), @("Cliente", "Usuario"), @("Empleado", "Usuario"),
      @("Receta", "Producto"), @("Receta", "Insumo (réplica)"), @("OrdenProduccion", "Receta"),
      @("NotaIngreso", "Ingrediente"), @("NotaEgreso", "Ingrediente"), @("Ingrediente", "Almacen"), @("Reserva", "Producto (réplica) "),
      @("DetalleVenta", "Venta"), @("DetallePedido", "Pedido"), @("Pedido", "Ubicacion"), @("EventoPago", "Pago"))) {
    Unir $ent[$par[0]] $ent[$par[1]] "Association" "" | Out-Null
  }
  foreach ($par in @(@("Pedido", "Cliente"), @("Venta", "Cliente"), @("Pago", "Pedido"))) {
    Unir $ent[$par[0]] $ent[$par[1]] "Dependency" "por id" | Out-Null
  }
  $nota = Nuevo $p "" "Note" -notas ("Cada recuadro es la base de un microservicio. Las líneas llenas son relaciones dentro de " +
    "una base (claves foráneas); las punteadas «por id» cruzan servicios: se guarda solo el número, sin clave foránea " +
    "(RNF-ARQ-02); Pago guarda el número del pedido o de la venta. «réplica»: copia local mínima que se mantiene por eventos.")
  Poner $d $nota 20 470 980 50 | Out-Null
  $diagramas += ,@($d, "3.9.3-modelo-conceptual.png")

  $proyecto = $r.GetProjectInterface()
  foreach ($par in $diagramas) {
    $dd = $par[0]
    $ruta = Join-Path $imagenes $par[1]
    $proyecto.PutDiagramImageToFile($dd.DiagramGUID, $ruta, 1) | Out-Null
    "exportado: " + $par[1]
  }
} catch {
  "ERROR: " + $_.Exception.Message + " en " + $_.InvocationInfo.ScriptLineNumber
} finally {
  $r.CloseFile()
  $r.Exit()
}
