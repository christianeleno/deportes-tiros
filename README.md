# PitchIQ ⚽

App web de **análisis prepartido con agentes de IA**: proyecta cuántos **córners** y cuántas **tarjetas** puede haber en un partido, con distribuciones de probabilidad, líneas over/under, cuotas justas y detección de valor frente al mercado.

## Cómo se ejecuta

```bash
node server.js
```

Y abre http://localhost:4173. Sin dependencias: `server.js` sirve los estáticos y hace de proxy hacia la API de datos.

### Datos reales

La app arranca en **modo demo** si no encuentra ninguna clave. Hay dos proveedores; se activa el primero que tenga clave.

**Opción A — Free API Live Football Data** (RapidAPI, datos de origen FotMob):

```bash
set RAPIDAPI_KEY=tu_clave_de_rapidapi
```

**Opción B — API-Football** (api-sports.io):

```bash
set APIFOOTBALL_KEY=tu_clave_de_apisports
```

Y en cualquiera de los dos casos:

```bash
node server.js
```

Con clave presente, la app selecciona sola la fuente real; el desplegable "Fuente de datos" te deja volver a demo cuando quieras.

**Las claves nunca llegan al navegador.** Viven solo en el entorno del servidor, que agrega los datos y devuelve el perfil ya calculado. Eso además resuelve el CORS.

**Cuidado con la cuota**: perfilar un equipo cuesta ~11 peticiones (1 para listar partidos + 1 por partido para las estadísticas). Un análisis son ~22. Por eso hay **caché en disco de 6 h** en `.cache/`. Ajusta la muestra con `PITCHIQ_PARTIDOS=5` si vas justo.

### Diferencias entre proveedores

| | Free API Live Football Data | API-Football |
|---|---|---|
| Identificadores de liga | esquema FotMob (LaLiga=87) | propios (LaLiga=140) |
| Temporada | no se pide; devuelve la vigente | parámetro obligatorio |
| Árbitros | por nombre, cruzando partido a partido | campo `referee` en cada partido |
| Competiciones incluidas | las 5 grandes + Champions | las 5 grandes |

Las respuestas de RapidAPI vienen de FotMob, con anidamiento variable. Por eso `providers/livefootball.js` **no navega rutas fijas**: busca recursivamente por título de estadística y acepta varios formatos (`[local, visitante]`, `{home, away}`, valores como cadena). Si el proveedor reordena su JSON, sigue leyendo.

### Defecto conocido del proveedor

`/football-get-list-all-team` **ignora el parámetro `leagueid`** y devuelve siempre los 18 equipos de la Bundesliga, sea cual sea la liga pedida. Verificado el 28/07/2026 con los ids 47, 54, 55 y 87: respuesta idéntica en los cuatro casos.

El adaptador no usa ese endpoint. Deriva los equipos de `/football-get-all-matches-by-league`, que sí respeta `leagueid`, y de paso ahorra una petición porque esa respuesta hace falta después para el perfil. Si algún día lo arreglan, volver al endpoint dedicado sería una micro-optimización, no una necesidad.

Para inspeccionar una respuesta cruda y ajustar los extractores:

```bash
curl "http://localhost:4173/api/diagnostico?ruta=/football-get-match-all-stats?eventid=4621624"
```

## Publicarla en internet

Ver [DESPLIEGUE.md](DESPLIEGUE.md): despliegue en Cloud Run con un solo comando,
protección de cuota y control de coste.

## Pruebas

```bash
node test/extractores.test.js
```

Cubren los extractores del proveedor de RapidAPI sin tocar la red: estructuras anidadas al estilo FotMob, formatos alternativos, referencias circulares y el caso de que la estadística no exista.

## El pipeline de agentes

Cada análisis dispara seis agentes en cadena, con progreso en vivo:

| Agente | Qué hace |
|---|---|
| Recolector | Normaliza las series por 90' de ambos equipos y valida la muestra |
| Córners | Ajusta el modelo ataque × defensa y su distribución |
| Tarjetas | Cruza faltas cometidas, propensión a la amonestación y riesgo de roja |
| Contexto | Pondera árbitro, clima e importancia del partido |
| Mercado | Compara probabilidades del modelo con las cuotas que introduzcas (EV) |
| Sintetizador | Redacta el informe final |

## El modelo

- **Binomial negativa** en vez de Poisson pura: los córners y las tarjetas están sobredispersados en datos reales, y la binomial negativa recoge esa cola.
- **Córners**: fuerza ofensiva del equipo × debilidad defensiva del rival, normalizado a la media de liga, con ventaja de local (+9%) y ajuste de clima.
- **Tarjetas**: tarjetas propias × índice de agresividad × faltas provocadas por el rival × severidad arbitral × peso del partido. La ventaja local reduce un 7% las amonestaciones.
- **Roja**: aproximación exponencial sobre la tasa de amarillas esperada.
- Salida: distribución completa, intervalo al 80%, tabla de líneas con probabilidad y **cuota justa** (1/p), y EV frente a la cuota real.

## Gemini (opcional)

El agente sintetizador redacta el informe con Gemini. Se configura **solo en el servidor**, con una clave de [Google AI Studio](https://aistudio.google.com/apikey):

```bash
set GEMINI_API_KEY=tu_clave_de_google_ai_studio
```

La app lo detecta al arrancar y llama al proxy `/api/gemini`. El navegador nunca ve la clave ni habla con Google: monta el prompt y lo manda al servidor. No hay nada que configurar en la interfaz — funciona igual en cualquier equipo que abra la página.

Para cambiar de modelo, `GEMINI_MODELO=gemini-3.1-pro-preview` (por defecto `gemini-3.6-flash`).

Sin clave, la app funciona igual: el informe lo escribe el motor de redacción local.

- Sin clave la app funciona igual: el informe lo escribe el motor de redacción local.
- La clave se guarda solo en `localStorage` de tu navegador y se envía directo a Google — no pasa por ningún servidor intermedio.
- Para desplegar en **Google Cloud**: sube la carpeta a Cloud Storage o Cloud Run como sitio estático, y si quieres esconder la clave, mueve la llamada de `src/gemini.js` a una Cloud Function que hable con Vertex AI.

## Estructura

```
server.js                  estáticos + proxy + caché + proveedor API-Football
providers/livefootball.js  adaptador de Free API Live Football Data (RapidAPI)
test/extractores.test.js   pruebas de los extractores, sin red
index.html                 UI
styles.css                 estilos
src/provider.js   capa de datos: proveedores 'demo' y 'api' intercambiables
src/data.js       datos de respaldo del proveedor demo
src/model.js      motor estadístico (binomial negativa, líneas, EV)
src/agents.js     orquestador multi-agente + informe local
src/gemini.js     integración opcional con la API de Gemini
```

## Cómo se derivan los perfiles reales

Para cada equipo, el servidor toma sus últimos 10 partidos finalizados de la liga y temporada elegidas, pide las estadísticas de cada uno y promedia por 90':

| Campo | Origen real |
|---|---|
| `cf` / `ca` | *Corner Kicks* propios / del rival |
| `tf` | *Yellow Cards* propias |
| `fc` | *Fouls* cometidas |
| `agr` | faltas cometidas ÷ 12.2 (media de las grandes ligas), acotado a 0.8–1.25 |
| `int` | tiros totales ÷ 12.5, acotado a 0.8–1.25 |

El **árbitro** también puede ser real: escribe su apellido en modo API y el servidor calcula su severidad como sus tarjetas por partido ÷ 4.6 (media de liga), sobre hasta 12 encuentros.

Un partido sin estadísticas publicadas se descarta sin invalidar la muestra; por debajo de 3 partidos útiles el perfil falla en vez de devolver un número poco fiable.

## Limitaciones conocidas

- **Muestra corta**: 10 partidos es poco para separar señal de ruido. Es un compromiso con la cuota gratuita; con plan de pago sube `PITCHIQ_PARTIDOS`.
- **Sin desglose local/visitante**: las medias mezclan ambos contextos, y la ventaja de campo se aplica después como coeficiente fijo.
- **`int` y la fuerza ofensiva están correlacionados** (tiros y córners van juntos), así que el modelo amplifica ligeramente a los equipos dominantes.
- **El modelo asume independencia entre eventos**, cuando una expulsión temprana altera drásticamente la tasa posterior de faltas y córners.
- Los coeficientes (ventaja local, dispersión, tasa de rojas) están calibrados a ojo sobre medias de las grandes ligas, no ajustados por máxima verosimilitud liga a liga.

## Aviso

Es una herramienta de análisis estadístico, no una predicción garantizada ni un consejo de apuesta. Un modelo bien calibrado sigue fallando partidos individuales. Juega con responsabilidad.
