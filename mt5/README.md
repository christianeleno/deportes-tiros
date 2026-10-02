# MegaSpikes Boom and Crash (MetaTrader 5)

Indicador técnico de MetaTrader 5 para estudiar los gráficos de índices sintéticos Boom y Crash, principalmente en M1. Reúne varios modos en un solo indicador.

## Instalación
1. En MT5: `Archivo > Abrir carpeta de datos > MQL5 > Indicators`.
2. Copia `MegaSpikes_BoomCrash.mq5` ahí y compílalo con MetaEditor (F7).
3. Arrástralo a un gráfico Boom o Crash en M1.

## Modos (selector de versión)
Las reglas de cada modo son una implementación propia basada en los componentes indicados; no se dispone de la fórmula original de MegaSpikes, así que ajústalas a tu criterio.

| Modo | Condición (Boom; Crash es el espejo) |
|---|---|
| MegaSpikes 1 | RSI en sobreventa (con margen) y la mecha toca la envolvente inferior |
| MegaSpikes 1.31 | Modo 1 + (labios del Alligator bajo los dientes **o** SAR aún por encima del precio) |
| MegaSpikes 1.32 | Modo 1.31 + rango de vela ≥ ATR × 0,7 + cierre bajo la media móvil |
| Divergencia | Mínimo de precio igual o más bajo con RSI más alto dentro de la ventana |
| Última vela roja | N velas bajistas seguidas (N=1 por defecto) con RSI bajo (con margen) |

## Alertas
Alerta en pantalla y sonido (configurables). Se emite una vez por vela cerrada.

## Aviso de riesgo
Es solo una herramienta de análisis técnico y no constituye asesoramiento financiero. Pruébalo en cuenta demo, combina las alertas con tu propio análisis y aplica gestión responsable del riesgo. Las condiciones del mercado cambian y los resultados pueden variar.
