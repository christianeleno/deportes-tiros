# OCO Apertura NY (TradingView)

Indicador en Pine Script v5 basado en el vídeo de @nqdog sobre la estrategia OCO (One Cancels the Other) en la apertura de Nueva York.

## Cómo usarlo
1. En TradingView abre el Editor de Pine, pega `OCO_Apertura_NY.pine` y pulsa "Añadir al gráfico".
2. Usa el NQ (por ejemplo `NQ1!` o `MNQ1!`) en 1 o 5 minutos.

## Qué hace
1. Marca el rango de los minutos previos a las 9:30 (hora de Nueva York). Por defecto 5 min.
2. Mide el ATR de las 5 velas de 5 minutos previas.
3. Dibuja la orden de COMPRA por encima y la de VENTA por debajo del rango.
4. La primera que se toca se activa y cancela la otra (OCO).
5. Stop en el lado contrario. Objetivo a un múltiplo del riesgo (mínimo 1:1).
6. Ajuste por tipo de día: Tranquilo 1 × ATR, Normal 1,5 × ATR, CPI/PPI 2 × ATR.
7. Alertas de entrada, objetivo y stop.

## Supuestos (no se pudo escuchar el audio del vídeo)
- El rango son los minutos antes de las 9:30. En el vídeo se veía de 09:25 a 09:30.
- El ajuste por tipo de día ensancha el rango hasta como mínimo "multiplicador × ATR". Puede desactivarse.
- El stop es el lado opuesto de las órdenes. El objetivo por defecto es 2R (el vídeo dice que 1:1 es el mínimo).
- Si en la misma vela se tocan ambos niveles, decide el color de la vela.
- Pendiente de revisar con las reglas exactas: margen sobre el rango, cálculo del stop y la evaluación de +3.000 $ / −2.000 $ (no incluida).

No es consejo financiero. Pruébalo primero en demo.
