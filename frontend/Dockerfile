FROM node:20-alpine AS builder

# Monorepo layout so Vite alias `@obs/backend` → `../backend/src` resolves
# (frontend imports shared attendance calculator from backend).
WORKDIR /workspace/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
COPY backend/src /workspace/backend/src

# Vite inlines VITE_* at build time — must be present here (not only at container runtime).
# Empty API base = same-origin `/api/...` via nginx proxy (ALB → frontend:8088).
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build

FROM nginx:1.27-alpine

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/frontend/dist /usr/share/nginx/html

EXPOSE 8088

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8088/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
