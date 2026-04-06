FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production 2>/dev/null || npm install --production
COPY . .
EXPOSE 8080
CMD ["node", "server.js"]
