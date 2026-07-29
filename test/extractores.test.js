/**
 * Pruebas de los extractores del proveedor Free API Live Football Data.
 * No tocan la red: alimentan estructuras anidadas al estilo FotMob y verifican
 * que se localizan las estadísticas sin depender de una ruta fija.
 *
 *   node test/extractores.test.js
 */

const assert = require('assert');
const lf = require('../providers/livefootball.js');

let ok = 0;
const pendientes = [];

/** Acepta funciones síncronas y asíncronas; las async se esperan al final. */
const prueba = (nombre, fn) => {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      pendientes.push(
        r.then(
          () => {
            ok++;
            console.log(`  ✓ ${nombre}`);
          },
          (e) => {
            console.error(`  ✗ ${nombre}\n    ${e.message}`);
            process.exitCode = 1;
          }
        )
      );
      return;
    }
    ok++;
    console.log(`  ✓ ${nombre}`);
  } catch (e) {
    console.error(`  ✗ ${nombre}\n    ${e.message}`);
    process.exitCode = 1;
  }
};

console.log('\nbuscarEstadistica');

// Forma habitual de FotMob: stats anidados por periodo y por grupo temático
const respuestaFotMob = {
  status: 'success',
  response: {
    content: {
      stats: {
        Periods: {
          All: {
            stats: [
              {
                title: 'Shots',
                stats: [
                  { title: 'Total shots', stats: [14, 9], type: 'number' },
                  { title: 'Shots on target', stats: [6, 3], type: 'number' },
                ],
              },
              {
                title: 'Discipline',
                stats: [
                  { title: 'Yellow cards', stats: [2, 4], type: 'number' },
                  { title: 'Red cards', stats: [0, 1], type: 'number' },
                ],
              },
              {
                title: 'Duels',
                stats: [
                  { title: 'Fouls', stats: [11, 15], type: 'number' },
                  { title: 'Corners', stats: [7, 3], type: 'number' },
                ],
              },
            ],
          },
        },
      },
    },
  },
};

prueba('encuentra córners en estructura profunda', () => {
  assert.deepStrictEqual(lf.buscarEstadistica(respuestaFotMob, lf.ETIQUETAS.corners), [7, 3]);
});

prueba('encuentra amarillas sin confundirlas con rojas', () => {
  assert.deepStrictEqual(lf.buscarEstadistica(respuestaFotMob, lf.ETIQUETAS.amarillas), [2, 4]);
  assert.deepStrictEqual(lf.buscarEstadistica(respuestaFotMob, lf.ETIQUETAS.rojas), [0, 1]);
});

prueba('encuentra faltas y tiros', () => {
  assert.deepStrictEqual(lf.buscarEstadistica(respuestaFotMob, lf.ETIQUETAS.faltas), [11, 15]);
  assert.deepStrictEqual(lf.buscarEstadistica(respuestaFotMob, lf.ETIQUETAS.tiros), [14, 9]);
});

prueba('tolera el formato {home, away}', () => {
  const alt = { data: [{ name: 'Corner Kicks', value: { home: '5', away: '8' } }] };
  assert.deepStrictEqual(lf.buscarEstadistica(alt, lf.ETIQUETAS.corners), [5, 8]);
});

prueba('tolera valores como cadena', () => {
  const alt = { x: { title: 'Fouls', stats: ['12', '9'] } };
  assert.deepStrictEqual(lf.buscarEstadistica(alt, lf.ETIQUETAS.faltas), [12, 9]);
});

prueba('devuelve null si la estadística no está', () => {
  assert.strictEqual(lf.buscarEstadistica({ a: { title: 'Offsides', stats: [2, 1] } }, lf.ETIQUETAS.corners), null);
});

prueba('no se cuelga con referencias circulares', () => {
  const c = { title: 'Corners', stats: [4, 4] };
  c.self = c;
  assert.deepStrictEqual(lf.buscarEstadistica({ raiz: c }, lf.ETIQUETAS.corners), [4, 4]);
});

console.log('\nbuscarPartidos');

const respuestaLiga = {
  status: 'success',
  response: {
    matches: {
      allMatches: [
        {
          id: 4621624,
          home: { id: 8633, name: 'Real Madrid' },
          away: { id: 9906, name: 'Atletico' },
          status: { finished: true, utcTime: '2026-05-10T19:00:00Z' },
        },
        {
          id: 4621625,
          home: { id: 8634, name: 'Barcelona' },
          away: { id: 8633, name: 'Real Madrid' },
          status: { finished: false, utcTime: '2026-08-20T19:00:00Z' },
        },
      ],
    },
  },
};

prueba('localiza los partidos sea cual sea la ruta', () => {
  const p = lf.buscarPartidos(respuestaLiga);
  assert.strictEqual(p.length, 2);
  assert.strictEqual(p[0].id, 4621624);
});

prueba('no confunde equipos sueltos con partidos', () => {
  const p = lf.buscarPartidos({ teams: [{ id: 1, name: 'X' }, { id: 2, name: 'Y' }] });
  assert.strictEqual(p.length, 0);
});

console.log('\nforma real del proveedor (Girona 1-3 Rayo, eventid 4837112)');

// Recorte literal de la respuesta real, capturado el 28/07/2026.
// Sirve de regresión: si el proveedor cambia el formato, estas pruebas caen.
const respuestaReal = {
  status: 'success',
  response: {
    stats: [
      {
        title: 'Top stats',
        key: 'top_stats',
        stats: [
          { title: 'Ball possession', key: 'BallPossesion', stats: [44, 56], type: 'graph' },
          { title: 'Expected goals (xG)', key: 'expected_goals', stats: ['0.56', '3.43'], type: 'text' },
          { title: 'Total shots', key: 'total_shots', stats: [7, 16], type: 'text' },
          { title: 'Accurate passes', key: 'accurate_passes', stats: ['296 (77%)', '415 (86%)'], type: 'text' },
          { title: 'Yellow cards', key: 'yellow_cards', stats: [0, 1], type: 'text' },
          { title: 'Corners', key: 'corners', stats: [2, 4], type: 'text' },
        ],
      },
      {
        title: 'Shots',
        key: 'shots',
        stats: [
          // fila de cabecera: mismo título que el grupo y valores nulos
          { title: 'Shots', key: 'shots', stats: [null, null], type: 'title' },
          { title: 'Total shots', key: 'total_shots', stats: [7, 16], type: 'text' },
        ],
      },
      {
        title: 'Discipline',
        key: 'discipline',
        stats: [
          { title: 'Discipline', key: 'discipline', stats: [null, null], type: 'title' },
          { title: 'Yellow cards', key: 'yellow_cards', stats: [0, 1], type: 'text' },
          { title: 'Red cards', key: 'red_cards', stats: [1, 0], type: 'text' },
          { title: 'Fouls committed', key: 'fouls', stats: [8, 17], type: 'text' },
        ],
      },
    ],
  },
};

prueba('lee las cinco estadísticas del JSON real', () => {
  assert.deepStrictEqual(lf.buscarEstadistica(respuestaReal, lf.ETIQUETAS.corners), [2, 4]);
  assert.deepStrictEqual(lf.buscarEstadistica(respuestaReal, lf.ETIQUETAS.amarillas), [0, 1]);
  assert.deepStrictEqual(lf.buscarEstadistica(respuestaReal, lf.ETIQUETAS.rojas), [1, 0]);
  assert.deepStrictEqual(lf.buscarEstadistica(respuestaReal, lf.ETIQUETAS.faltas), [8, 17]);
  assert.deepStrictEqual(lf.buscarEstadistica(respuestaReal, lf.ETIQUETAS.tiros), [7, 16]);
});

prueba('ignora las filas de cabecera con valores nulos', () => {
  // 'Shots' aparece como cabecera con [null, null] antes que 'Total shots'
  assert.deepStrictEqual(lf.buscarEstadistica(respuestaReal, ['shots', 'total shots']), [7, 16]);
});

// Forma real del listado de partidos por liga (response.matches, no allMatches)
const respuestaLigaReal = {
  status: 'success',
  response: {
    matches: [
      {
        id: '4837112',
        opponent: { id: '7732', name: 'Girona', score: 1 },
        home: { id: '7732', name: 'Girona', score: 1 },
        away: { id: '8370', name: 'Rayo Vallecano', score: 3 },
        status: { utcTime: '2025-08-15T17:00:00Z', finished: true, started: true, reason: { short: 'FT' } },
      },
      {
        id: '4837113',
        opponent: { id: '8633', name: 'Real Madrid', score: 0 },
        home: { id: '8633', name: 'Real Madrid', score: 0 },
        away: { id: '9906', name: 'Atletico Madrid', score: 0 },
        status: { utcTime: '2026-09-01T17:00:00Z', finished: false, started: false },
      },
    ],
  },
};

prueba('localiza los partidos en response.matches', () => {
  const p = lf.buscarPartidos(respuestaLigaReal);
  assert.strictEqual(p.length, 2);
  assert.strictEqual(p[0].id, '4837112');
});

prueba('el campo opponent no se cuela como partido extra', () => {
  const p = lf.buscarPartidos(respuestaLigaReal);
  assert.ok(p.every((x) => x.home && x.away));
});

console.log('\nmuestra incompleta (regresión: no degradar en silencio)');

// Reproduce lo que pasó en producción: la cuota del proveedor se agota a mitad
// del perfilado. Antes esto devolvía un perfil de 3 partidos como si fuera de 10.
prueba('la cuota agotada aborta el perfil en vez de recortarlo', async () => {
  let llamadas = 0;
  const apiGet = async (_host, ruta) => {
    llamadas++;
    if (ruta.startsWith('/football-get-all-matches-by-league')) {
      return {
        response: {
          matches: Array.from({ length: 10 }, (_, i) => ({
            id: String(1000 + i),
            home: { id: '1', name: 'Equipo A' },
            away: { id: '2', name: 'Equipo B' },
            status: { finished: true, utcTime: `2026-0${(i % 9) + 1}-01T19:00:00Z` },
          })),
        },
      };
    }
    // Las dos primeras estadísticas van bien; a partir de ahí, cuota agotada.
    if (llamadas > 3) {
      const e = new Error('Cuota del proveedor de datos agotada.');
      e.cuotaAgotada = true;
      throw e;
    }
    return {
      response: {
        stats: [{ title: 'Top stats', stats: [
          { title: 'Corners', stats: [5, 4] },
          { title: 'Yellow cards', stats: [2, 1] },
          { title: 'Fouls committed', stats: [11, 12] },
          { title: 'Total shots', stats: [13, 10] },
        ] }],
      },
    };
  };

  const prov = lf.crear({ apiGet, acotar: (v, a, b) => Math.min(b, Math.max(a, v)) });
  let error = null;
  try {
    await prov.perfil('1', 87, null, 10);
  } catch (e) {
    error = e;
  }
  assert.ok(error, 'debería lanzar en vez de devolver un perfil recortado');
  assert.ok(error.cuotaAgotada, 'el error debe conservar la marca de cuota agotada');
});

prueba('una muestra recortada por otros motivos se marca como incompleta', async () => {
  const apiGet = async (_host, ruta) => {
    if (ruta.startsWith('/football-get-all-matches-by-league')) {
      return {
        response: {
          matches: Array.from({ length: 6 }, (_, i) => ({
            id: String(2000 + i),
            home: { id: '1', name: 'Equipo A' },
            away: { id: '2', name: 'Equipo B' },
            status: { finished: true, utcTime: `2026-0${i + 1}-01T19:00:00Z` },
          })),
        },
      };
    }
    // La mitad de los partidos no traen estadísticas útiles
    const id = Number(/eventid=(\d+)/.exec(ruta)[1]);
    if (id % 2 === 0) return { response: { stats: [] } };
    return {
      response: {
        stats: [{ title: 'Top stats', stats: [
          { title: 'Corners', stats: [6, 3] },
          { title: 'Yellow cards', stats: [2, 2] },
          { title: 'Fouls committed', stats: [10, 11] },
          { title: 'Total shots', stats: [14, 9] },
        ] }],
      },
    };
  };

  const prov = lf.crear({ apiGet, acotar: (v, a, b) => Math.min(b, Math.max(a, v)) });
  const perfil = await prov.perfil('1', 87, null, 6);
  assert.strictEqual(perfil.muestra.partidos, 3);
  assert.strictEqual(perfil.muestra.incompleta, true, 'debe marcarse como incompleta');
  assert.strictEqual(perfil.muestra.descartados, 3);
});

Promise.all(pendientes).then(() => {
  console.log(`\n${ok} pruebas correctas\n`);
});
