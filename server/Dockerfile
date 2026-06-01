# Same image as /Dockerfile (repo root). Duplicate so `docker build -f server/Dockerfile` works.
# Coolify: default `./Dockerfile` at repo root is enough if this path is not set.

FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server

ENV NODE_ENV=production
EXPOSE 3001

CMD ["npm", "start"]
