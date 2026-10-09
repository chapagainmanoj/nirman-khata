# syntax=docker/dockerfile:1
# NirmanKhata web app. Build context: app/
#   dev  -> Vite dev server with hot reload (compose.dev.yaml)
#   prod -> static build served by nginx (compose.prod.yaml)

FROM node:22-alpine AS deps
RUN npm install -g pnpm@11.9.0
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS dev
COPY . .
EXPOSE 5173
CMD ["pnpm", "dev", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]

FROM deps AS build
# Vite bakes these into the bundle at build time. Both are public values
# (project URL and publishable key); never pass the service-role key here.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
RUN test -n "$VITE_SUPABASE_URL" && test -n "$VITE_SUPABASE_PUBLISHABLE_KEY" \
  || (echo "VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY build args are required" && exit 1)
COPY . .
RUN rm -f .env.local && pnpm build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
COPY --chmod=644 nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
