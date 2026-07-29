# Desplegar PitchIQ en Cloud Run

La app queda pública en una URL de Google, sin servidores que mantener y con
escalado a cero (si nadie entra, no cuesta nada).

## Antes de empezar

1. **Instala el SDK de Google Cloud**: https://cloud.google.com/sdk/docs/install
2. **Ten un proyecto con facturación activada.** Cloud Run tiene capa gratuita
   generosa, pero exige tarjeta asociada al proyecto.

## Despliegue

Todo desde la carpeta del proyecto. Sustituye `TU_PROYECTO` y las claves.

**1. Autentícate y elige proyecto** (una sola vez):

```bash
gcloud auth login
```

```bash
gcloud config set project TU_PROYECTO
```

**2. Activa las APIs necesarias** (una sola vez):

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

**3. Despliega**:

```bash
gcloud run deploy pitchiq --source . --region europe-southwest1 --allow-unauthenticated --max-instances 1 --memory 512Mi --set-env-vars RAPIDAPI_KEY=tu_clave_rapidapi,GEMINI_API_KEY=tu_clave_gemini
```

Google construye la imagen desde el `Dockerfile`, la sube y te devuelve la URL
pública. Tarda unos 3-4 minutos la primera vez.

### Por qué cada opción

| Opción | Motivo |
|---|---|
| `--allow-unauthenticated` | Es lo que hace la app pública. Sin esto, solo entra quien tenga permisos del proyecto. |
| `--max-instances 1` | **Importante.** Los contadores de cuota viven en memoria de la instancia. Con varias instancias, cada una tendría su propio presupuesto y podrías gastar el triple. |
| `--memory 512Mi` | La caché se guarda en `/tmp`, que en Cloud Run es memoria. 512 MB sobra. |
| `--region europe-southwest1` | Madrid. Cámbiala a la que te quede cerca. |

## Actualizar la app

Repite solo el paso 3. No hace falta volver a pasar las claves si no cambian:

```bash
gcloud run deploy pitchiq --source . --region europe-southwest1
```

## Protección de cuota

Las claves son tuyas y la app es pública, así que el servidor limita el gasto.
Valores por defecto, todos ajustables con `--set-env-vars`:

| Variable | Defecto | Qué hace |
|---|---|---|
| `LIMITE_IP_HORA` | 15 | Análisis por hora y por IP. Navegar la interfaz no cuenta. |
| `PRESUPUESTO_DIA` | 400 | Tope de peticiones diarias al proveedor de datos. |
| `LIMITE_GEMINI_DIA` | 150 | Tope de informes de Gemini al día. |

Al agotarse, la app no se rompe: devuelve un mensaje claro y, si lo que falta es
Gemini, el informe lo redacta el motor local.

**Ajusta `PRESUPUESTO_DIA` a tu plan real.** Un análisis cuesta ~22 peticiones
(11 por equipo), así que 400 son unos 18 análisis nuevos al día; los repetidos
salen de la caché y no gastan. Si tu plan de RapidAPI da menos, bájalo.

Consulta el gasto en cualquier momento:

```bash
curl https://TU-URL.run.app/api/estado
```

## Vigila el coste

Cloud Run cobra por tiempo de ejecución. Con escalado a cero y poco tráfico
suele quedarse en la capa gratuita, pero **pon un presupuesto con alerta** en
Facturación → Presupuestos y alertas. Es la red de seguridad que importa.

Para bajarla si algo se descontrola:

```bash
gcloud run services delete pitchiq --region europe-southwest1
```

## Seguridad

- Las claves van como variables de entorno del servicio, nunca en el código ni
  en la imagen. Para algo más serio, usa
  [Secret Manager](https://cloud.google.com/run/docs/configuring/secrets).
- `/api/diagnostico` está cerrado por defecto (expone respuestas crudas y gasta
  cuota). Se abre solo en local con `DIAGNOSTICO=1`.
- La app **no tiene login**: cualquiera con la URL puede usarla. Eso es lo que
  pediste; si algún día quieres restringirla, quita `--allow-unauthenticated` o
  pon [IAP](https://cloud.google.com/iap/docs/enabling-cloud-run) delante.
