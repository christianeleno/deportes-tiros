/**
 * Proveedor "Free API Live Football Data" (RapidAPI, host
 * free-api-live-football-data.p.rapidapi.com).
 *
 * Rutas y parámetros verificados contra el playground de RapidAPI:
 *   /football-get-list-all-team?leagueid=42
 *   /football-get-all-matches-by-league?leagueid=42
 *   /football-get-match-all-stats?eventid=4621624
 *   /football-get-match-referee?eventid=...
 *   /football-popular-leagues
 *
 * Los datos vienen de origen FotMob, con estructuras anidadas y variables entre
 * endpoints. Por eso NO navegamos rutas fijas: buscamos recursivamente por
 * título de estadística. Si el proveedor reordena su JSON, esto sigue leyendo.
 */

const HOST = 'free-api-live-football-data.p.rapidapi.com';

// Ids de liga en el esquema FotMob que usa este proveedor.
const LIGAS = [
  { id: 87, clave: 'laliga', nombre: 'LaLiga' },
  { id: 47, clave: 'premier', nombre: 'Premier League' },
  { id: 55, clave: 'seriea', nombre: 'Serie A' },
  { id: 54, clave: 'bundesliga', nombre: 'Bundesliga' },
  { id: 53, clave: 'ligue1', nombre: 'Ligue 1' },
  { id: 42, clave: 'ucl', nombre: 'Champions League' },
];

// Sinónimos con los que cada proveedor etiqueta la misma estadística.
const ETIQUETAS = {
  corners: ['corners', 'corner kicks'],
  amarillas: ['yellow cards', 'yellow card'],
  rojas: ['red cards', 'red card'],
  faltas: ['fouls', 'fouls committed'],
  tiros: ['total shots', 'shots', 'shots total'],
};

const norm = (s) => String(s || '').trim().toLowerCase();
const esNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Recorre el JSON buscando un nodo {title: <etiqueta>, stats: [local, visitante]}.
 * Acepta números o cadenas numéricas, y también el formato {home, away}.
 * Devuelve [local, visitante] o null.
 */
function buscarEstadistica(nodo, etiquetas, visto = new Set()) {
  if (!nodo || typeof nodo !== 'object' || visto.has(nodo)) return null;
  visto.add(nodo);

  if (Array.isArray(nodo)) {
    for (const hijo of nodo) {
      const r = buscarEstadistica(hijo, etiquetas, visto);
      if (r) return r;
    }
    return null;
  }

  const titulo = norm(nodo.title ?? nodo.name ?? nodo.type ?? nodo.key);
  if (titulo && etiquetas.includes(titulo)) {
    const par = extraerPar(nodo.stats ?? nodo.value ?? nodo.values ?? nodo.data);
    if (par) return par;
  }

  for (const v of Object.values(nodo)) {
    const r = buscarEstadistica(v, etiquetas, visto);
    if (r) return r;
  }
  return null;
}

/** Normaliza los formatos en que puede venir el par local/visitante. */
function extraerPar(v) {
  if (!v) return null;
  const num = (x) => {
    if (esNum(x)) return x;
    if (typeof x === 'string') {
      const n = parseFloat(x.replace(/[^\d.,-]/g, '').replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    }
    if (x && typeof x === 'object') return num(x.value ?? x.total ?? x.stat);
    return null;
  };
  if (Array.isArray(v) && v.length >= 2) {
    const a = num(v[0]);
    const b = num(v[1]);
    return a !== null && b !== null ? [a, b] : null;
  }
  if (typeof v === 'object' && (v.home !== undefined || v.away !== undefined)) {
    const a = num(v.home);
    const b = num(v.away);
    return a !== null && b !== null ? [a, b] : null;
  }
  return null;
}

/**
 * Localiza la lista de partidos dentro de la respuesta, sea cual sea su ruta.
 * Un partido es un objeto con id y dos lados (home/away).
 */
function buscarPartidos(nodo, salida = [], visto = new Set()) {
  if (!nodo || typeof nodo !== 'object' || visto.has(nodo)) return salida;
  visto.add(nodo);

  if (Array.isArray(nodo)) {
    for (const hijo of nodo) buscarPartidos(hijo, salida, visto);
    return salida;
  }
  const tieneLados = nodo.home && nodo.away && typeof nodo.home === 'object';
  const id = nodo.id ?? nodo.matchId ?? nodo.eventId;
  if (tieneLados && id !== undefined) {
    salida.push(nodo);
    return salida;
  }
  for (const v of Object.values(nodo)) buscarPartidos(v, salida, visto);
  return salida;
}

/** ¿El partido está terminado? Los flags varían según el endpoint. */
function terminado(p) {
  const s = p.status || {};
  if (s.finished === true || s.cancelled === false && s.finished === true) return true;
  const txt = norm(s.reason?.short ?? s.reason?.long ?? s.scoreStr ?? p.statusText);
  return ['ft', 'aet', 'pen', 'full-time', 'finished'].some((t) => txt.includes(t));
}

function crear({ apiGet, acotar }) {
  // apiGet lo inyecta el servidor: añade la clave de RapidAPI y gestiona la caché.
  const get = (ruta) => apiGet(HOST, ruta);

  return {
    id: 'livefootball',
    nombre: 'Free API Live Football Data',
    ligas: async () => LIGAS,

    /**
     * Equipos de la liga.
     *
     * OJO: /football-get-list-all-team IGNORA el parámetro leagueid y devuelve
     * siempre la Bundesliga (verificado el 28/07/2026 con los ids 47, 54, 55 y
     * 87: misma respuesta de 18 equipos alemanes). Es un defecto del proveedor.
     * Derivamos la lista de los partidos de la liga, que sí respeta leagueid,
     * y de paso ahorramos una petición porque esa respuesta ya hace falta luego.
     */
    async equipos(idLiga) {
      const j = await get(`/football-get-all-matches-by-league?leagueid=${idLiga}`);
      const mapa = new Map();
      for (const p of buscarPartidos(j)) {
        for (const lado of [p.home, p.away]) {
          if (lado?.id != null && lado.name) {
            mapa.set(String(lado.id), { id: String(lado.id), nombre: lado.name, escudo: '' });
          }
        }
      }
      const equipos = [...mapa.values()];
      if (!equipos.length) throw new Error('No se reconocieron equipos en la respuesta del proveedor');
      return equipos.sort((a, b) => a.nombre.localeCompare(b.nombre));
    },

    /** Perfil por 90' sobre los últimos N partidos terminados del equipo en esa liga. */
    async perfil(idEquipo, idLiga, _temporada, partidos) {
      const j = await get(`/football-get-all-matches-by-league?leagueid=${idLiga}`);
      const todos = buscarPartidos(j);

      const suyos = todos
        .filter((p) => String(p.home.id) === String(idEquipo) || String(p.away.id) === String(idEquipo))
        .filter(terminado)
        .sort((a, b) => String(b.status?.utcTime ?? b.time ?? '').localeCompare(String(a.status?.utcTime ?? a.time ?? '')))
        .slice(0, partidos);

      if (!suyos.length) throw new Error(`Sin partidos terminados para el equipo ${idEquipo} en la liga ${idLiga}`);

      const acc = { cf: 0, ca: 0, tf: 0, fc: 0, tiros: 0, rojas: 0, n: 0 };
      const detalle = [];
      let nombre = null;

      for (const p of suyos) {
        const esLocal = String(p.home.id) === String(idEquipo);
        if (!nombre) nombre = esLocal ? p.home.name : p.away.name;

        let est;
        try {
          est = await get(`/football-get-match-all-stats?eventid=${p.id ?? p.matchId ?? p.eventId}`);
        } catch {
          continue; // partido sin estadísticas publicadas: se descarta
        }

        const lee = (clave) => {
          const par = buscarEstadistica(est, ETIQUETAS[clave]);
          if (!par) return null;
          return { propio: esLocal ? par[0] : par[1], rival: esLocal ? par[1] : par[0] };
        };

        const corners = lee('corners');
        const amarillas = lee('amarillas');
        const faltas = lee('faltas');
        if (!corners || !amarillas || !faltas) continue;

        const tiros = lee('tiros');
        const rojas = lee('rojas');

        acc.cf += corners.propio;
        acc.ca += corners.rival;
        acc.tf += amarillas.propio;
        acc.fc += faltas.propio;
        acc.tiros += tiros?.propio ?? 12.5;
        acc.rojas += rojas?.propio ?? 0;
        acc.n++;

        detalle.push({
          rival: esLocal ? p.away.name : p.home.name,
          local: esLocal,
          cf: corners.propio,
          ca: corners.rival,
          tf: amarillas.propio,
          fc: faltas.propio,
        });
      }

      if (acc.n < 3) {
        throw new Error(
          `Muestra insuficiente: solo ${acc.n} de ${suyos.length} partidos traían estadísticas completas`
        );
      }

      const n = acc.n;
      const cf = acc.cf / n;
      const fc = acc.fc / n;
      const tiros = acc.tiros / n;

      return {
        id: `lf${idEquipo}`,
        idApi: String(idEquipo),
        nombre: nombre || `Equipo ${idEquipo}`,
        liga: idLiga,
        cf: +cf.toFixed(2),
        ca: +(acc.ca / n).toFixed(2),
        tf: +(acc.tf / n).toFixed(2),
        fc: +fc.toFixed(2),
        agr: +acotar(fc / 12.2, 0.8, 1.25).toFixed(3),
        int: +acotar(tiros / 12.5, 0.8, 1.25).toFixed(3),
        rojasPorPartido: +(acc.rojas / n).toFixed(3),
        muestra: { partidos: n, solicitados: partidos, detalle },
        fuente: 'Free API Live Football Data',
      };
    },

    /** Severidad arbitral: amarillas por partido del colegiado ÷ media de liga (4.6). */
    async arbitro(nombre, idLiga, _temporada, maxPartidos = 12) {
      const j = await get(`/football-get-all-matches-by-league?leagueid=${idLiga}`);
      const partidos = buscarPartidos(j).filter(terminado);

      let tarjetas = 0;
      let n = 0;
      let revisados = 0;

      for (const p of partidos) {
        if (n >= maxPartidos || revisados >= maxPartidos * 3) break;
        revisados++;
        let ref;
        try {
          ref = await get(`/football-get-match-referee?eventid=${p.id}`);
        } catch {
          continue;
        }
        if (!JSON.stringify(ref).toLowerCase().includes(norm(nombre))) continue;

        try {
          const est = await get(`/football-get-match-all-stats?eventid=${p.id}`);
          const par = buscarEstadistica(est, ETIQUETAS.amarillas);
          if (par) { tarjetas += par[0] + par[1]; n++; }
        } catch { /* ignorar */ }
      }

      if (n < 3) throw new Error(`Solo ${n} partidos localizados para "${nombre}" (hacen falta 3)`);

      const media = tarjetas / n;
      return {
        id: `ref_${norm(nombre).replace(/[^a-z0-9]/g, '_')}`,
        nombre,
        severidad: +acotar(media / 4.6, 0.6, 1.8).toFixed(3),
        taNota: `${media.toFixed(1)} TA/partido · ${n} partidos`,
        fuente: 'Free API Live Football Data',
      };
    },
  };
}

module.exports = { crear, HOST, LIGAS, buscarEstadistica, buscarPartidos, ETIQUETAS };
