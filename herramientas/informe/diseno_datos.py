"""Tablas del diseño lógico de datos (sección 3.9.3 del informe), leídas del schema.prisma de cada servicio.

Uso (desde la raíz del repositorio):
    python herramientas/informe/diseno_datos.py > /tmp/diseno.md

Imprime, por cada base de PostgreSQL, una tabla en Markdown con cada tabla, su clave primaria, sus
claves foráneas (dentro de la misma base: entre servicios no hay, RNF-ARQ-02) y el resto de sus
columnas. Se pega en docs/informe/capitulo-3-artefactos.md al cambiar un esquema.
"""
import os
import re

SERVICIOS = [
    ('ms-identidad', 'identidad_db'),
    ('ms-catalogo', 'catalogo_db'),
    ('ms-inventario', 'inventario_db'),
    ('ms-ventas', 'ventas_db'),
    ('ms-pedidos', 'pedidos_db'),
    ('ms-pagos', 'pagos_db'),
]
# Tablas de soporte que todos tienen y se explican una vez en el texto.
DE_SOPORTE = {'evento_procesado', 'sesion_vigente'}
TIPOS = {'Int': 'int', 'String': 'texto', 'Decimal': 'decimal', 'DateTime': 'fecha', 'Boolean': 'bool', 'BigInt': 'int'}


def modelos(texto):
    for m in re.finditer(r'^model (\w+) \{\n(.*?)^\}', texto, re.S | re.M):
        yield m.group(1), m.group(2)


def analizar(nombre, cuerpo):
    columnas, pk, fks = [], [], []
    for linea in cuerpo.splitlines():
        linea = linea.strip()
        if not linea or linea.startswith('//'):
            continue
        if linea.startswith('@@id'):
            pk = re.findall(r'\w+', linea.split('[', 1)[1].split(']')[0])
            continue
        if linea.startswith('@@'):
            continue
        partes = linea.split()
        campo, tipo = partes[0], partes[1]
        base = tipo.rstrip('?[]')
        if base not in TIPOS:  # relación
            if '@relation' in linea and 'fields:' in linea:
                propios = re.search(r'fields: \[([^\]]*)\]', linea).group(1)
                fks.append(f'{propios.strip()} → {base}')
            continue
        if '@id' in linea:
            pk = [campo]
        columnas.append((campo, TIPOS[base] + ('?' if tipo.endswith('?') else '')))
    otras = [f'{c}' for c, _ in columnas if c not in pk and not any(c in f.split(' → ')[0] for f in fks)]
    return pk, fks, otras


def main():
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    raiz = os.path.join(os.path.dirname(__file__), '..', '..')
    for servicio, base in SERVICIOS:
        texto = open(os.path.join(raiz, 'servicios', servicio, 'prisma', 'schema.prisma'), encoding='utf8').read()
        filas = []
        for nombre, cuerpo in modelos(texto):
            if nombre in DE_SOPORTE:
                continue
            pk, fks, otras = analizar(nombre, cuerpo)
            filas.append(f"| `{nombre}` | {', '.join(pk)} | {'; '.join(fks) or '—'} | {', '.join(otras)} |")
        print(f'**{base}** ({servicio}, {len(filas)} tablas más `evento_procesado` y `sesion_vigente`)\n')
        print('<!-- anchos: 18 16 26 40 -->')
        print('| Tabla | Clave primaria | Claves foráneas | Otras columnas |')
        print('|---|---|---|---|')
        print('\n'.join(filas))
        print()


if __name__ == '__main__':
    main()
