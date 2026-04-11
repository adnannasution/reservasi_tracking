FROM node:18-slim

WORKDIR /app

# Copy package.json & install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy all source code
COPY . .

# Expose port untuk Cloud Run
EXPOSE 8080

# Set environment
ENV NODE_ENV=production
ENV PORT=8080

# Start server
CMD ["node", "server.js"]