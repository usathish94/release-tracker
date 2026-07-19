FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY src ./src
RUN npm run build

FROM node:20-alpine

WORKDIR /app

# chrome-launcher (used by lighthouseService.js) needs an actual Chrome/Chromium binary;
# Alpine ships one via the chromium package. CHROME_PATH tells chrome-launcher where to find it.
RUN apk add --no-cache chromium
ENV CHROME_PATH=/usr/bin/chromium-browser

# The build is --packages=external (lighthouse and chrome-launcher read files relative
# to import.meta.url at runtime — bundling them broke that), so node_modules has to be
# present here, not just the bundled dist/index.cjs.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
# Not JS, so esbuild doesn't bundle it — read at runtime by skillService.js.
COPY --from=builder /app/src/skills ./src/skills

EXPOSE 4000

CMD ["node", "dist/index.cjs"]
