// Integración con Gemini. El navegador NO habla con Google: monta el prompt y
// lo manda al proxy /api/gemini, que es quien tiene la clave. Así la app
// funciona en cualquier equipo sin configurar nada y la clave no se expone.
// El modelo lo decide el servidor (GEMINI_MODELO); esto es solo el respaldo.

export const MODELO_POR_DEFECTO = 'gemini-3.6-flash';

const pct = (p) => `${(p * 100).toFixed(1)}%`;

export function construirPrompt(cfg, r) {
  const c = r.corners;
  const t = r.tarjetas;
  const lineasCorners = c.lineas
    .map((l) => `  - Over ${l.linea}: ${pct(l.over)} (cuota justa ${l.cuotaOver.toFixed(2)})`)
    .join('\n');
  const lineasTarjetas = t.lineas
    .map((l) => `  - Over ${l.linea}: ${pct(l.over)} (cuota justa ${l.cuotaOver.toFixed(2)})`)
    .join('\n');
  const mercado = (r.valor || [])
    .map((v) => `  - ${v.mercado} ${v.lado} ${v.linea} @ ${v.cuota} → EV ${(v.ev * 100).toFixed(1)}%`)
    .join('\n');

  return `Eres un analista cuantitativo de fútbol. Redacta un informe previo al partido en español, claro y accionable, basándote EXCLUSIVAMENTE en los números que te doy. No inventes datos, alineaciones ni lesiones.

PARTIDO: ${cfg.local.nombre} (local) vs ${cfg.visitante.nombre} (visitante)
Contexto: ${cfg.importancia.nombre} · ${cfg.clima.nombre} · ${cfg.arbitro.nombre} (${cfg.arbitro.taNota})

PERFILES POR 90':
- ${cfg.local.nombre}: ${cfg.local.cf} córners a favor, ${cfg.local.ca} en contra, ${cfg.local.tf} tarjetas, ${cfg.local.fc} faltas cometidas.
- ${cfg.visitante.nombre}: ${cfg.visitante.cf} córners a favor, ${cfg.visitante.ca} en contra, ${cfg.visitante.tf} tarjetas, ${cfg.visitante.fc} faltas cometidas.

PROYECCIÓN CÓRNERS (binomial negativa):
- Total esperado: ${c.muTotal.toFixed(2)} (local ${c.muLocal.toFixed(2)} / visitante ${c.muVisit.toFixed(2)})
- Intervalo 80%: ${c.ic[0]}–${c.ic[1]}
${lineasCorners}

PROYECCIÓN TARJETAS:
- Amarillas esperadas: ${t.muTotal.toFixed(2)} (local ${t.muLocal.toFixed(2)} / visitante ${t.muVisit.toFixed(2)})
- Intervalo 80%: ${t.ic[0]}–${t.ic[1]}
- Probabilidad de al menos una roja: ${pct(t.pRoja)}
${lineasTarjetas}

AJUSTES DE CONTEXTO APLICADOS:
- Árbitro: ${(r.contexto.impactoArbitro).toFixed(0)}% sobre tarjetas
- Clima: ${(r.contexto.impactoClima).toFixed(0)}% sobre córners
- Importancia: ${(r.contexto.impactoPeso).toFixed(0)}% sobre tarjetas

${mercado ? `CUOTAS DE MERCADO EVALUADAS:\n${mercado}` : 'Sin cuotas de mercado introducidas.'}

Estructura la respuesta en markdown con estas secciones:
### Córners — qué esperar
### Tarjetas — temperatura del partido
### Dónde está el valor
### Riesgos del modelo

Sé concreto, cita las probabilidades, y en "Riesgos del modelo" menciona qué supuestos podrían fallar. Máximo 450 palabras.`;
}

export async function generarNarrativa(cfg, resultado) {
  const modelo = cfg.modelo || MODELO_POR_DEFECTO;
  const prompt = construirPrompt(cfg, resultado);

  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, modelo }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  if (!json.texto) throw new Error('respuesta vacía del proxy');
  return json.texto;
}
