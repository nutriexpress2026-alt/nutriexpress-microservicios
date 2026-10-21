# Crea en Enterprise Architect los diagramas del Sprint 0 (secciones 3.1.2 y 3.1.7 del informe)
# y exporta cada uno como PNG a docs/diagramasEA/imagenes.
#
# Uso (PowerShell, con EA instalado):
#   Invoke-Expression (Get-Content -Raw -Encoding UTF8 .\crear-diagramas-sprint0.ps1)
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
    @("ms-identidad", "identidad_db", "PostgreSQL"),
    @("ms-catalogo", "catalogo_db", "PostgreSQL"),
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
  foreach ($n in @("ms-catalogo", "ms-ventas", "ms-pagos")) { Unir $ms[$n] $mq "Dependency" | Out-Null }
  foreach ($n in @("ms-inventario", "ms-pedidos")) { Unir $ms[$n] $mq "Dependency" -direccion "Bi-Directional" | Out-Null }
  Unir $mq $ms["ms-reportes"] "Dependency" | Out-Null
  $nota = Nuevo $p "" "Note" -notas ("Líneas hacia RabbitMQ: eventos asíncronos. Publican catálogo, ventas y pagos; " +
    "inventario y pedidos publican y consumen; reportes solo consume. Cada microservicio tiene su propia base de datos.")
  Poner $d $nota 560 30 270 100 | Out-Null
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
