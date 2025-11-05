# Frontend Dockerfile - Development
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src
COPY public ./public
COPY index.html .
COPY vite.config.js .
COPY eslint.config.js .

# Expose port
EXPOSE 5173

# Start development server
CMD ["npm", "run", "dev"]
