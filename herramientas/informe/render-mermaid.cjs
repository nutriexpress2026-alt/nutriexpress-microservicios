// Renderiza los bloques mermaid de los capitulos a PNG para el informe.
const fs = require('fs');
const path = require('path');
const [, , docsDir, libJs, outDir, playwrightDir] = process.argv;
const { chromium } = require(playwrightDir);
const archivos = ['capitulo-1-perfil.md', 'capitulo-2-organizacion.md', 'capitulo-3-sprint-0.md'];
const figuras = [];
for (const a of archivos) {
  const t = fs.readFileSync(path.join(docsDir, a), 'utf8');
  const re = /<!-- figura: (.*?) -->\r?\n```mermaid\r?\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(t))) figuras.push({ archivo: a, titulo: m[1].trim(), codigo: m[2] });
}
(async () => {
  const nav = await chromium.launch({ channel: 'chrome' });
  const pag = await nav.newPage({ deviceScaleFactor: 2.5, viewport: { width: 1100, height: 900 } });
  await pag.setContent('<html><body style="margin:0;background:#fff"><div id="d" style="display:inline-block;padding:12px;background:#fff"></div></body></html>');
  await pag.addScriptTag({ path: libJs });
  await pag.evaluate(() => mermaid.initialize({
    startOnLoad: false, theme: 'neutral', fontFamily: 'Arial',
    themeVariables: { fontFamily: 'Arial', fontSize: '15px' },
    flowchart: { htmlLabels: true, curve: 'basis', rankSpacing: 32, nodeSpacing: 40 }, sequence: { mirrorActors: false },
  }));
  const manifiesto = [];
  for (let i = 0; i < figuras.length; i++) {
    const f = figuras[i];
    const svg = await pag.evaluate(async ([id, c]) => (await mermaid.render(id, c)).svg, ['g' + i, f.codigo]);
    await pag.evaluate((s) => {
      const d = document.getElementById('d');
      d.innerHTML = s;
      const g = d.querySelector('svg');
      const vb = g.viewBox.baseVal;
      g.style.maxWidth = 'none';
      g.setAttribute('width', vb.width);
      g.setAttribute('height', vb.height);
    }, svg);
    const el = await pag.$('#d');
    const caja = await el.boundingBox();
    const archivo = `figura-${String(i + 1).padStart(2, '0')}.png`;
    await el.screenshot({ path: path.join(outDir, archivo) });
    manifiesto.push({ archivo, titulo: f.titulo, ancho: caja.width, alto: caja.height });
    console.log(archivo, f.titulo, Math.round(caja.width), 'x', Math.round(caja.height));
  }
  fs.writeFileSync(path.join(outDir, 'figuras.json'), JSON.stringify(manifiesto, null, 2));
  await nav.close();
})().catch((e) => { console.error(e); process.exit(1); });
