FROM node:20-alpine AS build
WORKDIR /app

COPY server/package*.json ./
RUN npm install
COPY server/tsconfig.json ./tsconfig.json
COPY server/src ./src
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server/package*.json ./
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "dist/index.js"]
