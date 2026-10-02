//+------------------------------------------------------------------+
//| MegaSpikes_BoomCrash.mq5                                         |
//| Indicador de analisis tecnico para indices Boom y Crash (M1).    |
//| Solo herramienta de analisis: no es asesoria financiera.         |
//+------------------------------------------------------------------+
#property copyright "deportes-tiros"
#property version   "1.00"
#property description "MegaSpikes Boom and Crash - modos 1, 1.31, 1.32, Divergencia y Ultima vela roja"
#property description "Herramienta de analisis tecnico. Pruebela en cuenta demo y gestione el riesgo."
#property indicator_chart_window
#property indicator_buffers 5
#property indicator_plots   5

#property indicator_label1  "Senal Boom (compra)"
#property indicator_type1   DRAW_ARROW
#property indicator_color1  clrLime
#property indicator_width1  2

#property indicator_label2  "Senal Crash (venta)"
#property indicator_type2   DRAW_ARROW
#property indicator_color2  clrRed
#property indicator_width2  2

#property indicator_label3  "Envolvente superior"
#property indicator_type3   DRAW_LINE
#property indicator_color3  clrDodgerBlue
#property indicator_style3  STYLE_DOT

#property indicator_label4  "Envolvente inferior"
#property indicator_type4   DRAW_LINE
#property indicator_color4  clrDodgerBlue
#property indicator_style4  STYLE_DOT

#property indicator_label5  "Media movil"
#property indicator_type5   DRAW_LINE
#property indicator_color5  clrGold

enum ENUM_MEGA_MODE
  {
   MODE_MEGA_1    = 0, // MegaSpikes 1
   MODE_MEGA_131  = 1, // MegaSpikes 1.31
   MODE_MEGA_132  = 2, // MegaSpikes 1.32
   MODE_DIVERGE   = 3, // Divergencia
   MODE_LAST_RED  = 4  // Ultima vela roja
  };

input group "General"
input ENUM_MEGA_MODE InpMode        = MODE_MEGA_1; // Version / modo
input bool   InpAutoDirection       = true;        // Detectar Boom/Crash por nombre del simbolo
input bool   InpForceBoom           = true;        // Si no se autodetecta: true=Boom, false=Crash

input group "RSI"
input int    InpRsiPeriod           = 14;          // Periodo RSI
input double InpRsiOversold         = 30.0;        // RSI sobreventa (Boom)
input double InpRsiOverbought       = 70.0;        // RSI sobrecompra (Crash)
input double InpRsiMargin           = 5.0;         // Tolerancia RSI: mas margen = mas senales

input group "ATR"
input int    InpAtrPeriod           = 14;          // Periodo ATR
input double InpAtrMult             = 0.7;         // Rango minimo de vela = ATR x este valor (1.32)

input group "Alligator"
input int    InpJawPeriod           = 13;          // Mandibula
input int    InpTeethPeriod         = 8;           // Dientes
input int    InpLipsPeriod          = 5;           // Labios

input group "Media movil, SAR y envolventes"
input int    InpMaPeriod            = 50;          // Periodo media movil
input double InpSarStep             = 0.02;        // SAR paso
input double InpSarMax              = 0.2;         // SAR maximo
input int    InpEnvPeriod           = 20;          // Periodo envolventes
input double InpEnvDeviation        = 0.1;         // Desviacion envolventes (%)

input group "Divergencia / Ultima vela roja"
input int    InpDivLookback         = 10;          // Velas a mirar atras (divergencia)
input int    InpRedCandles          = 2;           // Velas del color contrario seguidas (ultima vela roja)

input group "Alertas"
input bool   InpAlertPopup          = true;        // Alerta en pantalla
input bool   InpAlertSound          = true;        // Sonido
input string InpSoundFile           = "alert.wav"; // Archivo de sonido

input group "Visual"
input bool   InpShowEnvelopes       = true;        // Mostrar envolventes
input bool   InpShowMa              = true;        // Mostrar media movil

double BufBuy[], BufSell[], BufEnvUp[], BufEnvLo[], BufMa[];

int hRsi = INVALID_HANDLE, hAtr = INVALID_HANDLE, hAlli = INVALID_HANDLE;
int hMa  = INVALID_HANDLE, hSar = INVALID_HANDLE, hEnv  = INVALID_HANDLE;

bool     g_isBoom = true;
datetime g_lastAlertBar = 0;

//+------------------------------------------------------------------+
int OnInit()
  {
   string sym = _Symbol;
   StringToUpper(sym);
   if(InpAutoDirection)
     {
      if(StringFind(sym, "BOOM") >= 0)       g_isBoom = true;
      else if(StringFind(sym, "CRASH") >= 0) g_isBoom = false;
      else
        {
         g_isBoom = InpForceBoom;
         Print("MegaSpikes: el simbolo no parece Boom/Crash; se usa la direccion manual.");
        }
     }
   else
      g_isBoom = InpForceBoom;

   SetIndexBuffer(0, BufBuy,   INDICATOR_DATA);
   SetIndexBuffer(1, BufSell,  INDICATOR_DATA);
   SetIndexBuffer(2, BufEnvUp, INDICATOR_DATA);
   SetIndexBuffer(3, BufEnvLo, INDICATOR_DATA);
   SetIndexBuffer(4, BufMa,    INDICATOR_DATA);

   PlotIndexSetInteger(0, PLOT_ARROW, 233); // flecha arriba
   PlotIndexSetInteger(1, PLOT_ARROW, 234); // flecha abajo
   for(int i = 0; i < 5; i++)
      PlotIndexSetDouble(i, PLOT_EMPTY_VALUE, EMPTY_VALUE);
   ArraySetAsSeries(BufBuy, true);
   ArraySetAsSeries(BufSell, true);
   ArraySetAsSeries(BufEnvUp, true);
   ArraySetAsSeries(BufEnvLo, true);
   ArraySetAsSeries(BufMa, true);

   hRsi  = iRSI(_Symbol, _Period, InpRsiPeriod, PRICE_CLOSE);
   hAtr  = iATR(_Symbol, _Period, InpAtrPeriod);
   hAlli = iAlligator(_Symbol, _Period, InpJawPeriod, 8, InpTeethPeriod, 5, InpLipsPeriod, 3, MODE_SMMA, PRICE_MEDIAN);
   hMa   = iMA(_Symbol, _Period, InpMaPeriod, 0, MODE_EMA, PRICE_CLOSE);
   hSar  = iSAR(_Symbol, _Period, InpSarStep, InpSarMax);
   hEnv  = iEnvelopes(_Symbol, _Period, InpEnvPeriod, 0, MODE_SMA, PRICE_CLOSE, InpEnvDeviation);

   if(hRsi == INVALID_HANDLE || hAtr == INVALID_HANDLE || hAlli == INVALID_HANDLE ||
      hMa == INVALID_HANDLE || hSar == INVALID_HANDLE || hEnv == INVALID_HANDLE)
     {
      Print("MegaSpikes: error creando indicadores internos, codigo ", GetLastError());
      return INIT_FAILED;
     }

   IndicatorSetString(INDICATOR_SHORTNAME, "MegaSpikes " + (g_isBoom ? "Boom" : "Crash"));
   return INIT_SUCCEEDED;
  }

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   int h[] = {hRsi, hAtr, hAlli, hMa, hSar, hEnv};
   for(int i = 0; i < ArraySize(h); i++)
      if(h[i] != INVALID_HANDLE)
         IndicatorRelease(h[i]);
  }

//+------------------------------------------------------------------+
bool Copy(int handle, int buffer, int count, double &arr[])
  {
   ArraySetAsSeries(arr, true);
   return CopyBuffer(handle, buffer, 0, count, arr) == count;
  }

//+------------------------------------------------------------------+
//| Evalua la senal en la barra i (series: 0 = actual).              |
//+------------------------------------------------------------------+
bool Signal(int i, const double &open[], const double &high[], const double &low[], const double &close[],
            const double &rsi[], const double &atr[], const double &lips[], const double &teeth[],
            const double &ma[], const double &sar[], const double &envUp[], const double &envLo[],
            int total)
  {
   bool boom = g_isBoom;

   // Condiciones base (extremo de precio): Boom busca agotamiento bajista, Crash alcista.
   // Reglas flexibles: el RSI admite un margen y basta con que la mecha toque la envolvente.
   bool rsiExt = boom ? (rsi[i] <= InpRsiOversold + InpRsiMargin) : (rsi[i] >= InpRsiOverbought - InpRsiMargin);
   bool outEnv = boom ? (low[i] <= envLo[i])       : (high[i] >= envUp[i]);
   bool sarOk  = boom ? (sar[i] > close[i])        : (sar[i] < close[i]); // SAR aun en contra: tendencia extendida

   switch(InpMode)
     {
      case MODE_MEGA_1:
         return rsiExt && outEnv;

      case MODE_MEGA_131:
        {
         // Anade confirmacion de tendencia extendida: Alligator O SAR (basta uno).
         bool alli = boom ? (lips[i] < teeth[i]) : (lips[i] > teeth[i]);
         return rsiExt && outEnv && (alli || sarOk);
        }

      case MODE_MEGA_132:
        {
         // Anade filtro ATR (vela con rango relevante) y precio alejado de la media.
         bool alli  = boom ? (lips[i] < teeth[i]) : (lips[i] > teeth[i]);
         bool range = (high[i] - low[i]) >= atr[i] * InpAtrMult;
         bool farMa = boom ? (close[i] < ma[i]) : (close[i] > ma[i]);
         return rsiExt && outEnv && (alli || sarOk) && range && farMa;
        }

      case MODE_DIVERGE:
        {
         int j = i + InpDivLookback;
         if(j >= total) return false;
         int k = i;
         // Busca el extremo de precio previo dentro de la ventana.
         for(int n = i + 1; n <= j; n++)
            if(boom ? (low[n] < low[k]) : (high[n] > high[k]))
               k = n;
         if(k == i)
           {
            // El extremo es la propia barra: comparar con el extremo anterior de la ventana
            int p = i + 1;
            for(int n = i + 2; n <= j; n++)
               if(boom ? (low[n] < low[p]) : (high[n] > high[p]))
                  p = n;
            if(boom)  return low[i] <= low[p]   && rsi[i] > rsi[p] && rsi[i] <= InpRsiOversold + InpRsiMargin + 10.0;
            else      return high[i] >= high[p] && rsi[i] < rsi[p] && rsi[i] >= InpRsiOverbought - InpRsiMargin - 10.0;
           }
         return false;
        }

      case MODE_LAST_RED:
        {
         // Boom: N velas bajistas seguidas con RSI bajo (ultima vela roja antes del posible spike).
         // Crash: N velas alcistas seguidas con RSI alto.
         if(i + InpRedCandles >= total) return false;
         for(int n = 0; n < InpRedCandles; n++)
           {
            int b = i + n;
            if(boom ? (close[b] >= open[b]) : (close[b] <= open[b]))
               return false;
           }
         return boom ? (rsi[i] <= InpRsiOversold + 10.0) : (rsi[i] >= InpRsiOverbought - 10.0);
        }
     }
   return false;
  }

//+------------------------------------------------------------------+
int OnCalculate(const int rates_total, const int prev_calculated,
                const datetime &time[], const double &open[], const double &high[],
                const double &low[], const double &close[], const long &tick_volume[],
                const long &volume[], const int &spread[])
  {
   int minBars = MathMax(InpMaPeriod, MathMax(InpEnvPeriod, InpDivLookback + InpRsiPeriod)) + 5;
   if(rates_total < minBars)
      return 0;

   ArraySetAsSeries(open, true);
   ArraySetAsSeries(high, true);
   ArraySetAsSeries(low, true);
   ArraySetAsSeries(close, true);
   ArraySetAsSeries(time, true);

   double rsi[], atr[], lips[], teeth[], ma[], sar[], envUp[], envLo[];
   int need = (prev_calculated == 0) ? rates_total : (rates_total - prev_calculated + 2);
   int fresh = need;                       // barras realmente nuevas a evaluar
   need = MathMin(need + InpDivLookback + InpRedCandles + 5, rates_total); // historial extra para ventanas

   if(!Copy(hRsi, 0, need, rsi) || !Copy(hAtr, 0, need, atr) ||
      !Copy(hAlli, 1, need, teeth) || !Copy(hAlli, 2, need, lips) ||
      !Copy(hMa, 0, need, ma) || !Copy(hSar, 0, need, sar) ||
      !Copy(hEnv, 0, need, envUp) || !Copy(hEnv, 1, need, envLo))
      return prev_calculated; // datos aun no listos

   int limit = (prev_calculated == 0) ? need - 1 - minBars : MathMin(fresh, need - InpDivLookback - InpRedCandles - 2);
   if(prev_calculated == 0)
     {
      ArrayInitialize(BufBuy, EMPTY_VALUE);
      ArrayInitialize(BufSell, EMPTY_VALUE);
      ArrayInitialize(BufEnvUp, EMPTY_VALUE);
      ArrayInitialize(BufEnvLo, EMPTY_VALUE);
      ArrayInitialize(BufMa, EMPTY_VALUE);
     }
   if(limit < 1) limit = 1;

   // Las series locales tienen indice 0 = barra actual, igual que los buffers.
   // Se evalua solo barras cerradas (indice >= 1).
   for(int i = limit; i >= 1; i--)
     {
      BufBuy[i] = EMPTY_VALUE;
      BufSell[i] = EMPTY_VALUE;
      BufEnvUp[i] = InpShowEnvelopes ? envUp[i] : EMPTY_VALUE;
      BufEnvLo[i] = InpShowEnvelopes ? envLo[i] : EMPTY_VALUE;
      BufMa[i]    = InpShowMa ? ma[i] : EMPTY_VALUE;

      if(Signal(i, open, high, low, close, rsi, atr, lips, teeth, ma, sar, envUp, envLo, need))
        {
         if(g_isBoom) BufBuy[i]  = low[i]  - atr[i] * 0.5;
         else         BufSell[i] = high[i] + atr[i] * 0.5;
        }
     }
   BufBuy[0] = BufSell[0] = EMPTY_VALUE;
   BufEnvUp[0] = (InpShowEnvelopes && need > 0) ? envUp[0] : EMPTY_VALUE;
   BufEnvLo[0] = (InpShowEnvelopes && need > 0) ? envLo[0] : EMPTY_VALUE;
   BufMa[0]    = (InpShowMa && need > 0) ? ma[0] : EMPTY_VALUE;

   // Alerta: ultima barra cerrada (indice 1), una sola vez por barra.
   if(prev_calculated > 0 && time[1] != g_lastAlertBar &&
      (BufBuy[1] != EMPTY_VALUE || BufSell[1] != EMPTY_VALUE))
     {
      g_lastAlertBar = time[1];
      string msg = StringFormat("MegaSpikes %s %s: posible %s (%s)", _Symbol,
                                EnumToString((ENUM_TIMEFRAMES)_Period),
                                g_isBoom ? "spike alcista (Boom)" : "spike bajista (Crash)",
                                EnumToString(InpMode));
      if(InpAlertPopup) Alert(msg);
      if(InpAlertSound) PlaySound(InpSoundFile);
     }

   return rates_total;
  }
//+------------------------------------------------------------------+
