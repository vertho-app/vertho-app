# Worker de extração de conteúdo-base de vídeo (Fase 3).
# yt-dlp resolve o vídeo de ~1800 plataformas (Vimeo, TED, LMS, YouTube),
# ffmpeg extrai/comprime o áudio, e o Gemini transcreve + estrutura o texto-base.
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 ca-certificates curl \
  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY index.mjs ./

CMD ["node", "index.mjs"]
