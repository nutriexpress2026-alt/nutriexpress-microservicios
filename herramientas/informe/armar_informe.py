"""Arma el informe SCRUM en Word a partir de la caratula y los capitulos en Markdown.

Uso: python -I armar_informe.py <caratula.docx> <carpeta docs/informe> <carpeta figuras> <salida.docx>

Copia el formato del informe del Proyecto 1: Arial 11, interlineado 1,5, texto
justificado, titulos en negrita sin color y tablas con encabezado negro.
"""
import json
import os
import re
import shutil
import struct
import sys
import tempfile
import zipfile
from xml.sax.saxutils import escape

CARATULA, DOCS, FIGURAS, SALIDA = sys.argv[1:5]

ARIAL = '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>'
CODIGO = '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>'
ANCHO_TABLA = 9000
EMU_POR_PULGADA = 914400
MAX_ANCHO_IN = 6.0
MAX_ALTO_IN = 8.0


# ---------------------------------------------------------------- texto en linea
TOKENS = re.compile(r'(\*\*.+?\*\*|`[^`]+`|\*[^*\s][^*]*?\*)')


def runs(texto, negrita=False, tam=None, color=None, cursiva=False):
    """Convierte **negrita**, *cursiva* y `codigo` en runs de Word."""
    salida = []
    for parte in TOKENS.split(texto):
        if not parte:
            continue
        b, i, fuente = negrita, cursiva, ARIAL
        if parte.startswith('**') and parte.endswith('**') and len(parte) > 4:
            parte, b = parte[2:-2], True
        elif parte.startswith('`') and parte.endswith('`'):
            parte, fuente = parte[1:-1], CODIGO
        elif parte.startswith('*') and parte.endswith('*') and len(parte) > 2:
            parte, i = parte[1:-1], True
        rpr = fuente
        if b:
            rpr += '<w:b/><w:bCs/>'
        if i:
            rpr += '<w:i/><w:iCs/>'
        if color:
            rpr += f'<w:color w:val="{color}"/>'
        if tam:
            rpr += f'<w:sz w:val="{tam}"/><w:szCs w:val="{tam}"/>'
        salida.append(f'<w:r><w:rPr>{rpr}</w:rPr><w:t xml:space="preserve">{escape(parte)}</w:t></w:r>')
    return ''.join(salida)


def parrafo(contenido, jc='both', antes=0, despues=160, linea=360, extra='', estilo=''):
    ppr = f'<w:pStyle w:val="{estilo}"/>' if estilo else ''
    ppr += extra
    ppr += f'<w:spacing w:before="{antes}" w:after="{despues}" w:line="{linea}" w:lineRule="auto"/>'
    ppr += f'<w:jc w:val="{jc}"/><w:rPr>{ARIAL}</w:rPr>'
    return f'<w:p><w:pPr>{ppr}</w:pPr>{contenido}</w:p>'


def salto_pagina():
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'


def titulo(nivel, texto, salto=False, centrado=False):
    estilo = {1: 'Ttulo1', 2: 'Ttulo2', 3: 'Ttulo3'}[nivel]
    antes, despues = {1: (360, 220), 2: (280, 160), 3: (220, 140)}[nivel]
    extra = '<w:pageBreakBefore/>' if salto else ''
    cursiva = '<w:i/><w:iCs/>' if nivel == 3 else ''
    rpr = f'{ARIAL}<w:b/><w:bCs/>{cursiva}<w:color w:val="auto"/><w:sz w:val="22"/><w:szCs w:val="22"/>'
    jc = 'center' if centrado else 'left'
    return (f'<w:p><w:pPr><w:pStyle w:val="{estilo}"/>{extra}'
            f'<w:spacing w:before="{antes}" w:after="{despues}" w:line="360" w:lineRule="auto"/>'
            f'<w:jc w:val="{jc}"/><w:rPr>{rpr}</w:rPr></w:pPr>'
            f'<w:r><w:rPr>{rpr}</w:rPr><w:t xml:space="preserve">{escape(texto)}</w:t></w:r></w:p>')


def subtitulo_negrita(texto):
    """Como los «CU-SEG-01. Iniciar sesión» del informe anterior: negrita, fuera del indice."""
    texto = texto.strip('*')
    return parrafo(runs(texto, negrita=True), jc='left', antes=240, despues=120, extra='<w:keepNext/>')


def pendiente(texto):
    return parrafo(runs(texto, cursiva=True, color='7F7F7F'), jc='left')


# ---------------------------------------------------------------- listas
class Listas:
    """Una numeracion nueva por cada lista numerada, para que empiece en 1."""

    def __init__(self):
        self.nums = []  # (numId, abstractId)
        self.siguiente = 100

    def nueva(self, abstracto):
        n = self.siguiente
        self.siguiente += 1
        self.nums.append((n, abstracto))
        return n


ABSTRACTOS = '''<w:abstractNum w:abstractNumId="90"><w:multiLevelType w:val="hybridMultilevel"/>
<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val=""/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr></w:lvl>
<w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="o"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New" w:hint="default"/></w:rPr></w:lvl>
</w:abstractNum>
<w:abstractNum w:abstractNumId="91"><w:multiLevelType w:val="hybridMultilevel"/>
<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
<w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="o"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New" w:hint="default"/></w:rPr></w:lvl>
</w:abstractNum>'''.replace('\n', '')


def item_lista(texto, num_id, nivel=0):
    return (f'<w:p><w:pPr><w:pStyle w:val="Prrafodelista"/><w:numPr><w:ilvl w:val="{nivel}"/>'
            f'<w:numId w:val="{num_id}"/></w:numPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/>'
            f'<w:jc w:val="both"/><w:rPr>{ARIAL}</w:rPr></w:pPr>{runs(texto)}</w:p>')


# ---------------------------------------------------------------- tablas
def limpio(t):
    return re.sub(r'[*`]', '', t)


def anchos_de_columna(filas, cols, tam):
    """Reparte el ancho segun el texto, sin dejar una columna mas angosta que su palabra mas larga.

    Asi «RNF-ARQ-02», «Categoría» o «Sprint» no se parten letra por letra.
    """
    por_letra = 0.62 * (tam / 2) * 20  # dxa por caracter de Arial, con holgura
    minimos, pesos = [], []
    for c in range(cols):
        textos = [limpio(f[c]) for f in filas if c < len(f)]
        palabra = max((len(p) for t in textos for p in t.split()), default=2)
        minimos.append(int(palabra * por_letra) + 260)
        largos = [len(x) for x in textos]
        pesos.append(min(max(sum(largos) / len(largos) * 0.6 + max(largos) * 0.4, 3), 70))
    anchos = [0] * cols
    libres = set(range(cols))
    disponible = ANCHO_TABLA
    while True:
        total = sum(pesos[c] for c in libres)
        fijadas = [c for c in libres if disponible * pesos[c] / total < minimos[c]]
        if not fijadas:
            for c in libres:
                anchos[c] = int(disponible * pesos[c] / total)
            break
        for c in fijadas:
            anchos[c] = minimos[c]
            disponible -= minimos[c]
            libres.discard(c)
        if not libres:
            break
    anchos[max(range(cols), key=lambda c: anchos[c])] += ANCHO_TABLA - sum(anchos)
    return anchos


def tabla(filas):
    cols = len(filas[0])
    chica = cols >= 4
    tam, linea = (18, 240) if chica else (22, 360)
    anchos = anchos_de_columna(filas, cols, tam)
    borde = '<w:{0} w:val="single" w:sz="6" w:space="0" w:color="000000"/>'
    bordes = ''.join(borde.format(b) for b in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'))
    xml = [f'<w:tbl><w:tblPr><w:tblW w:w="{ANCHO_TABLA}" w:type="dxa"/><w:jc w:val="center"/>'
           f'<w:tblBorders>{bordes}</w:tblBorders><w:tblLayout w:type="fixed"/>'
           '<w:tblCellMar><w:left w:w="10" w:type="dxa"/><w:right w:w="10" w:type="dxa"/></w:tblCellMar>'
           '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="0"/>'
           '</w:tblPr><w:tblGrid>' + ''.join(f'<w:gridCol w:w="{a}"/>' for a in anchos) + '</w:tblGrid>']
    margen = ('<w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="110" w:type="dxa"/>'
              '<w:bottom w:w="80" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tcMar>')
    for i, fila in enumerate(filas):
        cab = i == 0
        trpr = '<w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>' if cab else '<w:trPr><w:cantSplit/></w:trPr>'
        celdas = []
        for c in range(cols):
            texto = fila[c] if c < len(fila) else ''
            relleno = '<w:shd w:val="clear" w:color="auto" w:fill="000000"/>' if cab else ''
            contenido = runs(texto, negrita=cab, tam=tam, color='FFFFFF' if cab else '000000')
            celdas.append(f'<w:tc><w:tcPr><w:tcW w:w="{anchos[c]}" w:type="dxa"/>{relleno}{margen}</w:tcPr>'
                          f'<w:p><w:pPr><w:spacing w:after="0" w:line="{linea}" w:lineRule="auto"/>'
                          f'<w:rPr>{ARIAL}</w:rPr></w:pPr>{contenido}</w:p></w:tc>')
        xml.append(f'<w:tr>{trpr}{"".join(celdas)}</w:tr>')
    xml.append('</w:tbl>')
    # Un parrafo vacio despues: Word no deja dos tablas pegadas ni texto encima.
    return ''.join(xml) + parrafo('', despues=120, linea=240)


# ---------------------------------------------------------------- figuras
def tamano_png(ruta):
    """Ancho y alto en pixeles, leidos de la cabecera IHDR del PNG."""
    with open(ruta, 'rb') as f:
        cabecera = f.read(24)
    return struct.unpack('>II', cabecera[16:24])


class Figuras:
    """Figuras numeradas: diagramas Mermaid (manifiesto) o imagenes ya hechas, como las de EA."""

    def __init__(self, manifiesto):
        self.lista = manifiesto
        self.usadas = []  # (rId, archivo de origen, nombre dentro del docx)
        self.siguiente_id = 1000

    def xml(self, titulo, ruta=None):
        if ruta:
            ancho_px, alto_px = tamano_png(ruta)
            origen = ruta
        else:
            f = next(x for x in self.lista if x['titulo'] == titulo)
            ancho_px, alto_px = f['ancho'], f['alto']
            origen = os.path.join(FIGURAS, f['archivo'])
        ancho_in, alto_in = ancho_px / 96, alto_px / 96
        escala = min(1, MAX_ANCHO_IN / ancho_in, MAX_ALTO_IN / alto_in)
        cx, cy = int(ancho_in * escala * EMU_POR_PULGADA), int(alto_in * escala * EMU_POR_PULGADA)
        rid = f'rIdFig{len(self.usadas) + 1}'
        media = f'figura-{len(self.usadas) + 1:02d}.png'
        self.usadas.append((rid, origen, media))
        self.siguiente_id += 1
        n = self.siguiente_id
        dibujo = (
            f'<w:r><w:rPr><w:noProof/></w:rPr><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
            f'<wp:extent cx="{cx}" cy="{cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>'
            f'<wp:docPr id="{n}" name="Figura {n}" descr="{escape(titulo)}"/>'
            '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>'
            '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
            '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
            f'<pic:nvPicPr><pic:cNvPr id="{n}" name="{media}"/><pic:cNvPicPr/></pic:nvPicPr>'
            f'<pic:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
            f'<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
            '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>')
        imagen = parrafo(dibujo, jc='center', antes=120, despues=60, linea=240, extra='<w:keepNext/>')
        rpr = f'{ARIAL}<w:i/><w:iCs/><w:sz w:val="20"/><w:szCs w:val="20"/>'
        leyenda = (
            f'<w:p><w:pPr><w:pStyle w:val="Descripcin"/><w:spacing w:after="240"/><w:jc w:val="center"/></w:pPr>'
            f'<w:r><w:rPr>{rpr}</w:rPr><w:t xml:space="preserve">Figura </w:t></w:r>'
            f'<w:r><w:rPr>{rpr}</w:rPr><w:fldChar w:fldCharType="begin"/></w:r>'
            f'<w:r><w:rPr>{rpr}</w:rPr><w:instrText xml:space="preserve"> SEQ Figura \\* ARABIC </w:instrText></w:r>'
            f'<w:r><w:rPr>{rpr}</w:rPr><w:fldChar w:fldCharType="separate"/></w:r>'
            f'<w:r><w:rPr>{rpr}</w:rPr><w:t>{len(self.usadas)}</w:t></w:r>'
            f'<w:r><w:rPr>{rpr}</w:rPr><w:fldChar w:fldCharType="end"/></w:r>'
            f'<w:r><w:rPr>{rpr}</w:rPr><w:t xml:space="preserve">. {escape(titulo)}</w:t></w:r></w:p>')
        return imagen + leyenda


# ---------------------------------------------------------------- markdown
def convertir(md, listas, figuras):
    lineas = md.replace('\r\n', '\n').split('\n')
    out = []
    i = 0
    primer_h1 = True
    while i < len(lineas):
        l = lineas[i]
        s = l.strip()
        if not s or s == '---':
            i += 1
            continue
        if s.startswith('<!-- figura:'):
            nombre = re.match(r'<!-- figura: (.*?) -->', s).group(1).strip()
            i += 1
            while not lineas[i].strip():
                i += 1
            imagen = re.match(r'!\[[^\]]*\]\(([^)]+)\)', lineas[i].strip())
            if imagen:  # imagen ya hecha (por ejemplo, exportada de Enterprise Architect)
                out.append(figuras.xml(nombre, os.path.normpath(os.path.join(DOCS, imagen.group(1)))))
                i += 1
                continue
            i += 1  # apertura del bloque mermaid
            while not lineas[i].startswith('```'):
                i += 1
            i += 1
            out.append(figuras.xml(nombre))
            continue
        if s.startswith('```'):  # bloque de codigo sin figura: se omite
            i += 1
            while not lineas[i].startswith('```'):
                i += 1
            i += 1
            continue
        if s.startswith('>'):  # notas internas del equipo: no van al informe
            i += 1
            continue
        m = re.match(r'(#{1,4}) (.*)', s)
        if m:
            nivel, texto = len(m.group(1)), m.group(2).strip()
            if nivel == 1:
                if texto.startswith('PARTE'):
                    out.append(parte(texto))
                else:
                    out.append(titulo(1, texto, salto=True))
                primer_h1 = False
            elif nivel == 2:
                out.append(titulo(2, texto.upper()))
            elif nivel == 3:
                out.append(titulo(3, texto))
            else:
                out.append(subtitulo_negrita(texto))
            i += 1
            continue
        if s.startswith('|'):
            filas = []
            while i < len(lineas) and lineas[i].strip().startswith('|'):
                fila = lineas[i].strip().strip('|')
                celdas = [c.strip() for c in fila.split('|')]
                if not all(re.fullmatch(r':?-+:?', c) for c in celdas):
                    filas.append(celdas)
                i += 1
            out.append(tabla(filas))
            continue
        lm = re.match(r'( *)(- |\d+\. )(.*)', l)
        if lm:
            numerada = lm.group(2)[0].isdigit()
            num_id = listas.nueva(91 if numerada else 90)
            while i < len(lineas):
                lm = re.match(r'( *)(- |\d+\. )(.*)', lineas[i])
                if not lm:
                    break
                sangria = len(lm.group(1))
                texto = lm.group(3)
                i += 1
                while i < len(lineas) and lineas[i].startswith('  ') and lineas[i].strip() \
                        and not re.match(r' *(- |\d+\. )', lineas[i]):
                    texto += ' ' + lineas[i].strip()
                    i += 1
                out.append(item_lista(texto, num_id, 1 if sangria >= 2 else 0))
            continue
        # parrafo comun: une las lineas seguidas
        texto = s
        i += 1
        while i < len(lineas) and lineas[i].strip() and not re.match(r'\s*(#|\||- |\d+\. |```|<!--|>)', lineas[i]):
            texto += ' ' + lineas[i].strip()
            i += 1
        if re.fullmatch(r'\*\*[^*]+\*\*', texto):
            out.append(subtitulo_negrita(texto))
        else:
            out.append(parrafo(runs(texto)))
    return ''.join(out)


def parte(texto):
    """Pagina divisoria de cada parte, con el titulo en el centro de la hoja."""
    rpr = f'{ARIAL}<w:b/><w:bCs/><w:color w:val="auto"/><w:sz w:val="32"/><w:szCs w:val="32"/>'
    return (f'<w:p><w:pPr><w:pStyle w:val="Ttulo1"/><w:pageBreakBefore/>'
            f'<w:spacing w:before="4800" w:after="220" w:line="360" w:lineRule="auto"/><w:jc w:val="center"/>'
            f'<w:rPr>{rpr}</w:rPr></w:pPr><w:r><w:rPr>{rpr}</w:rPr><w:t>{escape(texto)}</w:t></w:r></w:p>')


# ---------------------------------------------------------------- partes fijas
def portada_interior(titulo_txt, parrafos):
    rpr = f'{ARIAL}<w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/>'
    cab = (f'<w:p><w:pPr><w:pageBreakBefore/><w:spacing w:before="600" w:after="480"/><w:jc w:val="center"/></w:pPr>'
           f'<w:r><w:rPr>{rpr}</w:rPr><w:t>{titulo_txt}</w:t></w:r></w:p>')
    return cab + ''.join(parrafo(runs(p)) for p in parrafos)


def indice(titulo_txt, instruccion, aviso):
    rpr = f'{ARIAL}<w:b/><w:bCs/><w:color w:val="auto"/><w:sz w:val="24"/><w:szCs w:val="24"/>'
    cab = (f'<w:p><w:pPr><w:pStyle w:val="TtuloTDC"/><w:pageBreakBefore/><w:spacing w:after="240"/>'
           f'<w:jc w:val="center"/></w:pPr><w:r><w:rPr>{rpr}</w:rPr><w:t>{titulo_txt}</w:t></w:r></w:p>')
    campo = (f'<w:p><w:pPr><w:pStyle w:val="TDC1"/><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9350"/></w:tabs></w:pPr>'
             f'<w:r><w:fldChar w:fldCharType="begin"/></w:r>'
             f'<w:r><w:instrText xml:space="preserve"> {instruccion} </w:instrText></w:r>'
             f'<w:r><w:fldChar w:fldCharType="separate"/></w:r>'
             f'<w:r><w:rPr>{ARIAL}</w:rPr><w:t>{aviso}</w:t></w:r>'
             f'<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>')
    return cab + campo


SUBSECCIONES_SPRINT = [
    'Sprint Planning (objetivo del sprint)',
    'Sprint Backlog (tareas, responsables y tiempo)',
    'Diagramas de clase e interfaces',
    'Daily Meeting',
    'Scrumboard (To Do, Doing, Done)',
    'Product Increment',
    'Burndown y Burnup',
    'Sprint Review',
    'Sprint Retrospective',
]

SPRINTS = [
    (1, '26 de octubre al 1 de noviembre de 2026', 'Infraestructura, API Gateway e Identidad: se puede iniciar sesión en el sistema.'),
    (2, '2 al 8 de noviembre de 2026', 'Catálogo e inventario básico: se registran productos, insumos y stock.'),
    (3, '9 al 15 de noviembre de 2026', 'Recetas y producción, con los servicios comunicados por eventos.'),
    (4, '16 al 22 de noviembre de 2026', 'Pedido a domicilio con pago en línea (saga completa).'),
    (5, '23 al 29 de noviembre de 2026', 'Despacho de pedidos, reparto y venta de mostrador.'),
    (6, '30 de noviembre al 6 de diciembre de 2026', 'Reportes, temas, notificaciones y despliegue.'),
]

BIBLIOGRAFIA = [
    'Brown, S. (s.f.). *The C4 model for visualising software architecture*. https://c4model.com',
    'Docker Inc. (2026). *Docker Documentation*. https://docs.docker.com',
    'Lewis, J. y Fowler, M. (2014). *Microservices: a definition of this new architectural term*. https://martinfowler.com/articles/microservices.html',
    'MongoDB Inc. (2026). *MongoDB Manual*. https://www.mongodb.com/docs/manual/',
    'Newman, S. (2021). *Building Microservices: Designing Fine-Grained Systems* (2.ª ed.). O\'Reilly Media.',
    'Richardson, C. (2018). *Microservices Patterns: With examples in Java*. Manning Publications.',
    'Schwaber, K. y Sutherland, J. (2020). *La Guía Scrum: la guía definitiva de Scrum, las reglas del juego*. https://scrumguides.org',
    'Sommerville, I. (2016). *Ingeniería de software* (10.ª ed.). Pearson.',
    'The PostgreSQL Global Development Group. (2026). *PostgreSQL 16 Documentation*. https://www.postgresql.org/docs/16/',
    'VMware Tanzu. (2026). *RabbitMQ Documentation*. https://www.rabbitmq.com/docs',
]


def resto_del_indice(listas):
    out = []
    for n, fechas, objetivo in SPRINTS:
        sec = n + 1
        out.append(titulo(2, f'3.{sec} SPRINT {n}'))
        out.append(parrafo(runs(f'**Fechas:** {fechas}. **Objetivo previsto:** {objetivo}')))
        for k, nombre in enumerate(SUBSECCIONES_SPRINT, 1):
            out.append(titulo(3, f'3.{sec}.{k} {nombre}'))
            out.append(pendiente(f'Pendiente: se completa durante el Sprint {n}.'))
    a = len(SPRINTS) + 2
    out.append(titulo(2, f'3.{a} ARTEFACTOS (DIAGRAMA DE COMPONENTES)'))
    out.append(pendiente('Pendiente: se completa al cerrar el último sprint.'))
    for k, nombre in enumerate(['Product Backlog final',
                                'Arquitectura del sistema (diagrama de paquetes)',
                                'Diseño de datos (conceptual, lógico y físico)',
                                'Diagrama de despliegue',
                                'Gráficas Burndown y Burnup de todo el proyecto'], 1):
        out.append(titulo(3, f'3.{a}.{k} {nombre}'))
        out.append(pendiente('Pendiente: se completa al cerrar el último sprint.'))
    out.append(titulo(1, 'CONCLUSIONES', salto=True))
    out.append(pendiente('Pendiente: se redactan al terminar el proyecto.'))
    out.append(titulo(1, 'RECOMENDACIONES', salto=True))
    out.append(pendiente('Pendiente: se redactan al terminar el proyecto.'))
    out.append(titulo(1, 'BIBLIOGRAFÍA', salto=True))
    for ref in BIBLIOGRAFIA:
        out.append(parrafo(runs(ref), jc='left', extra='<w:ind w:left="720" w:hanging="720"/>'))
    out.append(titulo(1, 'ANEXOS', salto=True))
    out.append(pendiente('Pendiente: manual de usuario, capturas y evidencias de los sprints.'))
    return ''.join(out)


INCLUIR_AGRADECIMIENTOS = False
AGRADECIMIENTOS = [
    'Agradecemos a la Universidad Autónoma Gabriel René Moreno y a la Facultad Integral del Norte por '
    'la formación que nos brindan, y al Ing. Edwin Calle Terrazas, docente de la materia Tecnología Web, '
    'por su guía y sus observaciones a lo largo del proyecto.',
    'A nuestras familias, por su apoyo y paciencia durante las semanas de trabajo, y a nuestros '
    'compañeros, por compartir sus conocimientos y experiencias.',
]
DEDICATORIA = [
    'A nuestras familias, que nos acompañan en cada etapa de nuestra formación profesional.',
]


# ---------------------------------------------------------------- estilos y piezas
def ajustar_estilos(xml):
    rpr_t = f'<w:rPr>{ARIAL}<w:b/><w:bCs/><w:color w:val="auto"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>'
    for sid, nombre, nivel in (('Ttulo1', 'heading 1', 0), ('Ttulo2', 'heading 2', 1), ('Ttulo3', 'heading 3', 2)):
        nuevo = (f'<w:style w:type="paragraph" w:styleId="{sid}"><w:name w:val="{nombre}"/><w:basedOn w:val="Normal"/>'
                 f'<w:next w:val="Normal"/><w:link w:val="{sid}Car"/><w:uiPriority w:val="9"/><w:qFormat/>'
                 f'<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="240" w:after="120" w:line="360" w:lineRule="auto"/>'
                 f'<w:outlineLvl w:val="{nivel}"/></w:pPr>{rpr_t}</w:style>')
        xml, n = re.subn(r'<w:style w:type="paragraph" w:styleId="%s">.*?</w:style>' % sid, nuevo, xml, flags=re.S)
        assert n == 1, sid
    extra = ''
    for k in (1, 2, 3):
        extra += (f'<w:style w:type="paragraph" w:styleId="TDC{k}"><w:name w:val="toc {k}"/><w:basedOn w:val="Normal"/>'
                  f'<w:next w:val="Normal"/><w:autoRedefine/><w:uiPriority w:val="39"/><w:unhideWhenUsed/>'
                  f'<w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9350"/></w:tabs>'
                  f'<w:spacing w:after="100"/><w:ind w:left="{(k - 1) * 220}"/></w:pPr>'
                  f'<w:rPr>{ARIAL}{"<w:b/><w:bCs/>" if k == 1 else ""}</w:rPr></w:style>')
    extra += ('<w:style w:type="paragraph" w:styleId="TtuloTDC"><w:name w:val="TOC Heading"/><w:basedOn w:val="Ttulo1"/>'
              '<w:next w:val="Normal"/><w:uiPriority w:val="39"/><w:unhideWhenUsed/><w:qFormat/>'
              '<w:pPr><w:outlineLvl w:val="9"/></w:pPr></w:style>')
    extra += ('<w:style w:type="paragraph" w:styleId="Descripcin"><w:name w:val="caption"/><w:basedOn w:val="Normal"/>'
              '<w:next w:val="Normal"/><w:uiPriority w:val="35"/><w:unhideWhenUsed/><w:qFormat/>'
              f'<w:pPr><w:spacing w:after="240"/><w:jc w:val="center"/></w:pPr><w:rPr>{ARIAL}<w:i/><w:iCs/>'
              '<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>')
    extra += ('<w:style w:type="paragraph" w:styleId="Tabladeilustraciones"><w:name w:val="table of figures"/>'
              '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/>'
              f'<w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9350"/></w:tabs><w:spacing w:after="100"/></w:pPr>'
              f'<w:rPr>{ARIAL}</w:rPr></w:style>')
    for sid in ('TDC1', 'TDC2', 'TDC3', 'TtuloTDC', 'Descripcin', 'Tabladeilustraciones'):
        assert f'w:styleId="{sid}"' not in xml, sid
    return xml.replace('</w:styles>', extra + '</w:styles>')


PIE = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
       '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
       'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
       '<w:p><w:pPr><w:pStyle w:val="Piedepgina"/><w:jc w:val="right"/></w:pPr>'
       f'<w:r><w:rPr>{ARIAL}</w:rPr><w:fldChar w:fldCharType="begin"/></w:r>'
       f'<w:r><w:rPr>{ARIAL}</w:rPr><w:instrText xml:space="preserve">PAGE   \\* MERGEFORMAT</w:instrText></w:r>'
       f'<w:r><w:rPr>{ARIAL}</w:rPr><w:fldChar w:fldCharType="separate"/></w:r>'
       f'<w:r><w:rPr>{ARIAL}</w:rPr><w:t>2</w:t></w:r>'
       f'<w:r><w:rPr>{ARIAL}</w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>')


# ---------------------------------------------------------------- armado
def main():
    tmp = tempfile.mkdtemp()
    with zipfile.ZipFile(CARATULA) as z:
        z.extractall(tmp)
    w = os.path.join(tmp, 'word')
    doc = open(os.path.join(w, 'document.xml'), encoding='utf8').read()

    # Caratula: se conserva tal cual, sin los parrafos vacios del final.
    cuerpo_ini = doc.index('<w:body>') + len('<w:body>')
    sect = doc.index('<w:sectPr')
    caratula = doc[cuerpo_ini:sect]
    caratula = re.sub(r'(<w:p [^>]*/>)+$', '', caratula)
    caratula = re.sub(r'(<w:p [^>]*><w:pPr>(?:(?!</w:p>).)*?</w:pPr></w:p>)+$', '', caratula, flags=re.S)

    listas = Listas()
    figuras = Figuras(json.load(open(os.path.join(FIGURAS, 'figuras.json'), encoding='utf8')))
    contenido = []
    if INCLUIR_AGRADECIMIENTOS:  # el equipo los quito del informe (21-oct)
        contenido.append(portada_interior('AGRADECIMIENTOS', AGRADECIMIENTOS))
        contenido.append(portada_interior('DEDICATORIA', DEDICATORIA))
    contenido.append(indice('ÍNDICE GENERAL', 'TOC \\o "1-3" \\h \\z \\u', 'Actualice el índice: clic derecho › Actualizar campos.'))
    contenido.append(indice('ÍNDICE DE FIGURAS', 'TOC \\h \\z \\c "Figura"', 'Actualice el índice: clic derecho › Actualizar campos.'))
    for nombre in ('capitulo-1-perfil.md', 'capitulo-2-organizacion.md', 'capitulo-3-sprint-0.md'):
        md = open(os.path.join(DOCS, nombre), encoding='utf8').read()
        contenido.append(convertir(md, listas, figuras))
    contenido.append(resto_del_indice(listas))

    seccion = ('<w:sectPr><w:footerReference w:type="default" r:id="rIdPie1"/>'
               '<w:pgSz w:w="12240" w:h="15840" w:code="1"/>'
               '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>'
               '<w:cols w:space="720"/><w:titlePg/><w:docGrid w:linePitch="360"/></w:sectPr>')
    doc = doc[:cuerpo_ini] + caratula + ''.join(contenido) + seccion + '</w:body></w:document>'
    open(os.path.join(w, 'document.xml'), 'w', encoding='utf8').write(doc)

    est = os.path.join(w, 'styles.xml')
    estilos = ajustar_estilos(open(est, encoding='utf8').read())
    open(est, 'w', encoding='utf8').write(estilos)

    num = os.path.join(w, 'numbering.xml')
    nx = open(num, encoding='utf8').read()
    primera = nx.index('<w:num ')
    nums = ''.join(f'<w:num w:numId="{n}"><w:abstractNumId w:val="{a}"/>'
                   f'<w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>'
                   for n, a in listas.nums)
    nx = nx[:primera] + ABSTRACTOS + nx[primera:]
    nx = nx.replace('</w:numbering>', nums + '</w:numbering>')
    open(num, 'w', encoding='utf8').write(nx)

    open(os.path.join(w, 'footer1.xml'), 'w', encoding='utf8').write(PIE)
    rels = os.path.join(w, '_rels', 'document.xml.rels')
    rx = open(rels, encoding='utf8').read()
    nuevas = ('<Relationship Id="rIdPie1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" '
              'Target="footer1.xml"/>')
    os.makedirs(os.path.join(w, 'media'), exist_ok=True)
    for rid, origen, media in figuras.usadas:
        shutil.copy(origen, os.path.join(w, 'media', media))
        nuevas += (f'<Relationship Id="{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" '
                   f'Target="media/{media}"/>')
    open(rels, 'w', encoding='utf8').write(rx.replace('</Relationships>', nuevas + '</Relationships>'))

    ct = os.path.join(tmp, '[Content_Types].xml')
    cx = open(ct, encoding='utf8').read()
    cx = cx.replace('</Types>', '<Override PartName="/word/footer1.xml" '
                    'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>')
    open(ct, 'w', encoding='utf8').write(cx)

    if os.path.exists(SALIDA):
        os.remove(SALIDA)
    with zipfile.ZipFile(SALIDA, 'w', zipfile.ZIP_DEFLATED) as z:
        # [Content_Types].xml primero, como lo escribe Word.
        z.write(ct, '[Content_Types].xml')
        for raiz, _, archivos in os.walk(tmp):
            for a in archivos:
                ruta = os.path.join(raiz, a)
                rel = os.path.relpath(ruta, tmp).replace(os.sep, '/')
                if rel != '[Content_Types].xml':
                    z.write(ruta, rel)
    shutil.rmtree(tmp)
    print('figuras:', len(figuras.usadas), 'listas:', len(listas.nums), '->', SALIDA)


main()
