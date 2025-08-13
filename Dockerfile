# Use an official Node.js runtime as the base image
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy web-ui package files first for better caching
COPY web-ui/package.json web-ui/package-lock.json* ./web-ui/

# Install web-ui dependencies
WORKDIR /app/web-ui
RUN npm install

# Copy github-oauth-server package files
WORKDIR /app
COPY github-oauth-server/package.json github-oauth-server/package-lock.json* ./github-oauth-server/

# Install github-oauth-server dependencies
WORKDIR /app/github-oauth-server
RUN npm install

# Copy the rest of the application code
WORKDIR /app
COPY . .

# Set working directory to web-ui for startup
WORKDIR /app/web-ui

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]
