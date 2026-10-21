# Jira: tablero Scrum de NutriExpress

`backlog-jira.csv` tiene los 39 elementos del Product Backlog (sección 3.1.6 del informe), con su
historia, criterios de aceptación, puntos, prioridad, microservicio (como etiqueta) y sprint. Se
genera con `python herramientas/jira/generar-csv-jira.py` cada vez que cambie el backlog.

## 1. Crear la cuenta y el proyecto

1. Entrar a <https://www.atlassian.com/software/jira/free> y registrarse (plan **Free**, hasta 10
   usuarios). Elegir un nombre de sitio, por ejemplo `nutriexpress2026.atlassian.net`.
2. Crear un proyecto con la plantilla **Scrum**, de tipo **gestionado por la empresa**
   (*company-managed*): con ese tipo la importación respeta los puntos y los sprints.
   - Nombre: `NutriExpress Microservicios` · Clave: `NEM`.
3. Invitar a Joseph (y, si el docente lo pide, al docente con permiso de solo lectura).

## 2. Importar el backlog

1. Engranaje ⚙ (arriba a la derecha) › **Sistema** › **Importación de sistemas externos** › **CSV**.
2. Subir `backlog-jira.csv`. Codificación **UTF-8**, separador **coma**.
3. Proyecto destino: `NutriExpress Microservicios`.
4. Asociar las columnas:

   | Columna del CSV | Campo de Jira |
   |---|---|
   | Summary | Resumen |
   | Issue Type | Tipo de incidencia (Story = Historia, Task = Tarea) |
   | Description | Descripción |
   | Story Points | Story Points / Estimación de puntos de historia |
   | Priority | Prioridad |
   | Labels (las tres) | Etiquetas |
   | Sprint | Sprint |
   | Orden | *No importar* |

5. Importar. Deben quedar 39 incidencias que suman **205 puntos**.

Si la columna Sprint da error, importar sin ella y crear los sprints a mano en el Backlog
(botón **Crear sprint**), arrastrando cada historia al suyo según la columna Sprint del informe.

## 3. Sprints

| Sprint | Inicio | Fin |
|---|---|---|
| Sprint 1 | lun 26-oct-2026 | dom 01-nov-2026 |
| Sprint 2 | lun 02-nov-2026 | dom 08-nov-2026 |
| Sprint 3 | lun 09-nov-2026 | dom 15-nov-2026 |
| Sprint 4 | lun 16-nov-2026 | dom 22-nov-2026 |
| Sprint 5 | lun 23-nov-2026 | dom 29-nov-2026 |
| Sprint 6 | lun 30-nov-2026 | dom 06-dic-2026 |
| Sprint 7 (reserva) | lun 07-dic-2026 | dom 13-dic-2026 |

HT-05 (pruebas) no tiene sprint: se trabaja en todos.

## 4. Uso durante cada sprint (lo que pide el informe)

- **Sprint Planning**: al iniciar el sprint (botón **Iniciar sprint**), dividir cada historia en
  tareas con responsable y horas. Captura del backlog del sprint → 3.x.2 *Sprint Backlog*.
- **Daily Meeting**: mover las tarjetas To Do → In Progress → Done. Captura del tablero al inicio y
  al final → 3.x.5 *Scrumboard*.
- **Burndown y Burnup**: menú **Informes** del proyecto → *Gráfico de evolución del sprint*
  (Burndown) y *Informe de trabajo completado* (Burnup). Captura al cerrar el sprint → 3.x.7.
- **Sprint Review y Retrospective**: al cerrar el sprint (botón **Completar sprint**).
