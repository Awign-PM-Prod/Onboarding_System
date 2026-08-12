FROM node:20-alpine AS builder

# Monorepo layout so Vite alias `@obs/backend` → `../backend/src` resolves
# (frontend imports shared attendance calculator from backend).
WORKDIR /workspace/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
COPY backend/src /workspace/backend/src

# Vite inlines VITE_* at build time — must be present here (not only at container runtime).
ARG VITE_API_BASE_URL=
ARG VITE_SUPABASE_URL=
ARG VITE_SUPABASE_ANON_KEY=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}

RUN npm run build

FROM nginx:1.27-alpine

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/frontend/dist /usr/share/nginx/html

EXPOSE 8088

CMD ["nginx", "-g", "daemon off;"]
