# EE Outlook: static dashboard + a tiny Node server that refreshes IRCC data on a timer.
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 REFRESH_HOURS=6
COPY package.json ./
COPY src ./src
COPY scripts ./scripts
COPY data ./data
# Bake in the committed snapshot so the image works offline; the server refreshes on start.
RUN node scripts/build.mjs && chown -R node:node /app
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "scripts/serve.mjs"]
