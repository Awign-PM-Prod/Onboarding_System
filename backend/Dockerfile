FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

EXPOSE 8089

# Explicit entrypoint (avoid npm script flags that break on Node 20, e.g. --use-system-ca)
CMD ["node", "src/index.js"]
