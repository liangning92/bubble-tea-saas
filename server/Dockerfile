FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates chromium fonts-dejavu-core && rm -rf /var/lib/apt/lists/*

ARG SOURCE_SHA
ENV APP_SOURCE_SHA=$SOURCE_SHA

WORKDIR /app

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .

RUN node -e 'require("fs").writeFileSync("public/tv/build.js","window.TV_BUILD = "+JSON.stringify({sourceSha:process.env.APP_SOURCE_SHA||"development",appVersion:"browser-"+(process.env.APP_SOURCE_SHA||"development")})+";\n")'

RUN npx prisma generate
RUN npm run build

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "dist/index.js"]
