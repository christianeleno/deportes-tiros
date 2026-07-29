/**
 * Servidor de PitchIQ: sirve los estáticos y hace de proxy hacia el proveedor
 * de datos elegido. Las claves viven SOLO aquí, nunca llegan al navegador.
 *
 * Proveedores soportados (se activa el primero que tenga clave):
 *   RAPIDAPI_KEY      → Free API Live Football Data (RapidAPI)
 *   APIFOOTBALL_KEY   → API-Football (api-sports.io)
 *
 *   set RAPIDAPI_KEY=tu_clave
 *   node server.js
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const liveFootball = require('./providers/livefootball.js');

const PUERTO = process.env.PORT || 4173;
const CLAVE_RAPID = process.env.RAPIDAPI_KEY || '';
const CLAVE_APIFOOTBALL = process.env.APIFOOTBALL_KEY || '';
const CLAVE_GEMINI = process.env.GEMINI_API_KEY || '';
const MODELO_GEMINI = process.env.GEMINI_MODELO || 'gemini-3.6-flash';
const HOST_APIFOOTBALL = 'v3.football.api-sports.io';
// En Cloud Run el contenedor es efímero: la caché va a /tmp vía CACHE_DIR.
const DIR_CACHE = process.env.CACHE_DIR || path.join(__dirname, '.cache');
const TTL_CACHE = 6 * 60 * 60 * 1000; // 6 h: los partidos recientes cambian a diario
const PARTIDOS = Number(process.env.PITCHIQ_PARTIDOS || 10);

// --- Protección de cuota (imprescindible si la app es pública) ---------------
// Las claves son del dueño del despliegue, así que sin límites cualquiera puede
// agotarlas. Los contadores son por instancia: despliega con --max-instances=1
// para que el presupuesto diario sea exacto.
const LIMITE_IP_HORA = Number(process.env.LIMITE_IP_HORA || 15);
const PRESUPUESTO_DIA = Number(process.env.PRESUPUESTO_DIA || 400);
const LIMITE_GEMINI_DIA = Number(process.env.LIMITE_GEMINI_DIA || 150);

const acotar = (v, min, max) => Math.min(max, Math.max(min, v));
const clave = (s) => s.replace(/[^a-z0-9]/gi, '_').slice(0, 150);

// --------------------------------------------------------------------- caché
function contarCache() {
  try {
    return fs.readdirSync(DIR_CACHE).length;
  } catch {
    return 0;
  }
}

function leerCache(k) {
  const f = path.join(DIR_CACHE, `${clave(k)}.json`);
  try {
    const { ts, datos } = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (Date.now() - ts > TTL_CACHE) return null;
    return datos;
  } catch {
    return null;
  }
}

function escribirCache(k, datos) {
  try {
    if (!fs.existsSync(DIR_CACHE)) fs.mkdirSync(DIR_CACHE, { recursive: true });
    fs.writeFileSync(path.join(DIR_CACHE, `${clave(k)}.json`), JSON.stringify({ ts: Date.now(), datos }));
  } catch (e) {
    console.warn('No se pudo escribir en caché:', e.message);
  }
}

// ------------------------------------------------------------- límites de uso
const golpesPorIp = new Map(); // ip -> [marcas de tiempo]
let gastoUpstream = { dia: null, peticiones: 0, gemini: 0 };

/** Reinicia los contadores diarios al cambiar de día (UTC). */
function diaActual() {
  const hoy = new Date().toISOString().slice(0, 10);
  if (gastoUpstream.dia !== hoy) gastoUpstream = { dia: hoy, peticiones: 0, gemini: 0 };
  return gastoUpstream;
}

/** Cloud Run pone la IP real del cliente al principio de X-Forwarded-For. */
function ipCliente(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return req.socket.remoteAddress || 'desconocida';
}

/**
 * Ventana deslizante de una hora por IP. Solo se aplica a los endpoints que
 * cuestan dinero (perfil y gemini); navegar la interfaz no consume nada.
 */
function superaLimiteIp(req) {
  const ip = ipCliente(req);
  const ahora = Date.now();
  const hace1h = ahora - 3600_000;
  const marcas = (golpesPorIp.get(ip) || []).filter((t) => t > hace1h);
  marcas.push(ahora);
  golpesPorIp.set(ip, marcas);

  // Limpieza perezosa para que el mapa no crezca sin fin
  if (golpesPorIp.size > 5000) {
    for (const [k, v] of golpesPorIp) {
      if (!v.some((t) => t > hace1h)) golpesPorIp.delete(k);
    }
  }
  return marcas.length > LIMITE_IP_HORA;
}

// ------------------------------------------------------------------ upstream
let peticiones = 0;

/** GET cacheado a un host externo. Las cabeceras de autenticación se añaden aquí. */
function apiGet(host, ruta) {
  const k = `${host}${ruta}`;
  const cacheado = leerCache(k);
  if (cacheado) return Promise.resolve(cacheado);

  // Solo las peticiones que salen de verdad gastan presupuesto: las servidas
  // desde caché ya han vuelto antes de llegar aquí.
  const gasto = diaActual();
  if (gasto.peticiones >= PRESUPUESTO_DIA) {
    return Promise.reject(
      new Error(`Presupuesto diario agotado (${PRESUPUESTO_DIA} peticiones). Vuelve mañana.`)
    );
  }
  gasto.peticiones++;

  const headers = {};
  if (host === liveFootball.HOST) {
    if (!CLAVE_RAPID) return Promise.reject(new Error('Falta RAPIDAPI_KEY en el entorno'));
    headers['x-rapidapi-host'] = host;
    headers['x-rapidapi-key'] = CLAVE_RAPID;
  } else {
    if (!CLAVE_APIFOOTBALL) return Promise.reject(new Error('Falta APIFOOTBALL_KEY en el entorno'));
    headers['x-apisports-key'] = CLAVE_APIFOOTBALL;
  }

  return new Promise((resolve, reject) => {
    const req = https.request({ host, path: ruta, method: 'GET', headers }, (res) => {
      let cuerpo = '';
      res.on('data', (d) => (cuerpo += d));
      res.on('end', () => {
        peticiones++;
        if (res.statusCode !== 200) {
          return reject(new Error(`${host} HTTP ${res.statusCode}: ${cuerpo.slice(0, 180)}`));
        }
        let json;
        try {
          json = JSON.parse(cuerpo);
        } catch {
          return reject(new Error(`Respuesta no-JSON de ${host}`));
        }
        // API-Football devuelve 200 con los errores dentro del cuerpo
        const err = json.errors;
        if (err && !Array.isArray(err) && Object.keys(err).length) {
          return reject(new Error(Object.values(err).join(' · ')));
        }
        escribirCache(k, json);
        resolve(json);
      });
    });
    req.on('error', reject);
    req.setTimeout(25000, () => req.destroy(new Error('timeout hacia el proveedor')));
    req.end();
  });
}

// ------------------------------------------------------- proveedor API-Football
const LIGAS_AF = [
  { id: 140, clave: 'laliga', nombre: 'LaLiga' },
  { id: 39, clave: 'premier', nombre: 'Premier League' },
  { id: 135, clave: 'seriea', nombre: 'Serie A' },
  { id: 78, clave: 'bundesliga', nombre: 'Bundesliga' },
  { id: 61, clave: 'ligue1', nombre: 'Ligue 1' },
];

function statAF(bloque, tipo) {
  const s = (bloque.statistics || []).find((x) => x.type === tipo);
  const v = s?.value;
  if (v === null || v === undefined) return null;
  return typeof v === 'string' ? parseFloat(v) : v;
}

const apiFootball = {
  id: 'apifootball',
  nombre: 'API-Football',
  ligas: async () => LIGAS_AF,
  usaTemporada: true,

  async equipos(idLiga, temporada) {
    const j = await apiGet(HOST_APIFOOTBALL, `/teams?league=${idLiga}&season=${temporada}`);
    return (j.response || [])
      .map((r) => ({ id: String(r.team.id), nombre: r.team.name, escudo: r.team.logo }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  },

  async perfil(idEquipo, idLiga, temporada, partidos) {
    const fixtures = await apiGet(
      HOST_APIFOOTBALL,
      `/fixtures?team=${idEquipo}&league=${idLiga}&season=${temporada}&status=FT&last=${partidos}`
    );
    const lista = fixtures.response || [];
    if (!lista.length) throw new Error(`Sin partidos finalizados para el equipo ${idEquipo} en ${temporada}`);

    const acc = { cf: 0, ca: 0, tf: 0, fc: 0, tiros: 0, rojas: 0, n: 0 };
    const detalle = [];

    for (const p of lista) {
      let est;
      try {
        est = await apiGet(HOST_APIFOOTBALL, `/fixtures/statistics?fixture=${p.fixture.id}`);
      } catch {
        continue;
      }
      const bloques = est.response || [];
      const propio = bloques.find((b) => String(b.team.id) === String(idEquipo));
      const rival = bloques.find((b) => String(b.team.id) !== String(idEquipo));
      if (!propio || !rival) continue;

      const cf = statAF(propio, 'Corner Kicks');
      const tf = statAF(propio, 'Yellow Cards');
      const fc = statAF(propio, 'Fouls');
      if (cf === null || tf === null || fc === null) continue;

      acc.cf += cf;
      acc.ca += statAF(rival, 'Corner Kicks') ?? 0;
      acc.tf += tf;
      acc.fc += fc;
      acc.tiros += statAF(propio, 'Total Shots') ?? 12.5;
      acc.rojas += statAF(propio, 'Red Cards') ?? 0;
      acc.n++;

      detalle.push({
        fecha: p.fixture.date.slice(0, 10),
        rival: String(p.teams.home.id) === String(idEquipo) ? p.teams.away.name : p.teams.home.name,
        local: String(p.teams.home.id) === String(idEquipo),
        cf, ca: statAF(rival, 'Corner Kicks') ?? 0, tf, fc,
      });
    }

    if (acc.n < 3) throw new Error(`Muestra insuficiente (${acc.n} partidos con estadísticas)`);

    const n = acc.n;
    const eq = String(lista[0].teams.home.id) === String(idEquipo) ? lista[0].teams.home : lista[0].teams.away;
    const cf = acc.cf / n;
    const fc = acc.fc / n;

    return {
      id: `af${idEquipo}`,
      idApi: String(idEquipo),
      nombre: eq.name,
      escudo: eq.logo,
      liga: idLiga,
      temporada,
      cf: +cf.toFixed(2),
      ca: +(acc.ca / n).toFixed(2),
      tf: +(acc.tf / n).toFixed(2),
      fc: +fc.toFixed(2),
      agr: +acotar(fc / 12.2, 0.8, 1.25).toFixed(3),
      int: +acotar(acc.tiros / n / 12.5, 0.8, 1.25).toFixed(3),
      rojasPorPartido: +(acc.rojas / n).toFixed(3),
      muestra: { partidos: n, solicitados: partidos, detalle },
      fuente: 'API-Football',
    };
  },

  async arbitro(nombre, idLiga, temporada) {
    const fixtures = await apiGet(HOST_APIFOOTBALL, `/fixtures?league=${idLiga}&season=${temporada}&status=FT`);
    const suyos = (fixtures.response || []).filter((f) =>
      (f.fixture.referee || '').toLowerCase().includes(nombre.toLowerCase())
    );
    if (suyos.length < 3) throw new Error(`Solo ${suyos.length} partidos encontrados para "${nombre}"`);

    let tarjetas = 0;
    let n = 0;
    for (const f of suyos.slice(0, 12)) {
      try {
        const est = await apiGet(HOST_APIFOOTBALL, `/fixtures/statistics?fixture=${f.fixture.id}`);
        const total = (est.response || []).reduce((s, b) => s + (statAF(b, 'Yellow Cards') ?? 0), 0);
        if (total > 0) { tarjetas += total; n++; }
      } catch { /* ignorar */ }
    }
    if (!n) throw new Error('Sin estadísticas de tarjetas para ese árbitro');

    const media = tarjetas / n;
    return {
      id: `ref_${clave(nombre)}`,
      nombre,
      severidad: +acotar(media / 4.6, 0.6, 1.8).toFixed(3),
      taNota: `${media.toFixed(1)} TA/partido · ${n} partidos`,
      fuente: 'API-Football',
    };
  },
};

// ------------------------------------------------------- selección de proveedor
const PROVEEDORES = {
  livefootball: liveFootball.crear({ apiGet, acotar }),
  apifootball: apiFootball,
};

const ACTIVO = CLAVE_RAPID ? 'livefootball' : CLAVE_APIFOOTBALL ? 'apifootball' : null;
const proveedor = ACTIVO ? PROVEEDORES[ACTIVO] : null;

// ------------------------------------------------------------------- Gemini
/**
 * Proxy hacia Gemini. Permite que la clave viva en el servidor en vez de en el
 * localStorage de cada navegador: así la app funciona en cualquier equipo sin
 * que nadie tenga que pegar la clave a mano.
 */
function llamarGemini(prompt, modelo) {
  return new Promise((resolve, reject) => {
    const cuerpo = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 4000 },
    });
    const req = https.request(
      {
        host: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${modelo}:generateContent?key=${encodeURIComponent(CLAVE_GEMINI)}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(cuerpo) },
      },
      (r) => {
        let b = '';
        r.on('data', (d) => (b += d));
        r.on('end', () => {
          if (r.statusCode !== 200) return reject(new Error(`Gemini HTTP ${r.statusCode}: ${b.slice(0, 200)}`));
          try {
            const j = JSON.parse(b);
            const texto = j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
            if (!texto.trim()) return reject(new Error('respuesta vacía de Gemini'));
            resolve(texto.trim());
          } catch (e) {
            reject(new Error(`respuesta ilegible de Gemini: ${e.message}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('timeout hacia Gemini')));
    req.end(cuerpo);
  });
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', (d) => {
      b += d;
      if (b.length > 1e6) reject(new Error('cuerpo demasiado grande'));
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(b || '{}'));
      } catch {
        reject(new Error('cuerpo no es JSON'));
      }
    });
  });
}

// ------------------------------------------------------------------ rutas API
async function manejarApi(url, res, req) {
  const q = url.searchParams;
  const responder = (codigo, datos) => {
    res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(datos));
  };

  try {
    if (url.pathname === '/api/estado') {
      return responder(200, {
        claveConfigurada: !!proveedor,
        proveedor: proveedor?.id || null,
        proveedorNombre: proveedor?.nombre || null,
        usaTemporada: !!proveedor?.usaTemporada,
        geminiConfigurado: !!CLAVE_GEMINI,
        geminiModelo: CLAVE_GEMINI ? MODELO_GEMINI : null,
        ligas: proveedor ? await proveedor.ligas() : [],
        partidosPorPerfil: PARTIDOS,
        peticionesEstaSesion: peticiones,
        entradasEnCache: contarCache(),
        presupuesto: {
          usadasHoy: diaActual().peticiones,
          limiteDia: PRESUPUESTO_DIA,
          informesHoy: diaActual().gemini,
          limiteInformesDia: LIMITE_GEMINI_DIA,
          limiteIpHora: LIMITE_IP_HORA,
        },
      });
    }

    // Endpoints que cuestan cuota: limitados por IP y por presupuesto diario.
    const esCaro = url.pathname === '/api/perfil' || url.pathname === '/api/gemini';
    if (esCaro && superaLimiteIp(req)) {
      return responder(429, {
        error: `Has superado el límite de ${LIMITE_IP_HORA} análisis por hora. Prueba de nuevo más tarde.`,
      });
    }

    if (url.pathname === '/api/gemini') {
      if (!CLAVE_GEMINI) return responder(503, { error: 'El servidor no tiene GEMINI_API_KEY' });
      if (req.method !== 'POST') return responder(405, { error: 'Usa POST' });
      const gasto = diaActual();
      if (gasto.gemini >= LIMITE_GEMINI_DIA) {
        return responder(429, { error: 'Cuota diaria de informes agotada. El análisis estadístico sigue disponible.' });
      }
      gasto.gemini++;
      const { prompt, modelo } = await leerCuerpo(req);
      if (!prompt) return responder(400, { error: 'Falta el prompt' });
      const texto = await llamarGemini(prompt, modelo || MODELO_GEMINI);
      return responder(200, { texto, modelo: modelo || MODELO_GEMINI });
    }

    if (!proveedor) return responder(503, { error: 'Ningún proveedor configurado en el servidor' });

    if (url.pathname === '/api/equipos') {
      const liga = q.get('liga');
      if (!liga) return responder(400, { error: 'Falta la liga' });
      return responder(200, { equipos: await proveedor.equipos(liga, q.get('temporada')) });
    }

    if (url.pathname === '/api/perfil') {
      const equipo = q.get('equipo');
      const liga = q.get('liga');
      if (!equipo || !liga) return responder(400, { error: 'Faltan parámetros' });
      return responder(200, await proveedor.perfil(equipo, liga, q.get('temporada'), PARTIDOS));
    }

    if (url.pathname === '/api/arbitro') {
      const nombre = q.get('nombre');
      if (!nombre) return responder(400, { error: 'Falta el nombre del árbitro' });
      if (!proveedor.arbitro) return responder(501, { error: 'Este proveedor no perfila árbitros' });
      return responder(200, await proveedor.arbitro(nombre, q.get('liga'), q.get('temporada')));
    }

    // Volcado de la respuesta cruda: sirve para ajustar los extractores si el
    // proveedor cambia la forma de su JSON.
    if (url.pathname === '/api/diagnostico') {
      // Cerrado por defecto: expone respuestas crudas del proveedor y gasta
      // cuota. Actívalo solo en local con DIAGNOSTICO=1.
      if (process.env.DIAGNOSTICO !== '1') return responder(404, { error: 'Ruta no encontrada' });
      const ruta = q.get('ruta');
      if (!ruta) return responder(400, { error: 'Falta ?ruta=/football-...' });
      const j = await apiGet(liveFootball.HOST, ruta);
      return responder(200, { ruta, muestra: JSON.stringify(j).slice(0, 4000) });
    }

    return responder(404, { error: 'Ruta no encontrada' });
  } catch (e) {
    return responder(502, { error: e.message });
  }
}

// -------------------------------------------------------------- estáticos
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function servirEstatico(url, res) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const destino = path.join(__dirname, rel);
  if (!destino.startsWith(__dirname)) {
    res.writeHead(403);
    return res.end('Prohibido');
  }
  fs.readFile(destino, (err, datos) => {
    if (err) {
      res.writeHead(404);
      return res.end('No encontrado');
    }
    // Sin caché: si no, el navegador se queda con un app.js viejo tras cada
    // cambio y la interfaz deja de coincidir con el código.
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(destino)] || 'application/octet-stream',
      'Cache-Control': 'no-store, must-revalidate',
    });
    res.end(datos);
  });
}

const servidor = http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PUERTO}`);
    if (url.pathname.startsWith('/api/')) return manejarApi(url, res, req);
    servirEstatico(url, res);
  })
  .listen(PUERTO, () => {
    console.log(`PitchIQ en http://localhost:${PUERTO}`);
    console.log(
      proveedor
        ? `Proveedor activo: ${proveedor.nombre} · ${PARTIDOS} partidos por perfil · caché 6 h`
        : 'Sin clave (RAPIDAPI_KEY o APIFOOTBALL_KEY): la app arranca en modo demo.'
    );
    console.log(
      `Límites: ${LIMITE_IP_HORA} análisis/hora por IP · ${PRESUPUESTO_DIA} peticiones/día · ${LIMITE_GEMINI_DIA} informes/día`
    );
  });

// Cloud Run manda SIGTERM antes de retirar la instancia: cerramos sin cortar
// las peticiones en vuelo.
process.on('SIGTERM', () => {
  console.log('SIGTERM recibido, cerrando…');
  servidor.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10000).unref();
});
