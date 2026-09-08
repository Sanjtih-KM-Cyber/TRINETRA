# TRINETRA OS — production image (multi-stage)
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/index.html ./index.html
COPY --from=build /app/public ./public
EXPOSE 3000
# Required at runtime: JWT_SECRET (unique), CCTNS_DEMO_MODE=false,
# MONGO_URL/MONGO_DB, PORT (default 3000).
CMD ["node", "dist/server.cjs"]
