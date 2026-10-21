"""Genera docs/jira/backlog-jira.csv a partir del Product Backlog de capitulo-3-sprint-0.md.

Uso: python herramientas/jira/generar-csv-jira.py   (desde la raiz del repositorio)

El CSV se importa en Jira (Configuracion > Sistema > Importacion de sistemas externos > CSV) y crea
una incidencia por cada elemento del backlog con sus puntos, prioridad, etiquetas y sprint.
"""
import csv
import os
import re

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
md = open(os.path.join(RAIZ, 'docs', 'informe', 'capitulo-3-sprint-0.md'), encoding='utf8').read()


def limpio(s):
    return re.sub(r'\*\*|`', '', s).strip()


# Historias de usuario: ID | Historia | Criterios de aceptacion | Pts | Prior.
historias = {}
for id_, historia, criterios, _, _ in re.findall(r'^\| (H[TU]-\d+) \| (.+?) \| (.+?) \| (\d+) \| (\w+) \|$', md, re.M):
    historias[id_] = (limpio(historia), limpio(criterios))
# Product Backlog: Orden | ID | Elemento | Microservicio | Pts | Prioridad | Sprint
backlog = re.findall(r'^\| (\d+) \| (H[TU]-\d+) \| (.+?) \| (.+?) \| (\d+) \| (\w+) \| (.+?) \|$', md, re.M)
assert len(backlog) == len(historias), (len(backlog), len(historias))

PRIORIDAD = {'Alta': 'High', 'Media': 'Medium', 'Baja': 'Low'}
filas = []
for orden, id_, elemento, servicio, pts, prio, sprint in backlog:
    historia, criterios = historias[id_]
    lista = []
    for c in criterios.split(';'):
        c = c.strip().rstrip('.')
        if c:
            lista.append('- ' + c[0].upper() + c[1:] + '.')
    etiquetas = [s.strip().lower() for s in servicio.split('+')]
    filas.append([f'{id_} {elemento}', 'Task' if id_.startswith('HT') else 'Story',
                  historia + '\n\nCriterios de aceptación:\n' + '\n'.join(lista),
                  pts, PRIORIDAD[prio], etiquetas, f'Sprint {sprint}' if sprint.isdigit() else '', orden])

max_etq = max(len(f[5]) for f in filas)
with open(os.path.join(RAIZ, 'docs', 'jira', 'backlog-jira.csv'), 'w', encoding='utf8', newline='') as f:
    w = csv.writer(f, quoting=csv.QUOTE_ALL)
    w.writerow(['Summary', 'Issue Type', 'Description', 'Story Points', 'Priority'] + ['Labels'] * max_etq + ['Sprint', 'Orden'])
    for resumen, tipo, desc, pts, prio, etq, sprint, orden in filas:
        w.writerow([resumen, tipo, desc, pts, prio] + etq + [''] * (max_etq - len(etq)) + [sprint, orden])
print(len(filas), 'elementos ->', 'docs/jira/backlog-jira.csv')
