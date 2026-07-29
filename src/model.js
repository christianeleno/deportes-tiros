// Motor estadístico: Poisson / Binomial Negativa para córners y tarjetas.

const VENTAJA_LOCAL_CORNERS = 1.09; // el local genera ~9% más córners
const VENTAJA_LOCAL_TARJETAS = 0.93; // el local recibe ~7% menos tarjetas
const MEDIA_LIGA_CORNERS = 5.4;
const MEDIA_LIGA_TARJETAS = 2.45;

export function factorial(n) {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

export function poissonPmf(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

/**
 * Binomial negativa parametrizada por media y dispersión (r).
 * Reproduce la sobredispersión real de córners/tarjetas mejor que Poisson puro.
 */
export function negBinPmf(k, mu, r) {
  const p = r / (r + mu);
  let logC = 0;
  for (let i = 0; i < k; i++) logC += Math.log(r + i) - Math.log(i + 1);
  return Math.exp(logC + r * Math.log(p) + k * Math.log(1 - p));
}

/** Distribución completa 0..max con la cola acumulada en el último bucket. */
export function distribucion(mu, r, max = 25) {
  const d = [];
  let acum = 0;
  for (let k = 0; k <= max; k++) {
    const p = negBinPmf(k, mu, r);
    d.push(p);
    acum += p;
  }
  d.push(Math.max(0, 1 - acum)); // resto de la cola
  return d;
}

/** P(X > linea) para líneas con .5 */
export function probOver(dist, linea) {
  const corte = Math.floor(linea);
  let under = 0;
  for (let k = 0; k <= corte && k < dist.length; k++) under += dist[k];
  return 1 - under;
}

export function cuotaJusta(p) {
  if (p <= 0.0001) return Infinity;
  return 1 / p;
}

/**
 * Modelo de córners.
 * Ataque de un equipo x defensa del rival, normalizado a la media de liga.
 */
export function modeloCorners({ local, visitante, clima, importancia }) {
  const fuerzaLocal = (local.cf / MEDIA_LIGA_CORNERS) * (visitante.ca / MEDIA_LIGA_CORNERS);
  const fuerzaVisit = (visitante.cf / MEDIA_LIGA_CORNERS) * (local.ca / MEDIA_LIGA_CORNERS);

  const ctx = clima.corners * importancia.corners;

  const muLocal = MEDIA_LIGA_CORNERS * fuerzaLocal * VENTAJA_LOCAL_CORNERS * local.int * ctx;
  const muVisit = MEDIA_LIGA_CORNERS * fuerzaVisit * visitante.int * ctx;
  const muTotal = muLocal + muVisit;

  // r calibrado: los córners totales tienen varianza ≈ 1.35 * media
  const r = muTotal / 0.35;

  return {
    muLocal,
    muVisit,
    muTotal,
    dist: distribucion(muTotal, r, 25),
    distLocal: distribucion(muLocal, muLocal / 0.35, 16),
    distVisit: distribucion(muVisit, muVisit / 0.35, 16),
  };
}

/**
 * Modelo de tarjetas.
 * Combina tarjetas recibidas propias, faltas provocadas del rival, árbitro y contexto.
 */
export function modeloTarjetas({ local, visitante, arbitro, clima, importancia }) {
  const provocaLocal = visitante.fc / 12.2; // faltas del rival empujan tarjetas propias
  const provocaVisit = local.fc / 12.2;

  const ctx = clima.tarjetas * importancia.tarjetas * arbitro.severidad;

  const muLocal =
    local.tf * (local.agr * 0.6 + 0.4) * provocaLocal * VENTAJA_LOCAL_TARJETAS * ctx;
  const muVisit = visitante.tf * (visitante.agr * 0.6 + 0.4) * provocaVisit * ctx;
  const muTotal = muLocal + muVisit;

  const r = muTotal / 0.45;

  // Roja: exponencial sobre la tasa de amarillas esperada.
  // Coeficiente calibrado para que un partido medio (≈4.5 amarillas) dé ~10%
  // de probabilidad de roja, en línea con la tasa observada en las grandes ligas.
  const pRoja = 1 - Math.exp(-0.023 * muTotal * (importancia.tarjetas > 1.1 ? 1.3 : 1));

  return {
    muLocal,
    muVisit,
    muTotal,
    pRoja,
    dist: distribucion(muTotal, r, 20),
    distLocal: distribucion(muLocal, muLocal / 0.45, 12),
    distVisit: distribucion(muVisit, muVisit / 0.45, 12),
  };
}

/** Genera la tabla de líneas over/under con probabilidad y cuota justa. */
export function tablaLineas(dist, lineas) {
  return lineas.map((l) => {
    const over = probOver(dist, l);
    return {
      linea: l,
      over,
      under: 1 - over,
      cuotaOver: cuotaJusta(over),
      cuotaUnder: cuotaJusta(1 - over),
    };
  });
}

/** Intervalo de confianza al 80% (percentiles 10 y 90). */
export function intervalo(dist, alfa = 0.1) {
  let acum = 0;
  let lo = 0;
  let hi = dist.length - 1;
  for (let k = 0; k < dist.length; k++) {
    acum += dist[k];
    if (acum >= alfa && lo === 0) lo = k;
    if (acum >= 1 - alfa) { hi = k; break; }
  }
  return [lo, hi];
}

/** Detecta valor comparando la probabilidad del modelo con una cuota de mercado. */
export function valorEsperado(pModelo, cuotaMercado) {
  if (!cuotaMercado || cuotaMercado <= 1) return null;
  const ev = pModelo * cuotaMercado - 1;
  return { ev, pImplicita: 1 / cuotaMercado, edge: pModelo - 1 / cuotaMercado };
}
