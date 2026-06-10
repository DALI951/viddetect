FROM node:20-slim

RUN apt-get update && apt-get install -y curl && \
    curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+x /usr/local/bin/yt-dlp && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY client/package*.json client/
RUN cd client && npm install

COPY . .
RUN cd client && npm run build

ENV PORT=3001
EXPOSE 3001
CMD ["node", "server.js"]
