# OCO Apertura NY (TradingView)

Indicador en Pine Script v5 basado en el vídeo de @nqdog sobre la estrategia OCO (One Cancels the Other) en la apertura de Nueva York.

## Cómo usarlo
1. En TradingView abre el Editor de Pine, pega `OCO_Apertura_NY.pine` y pulsa "Añadir al gráfico".
2. Usa el NQ (`NQ1!` o `MNQ1!`) en 1 o 5 minutos.

## Reglas (leídas del texto y los números que salen en pantalla)
1. Rango de los 5 minutos antes de las 9:30 de Nueva York (09:25–09:30).
2. ATR de las cinco velas de cinco minutos previas (en el ejemplo, 15 pts).
3. Orden de COMPRA = máximo del rango + multiplicador × ATR. Orden de VENTA = mínimo del rango − multiplicador × ATR. Ejemplo del vídeo: 15 pts × 1,5 = 22,5 pts.
4. La primera que se toca se ejecuta y cancela la otra (OCO). Una operación al día.
5. Stop en el lado contrario del rango. La distancia entrada–stop es 1R (en el ejemplo, 34 pts).
6. Objetivo: 1:1 es el mínimo, no el objetivo. Se dibuja también un nivel extra (por defecto 4R).
7. Multiplicador según el día: Tranquilo 1 × ATR, Normal 1,5 × ATR, CPI o PPI 2 × ATR.
8. Alertas de entrada, objetivo y stop.

## Lo que no incluye
- La evaluación de +3.000 $ / −2.000 $ (objetivo y suelo de la cuenta). Solo muestra el valor de 1R por contrato.
- La condición "puede tocar el rango con mechas, no puede cerrar fuera": no se pudo confirmar a qué momento se refiere.
- Si en una misma vela se tocan ambos niveles, decide el color de la vela.

No es consejo financiero. Pruébalo primero en demo.
