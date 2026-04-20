FROM node:20-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

# ── Runtime image ─────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

# Remove default nginx welcome page
RUN rm -f /usr/share/nginx/html/*

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
