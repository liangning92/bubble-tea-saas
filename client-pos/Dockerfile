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
RUN npm run build:pos

FROM nginx:alpine
COPY --from=builder /app/client-pos/dist /usr/share/nginx/html
RUN chmod -R 755 /usr/share/nginx/html && chmod 644 /usr/share/nginx/html/youme-logo-*.png
RUN printf '%s\n' 'server {' '    listen 80;' '    server_name _;' '    root /usr/share/nginx/html;' '    index index.html;' '    location / { try_files $uri $uri/ /index.html; }' '    location /api/ { proxy_pass http://bubble-tea-api:3000; proxy_http_version 1.1; proxy_set_header Host $host; }' '    location /uploads/ { proxy_pass http://bubble-tea-api:3000; proxy_http_version 1.1; proxy_set_header Host $host; }' '    location /socket.io/ { proxy_pass http://bubble-tea-api:3000; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Host $host; }' '}' > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
