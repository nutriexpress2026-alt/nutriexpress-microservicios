# Armado del informe en Word

Los capítulos se escriben en `docs/informe/*.md` (fuente). `docs/informe/informe.docx` se genera a
partir de ellos con la carátula y el formato del informe del Proyecto 1 (Arial 11, interlineado 1,5,
tablas con encabezado negro).

Desde el 21-oct todas las figuras son imágenes de Enterprise Architect (`docs/diagramasEA/imagenes`),
citadas en los .md con `<!-- figura: Título -->` y `![Título](ruta.png)`. El paso 1 solo hace falta si
algún capítulo vuelve a usar un bloque Mermaid.

1. `render-mermaid.cjs` dibuja cada bloque ```` ```mermaid ```` precedido de `<!-- figura: Título -->`
   como PNG (necesita el paquete `mermaid` y Playwright con Google Chrome):
   `node render-mermaid.cjs <docs/informe> <mermaid.min.js> <carpeta-figuras> <ruta a playwright>`
2. `armar_informe.py` agrega a la carátula los índices, los capítulos, las figuras y el esqueleto de
   los sprints pendientes:
   `python armar_informe.py <caratula.docx> <docs/informe> <carpeta-figuras> <salida.docx>`
3. Abrir la salida en Word y actualizar los campos (clic derecho en el índice › Actualizar campos)
   para que el índice general y el de figuras tengan sus números de página.

**Ojo:** si alguien edita `informe.docx` a mano en Word, volver a generarlo borra esos cambios.
Pasar primero lo editado al `.md` correspondiente.
