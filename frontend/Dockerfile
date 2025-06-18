FROM oven/bun:1-alpine

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package.json bun.lockb ./

# Install dependencies using bun
RUN bun install --frozen-lockfile

# Copy the rest of the application
COPY . .

# Expose port
EXPOSE 5173

# Default command (can be overridden in docker-compose)
CMD ["bun", "run", "dev", "--host", "0.0.0.0"] 