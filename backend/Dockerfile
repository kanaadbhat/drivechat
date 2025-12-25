# Backend Dockerfile (production-ready)
FROM node:22-alpine

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY src ./src
COPY .env.example .env.example

# Ensure writable temp dirs
RUN mkdir -p /app/tmp && chown -R node:node /app

USER node

EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => { if (r.statusCode !== 200) process.exit(1) })"

ENV NODE_ENV=production
CMD ["npm", "start"]
