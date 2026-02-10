FROM node:20-slim

# Install Chromium and dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*

# Set Chromium path for Puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Don't download Chromium during install (we installed it above)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

# Install pnpm (project uses pnpm; package-lock.json is out of sync with package.json)
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files (use pnpm lockfile so install matches local dev)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy application code
COPY . .

# Build Next.js application
RUN pnpm run build

EXPOSE 3000

# Start the application
CMD ["pnpm", "start"]
