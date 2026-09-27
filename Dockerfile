# syntax=docker/dockerfile:1

# ---- build: install everything, compile TypeScript ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- tester: the optional upload tester UI (dev tool, runs with tsx) ----
FROM build AS tester
COPY tools ./tools
ENV TESTER_HOST=0.0.0.0 TESTER_PORT=5173
EXPOSE 5173
USER node
CMD ["node", "--import", "tsx", "tools/upload-tester/server.ts"]

# ---- api: small production image with runtime dependencies only ----
FROM node:24-alpine AS api
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
EXPOSE 3000
USER node
CMD ["node", "dist/server.js"]
