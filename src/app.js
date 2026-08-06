import { ARBITROS, CONTEXTOS } from './data.js';
import { AGENTES, ejecutarPipeline } from './agents.js';
import { MODELO_POR_DEFECTO } from './gemini.js';
import { PROVEEDORES, temporadaActual } from './provider.js';

let proveedor = PROVEEDORES.api; // Prioriza API (realista desde servidor) sobre demo
let estadoServidor = {};
const temporada = () => Number($('temporada').value) || temporadaActual();

const $ = (id) => document.getElementById(id);
const pct = (p) => `${(p * 100).toFixed(1)}%`;

// ---------- Poblar selects ----------
function opcion(sel, valor, texto) {
  const o = document.createElement('option');
  o.value = valor;
  o.textContent = texto;
  sel.appendChild(o);
}

async function pintarLigas() {
  const sel = $('liga');
  sel.innerHTML = '';
  if (proveedor.id === 'demo') opcion(sel, 'todas', 'Todas las ligas');
  const ligas = await proveedor.ligas();
  ligas.forEach((l) => opcion(sel, l.id, l.nombre));
}

function pintarTemporadas() {
  const sel = $('temporada');
  sel.innerHTML = '';
  const actual = temporadaActual();
  for (let y = actual; y >= actual - 4; y--) opcion(sel, y, `${y}/${String(y + 1).slice(2)}`);
}

async function pintarEquipos() {
  const [sl, sv] = [$('local'), $('visitante')];
  const previo = [sl.value, sv.value];
  sl.innerHTML = sv.innerHTML = '';
  opcion(sl, '', 'Cargando…');
  opcion(sv, '', 'Cargando…');

  let lista;
  try {
    lista = await proveedor.equipos($('liga').value, temporada());
  } catch (e) {
    sl.innerHTML = sv.innerHTML = '';
    opcion(sl, '', 'Error al cargar');
    opcion(sv, '', 'Error al cargar');
    $('estado-datos').textContent = `⚠️ No se pudieron cargar los equipos: ${e.message}`;
    return;
  }

  sl.innerHTML = sv.innerHTML = '';
  lista.forEach((e) => {
    opcion(sl, e.id, e.nombre);
    opcion(sv, e.id, e.nombre);
  });
  // Una carga correcta limpia cualquier error anterior
  if ($('estado-datos').textContent.startsWith('⚠️')) {
    $('estado-datos').textContent = `✅ ${proveedor.nombre} · ${lista.length} equipos cargados`;
  }
  if (lista.some((e) => e.id === previo[0])) sl.value = previo[0];
  if (lista.some((e) => e.id === previo[1])) sv.value = previo[1];
  if (lista.length > 1 && sl.value === sv.value) sv.value = lista[1].id;
}

async function cambiarFuente() {
  proveedor = PROVEEDORES[$('fuente').value];
  const esApi = proveedor.id === 'api';
  const st = await proveedor.estado();
  // La temporada solo aplica a proveedores que la aceptan como parámetro.
  $('wrap-temporada').hidden = !esApi || !st.usaTemporada;
  $('wrap-arbitro-real').hidden = !esApi;
  $('estado-datos').textContent = st.disponible
    ? `✅ ${proveedor.nombre} · ${st.nota}`
    : `⚠️ ${proveedor.nombre} no disponible. ${st.nota}`;

  if (!st.disponible && esApi) {
    $('fuente').value = 'demo';
    proveedor = PROVEEDORES.demo;
    $('wrap-temporada').hidden = true;
    $('wrap-arbitro-real').hidden = true;
  }
  await pintarLigas();
  await pintarEquipos();
}

function pintarResto() {
  ARBITROS.forEach((a) => opcion($('arbitro'), a.id, `${a.nombre} · ${a.taNota}`));
  CONTEXTOS.clima.forEach((c) => opcion($('clima'), c.id, c.nombre));
  CONTEXTOS.importancia.forEach((i) => opcion($('importancia'), i.id, i.nombre));
}

function pintarAgentes() {
  $('agentes').innerHTML = AGENTES.map(
    (a) => `<li class="agente" id="ag-${a.id}">
      <div class="icono">○</div>
      <div>
        <strong>${a.nombre}</strong>
        <div class="rol">${a.rol}</div>
        <div class="msg"></div>
      </div>
    </li>`
  ).join('');
}

// ---------- Render de resultados ----------
function histograma(canvas, dist, mu, color) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = 150;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const datos = dist.slice(0, dist.length - 1);
  const max = Math.max(...datos);
  const n = datos.length;
  const bw = w / n;

  datos.forEach((p, k) => {
    const bh = (p / max) * (h - 26);
    const x = k * bw;
    const cerca = Math.abs(k - mu) < 1;
    ctx.fillStyle = cerca ? color : 'rgba(96,165,250,.38)';
    ctx.fillRect(x + 1, h - 20 - bh, Math.max(1, bw - 2), bh);
    if (n <= 22 && k % (n > 16 ? 2 : 1) === 0) {
      ctx.fillStyle = '#93a3bd';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(k, x + bw / 2, h - 6);
    }
  });

  // línea de la media
  const xm = (mu / n) * w;
  ctx.strokeStyle = '#fbbf24';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(xm, 0);
  ctx.lineTo(xm, h - 20);
  ctx.stroke();
  ctx.setLineDash([]);
}

function tablaLineasHTML(lineas) {
  return `<tr><th>Línea</th><th>Over</th><th></th><th>Cuota justa O</th><th>Cuota justa U</th></tr>` +
    lineas
      .map(
        (l) => `<tr>
          <td><b>${l.linea}</b></td>
          <td>${pct(l.over)}</td>
          <td><div class="barra"><i style="width:${(l.over * 100).toFixed(0)}%"></i></div></td>
          <td>${l.cuotaOver.toFixed(2)}</td>
          <td>${l.cuotaUnder.toFixed(2)}</td>
        </tr>`
      )
      .join('');
}

function markdownSimple(md) {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[-•] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>')
    .split('\n\n')
    .map((b) => (b.trim().startsWith('<') ? b : `<p>${b.replace(/\n/g, ' ')}</p>`))
    .join('');
}

function render(cfg, r) {
  $('resultados').hidden = false;

  // Córners
  $('kpi-corners').textContent = r.corners.muTotal.toFixed(1);
  $('split-corners').innerHTML =
    `<span class="chip">${cfg.local.nombre}: <b>${r.corners.muLocal.toFixed(1)}</b></span>` +
    `<span class="chip">${cfg.visitante.nombre}: <b>${r.corners.muVisit.toFixed(1)}</b></span>` +
    `<span class="chip">Rango 80%: <b>${r.corners.ic[0]}–${r.corners.ic[1]}</b></span>`;
  histograma($('chart-corners'), r.corners.dist, r.corners.muTotal, '#34d399');
  $('tabla-corners').innerHTML = tablaLineasHTML(r.corners.lineas);

  // Tarjetas
  $('kpi-tarjetas').textContent = r.tarjetas.muTotal.toFixed(1);
  $('split-tarjetas').innerHTML =
    `<span class="chip">${cfg.local.nombre}: <b>${r.tarjetas.muLocal.toFixed(1)}</b></span>` +
    `<span class="chip">${cfg.visitante.nombre}: <b>${r.tarjetas.muVisit.toFixed(1)}</b></span>` +
    `<span class="chip">Roja: <b>${pct(r.tarjetas.pRoja)}</b></span>` +
    `<span class="chip">Rango 80%: <b>${r.tarjetas.ic[0]}–${r.tarjetas.ic[1]}</b></span>`;
  histograma($('chart-tarjetas'), r.tarjetas.dist, r.tarjetas.muTotal, '#fbbf24');
  $('tabla-tarjetas').innerHTML = tablaLineasHTML(r.tarjetas.lineas);

  // Valor
  if (r.valor?.length) {
    $('card-valor').hidden = false;
    $('tabla-valor').innerHTML =
      `<tr><th>Mercado</th><th>Selección</th><th>Cuota</th><th>P. modelo</th><th>P. implícita</th><th>EV</th></tr>` +
      r.valor
        .map(
          (v) => `<tr>
            <td>${v.mercado}</td>
            <td><b>${v.lado} ${v.linea}</b></td>
            <td>${v.cuota.toFixed(2)}</td>
            <td>${pct(v.p)}</td>
            <td>${pct(v.pImplicita)}</td>
            <td class="${v.ev > 0 ? 'pos' : 'neg'}">${v.ev > 0 ? '+' : ''}${(v.ev * 100).toFixed(1)}%</td>
          </tr>`
        )
        .join('');
  } else {
    $('card-valor').hidden = true;
  }

  // Informe
  $('fuente-informe').textContent = r.fuenteInforme;
  $('informe').innerHTML = markdownSimple(r.informe);
}

// ---------- Ejecución ----------
function leerCuotas() {
  const num = (id) => {
    const v = parseFloat($(id).value);
    return Number.isFinite(v) ? v : null;
  };
  return {
    cornersLinea: num('cornersLinea'),
    cornersOver: num('cornersOver'),
    cornersUnder: num('cornersUnder'),
    tarjetasLinea: num('tarjetasLinea'),
    tarjetasOver: num('tarjetasOver'),
    tarjetasUnder: num('tarjetasUnder'),
  };
}

async function analizar() {
  const idLocal = $('local').value;
  const idVisit = $('visitante').value;
  if (!idLocal || !idVisit) return;
  if (idLocal === idVisit) {
    alert('Elige dos equipos distintos.');
    return;
  }

  $('analizar').disabled = true;
  $('estado-datos').textContent = '⏳ Descargando perfiles reales (puede tardar en la primera consulta)…';

  let local, visitante;
  try {
    [local, visitante] = await Promise.all([
      proveedor.perfil(idLocal, $('liga').value, temporada()),
      proveedor.perfil(idVisit, $('liga').value, temporada()),
    ]);
  } catch (e) {
    $('estado-datos').textContent = `⚠️ No se pudo perfilar a los equipos: ${e.message}`;
    $('analizar').disabled = false;
    return;
  }

  // Árbitro: perfil real si se ha escrito un nombre, si no el preajuste
  let arbitro = ARBITROS.find((a) => a.id === $('arbitro').value);
  const nombreArb = $('arbitroNombre')?.value.trim();
  if (proveedor.id === 'api' && nombreArb) {
    try {
      arbitro = await proveedor.arbitro(nombreArb, $('liga').value, temporada());
    } catch (e) {
      $('estado-datos').textContent = `⚠️ Árbitro "${nombreArb}" no perfilado (${e.message}). Se usa el preajuste.`;
    }
  }

  const recortada = local.muestra?.incompleta || visitante.muestra?.incompleta;
  const nota = local.muestra?.partidos
    ? `Perfiles sobre ${local.muestra.partidos} y ${visitante.muestra.partidos} partidos` +
      (recortada ? ` de ${local.muestra.solicitados} pedidos` : '') +
      ` · fuente ${local.fuente}`
    : `Fuente ${local.fuente}`;
  if (!$('estado-datos').textContent.startsWith('⚠️')) {
    $('estado-datos').textContent = recortada
      ? `⚠️ Muestra incompleta — ${nota}. Las proyecciones pierden fiabilidad.`
      : `✅ ${nota}`;
  }

  const cfg = {
    local,
    visitante,
    arbitro,
    clima: CONTEXTOS.clima.find((c) => c.id === $('clima').value),
    importancia: CONTEXTOS.importancia.find((i) => i.id === $('importancia').value),
    cuotas: leerCuotas(),
    geminiServidor: !!estadoServidor.geminiConfigurado,
    modelo: estadoServidor.geminiModelo || MODELO_POR_DEFECTO,
  };

  pintarAgentes();
  $('analizar').disabled = true;
  $('live-dot').hidden = false;
  $('resultados').hidden = true;

  try {
    const r = await ejecutarPipeline(cfg, (e) => {
      const li = $(`ag-${e.agente}`);
      if (!li) return;
      li.classList.remove('activo', 'ok');
      li.classList.add(e.estado);
      li.querySelector('.icono').textContent = e.estado === 'ok' ? '✓' : '◐';
      li.querySelector('.msg').textContent = e.mensaje;
    });
    render(cfg, r);
    $('resultados').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    alert(`Error en el pipeline: ${err.message}`);
    console.error(err);
  } finally {
    $('analizar').disabled = false;
    $('live-dot').hidden = true;
  }
}

// ---------- Estado de la síntesis ----------
function actualizarEstadoModo() {
  $('estado-modo').textContent = estadoServidor.geminiConfigurado
    ? `Síntesis con Gemini (${estadoServidor.geminiModelo}), configurado en el servidor.`
    : 'Modo local: el servidor no tiene GEMINI_API_KEY, así que el informe lo redacta el motor estadístico integrado.';
}

// ---------- Arranque ----------
async function iniciar() {
  pintarResto();
  pintarTemporadas();
  pintarAgentes();

  $('fuente').onchange = cambiarFuente;
  $('temporada').onchange = pintarEquipos;
  $('liga').onchange = pintarEquipos;
  $('analizar').onclick = analizar;

  // Si el servidor tiene ligas disponibles (realista o con clave), usa API.
  const estadoApi = await PROVEEDORES.api.estado();
  estadoServidor = PROVEEDORES.api._estado || {};
  const tieneProveedorServidor = estadoServidor.ligas && estadoServidor.ligas.length > 0;
  $('fuente').value = tieneProveedorServidor ? 'api' : 'demo';
  await cambiarFuente();
  actualizarEstadoModo();
}

iniciar();
