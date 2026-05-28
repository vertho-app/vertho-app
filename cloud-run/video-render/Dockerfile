# Cloud Run Job: render de vídeo (Node 22 + FFmpeg).
FROM node:22-bookworm-slim

# FFmpeg + ffprobe.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .

# Jobs não escutam porta; o entrypoint roda o render e sai.
CMD ["node", "render.mjs"]
