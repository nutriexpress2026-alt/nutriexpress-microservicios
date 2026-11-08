# Pone en marcha NutriExpress Microservicios en una computadora nueva (HT-01).
#
# Uso, desde la carpeta del repositorio:
#   powershell -ExecutionPolicy Bypass -File herramientas\instalar.ps1
#
# Comprueba lo que hace falta (Git, Node 22 o más, Docker Desktop encendido, espacio en disco),
# levanta los doce contenedores, prepara el frontend y verifica que todo responda. Se puede
# repetir sin riesgo: no borra datos, y sirve también para ponerse al día después de un `git pull`.
# Guía completa: INSTALACION.md.

$ErrorActionPreference = 'Continue'
$raiz = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $raiz

function Paso($texto) { Write-Host ""; Write-Host "==> $texto" -ForegroundColor Cyan }
function Bien($texto) { Write-Host "    OK  $texto" -ForegroundColor Green }
function Falla($texto) {
  Write-Host "    FALTA  $texto" -ForegroundColor Red
  Write-Host ""
  Write-Host "Corrija lo anterior y vuelva a ejecutar el script (ver INSTALACION.md)." -ForegroundColor Yellow
  exit 1
}

# ------------------------------------------------------------------ 1. Requisitos
Paso "1/5 Comprobando lo necesario"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Falla "Git no está instalado: https://git-scm.com/download/win" }
Bien "Git"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Falla "Node.js no está instalado: https://nodejs.org (versión 22 LTS o más nueva)" }
$versionNode = [int]((node -v).TrimStart('v').Split('.')[0])
if ($versionNode -lt 22) { Falla "Node.js $((node -v)) es muy viejo: instale la versión 22 LTS o más nueva" }
Bien "Node.js $(node -v)"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Falla "Docker Desktop no está instalado: https://www.docker.com/products/docker-desktop" }
docker info *> $null
if ($LASTEXITCODE -ne 0) { Falla "Docker Desktop está instalado pero apagado: ábralo, espere a que diga 'Engine running' y repita" }
Bien "Docker Desktop encendido"

$libreGB = [math]::Round((Get-PSDrive C).Free / 1GB, 1)
if ($libreGB -lt 10) { Falla "Solo hay $libreGB GB libres en C:. Hacen falta al menos 10 GB (Docker se queda sin espacio y falla)" }
Bien "$libreGB GB libres en C:"

foreach ($puerto in 3000, 5433, 5673, 6380, 8080, 27018) {
  $ocupado = Get-NetTCPConnection -LocalPort $puerto -State Listen -ErrorAction SilentlyContinue |
    Where-Object { (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName -notmatch 'docker|wsl|vpnkit|node' }
  if ($ocupado) { Falla "El puerto $puerto lo usa otro programa (proceso $($ocupado[0].OwningProcess)). Ciérrelo y repita" }
}
Bien "Puertos 3000, 5433, 5673, 6380, 8080 y 27018 disponibles"

# ------------------------------------------------------------------ 2. Configuración
Paso "2/5 Configuración del frontend"
$envLocal = Join-Path $raiz "frontend\.env.local"
if (Test-Path $envLocal) { Bien "frontend\.env.local ya existe" }
else {
  Copy-Item (Join-Path $raiz "frontend\.env.example") $envLocal
  Bien "frontend\.env.local creado desde .env.example"
}

# ------------------------------------------------------------------ 3. Contenedores
Paso "3/5 Construyendo y levantando los contenedores (la primera vez tarda 5-15 minutos)"
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { Falla "docker compose no pudo levantar los contenedores (lea el error de arriba)" }
Bien "Contenedores levantados"

# ------------------------------------------------------------------ 4. Frontend
Paso "4/5 Instalando y compilando el frontend (tarda unos minutos)"
Push-Location (Join-Path $raiz "frontend")
npm ci
if ($LASTEXITCODE -ne 0) { Pop-Location; Falla "npm ci falló en frontend (lea el error de arriba)" }
# Next descarga las fuentes de Google al compilar; con IPv6 a veces no llega.
$env:NODE_OPTIONS = "--dns-result-order=ipv4first"
npm run build
$compilo = $LASTEXITCODE
Remove-Item Env:NODE_OPTIONS
Pop-Location
if ($compilo -ne 0) { Falla "npm run build falló en frontend (si es por las fuentes de Google, revise la conexión y repita)" }
Bien "Frontend compilado"

# ------------------------------------------------------------------ 5. Verificación
Paso "5/5 Verificando que cada servicio responda"
function Responde($url, $intentos = 40) {
  for ($i = 0; $i -lt $intentos; $i++) {
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
      if ($r.StatusCode -eq 200) { return $true }
    } catch { }
    Start-Sleep -Seconds 3
  }
  return $false
}

# Redis no tiene ruta en el gateway y todavía ningún servicio depende de él: se le
# pregunta directamente.
$redisVivo = $false
for ($i = 0; $i -lt 40 -and -not $redisVivo; $i++) {
  $redisVivo = @(docker compose exec -T redis redis-cli ping 2>$null) -contains 'PONG'
  if (-not $redisVivo) { Start-Sleep -Seconds 3 }
}
if (-not $redisVivo) { Falla "Redis no responde. Mire su registro con: docker compose logs redis" }
Bien "Redis"

$comprobaciones = [ordered]@{
  "API Gateway"   = "http://localhost:8080/api/health"
  "ms-identidad"  = "http://localhost:8080/api/auth/clave-publica"
  "ms-catalogo"   = "http://localhost:8080/api/catalogo"
  "ms-inventario" = "http://localhost:8080/api/stock/alertas"
  "ms-reportes"   = "http://localhost:8080/api/visitas?ruta=/"
  "ms-pedidos"    = "http://localhost:8080/api/pedidos"
  "ms-pagos"      = "http://localhost:8080/api/configuracion/cobro"
  "ms-ventas"     = "http://localhost:8080/api/ventas"
}
# Estos piden sesión: un 401 también prueba que están vivos.
$conSesion = @("ms-inventario", "ms-pedidos", "ms-pagos", "ms-ventas")
foreach ($nombre in $comprobaciones.Keys) {
  $url = $comprobaciones[$nombre]
  if ($conSesion -contains $nombre) {
    $vivo = $false
    for ($i = 0; $i -lt 40 -and -not $vivo; $i++) {
      try { Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 | Out-Null; $vivo = $true }
      catch { if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401) { $vivo = $true } else { Start-Sleep -Seconds 3 } }
    }
  } else { $vivo = Responde $url }
  $servicio = if ($nombre -eq "API Gateway") { "gateway" } else { $nombre }
  if (-not $vivo) { Falla "$nombre no responde. Mire su registro con: docker compose logs $servicio" }
  Bien $nombre
}

Write-Host ""
Write-Host "Listo. Para abrir el sistema:" -ForegroundColor Green
Write-Host "   cd frontend"
Write-Host "   npx next start          (y abrir http://localhost:3000)"
Write-Host ""
Write-Host "Usuarios de prueba: admin / Admin1234!   almacenero / Almacen2026!   cliente / Cliente2026!"
Write-Host "(la lista completa está en INSTALACION.md)"
