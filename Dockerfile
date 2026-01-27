# OpenClaude IDE - Production Docker Image
# Multi-stage build for optimized image size

# Stage 1: Build
FROM node:18-bullseye AS builder

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    libsecret-1-dev \
    libx11-dev \
    libxkbfile-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
COPY lerna.json ./
COPY tsconfig*.json ./
COPY configs ./configs

# Copy all packages
COPY packages ./packages
COPY dev-packages ./dev-packages
COPY examples ./examples

# Install dependencies
RUN npm ci --ignore-scripts

# Build the browser application
RUN npm run build:browser

# Stage 2: Production
FROM node:18-bullseye-slim AS production

WORKDIR /app

# Install runtime dependencies only
RUN apt-get update && apt-get install -y \
    git \
    libsecret-1-0 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -s /bin/bash theia && \
    mkdir -p /home/theia/workspace && \
    chown -R theia:theia /home/theia

# Copy built application from builder
COPY --from=builder /app/examples/browser/lib /app/lib
COPY --from=builder /app/examples/browser/src-gen /app/src-gen
COPY --from=builder /app/examples/browser/package.json /app/
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages /app/packages

# Copy plugins directory if exists
COPY --from=builder /app/plugins /app/plugins 2>/dev/null || true

# Set environment variables
ENV HOME=/home/theia \
    SHELL=/bin/bash \
    THEIA_DEFAULT_PLUGINS=local-dir:/app/plugins \
    USE_LOCAL_GIT=true

# Switch to non-root user
USER theia
WORKDIR /home/theia

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/healthz || exit 1

# Start the application
CMD ["node", "/app/src-gen/backend/main.js", "/home/theia/workspace", "--hostname=0.0.0.0"]
