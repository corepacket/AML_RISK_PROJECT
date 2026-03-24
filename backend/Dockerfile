FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* /app/
RUN npm ci --omit=dev

COPY . /app

ENV NODE_ENV=production

EXPOSE 5000

CMD ["node", "server.js"]
