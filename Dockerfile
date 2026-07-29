# PitchIQ en Cloud Run.
# La app no tiene dependencias npm: basta el runtime de Node.
FROM node:22-alpine

WORKDIR /app

# Copiamos solo lo que sirve la app (ver .dockerignore)
COPY . .

# En Cloud Run el disco del contenedor es efímero y cuenta contra la memoria,
# así que la caché va a /tmp. Se pierde al reiniciar la instancia: es un caché
# de conveniencia, no un almacén.
ENV CACHE_DIR=/tmp/pitchiq-cache

# Cloud Run inyecta PORT; el servidor ya lo respeta.
ENV PORT=8080
EXPOSE 8080

# Usuario sin privilegios (la imagen node ya trae el usuario 'node')
USER node

CMD ["node", "server.js"]
