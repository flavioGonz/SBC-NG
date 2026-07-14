FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . ./
COPY ../VERSION ./VERSION
EXPOSE 3100
CMD ["node", "server.js"]
