FROM node:20-alpine AS builder

# Monorepo layout so Vite alias `@obs/backend` → `../backend/src` resolves
# (frontend imports shared attendance calculator from backend).
WORKDIR /workspace/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
COPY backend/src /workspace/backend/src

# Default empty: SPA uses relative `/api/...` (see nginx.conf). Override at build: --build-arg or compose.
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build

FROM nginx:1.27-alpine

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/frontend/dist /usr/share/nginx/html

EXPOSE 8088

CMD ["nginx", "-g", "daemon off;"]
