import re, sys
src, dst, keep = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
texto = open(src, encoding='utf8').read()
bloques = re.findall(r'((?:///[^\n]*\n)*model (\w+) \{.*?\n\})', texto, re.S)
todos = {n for _, n in bloques}
out = ['// Generado a partir de prisma/esquema.sql (fuente de verdad). Con la base levantada,',
       '// `npm run db:pull` lo regenera; no editar a mano.', '',
       'generator client {', '  provider        = "prisma-client-js"', '  previewFeatures = ["partialIndexes"]', '}', '',
       'datasource db {', '  provider = "postgresql"', '}', '']
quitados = []
for bloque, nombre in bloques:
    if nombre not in keep: continue
    lineas = []
    for l in bloque.split('\n'):
        m = re.match(r'\s+(\w+)\s+(\w+)(\[\])?\??', l)
        if m and m.group(2) in todos and m.group(2) not in keep:
            quitados.append(f'{nombre}.{m.group(1)}'); continue
        lineas.append(l)
    out.append('\n'.join(lineas)); out.append('')
open(dst, 'w', encoding='utf8').write('\n'.join(out))
print('relaciones quitadas:', quitados)
