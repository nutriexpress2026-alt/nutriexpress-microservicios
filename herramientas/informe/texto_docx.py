"""Extrae el texto de un .docx, un párrafo por línea, para compararlo con otro.

Sirve para ver qué se editó a mano en informe.docx antes de regenerarlo desde los .md
(regenerar borra esos cambios):

    python texto_docx.py docs/informe/informe.docx actual.txt
    git show HEAD:docs/informe/informe.docx > anterior.docx
    python texto_docx.py anterior.docx anterior.txt
    git diff --no-index anterior.txt actual.txt

Omite los índices; marca las imágenes y los saltos de página.
"""
import sys, zipfile, re
z = zipfile.ZipFile(sys.argv[1])
x = z.read('word/document.xml').decode('utf8')
rels = z.read('word/_rels/document.xml.rels').decode('utf8')
mapa = dict(re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', rels))
mapa.update({a: b for b, a in re.findall(r'Target="([^"]+)"[^>]*Id="([^"]+)"', rels)})
out = []
for p in re.findall(r'<w:p[ >](?:(?!<w:p[ >]).)*?</w:p>', x, re.S):
    if re.search(r'pStyle w:val="(TDC\d|TtuloTDC|Tabladeilustraciones)"', p):
        continue
    t = ''.join(re.findall(r'<w:t(?: [^>]*)?>([^<]*)</w:t>', p))
    for rid in re.findall(r'r:embed="([^"]+)"', p):
        t += ' [IMAGEN ' + mapa.get(rid, rid) + ']'
    if 'w:br w:type="page"' in p or 'pageBreakBefore' in p:
        t = '<<salto>> ' + t
    out.append(t)
open(sys.argv[2], 'w', encoding='utf8').write('\n'.join(out) + '\n')
