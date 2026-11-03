"""Genera docs/scrum/seguimiento-scrum.xlsx: backlog, sprints con burndown/burnup, scrumboard y daily.

Uso (desde la raíz del repositorio; necesita `pip install openpyxl`):
    python herramientas/scrum/excel_scrum.py docs/informe/capitulo-3-sprint-0.md docs/scrum/seguimiento-scrum.xlsx

Regenerar REESCRIBE el Excel: lo editado a mano (celdas amarillas) se pierde si no se pasó antes a
este script. Al cerrar cada sprint: agregar sus tareas (S3, S4...) y su fecha en HECHO, sumar el
sprint en SPRINTS, subir «Último sprint cerrado» y agregar las filas de la Daily.

Después hay que abrirlo con Excel para que calcule las fórmulas; las gráficas del informe se exportan
desde Excel (Chart.Export por COM) a docs/informe/imagenes/sprintN/.
"""
import re
import sys
from datetime import date, timedelta

from openpyxl import Workbook
from openpyxl.chart import LineChart, Reference
from openpyxl.comments import Comment
from openpyxl.formatting.rule import CellIsRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

MD, SALIDA = sys.argv[1], sys.argv[2]

F = 'Arial'
NEGRO = PatternFill('solid', fgColor='000000')
AMARILLO = PatternFill('solid', fgColor='FFF2CC')
GRIS = PatternFill('solid', fgColor='F2F2F2')
VERDE = PatternFill('solid', fgColor='E2EFDA')
AZUL = PatternFill('solid', fgColor='DDEBF7')
fino = Side(style='thin', color='808080')
BORDE = Border(left=fino, right=fino, top=fino, bottom=fino)
CAB = Font(name=F, bold=True, color='FFFFFF', size=10)
NORMAL = Font(name=F, size=10)
NEGRITA = Font(name=F, size=10, bold=True)
TITULO = Font(name=F, size=14, bold=True)

ESTADOS = ['To Do', 'Doing', 'Done']


def cabecera(ws, fila, textos, anchos=None):
    for i, t in enumerate(textos, 1):
        c = ws.cell(row=fila, column=i, value=t)
        c.font, c.fill, c.border = CAB, NEGRO, BORDE
        c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
    if anchos:
        for i, a in enumerate(anchos, 1):
            ws.column_dimensions[get_column_letter(i)].width = a


def celda(ws, fila, col, valor, editable=False, formato=None, negrita=False, ajustar=False):
    c = ws.cell(row=fila, column=col, value=valor)
    c.font = NEGRITA if negrita else NORMAL
    c.border = BORDE
    c.alignment = Alignment(vertical='top', wrap_text=ajustar)
    if editable:
        c.fill = AMARILLO
    if formato:
        c.number_format = formato
    return c



def ejes_visibles(grafico):
    """openpyxl 3.1 oculta los ejes y suaviza las líneas por defecto."""
    grafico.x_axis.delete = False
    grafico.y_axis.delete = False
    for serie in grafico.series:
        serie.smooth = False
    grafico.legend.position = 'r'

# ------------------------------------------------------------------ datos del informe
md = open(MD, encoding='utf8').read()
BACKLOG = re.findall(r'^\| (\d+) \| (H[TU]-\d+) \| (.+?) \| (.+?) \| (\d+) \| (\w+) \| (.+?) \|$', md, re.M)
assert len(BACKLOG) == 39

# Tareas del Sprint 1 (Sprint Planning). Estado y fecha reales: se completa al terminar cada una.
S1 = [
    ('T1.1', 'HT-01', 'Estructura del repositorio y docker-compose (PostgreSQL, MongoDB, RabbitMQ)', 'Nilser', 3),
    ('T1.2', 'HT-01', 'Script que crea una base y un usuario por microservicio', 'Nilser', 1),
    ('T1.3', 'HT-01', 'Dockerfile de ms-identidad y ms-reportes', 'Nilser', 2),
    ('T2.1', 'HT-02', 'API Gateway en Nginx con una ruta por microservicio', 'Nilser', 2),
    ('T2.2', 'HT-02', 'CORS en el gateway y respuesta 503 para módulos pendientes', 'Nilser', 1),
    ('T3.1', 'HU-01', 'Esquema identidad_db (9 tablas) y esquema de Prisma', 'Nilser', 2),
    ('T3.2', 'HU-01', 'Adaptar inicio de sesión y bloqueo escalonado del sistema anterior', 'Nilser', 2),
    ('T3.3', 'HU-01', 'Token RS256 con rol, cargo y permisos; ruta de la clave pública', 'Nilser', 2),
    ('T4.1', 'HU-02', 'Adaptar el autorregistro de cliente con la política de contraseñas', 'Nilser', 1),
    ('T5.1', 'HU-03', 'Adaptar alta, edición, baja y reactivación de usuarios', 'Nilser', 2),
    ('T6.1', 'HU-04', 'Adaptar roles y permisos y la carga inicial (seed)', 'Nilser', 2),
    ('T7.1', 'HU-34', 'Reutilizar el frontend y apuntarlo al API Gateway', 'Nilser', 2),
    ('T7.2', 'HU-34', 'Ocultar del menú los módulos de sprints futuros', 'Nilser', 1),
    ('T8.1', 'HU-31', 'ms-reportes con MongoDB: contador de visitas por página', 'Nilser', 2),
    ('T8.2', 'HU-31', 'Pie de página con el contador de su ruta', 'Nilser', 1),
    ('T9.1', 'HT-05', 'Pruebas de integración de ms-identidad (adaptadas)', 'Nilser', 2),
    ('T9.2', 'HT-05', 'Pruebas de integración de ms-reportes', 'Nilser', 1),
    ('T10.1', 'Informe', 'Diagrama de clases de ms-identidad en Enterprise Architect', 'Nilser', 2),
    ('T10.2', 'Informe', 'Documentar el Sprint 1 en el informe', 'Nilser', 2),
]

# Tareas del Sprint 2 (propuesta del Sprint Planning; las ajusta el equipo).
S2 = [
    ('T1.1', 'HU-08', 'ms-catalogo: esquema catalogo_db (producto, categoría, valor nutricional)', 'Nilser', 2),
    ('T1.2', 'HU-08', 'Adaptar alta, edición y foto de productos', 'Nilser', 3),
    ('T2.1', 'HU-11', 'Catálogo público y búsqueda sin tildes ni mayúsculas', 'Nilser', 2),
    ('T2.2', 'HU-11', 'Información del negocio (horario, contacto) y búsqueda en el encabezado', 'Nilser', 2),
    ('T3.1', 'HU-12', 'ms-inventario: esquema inventario_db (insumo, unidad, almacén, stock)', 'Nilser', 2),
    ('T3.2', 'HU-12', 'Adaptar alta y edición de insumos', 'Nilser', 2),
    ('T4.1', 'HU-13', 'Adaptar almacenes por tipo de conservación', 'Nilser', 1),
    ('T5.1', 'HU-14', 'Notas de ingreso con costo promedio y lotes', 'Nilser', 4),
    ('T6.1', 'HU-15', 'Notas de egreso sin superar el stock', 'Nilser', 3),
    ('T7.1', 'HU-16', 'Consulta de stock por almacén y alertas de mínimo', 'Nilser', 2),
    ('T8.1', 'HT-02', 'Rutas de ms-catalogo y ms-inventario en el API Gateway', 'Nilser', 1),
    ('T8.2', 'HU-34', 'Habilitar en el menú Producción e Inventario', 'Nilser', 1),
    ('T9.1', 'HT-05', 'Pruebas de integración de ms-catalogo y ms-inventario', 'Nilser', 3),
    ('T10.1', 'Informe', 'Diagramas de clases de ms-catalogo y ms-inventario en EA', 'Nilser', 2),
    ('T10.2', 'Informe', 'Documentar el Sprint 2 en el informe', 'Nilser', 2),
]

# Fecha real de término de las tareas de cada sprint cerrado.
HECHO = {1: date(2026, 11, 3), 2: date(2026, 11, 3)}
SPRINTS = {
    1: (date(2026, 10, 26), date(2026, 11, 1), 'Infraestructura, API Gateway e Identidad: se puede iniciar sesión en el sistema.', S1),
    2: (date(2026, 11, 2), date(2026, 11, 8), 'Catálogo e inventario básico: se registran productos, insumos y stock.', S2),
}

wb = Workbook()

# ------------------------------------------------------------------ Léeme
ws = wb.active
ws.title = 'Léeme'
ws['A1'] = 'Seguimiento Scrum — NutriExpress Microservicios'
ws['A1'].font = TITULO
lineas = [
    'Reemplaza a Jira. Una hoja por sprint, más el Product Backlog y la Daily.',
    '',
    'Celdas AMARILLAS: las llena el equipo. Lo demás son fórmulas: no tocarlas.',
    '',
    'Durante el sprint (en cada Daily):',
    '  1. En la hoja del sprint, cambiar el Estado de cada tarea: To Do → Doing → Done.',
    '  2. Al pasar una tarea a Done, escribir la Fecha de término REAL (dd/mm/aaaa).',
    '  3. Anotar la Daily en la hoja Daily: qué hice, qué haré, impedimentos.',
    '',
    'El Burndown y el Burnup se dibujan solos con esas fechas. No ajustarlos a mano:',
    'una gráfica con atrasos reales es más creíble que una perfecta.',
    '',
    'Al cerrar el sprint: marcar como Hecho las historias en el Product Backlog y',
    'pasar las gráficas, el scrumboard y la daily al informe (sección 3.x).',
    '',
    'Unidades: el Burndown de cada sprint va en HORAS; el Burnup del proyecto, en PUNTOS.',
]
for i, l in enumerate(lineas, 3):
    ws.cell(row=i, column=1, value=l).font = NORMAL
ws.column_dimensions['A'].width = 95
leyenda = ws.cell(row=len(lineas) + 4, column=1, value='Celda para llenar')
leyenda.fill, leyenda.font, leyenda.border = AMARILLO, NORMAL, BORDE

# ------------------------------------------------------------------ Product Backlog
pb = wb.create_sheet('Product Backlog')
cabecera(pb, 1, ['Orden', 'ID', 'Elemento', 'Microservicio', 'Pts', 'Prioridad', 'Sprint', 'Estado'],
         [7, 8, 34, 30, 6, 10, 8, 12])
dv_pb = DataValidation(type='list', formula1='"Pendiente,En curso,Hecho"', allow_blank=True)
pb.add_data_validation(dv_pb)
for i, (orden, id_, elem, ms, pts, prio, spr) in enumerate(BACKLOG, 2):
    celda(pb, i, 1, int(orden))
    celda(pb, i, 2, id_)
    celda(pb, i, 3, elem, ajustar=True)
    celda(pb, i, 4, ms, ajustar=True)
    celda(pb, i, 5, int(pts))
    celda(pb, i, 6, prio)
    celda(pb, i, 7, int(spr) if spr.isdigit() else spr)
    estado = 'Hecho' if spr in ('1', '2') else ('En curso' if id_ == 'HT-05' else 'Pendiente')
    c = celda(pb, i, 8, estado, editable=True)
    dv_pb.add(c)
ult = len(BACKLOG) + 1
pb.cell(row=ult + 2, column=4, value='Total de puntos').font = NEGRITA
pb.cell(row=ult + 2, column=5, value=f'=SUM(E2:E{ult})').font = NEGRITA
pb.cell(row=ult + 3, column=4, value='Puntos hechos').font = NEGRITA
pb.cell(row=ult + 3, column=5, value=f'=SUMIFS(E2:E{ult},H2:H{ult},"Hecho")').font = NEGRITA
pb.freeze_panes = 'A2'

# Burnup del proyecto: puntos hechos al final de cada sprint vs alcance total.
pb_fila = ult + 6
pb.cell(row=pb_fila - 1, column=1, value='Burnup del proyecto (puntos)').font = NEGRITA
pb.cell(row=pb_fila - 2, column=1, value='Último sprint cerrado').font = NEGRITA
cerrado = celda(pb, pb_fila - 2, 3, 2, editable=True)
cerrado.comment = Comment('Al cerrar cada sprint, sumar 1. La línea de puntos hechos llega hasta aquí.', 'Equipo')
CERRADO = f'$C${pb_fila - 2}'
cabecera_fila = pb_fila
for j, t in enumerate(['Sprint', 'Alcance', 'Hechos (acum.)', 'Ideal'], 1):
    c = pb.cell(row=cabecera_fila, column=j, value=t)
    c.font, c.fill, c.border = CAB, NEGRO, BORDE
for k in range(0, 8):
    f = cabecera_fila + 1 + k
    celda(pb, f, 1, k)
    celda(pb, f, 2, f'=$E${ult + 2}')
    # Puntos de historias hechas cuyo sprint es <= k (las de sprint "1–6" cuentan al final).
    celda(pb, f, 3, f'=IF(A{f}>{CERRADO},NA(),SUMIFS($E$2:$E${ult},$H$2:$H${ult},"Hecho",$G$2:$G${ult},"<="&A{f}))')
    celda(pb, f, 4, f'=ROUND($E${ult + 2}*A{f}/7,0)')
graf = LineChart()
graf.title = 'Burnup del proyecto'
graf.y_axis.title = 'Puntos de historia'
graf.x_axis.title = 'Sprint'
datos = Reference(pb, min_col=2, max_col=4, min_row=cabecera_fila, max_row=cabecera_fila + 8)
graf.add_data(datos, titles_from_data=True)
graf.set_categories(Reference(pb, min_col=1, min_row=cabecera_fila + 1, max_row=cabecera_fila + 8))
graf.height, graf.width = 8, 16
ejes_visibles(graf)
pb.add_chart(graf, f'F{pb_fila}')

# ------------------------------------------------------------------ Hojas de sprint
for n, (ini, fin, objetivo, tareas) in SPRINTS.items():
    ws = wb.create_sheet(f'Sprint {n}')
    ws['A1'] = f'Sprint {n}'
    ws['A1'].font = TITULO
    ws['A2'], ws['B2'] = 'Inicio', ini
    ws['A3'], ws['B3'] = 'Fin', fin
    ws['A4'], ws['B4'] = 'Objetivo', objetivo
    for r in (2, 3, 4):
        ws[f'A{r}'].font = NEGRITA
        ws[f'B{r}'].font = NORMAL
    ws['B2'].number_format = ws['B3'].number_format = 'dd/mm/yyyy'
    ws.merge_cells('B4:G4')
    ws['B4'].alignment = Alignment(wrap_text=True, vertical='top')
    ws.row_dimensions[4].height = 28

    f0 = 6
    cabecera(ws, f0, ['ID', 'Historia', 'Tarea', 'Responsable', 'Horas est.', 'Estado', 'Fecha de término'],
             [7, 9, 58, 13, 10, 10, 15])
    dv = DataValidation(type='list', formula1='"To Do,Doing,Done"', allow_blank=False)
    ws.add_data_validation(dv)
    for i, (tid, hu, tarea, resp, horas) in enumerate(tareas, f0 + 1):
        celda(ws, i, 1, tid)
        celda(ws, i, 2, hu)
        celda(ws, i, 3, tarea, ajustar=True)
        celda(ws, i, 4, resp, editable=True)
        celda(ws, i, 5, horas, editable=True)
        hecho = n in HECHO
        dv.add(celda(ws, i, 6, 'Done' if hecho else 'To Do', editable=True))
        celda(ws, i, 7, HECHO[n] if hecho else None, editable=True, formato='dd/mm/yyyy')
    fu = f0 + len(tareas)
    rng = lambda col: f'${col}${f0 + 1}:${col}${fu}'
    # Colores del estado (como un tablero).
    ws.conditional_formatting.add(f'F{f0 + 1}:F{fu}', CellIsRule(operator='equal', formula=['"Done"'], fill=VERDE))
    ws.conditional_formatting.add(f'F{f0 + 1}:F{fu}', CellIsRule(operator='equal', formula=['"Doing"'], fill=AZUL))

    t = fu + 2
    ws.cell(row=t, column=3, value='Horas planificadas').font = NEGRITA
    ws.cell(row=t, column=5, value=f'=SUM({rng("E")})').font = NEGRITA
    ws.cell(row=t + 1, column=3, value='Horas completadas').font = NEGRITA
    ws.cell(row=t + 1, column=5, value=f'=SUMIFS({rng("E")},{rng("F")},"Done")').font = NEGRITA
    ws.cell(row=t + 2, column=3, value='Avance').font = NEGRITA
    c = ws.cell(row=t + 2, column=5, value=f'=IF(E{t}=0,0,E{t + 1}/E{t})')
    c.font, c.number_format = NEGRITA, '0%'

    # Scrumboard: tareas por historia y estado.
    s = t + 5
    ws.cell(row=s - 1, column=1, value='Scrumboard (tareas por historia)').font = NEGRITA
    for j, h in enumerate(['Historia', 'To Do', 'Doing', 'Done', 'Total'], 1):
        c = ws.cell(row=s, column=j + 1, value=h)
        c.font, c.fill, c.border = CAB, NEGRO, BORDE
    historias = list(dict.fromkeys(hu for _, hu, *_ in tareas))
    for k, hu in enumerate(historias, 1):
        f = s + k
        celda(ws, f, 2, hu)
        for j, est in enumerate(ESTADOS, 3):
            celda(ws, f, j, f'=COUNTIFS({rng("B")},$B{f},{rng("F")},"{est}")')
        celda(ws, f, 6, f'=SUM(C{f}:E{f})')

    # Serie diaria del burndown/burnup (horas). Se extiende hasta 7 días después
    # del fin por si el sprint se atrasa: el atraso se ve en la gráfica.
    d0 = 2
    col = 9  # I
    for j, h in enumerate(['Día', 'Ideal (h)', 'Restante real (h)', 'Completado (h)', 'Alcance (h)'], col):
        c = ws.cell(row=d0 - 1 + 5, column=j, value=h)
        c.font, c.fill, c.border = CAB, NEGRO, BORDE
        ws.column_dimensions[get_column_letter(j)].width = 13
    duracion = (fin - ini).days
    dias = duracion + 1 + 7
    hoy_fila = d0 + 5
    for k in range(dias):
        f = hoy_fila + k
        celda(ws, f, col, f'=$B$2+{k}', formato='dd/mm')
        celda(ws, f, col + 1, f'=IF({k}>{duracion},0,ROUND($E${t}*(1-{k}/{duracion}),1))')
        # Restante = planificado - lo terminado hasta ese día. Días futuros quedan vacíos.
        celda(ws, f, col + 2, f'=IF(I{f}>TODAY(),NA(),$E${t}-SUMIFS({rng("E")},{rng("F")},"Done",{rng("G")},"<="&I{f}))')
        celda(ws, f, col + 3, f'=IF(I{f}>TODAY(),NA(),SUMIFS({rng("E")},{rng("F")},"Done",{rng("G")},"<="&I{f}))')
        celda(ws, f, col + 4, f'=$E${t}')
    ws.cell(row=hoy_fila + dias, column=col, value='Los 7 días después del fin muestran el atraso, si lo hay.').font = Font(name=F, size=8, italic=True)
    ultima = hoy_fila + dias - 1

    bd = LineChart()
    bd.title = f'Burndown — Sprint {n}'
    bd.y_axis.title = 'Horas restantes'
    bd.x_axis.title = 'Día'
    bd.add_data(Reference(ws, min_col=col + 1, max_col=col + 2, min_row=hoy_fila - 1, max_row=ultima), titles_from_data=True)
    bd.set_categories(Reference(ws, min_col=col, min_row=hoy_fila, max_row=ultima))
    bd.x_axis.number_format = 'dd/mm'
    bd.height, bd.width = 8, 16
    ejes_visibles(bd)
    ws.add_chart(bd, f'O{f0}')

    bu = LineChart()
    bu.title = f'Burnup — Sprint {n}'
    bu.y_axis.title = 'Horas'
    bu.x_axis.title = 'Día'
    bu.add_data(Reference(ws, min_col=col + 3, max_col=col + 4, min_row=hoy_fila - 1, max_row=ultima), titles_from_data=True)
    bu.set_categories(Reference(ws, min_col=col, min_row=hoy_fila, max_row=ultima))
    bu.x_axis.number_format = 'dd/mm'
    bu.height, bu.width = 8, 16
    ejes_visibles(bu)
    ws.add_chart(bu, f'O{f0 + 18}')
    ws.freeze_panes = f'A{f0 + 1}'
    ws['G6'].comment = Comment('Fecha REAL en que la tarea pasó a Done. Con ella se dibujan las gráficas.', 'Equipo')

# ------------------------------------------------------------------ Daily
dl = wb.create_sheet('Daily')
cabecera(dl, 1, ['Fecha', 'Sprint', 'Integrante', '¿Qué hice desde la última daily?', '¿Qué haré hoy?', 'Impedimentos'],
         [12, 8, 13, 45, 45, 35])
filas = [
    (date(2026, 11, 3), 1, 'Nilser',
     'Sprint 0 cerrado: informe (cap. 1 a 3), diagramas en EA y backlog. Se descartó Jira y se pasó el seguimiento a Excel.',
     'Sprint 1 completo: Docker Compose, API Gateway, ms-identidad, ms-reportes y frontend reutilizado.',
     'El Sprint 1 empezó tarde (se perdió la semana con Jira). Docker Desktop no arrancaba: se resolvió borrando archivos trabados.'),
    (date(2026, 11, 3), 2, 'Nilser',
     'Sprint 1 cerrado y documentado; planificación del Sprint 2.',
     'ms-catalogo y ms-inventario con sus pruebas, rutas en el gateway, menú del frontend, diagramas de clases en EA e informe.',
     'Las tareas de Joseph se reasignaron a Nilser para cerrar el sprint en el día. Next.js en modo desarrollo es lento en la máquina y hacía fallar las pruebas E2E: se corren contra el frontend compilado.'),
]
for i, fila in enumerate(filas, 2):
    for j, v in enumerate(fila, 1):
        celda(dl, i, j, v, editable=True, formato='dd/mm/yyyy' if j == 1 else None, ajustar=j >= 4)
for i in range(len(filas) + 2, 60):
    for j in range(1, 7):
        celda(dl, i, j, None, editable=True, formato='dd/mm/yyyy' if j == 1 else None, ajustar=j >= 4)
dl.freeze_panes = 'A2'

wb.save(SALIDA)
print('ok', SALIDA)
