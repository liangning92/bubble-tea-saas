# Build with repository root as context so npm ci uses the workspace lockfile.
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY client-admin/package.json client-admin/package.json
COPY client-pos/package.json client-pos/package.json
COPY client-staff/package.json client-staff/package.json
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY client-admin client-admin
COPY client-pos client-pos
COPY client-staff client-staff
COPY shared shared
RUN npm run build:admin

FROM nginx:alpine
COPY --from=builder /app/client-admin/dist /usr/share/nginx/html
RUN chmod -R 755 /usr/share/nginx/html && chmod 644 /usr/share/nginx/html/youme-logo-*.png
COPY client-admin/docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
