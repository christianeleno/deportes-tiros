# Desplegar PitchIQ en Render

Render despliega desde un repositorio Git: cada `git push` reconstruye la app
sola. El archivo `render.yaml` ya deja el servicio configurado, así que no hay
que rellenar formularios salvo las dos claves.

## 1. Sube el código a GitHub

El repositorio local ya está creado con el primer commit hecho. Falta enlazarlo
con uno remoto:

1. Crea un repositorio vacío en https://github.com/new (por ejemplo `pitchiq`).
   **No marques** "Add a README" ni ningún otro archivo inicial.
2. Desde la carpeta del proyecto:

```bash
git remote add origin https://github.com/TU_USUARIO/pitchiq.git
```

```bash
git push -u origin main
```

> Si tu rama se llama `master`, usa `git push -u origin master`.

**Puede ser un repositorio privado**: Render se conecta igual y así el código no
queda expuesto. Las claves no están en el repo en ningún caso — `.claude/`, que
sí las contenía, está excluido en `.gitignore`.

## 2. Crea el servicio en Render

1. Entra en https://dashboard.render.com y regístrate con GitHub.
2. **New → Blueprint**.
3. Elige el repositorio que acabas de subir. Render detecta `render.yaml` y
   propone el servicio `pitchiq` ya configurado.
4. Te pedirá las dos variables marcadas como secretas:

   | Variable | Valor |
   |---|---|
   | `RAPIDAPI_KEY` | tu clave de RapidAPI |
   | `GEMINI_API_KEY` | tu clave de Google AI Studio |

5. **Apply**. El primer despliegue tarda 2-3 minutos y te da una URL del tipo
   `https://pitchiq.onrender.com`, pública desde cualquier navegador del mundo.

## 3. Actualizar la app

No hay comando de despliegue. Cada push a la rama principal reconstruye:

```bash
git add -A
```

```bash
git commit -m "descripción del cambio"
```

```bash
git push
```

## Lo que debes saber del plan gratuito

**El servicio se duerme tras ~15 minutos sin visitas.** La siguiente petición lo
despierta, pero esa carga tarda unos 50 segundos. Quien entre en ese momento verá
la página en blanco un rato largo. Es la limitación real del plan gratuito de
Render, y conviene avisar a quien compartas el enlace.

Si molesta, hay dos salidas: pasar al plan de pago (7 $/mes, sin suspensión) o
usar Cloud Run, que despierta en un par de segundos — ver [DESPLIEGUE.md](DESPLIEGUE.md).

**El disco es efímero.** La caché vive en `/tmp` y se borra en cada reinicio, así
que tras despertar los primeros análisis vuelven a gastar cuota. Está previsto:
`CACHE_DIR` ya apunta ahí en `render.yaml`.

## Protección de cuota

La app es pública y las claves son tuyas, así que el servidor limita el gasto.
Los valores están en `render.yaml` y se pueden cambiar en el panel de Render
(Environment) sin tocar el código:

| Variable | Defecto | Qué hace |
|---|---|---|
| `LIMITE_IP_HORA` | 15 | Análisis por hora y por IP. Navegar la interfaz no cuenta. |
| `PRESUPUESTO_DIA` | 400 | Tope de peticiones diarias al proveedor de datos. |
| `LIMITE_GEMINI_DIA` | 150 | Tope de informes de Gemini al día. |

Al agotarse, la app no se rompe: avisa con un mensaje claro y, si lo que falta es
Gemini, el informe lo redacta el motor estadístico local.

Un análisis nuevo cuesta ~22 peticiones (11 por equipo), así que 400 dan para
unos 18 análisis distintos al día. **Ajústalo a tu plan real de RapidAPI.**

Para ver el gasto en cualquier momento:

```bash
curl https://TU-APP.onrender.com/api/estado
```

## Comprobar que va bien

- **Logs**: pestaña *Logs* del servicio en el panel de Render.
- **Salud**: Render vigila `/api/estado`, que responde sin llamar a ningún
  proveedor externo, así que la vigilancia no gasta cuota.

## Seguridad

- Las claves se guardan cifradas en Render (`sync: false` impide que se escriban
  en el repositorio) y solo existen como variables de entorno del servicio.
- `/api/diagnostico` está cerrado por defecto; solo se abre en local con
  `DIAGNOSTICO=1`.
- La app **no tiene login**: cualquiera con la URL puede usarla. Es lo buscado;
  si algún día quieres cerrarla, lo natural en Render es poner autenticación
  delante o pasar el servicio a privado.
