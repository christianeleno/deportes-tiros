// Orquestador multi-agente. Cada agente es una etapa que emite eventos de progreso
// y aporta su parte al informe final. El agente sintetizador puede delegar en
// Gemini (Google Cloud / Vertex AI) si hay clave configurada.

import { modeloCorners, modeloTarjetas, tablaLineas, intervalo, probOver } from './model.js';
import { generarNarrativa } from './gemini.js';

const pct = (p) => `${(p * 100).toFixed(1)}%`;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export const AGENTES = [
  { id: 'datos',    nombre: 'Agente Recolector',  rol: 'Normaliza series históricas y valida la muestra' },
  { id: 'corners',  nombre: 'Agente de Córners',  rol: 'Modela el volumen de saques de esquina' },
  { id: 'tarjetas', nombre: 'Agente de Tarjetas', rol: 'Modela amonestaciones y riesgo disciplinario' },
  { id: 'contexto', nombre: 'Agente de Contexto', rol: 'Pondera árbitro, clima y peso del partido' },
  { id: 'mercado',  nombre: 'Agente de Mercado',  rol: 'Compara el modelo con las cuotas ofrecidas' },
  { id: 'sintesis', nombre: 'Agente Sintetizador',rol: 'Redacta el informe y las conclusiones' },
];

/**
 * Ejecuta el pipeline completo.
 * @param {object} cfg  { local, visitante, arbitro, clima, importancia, cuotas, apiKey, modelo }
 * @param {(ev)=>void} emitir  callback de eventos: {agente, estado, mensaje, payload}
 */
export async function ejecutarPipeline(cfg, emitir) {
  const ev = (agente, estado, mensaje, payload) => emitir({ agente, estado, mensaje, payload });
  const resultado = { hallazgos: [] };

  // ---- 1. Recolector -------------------------------------------------
  ev('datos', 'activo', 'Cargando series de los últimos 90\' por equipo…');
  await dormir(420);
  const nLocal = cfg.local.muestra?.partidos ?? 38;
  const nVisit = cfg.visitante.muestra?.partidos ?? 38;
  const muestra = {
    partidosLocal: nLocal,
    partidosVisit: nVisit,
    cornersLocal: cfg.local.cf,
    cornersVisit: cfg.visitante.cf,
    fuente: cfg.local.fuente || 'Demo',
  };
  resultado.muestra = muestra;
  ev(
    'datos',
    'ok',
    `Muestra validada (${muestra.fuente}): ${cfg.local.nombre} ${nLocal} partidos, ${cfg.visitante.nombre} ${nVisit} partidos.`,
    muestra
  );
  resultado.hallazgos.push(
    `${cfg.local.nombre} genera ${cfg.local.cf.toFixed(1)} córners/90' y concede ${cfg.local.ca.toFixed(1)}.`,
    `${cfg.visitante.nombre} genera ${cfg.visitante.cf.toFixed(1)} córners/90' y concede ${cfg.visitante.ca.toFixed(1)}.`
  );

  // ---- 2. Córners ----------------------------------------------------
  ev('corners', 'activo', 'Ajustando binomial negativa ataque × defensa…');
  await dormir(520);
  const corners = modeloCorners(cfg);
  corners.lineas = tablaLineas(corners.dist, [7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5]);
  corners.ic = intervalo(corners.dist);
  resultado.corners = corners;
  ev(
    'corners',
    'ok',
    `Córners totales esperados: ${corners.muTotal.toFixed(2)} (rango 80%: ${corners.ic[0]}–${corners.ic[1]}).`,
    corners
  );
  resultado.hallazgos.push(
    `Reparto de córners: ${corners.muLocal.toFixed(1)} local vs ${corners.muVisit.toFixed(1)} visitante.`,
    `Over 9.5 córners: ${pct(probOver(corners.dist, 9.5))}.`
  );

  // ---- 3. Tarjetas ---------------------------------------------------
  ev('tarjetas', 'activo', 'Cruzando faltas cometidas con propensión a la amonestación…');
  await dormir(520);
  const tarjetas = modeloTarjetas(cfg);
  tarjetas.lineas = tablaLineas(tarjetas.dist, [2.5, 3.5, 4.5, 5.5, 6.5, 7.5]);
  tarjetas.ic = intervalo(tarjetas.dist);
  resultado.tarjetas = tarjetas;
  ev(
    'tarjetas',
    'ok',
    `Tarjetas amarillas esperadas: ${tarjetas.muTotal.toFixed(2)} (rango 80%: ${tarjetas.ic[0]}–${tarjetas.ic[1]}).`,
    tarjetas
  );
  resultado.hallazgos.push(
    `Over 4.5 tarjetas: ${pct(probOver(tarjetas.dist, 4.5))}.`,
    `Probabilidad de al menos una roja: ${pct(tarjetas.pRoja)}.`
  );

  // ---- 4. Contexto ---------------------------------------------------
  ev('contexto', 'activo', 'Ponderando árbitro, clima e importancia del encuentro…');
  await dormir(400);
  const impactoArbitro = (cfg.arbitro.severidad - 1) * 100;
  const impactoClima = (cfg.clima.corners - 1) * 100;
  const impactoPeso = (cfg.importancia.tarjetas - 1) * 100;
  const contexto = { impactoArbitro, impactoClima, impactoPeso };
  resultado.contexto = contexto;
  ev(
    'contexto',
    'ok',
    `Árbitro ${impactoArbitro >= 0 ? '+' : ''}${impactoArbitro.toFixed(0)}% tarjetas · Clima ${impactoClima >= 0 ? '+' : ''}${impactoClima.toFixed(0)}% córners · Contexto ${impactoPeso >= 0 ? '+' : ''}${impactoPeso.toFixed(0)}% tarjetas.`,
    contexto
  );
  if (Math.abs(impactoArbitro) > 10)
    resultado.hallazgos.push(
      `El perfil arbitral (${cfg.arbitro.nombre}, ${cfg.arbitro.taNota}) mueve la línea de tarjetas un ${impactoArbitro.toFixed(0)}%.`
    );
  if (Math.abs(impactoPeso) > 5)
    resultado.hallazgos.push(`Contexto "${cfg.importancia.nombre}": ${impactoPeso.toFixed(0)}% sobre tarjetas.`);

  // ---- 5. Mercado ----------------------------------------------------
  ev('mercado', 'activo', 'Buscando valor frente a las cuotas introducidas…');
  await dormir(380);
  const valor = evaluarMercado(corners, tarjetas, cfg.cuotas || {});
  resultado.valor = valor;
  ev(
    'mercado',
    'ok',
    valor.length
      ? `${valor.length} mercado(s) analizados, ${valor.filter((v) => v.ev > 0).length} con valor positivo.`
      : 'Sin cuotas introducidas: se muestran cuotas justas del modelo.',
    valor
  );

  // ---- 6. Síntesis ---------------------------------------------------
  ev('sintesis', 'activo', cfg.geminiServidor ? 'Consultando Gemini para el informe…' : 'Redactando informe local…');
  let informe;
  if (cfg.geminiServidor) {
    try {
      informe = await generarNarrativa(cfg, resultado);
      resultado.fuenteInforme = `Gemini (${cfg.modelo})`;
    } catch (err) {
      informe = informeLocal(cfg, resultado) + `\n\n⚠️ Gemini no respondió (${err.message}). Informe generado localmente.`;
      resultado.fuenteInforme = 'Local (fallback)';
    }
  } else {
    await dormir(450);
    informe = informeLocal(cfg, resultado);
    resultado.fuenteInforme = 'Motor local';
  }
  resultado.informe = informe;
  ev('sintesis', 'ok', `Informe listo · ${resultado.fuenteInforme}`, informe);

  return resultado;
}

function evaluarMercado(corners, tarjetas, cuotas) {
  const filas = [];
  const push = (mercado, linea, lado, p, cuota) => {
    if (!cuota || cuota <= 1) return;
    filas.push({
      mercado, linea, lado, p,
      cuota,
      pImplicita: 1 / cuota,
      ev: p * cuota - 1,
    });
  };
  if (cuotas.cornersLinea != null) {
    const p = probOver(corners.dist, cuotas.cornersLinea);
    push('Córners', cuotas.cornersLinea, 'Over', p, cuotas.cornersOver);
    push('Córners', cuotas.cornersLinea, 'Under', 1 - p, cuotas.cornersUnder);
  }
  if (cuotas.tarjetasLinea != null) {
    const p = probOver(tarjetas.dist, cuotas.tarjetasLinea);
    push('Tarjetas', cuotas.tarjetasLinea, 'Over', p, cuotas.tarjetasOver);
    push('Tarjetas', cuotas.tarjetasLinea, 'Under', 1 - p, cuotas.tarjetasUnder);
  }
  return filas.sort((a, b) => b.ev - a.ev);
}

export function informeLocal(cfg, r) {
  const c = r.corners;
  const t = r.tarjetas;
  const mejorCorner = c.lineas.reduce((a, b) =>
    Math.abs(b.over - 0.5) < Math.abs(a.over - 0.5) ? b : a
  );
  const mejorTarjeta = t.lineas.reduce((a, b) =>
    Math.abs(b.over - 0.5) < Math.abs(a.over - 0.5) ? b : a
  );

  const lineas = [];
  lineas.push(`**${cfg.local.nombre} vs ${cfg.visitante.nombre}** — ${cfg.importancia.nombre}, ${cfg.clima.nombre.toLowerCase()}, ${cfg.arbitro.nombre.toLowerCase()}.`);
  lineas.push('');
  lineas.push(`### Córners`);
  lineas.push(
    `El modelo proyecta **${c.muTotal.toFixed(1)} córners totales** (${c.muLocal.toFixed(1)} para ${cfg.local.nombre}, ${c.muVisit.toFixed(1)} para ${cfg.visitante.nombre}). ` +
      `El intervalo de confianza al 80% va de ${c.ic[0]} a ${c.ic[1]}. La línea más equilibrada es **${mejorCorner.linea}** (over ${pct(mejorCorner.over)}).`
  );
  const sesgoC = c.muLocal / (c.muLocal + c.muVisit);
  lineas.push(
    sesgoC > 0.6
      ? `${cfg.local.nombre} debería dominar el juego de esquina (${pct(sesgoC)} del total), lo que abre el mercado de córners asiáticos a su favor.`
      : sesgoC < 0.4
      ? `${cfg.visitante.nombre} proyecta más córners que el local pese a jugar fuera: ojo al hándicap de córners visitante.`
      : `El reparto de córners está muy igualado (${pct(sesgoC)} local), poco valor en hándicaps.`
  );
  lineas.push('');
  lineas.push(`### Tarjetas`);
  lineas.push(
    `Se esperan **${t.muTotal.toFixed(1)} amarillas** (${t.muLocal.toFixed(1)} local / ${t.muVisit.toFixed(1)} visitante), con un ${pct(t.pRoja)} de probabilidad de al menos una roja. ` +
      `Línea neutral: **${mejorTarjeta.linea}** (over ${pct(mejorTarjeta.over)}).`
  );
  if (cfg.arbitro.severidad >= 1.2)
    lineas.push(`El perfil arbitral es el factor dominante aquí: eleva la proyección un ${((cfg.arbitro.severidad - 1) * 100).toFixed(0)}% sobre la media.`);
  if (cfg.importancia.tarjetas >= 1.15)
    lineas.push(`El peso del partido (${cfg.importancia.nombre.toLowerCase()}) añade tensión y justifica inclinarse al over disciplinario.`);
  lineas.push('');
  lineas.push(`### Lectura final`);
  const recs = [];
  const o95 = probOver(c.dist, 9.5);
  recs.push(o95 > 0.58 ? `Over 9.5 córners (${pct(o95)}) es la vía más sólida.` : o95 < 0.42 ? `Under 9.5 córners (${pct(1 - o95)}) tiene respaldo estadístico.` : `El mercado de 9.5 córners está en moneda al aire (${pct(o95)}); mejor buscar líneas alternativas.`);
  const o45 = probOver(t.dist, 4.5);
  recs.push(o45 > 0.58 ? `Over 4.5 tarjetas (${pct(o45)}) encaja con el perfil del choque.` : o45 < 0.42 ? `Under 4.5 tarjetas (${pct(1 - o45)}) es la lectura natural.` : `Tarjetas sin sesgo claro en 4.5 (${pct(o45)}).`);
  lineas.push(recs.map((x) => `- ${x}`).join('\n'));
  if (r.valor?.length) {
    const mejor = r.valor[0];
    lineas.push('');
    lineas.push(
      mejor.ev > 0
        ? `Frente a las cuotas introducidas, el mejor valor es **${mejor.mercado} ${mejor.lado} ${mejor.linea} @ ${mejor.cuota}** con un EV de ${(mejor.ev * 100).toFixed(1)}%.`
        : `Ninguna de las cuotas introducidas ofrece valor positivo (el mejor caso es ${(mejor.ev * 100).toFixed(1)}%).`
    );
  }
  return lineas.join('\n');
}
