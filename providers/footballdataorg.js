// Football-Data.org: API gratuita, sin límites restrictivos. Devuelve datos por temporada.
// Nota: Este proveedor devuelve temporada, no partidos individuales, así que el modelo
// de perfil necesita un adaptador diferente.

const https = require('https');

const HOST = 'api.football-data.org';

function get(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { host: HOST, path, headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_ORG_KEY } },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            const err = new Error(`Football-Data.org HTTP ${res.statusCode}`);
            err.cuotaAgotada = res.statusCode === 429;
            return reject(err);
          }
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

/**
 * Obtiene lista de equipos de una competición. Football-Data.org usa códigos de competición
 * (e.g., 'PL' para Premier, 'LA' para LaLiga, 'SA' para Serie A, etc.)
 */
async function equipos(codigoCompeticion) {
  try {
    const data = await get(`/v4/competitions/${codigoCompeticion}/teams`);
    return data.teams.map((t) => ({ id: String(t.id), nombre: t.name }));
  } catch (e) {
    throw new Error(`No se pudieron obtener equipos de ${codigoCompeticion}: ${e.message}`);
  }
}

/**
 * Obtiene el perfil (estadísticas agregadas) de un equipo en una temporada.
 * Football-Data.org no ofrece estadísticas detalladas en el plan gratuito, solo en Premiums.
 * Como fallback, devuelve un error claro en lugar de datos falsos.
 */
async function perfil() {
  throw new Error(
    'Football-Data.org (plan gratuito) no ofrece estadísticas por partido. ' +
      'Necesita un plan de pago o cambiar de proveedor.'
  );
}

module.exports = {
  nombre: 'Football-Data.org',
  estado: () => ({
    disponible: !!process.env.FOOTBALL_DATA_ORG_KEY,
    proveedor: 'footballdataorg',
    proveedorNombre: 'Football-Data.org',
  }),
  equipos,
  perfil,
};
