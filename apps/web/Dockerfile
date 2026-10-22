# Build context: gốc repo (cần design/ cho token).
FROM node:22-alpine AS build
LABEL bonsai.project=bonsai
WORKDIR /app
COPY design /app/design
COPY apps/web/package.json apps/web/package-lock.json /app/apps/web/
WORKDIR /app/apps/web
RUN npm ci --no-audit --no-fund
COPY apps/web /app/apps/web
ARG VITE_API_BASE=/api/v1
ARG VITE_GOOGLE_CLIENT_ID=
ARG VITE_ZALO_APP_ID=
ARG VITE_DEV_LOGIN=false
ARG VITE_SENTRY_DSN=
ENV VITE_API_BASE=$VITE_API_BASE VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID VITE_ZALO_APP_ID=$VITE_ZALO_APP_ID VITE_DEV_LOGIN=$VITE_DEV_LOGIN VITE_SENTRY_DSN=$VITE_SENTRY_DSN
RUN npm run build

FROM nginx:1.27-alpine
LABEL bonsai.project=bonsai
COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
