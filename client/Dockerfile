FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Runtime ───────────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/build ./build
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev

EXPOSE 3001
ENV PORT=3001 HOST=0.0.0.0

CMD ["node", "build"]
