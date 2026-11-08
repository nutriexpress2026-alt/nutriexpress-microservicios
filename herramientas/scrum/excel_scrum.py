"""Genera docs/scrum/seguimiento-scrum.xlsx: backlog, sprints con burndown/burnup, scrumboard y daily.

Uso (desde la raíz del repositorio; necesita `pip install openpyxl`):
    python herramientas/scrum/excel_scrum.py docs/informe/capitulo-3-sprint-0.md docs/scrum/seguimiento-scrum.xlsx

Las tareas (con responsable y fecha de término) y la Daily de cada sprint se leen de su capítulo
`capitulo-3-sprint-N.md`. Regenerar REESCRIBE el Excel: lo editado a mano (celdas amarillas) se pierde
si no se pasó antes al capítulo. Al cerrar cada sprint basta con sumarlo en SPRINTS (fechas y objetivo): sus
historias pasan a Hecho y «Último sprint cerrado» se actualiza solo.

Después hay que abrirlo con Excel para que calcule las fórmulas; las gráficas del informe se exportan
desde Excel (Chart.Export por COM) a docs/informe/imagenes/sprintN/.
"""
import os
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

# Tareas y Daily de cada sprint documentado: se leen de su capítulo (capitulo-3-sprint-N.md), que es
# la fuente. Sprint Backlog: | ID | Historia | Tarea | Responsable | Horas | Terminada (dd/mm) |.
CARPETA = os.path.dirname(MD)
ANIO = 2026


def fecha_corta(texto):
    dia, mes = texto.strip().split('/')
    return date(ANIO, int(mes), int(dia))


def seccion(texto, titulo):
    """Texto desde el encabezado que contiene `titulo` hasta el siguiente encabezado ###."""
    m = re.search(r'^### [\d.]+ ' + re.escape(titulo) + r'.*?$(.*?)(?=^### |\Z)', texto, re.M | re.S)
    return m.group(1) if m else ''


def tareas_de(texto):
    filas = re.findall(r'^\| (T\d+\.\d+) \| (.+?) \| (.+?) \| (\w+) \| (\d+) \| (\d\d/\d\d)? ?\|$',
                       seccion(texto, 'Sprint Backlog'), re.M)
    return [(tid, hu, tarea, resp, int(h), fecha_corta(f) if f else None) for tid, hu, tarea, resp, h, f in filas]


def daily_de(texto, n):
    filas = re.findall(r'^\| (\d\d/\d\d) \| (\w+) \| (.+?) \| (.+?) \| (.+?) \|$',
                       seccion(texto, 'Daily Meeting'), re.M)
    return [(fecha_corta(f), n, quien, hice, hare, imp) for f, quien, hice, hare, imp in filas]


SPRINTS = {
    1: (date(2026, 10, 17), date(2026, 10, 21), 'Infraestructura, API Gateway e Identidad: se puede iniciar sesión en el sistema.'),
    2: (date(2026, 10, 22), date(2026, 10, 28), 'Catálogo e inventario básico: se registran productos, insumos y stock.'),
    3: (date(2026, 10, 29), date(2026, 11, 4), 'Recetas y producción, con los servicios comunicados por eventos.'),
    4: (date(2026, 11, 5), date(2026, 11, 11), 'Pedido a domicilio con pago en línea (saga completa).'),
    5: (date(2026, 11, 12), date(2026, 11, 18), 'Despacho de pedidos, reparto y venta de mostrador.'),
}
DAILY = []
for n in list(SPRINTS):
    texto = open(os.path.join(CARPETA, f'capitulo-3-sprint-{n}.md'), encoding='utf8').read()
    tareas = tareas_de(texto)
    assert tareas, f'Sprint {n}: no se encontró el Sprint Backlog'
    SPRINTS[n] += (tareas,)
    DAILY += daily_de(texto, n)

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
    estado = 'Hecho' if spr in {str(n) for n in SPRINTS} else ('En curso' if id_ == 'HT-05' else 'Pendiente')
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
cerrado = celda(pb, pb_fila - 2, 3, max(SPRINTS), editable=True)
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
    for i, (tid, hu, tarea, resp, horas, terminada) in enumerate(tareas, f0 + 1):
        celda(ws, i, 1, tid)
        celda(ws, i, 2, hu)
        celda(ws, i, 3, tarea, ajustar=True)
        celda(ws, i, 4, resp, editable=True)
        celda(ws, i, 5, horas, editable=True)
        dv.add(celda(ws, i, 6, 'Done' if terminada else 'To Do', editable=True))
        celda(ws, i, 7, terminada, editable=True, formato='dd/mm/yyyy')
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

    # Serie diaria del burndown/burnup (horas). Si alguna tarea terminó después del fin,
    # se extiende hasta esa fecha: el atraso se ve en la gráfica.
    d0 = 2
    col = 9  # I
    for j, h in enumerate(['Día', 'Ideal (h)', 'Restante real (h)', 'Completado (h)', 'Alcance (h)'], col):
        c = ws.cell(row=d0 - 1 + 5, column=j, value=h)
        c.font, c.fill, c.border = CAB, NEGRO, BORDE
        ws.column_dimensions[get_column_letter(j)].width = 13
    duracion = (fin - ini).days
    ultima_tarea = max((f for *_, f in tareas if f), default=fin)
    dias = max(duracion, (ultima_tarea - ini).days) + 1
    hoy_fila = d0 + 5
    for k in range(dias):
        f = hoy_fila + k
        celda(ws, f, col, f'=$B$2+{k}', formato='dd/mm')
        celda(ws, f, col + 1, f'=IF({k}>{duracion},0,ROUND($E${t}*(1-{k}/{duracion}),1))')
        # Restante = planificado - lo terminado hasta ese día. Los días después de hoy (o de la
        # última tarea terminada, si el sprint ya se registró completo) quedan vacíos.
        corte = f'MAX(TODAY(),MAX({rng("G")}))'
        celda(ws, f, col + 2, f'=IF(I{f}>{corte},NA(),$E${t}-SUMIFS({rng("E")},{rng("F")},"Done",{rng("G")},"<="&I{f}))')
        celda(ws, f, col + 3, f'=IF(I{f}>{corte},NA(),SUMIFS({rng("E")},{rng("F")},"Done",{rng("G")},"<="&I{f}))')
        celda(ws, f, col + 4, f'=$E${t}')
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
filas = DAILY
for i, fila in enumerate(filas, 2):
    for j, v in enumerate(fila, 1):
        celda(dl, i, j, v, editable=True, formato='dd/mm/yyyy' if j == 1 else None, ajustar=j >= 4)
for i in range(len(filas) + 2, 60):
    for j in range(1, 7):
        celda(dl, i, j, None, editable=True, formato='dd/mm/yyyy' if j == 1 else None, ajustar=j >= 4)
dl.freeze_panes = 'A2'

wb.save(SALIDA)
print('ok', SALIDA)
