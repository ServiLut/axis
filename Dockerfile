# --- Etapa 1: Dependencias ---
FROM node:22-bookworm-slim AS deps
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Instalamos dependencias. Al copiar 'prisma' antes, el postinstall de Prisma
# ya genera el cliente aquí y queda guardado en esta capa de Docker.
RUN npm ci

# --- Etapa 2: Construcción ---
FROM node:22-bookworm-slim AS builder
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Usamos variables para habilitar el cache de Next.js entre builds
# Esto es lo que realmente acelera la compilación de 4 min a < 2 min.
ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# --- Etapa 3: Producción (Runner) ---
FROM node:22-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Creamos un usuario de sistema para mayor seguridad
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Si usas output: 'standalone' en next.config.js (MUY RECOMENDADO)
# La copia de archivos es mucho más rápida y la imagen pesa un 80% menos.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
