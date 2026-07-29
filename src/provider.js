// Capa de datos. Dos proveedores intercambiables con la misma interfaz:
//   - 'demo' : valores estáticos de src/data.js (funciona sin clave ni red)
//   - 'api'  : API-Football a través del proxy local /api/* (datos reales)
// Ambos devuelven equipos con los mismos campos, así el modelo no se entera.

import { EQUIPOS, LIGAS, equipoPorId } from './data.js';

const jsonOk = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
};

/** Temporada por defecto: las ligas europeas se etiquetan por su año de inicio. */
export function temporadaActual(fecha = new Date()) {
  const y = fecha.getFullYear();
  return fecha.getMonth() >= 6 ? y : y - 1; // julio en adelante = nueva temporada
}

export const proveedorDemo = {
  id: 'demo',
  nombre: 'Datos de demostración',
  async estado() {
    return { disponible: true, nota: 'Medias estáticas realistas, sin red.' };
  },
  async ligas() {
    return Object.entries(LIGAS).map(([clave, nombre]) => ({ id: clave, nombre }));
  },
  async equipos(liga) {
    return EQUIPOS.filter((e) => liga === 'todas' || e.liga === liga).map((e) => ({
      id: e.id,
      nombre: e.nombre,
    }));
  },
  async perfil(id) {
    const e = equipoPorId(id);
    if (!e) throw new Error(`Equipo desconocido: ${id}`);
    return { ...e, fuente: 'Demo', muestra: { partidos: 38, detalle: [] } };
  },
};

export const proveedorApi = {
  id: 'api',
  _estado: null,
  get nombre() {
    return this._estado?.proveedorNombre || 'Datos reales';
  },
  async estado() {
    try {
      const s = await jsonOk('/api/estado');
      this._estado = s;
      return {
        disponible: s.claveConfigurada,
        usaTemporada: s.usaTemporada,
        nota: s.claveConfigurada
          ? `${s.partidosPorPerfil} últimos partidos por equipo · ${s.entradasEnCache} entradas en caché`
          : 'El servidor no tiene ninguna clave configurada (RAPIDAPI_KEY o APIFOOTBALL_KEY).',
        ligas: s.ligas,
      };
    } catch (e) {
      return { disponible: false, nota: `Proxy no disponible (${e.message}). ¿Arrancaste node server.js?` };
    }
  },
  async ligas() {
    if (!this._estado) await this.estado();
    return (this._estado?.ligas || []).map((l) => ({ id: String(l.id), nombre: l.nombre }));
  },
  async equipos(liga, temporada) {
    const j = await jsonOk(`/api/equipos?liga=${liga}&temporada=${temporada}`);
    return j.equipos.map((e) => ({ id: String(e.id), nombre: e.nombre, escudo: e.escudo }));
  },
  async perfil(id, liga, temporada) {
    return jsonOk(`/api/perfil?equipo=${id}&liga=${liga}&temporada=${temporada}`);
  },
  async arbitro(nombre, liga, temporada) {
    return jsonOk(`/api/arbitro?nombre=${encodeURIComponent(nombre)}&liga=${liga}&temporada=${temporada}`);
  },
};

export const PROVEEDORES = { demo: proveedorDemo, api: proveedorApi };
