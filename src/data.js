// Base de conocimiento de equipos y árbitros.
// AVISO: valores de demostración con medias realistas por 90'. Sustituir por una
// fuente real (API-Football, Opta, StatsBomb) antes de usar en producción.

export const LIGAS = {
  laliga: 'LaLiga',
  premier: 'Premier League',
  seriea: 'Serie A',
  bundesliga: 'Bundesliga',
  ligue1: 'Ligue 1',
};

// cf = córners a favor / 90'   ca = córners en contra / 90'
// tf = tarjetas a favor (recibidas por el equipo) / 90'   fc = faltas cometidas / 90'
// agr = índice de agresividad (0.8 - 1.25), int = intensidad ofensiva (0.8 - 1.25)
export const EQUIPOS = [
  // LaLiga
  { id: 'rma', nombre: 'Real Madrid',       liga: 'laliga',     cf: 5.9, ca: 3.4, tf: 2.1, fc: 11.4, agr: 0.95, int: 1.18 },
  { id: 'fcb', nombre: 'FC Barcelona',      liga: 'laliga',     cf: 6.8, ca: 3.1, tf: 2.3, fc: 11.9, agr: 1.00, int: 1.22 },
  { id: 'atm', nombre: 'Atlético de Madrid',liga: 'laliga',     cf: 5.1, ca: 4.0, tf: 3.0, fc: 14.2, agr: 1.20, int: 1.02 },
  { id: 'sev', nombre: 'Sevilla FC',        liga: 'laliga',     cf: 4.8, ca: 4.9, tf: 2.9, fc: 13.6, agr: 1.14, int: 0.94 },
  { id: 'bet', nombre: 'Real Betis',        liga: 'laliga',     cf: 5.0, ca: 4.7, tf: 2.7, fc: 13.1, agr: 1.10, int: 0.98 },
  { id: 'ath', nombre: 'Athletic Club',     liga: 'laliga',     cf: 5.6, ca: 4.2, tf: 2.6, fc: 13.8, agr: 1.12, int: 1.04 },
  { id: 'val', nombre: 'Valencia CF',       liga: 'laliga',     cf: 4.4, ca: 5.3, tf: 2.8, fc: 13.0, agr: 1.09, int: 0.90 },
  { id: 'get', nombre: 'Getafe CF',         liga: 'laliga',     cf: 3.9, ca: 5.6, tf: 3.6, fc: 15.8, agr: 1.25, int: 0.82 },

  // Premier League
  { id: 'mci', nombre: 'Manchester City',   liga: 'premier',    cf: 7.4, ca: 2.8, tf: 1.7, fc: 9.6,  agr: 0.85, int: 1.25 },
  { id: 'liv', nombre: 'Liverpool',         liga: 'premier',    cf: 6.9, ca: 3.3, tf: 1.9, fc: 10.2, agr: 0.90, int: 1.20 },
  { id: 'ars', nombre: 'Arsenal',           liga: 'premier',    cf: 6.5, ca: 3.5, tf: 2.2, fc: 10.9, agr: 0.98, int: 1.15 },
  { id: 'che', nombre: 'Chelsea',           liga: 'premier',    cf: 6.0, ca: 3.9, tf: 2.4, fc: 11.6, agr: 1.02, int: 1.10 },
  { id: 'mun', nombre: 'Manchester United', liga: 'premier',    cf: 5.3, ca: 4.6, tf: 2.3, fc: 11.1, agr: 1.00, int: 1.00 },
  { id: 'tot', nombre: 'Tottenham',         liga: 'premier',    cf: 5.8, ca: 4.4, tf: 2.2, fc: 10.8, agr: 0.99, int: 1.12 },
  { id: 'new', nombre: 'Newcastle',         liga: 'premier',    cf: 5.5, ca: 4.3, tf: 2.5, fc: 11.8, agr: 1.06, int: 1.06 },
  { id: 'eve', nombre: 'Everton',           liga: 'premier',    cf: 4.1, ca: 5.7, tf: 2.7, fc: 12.4, agr: 1.12, int: 0.85 },

  // Serie A
  { id: 'int', nombre: 'Inter',             liga: 'seriea',     cf: 6.2, ca: 3.4, tf: 2.4, fc: 12.1, agr: 1.02, int: 1.16 },
  { id: 'juv', nombre: 'Juventus',          liga: 'seriea',     cf: 5.4, ca: 3.8, tf: 2.6, fc: 13.0, agr: 1.08, int: 1.04 },
  { id: 'mil', nombre: 'AC Milan',          liga: 'seriea',     cf: 5.6, ca: 4.0, tf: 2.7, fc: 12.7, agr: 1.07, int: 1.08 },
  { id: 'nap', nombre: 'Napoli',            liga: 'seriea',     cf: 5.9, ca: 3.9, tf: 2.5, fc: 12.5, agr: 1.04, int: 1.10 },
  { id: 'rom', nombre: 'AS Roma',           liga: 'seriea',     cf: 5.2, ca: 4.5, tf: 3.1, fc: 14.0, agr: 1.18, int: 1.00 },
  { id: 'laz', nombre: 'Lazio',             liga: 'seriea',     cf: 5.0, ca: 4.4, tf: 2.9, fc: 13.4, agr: 1.13, int: 0.99 },

  // Bundesliga
  { id: 'bay', nombre: 'Bayern München',    liga: 'bundesliga', cf: 7.1, ca: 2.9, tf: 1.8, fc: 10.0, agr: 0.88, int: 1.24 },
  { id: 'bvb', nombre: 'Borussia Dortmund', liga: 'bundesliga', cf: 6.1, ca: 3.9, tf: 2.0, fc: 10.7, agr: 0.94, int: 1.14 },
  { id: 'lev', nombre: 'Bayer Leverkusen',  liga: 'bundesliga', cf: 6.4, ca: 3.5, tf: 2.1, fc: 10.5, agr: 0.93, int: 1.17 },
  { id: 'rbl', nombre: 'RB Leipzig',        liga: 'bundesliga', cf: 6.0, ca: 3.7, tf: 2.2, fc: 11.2, agr: 0.97, int: 1.13 },

  // Ligue 1
  { id: 'psg', nombre: 'Paris Saint-Germain', liga: 'ligue1',   cf: 7.0, ca: 3.0, tf: 2.0, fc: 10.4, agr: 0.92, int: 1.23 },
  { id: 'mar', nombre: 'Olympique Marsella',  liga: 'ligue1',   cf: 5.4, ca: 4.3, tf: 2.9, fc: 13.5, agr: 1.15, int: 1.02 },
  { id: 'lyo', nombre: 'Olympique Lyon',      liga: 'ligue1',   cf: 5.1, ca: 4.6, tf: 2.6, fc: 12.6, agr: 1.06, int: 0.98 },
  { id: 'lil', nombre: 'Lille OSC',           liga: 'ligue1',   cf: 5.2, ca: 4.2, tf: 2.5, fc: 12.3, agr: 1.05, int: 1.00 },
];

// severidad: multiplicador sobre tarjetas esperadas
export const ARBITROS = [
  { id: 'medio',   nombre: 'Árbitro medio de la liga', severidad: 1.00, taNota: '4.6 TA/partido' },
  { id: 'estr',    nombre: 'Colegiado estricto',       severidad: 1.26, taNota: '5.8 TA/partido' },
  { id: 'muyestr', nombre: 'Colegiado muy estricto',   severidad: 1.45, taNota: '6.7 TA/partido' },
  { id: 'perm',    nombre: 'Colegiado permisivo',      severidad: 0.80, taNota: '3.7 TA/partido' },
];

export const CONTEXTOS = {
  clima: [
    { id: 'seco',   nombre: 'Seco / templado', corners: 1.00, tarjetas: 1.00 },
    { id: 'lluvia', nombre: 'Lluvia',          corners: 1.06, tarjetas: 1.05 },
    { id: 'viento', nombre: 'Viento fuerte',   corners: 1.09, tarjetas: 1.00 },
    { id: 'calor',  nombre: 'Calor extremo',   corners: 0.94, tarjetas: 0.97 },
  ],
  importancia: [
    { id: 'normal', nombre: 'Jornada regular',        corners: 1.00, tarjetas: 1.00 },
    { id: 'derbi',  nombre: 'Derbi / clásico',        corners: 1.02, tarjetas: 1.28 },
    { id: 'titulo', nombre: 'Lucha por el título',    corners: 1.04, tarjetas: 1.15 },
    { id: 'descenso', nombre: 'Lucha por el descenso',corners: 0.97, tarjetas: 1.20 },
    { id: 'ko',     nombre: 'Eliminatoria KO',        corners: 1.03, tarjetas: 1.18 },
  ],
};

export const equipoPorId = (id) => EQUIPOS.find((e) => e.id === id);
