# Backend Dockerfile for TraceMind
FROM node:20-alpine

# Install build dependencies for native modules (sharp, etc.)
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json* ./

# Install dependencies (including devDependencies for build)
RUN npm ci

# Copy Prisma schema first for generate
COPY prisma ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Copy TypeScript configuration
COPY tsconfig.json ./

# Copy source code directories
COPY src ./src
COPY shared ./shared
COPY engine ./engine
COPY runtime ./runtime
COPY skill-packs ./skill-packs
COPY topic-config ./topic-config
COPY cli.ts ./

# Build TypeScript
RUN npm run build

# Remove devDependencies to reduce image size
RUN npm prune --production

# Create directories for uploads and PDFs
RUN mkdir -p uploads pdfs

# Expose backend port
EXPOSE 3303

# Health check on /api/health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3303/api/health || exit 1

# Start the server
CMD ["node", "dist/server.js"]