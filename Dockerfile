# Email API + worker (Ensend). Context = repo root.
# Coolify often looks for ./Dockerfile — this matches server/Dockerfile.
#
# Build: docker build -t inturank-email .

FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server

ENV NODE_ENV=production
EXPOSE 3001

CMD ["npm", "start"]
