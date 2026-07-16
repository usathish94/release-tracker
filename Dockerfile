FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY src ./src
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
# Not JS, so esbuild doesn't bundle it — read at runtime by skillService.js.
COPY --from=builder /app/src/skills ./src/skills

EXPOSE 4000

CMD ["node", "dist/index.cjs"]
