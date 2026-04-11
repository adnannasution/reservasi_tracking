FROM node:18

WORKDIR /app

# Copy package.json & install dependencies
COPY package*.json ./
RUN npm install

# Copy all source code
COPY . .

# Use Cloud Run port
ENV PORT=8080

# Start server
CMD ["node", "server.js"]
