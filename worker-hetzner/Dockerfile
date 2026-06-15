# Worker de render Remotion — Vertho (Hetzner CX33, always-on)
FROM node:22-bookworm-slim

# Dependências de sistema: ffmpeg (encode/concat) + libs do Chrome headless que o
# Remotion (renderMedia) usa. Mesmas libs do build do trigger.dev.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg ca-certificates fonts-liberation \
      libnss3 libdbus-1-3 libatk1.0-0 libgbm1 libasound2 libxrandr2 libxkbcommon0 \
      libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 \
      libcairo2 libcups2 libxext6 libxrender1 libx11-6 libxcb1 libxi6 libdrm2 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instala deps (npm pega o @remotion/compositor-linux-x64-gnu nativo automaticamente no Linux).
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Código + bundle Remotion já compilado (mesma composição do app).
COPY worker.mjs ./
COPY spike-bundle ./spike-bundle

# Pré-baixa o Chrome headless do Remotion na imagem (evita baixar a cada boot).
RUN node -e "import('@remotion/renderer').then(r=>r.ensureBrowser()).then(()=>console.log('chrome ok')).catch(e=>{console.error(e);process.exit(1)})"

CMD ["node", "worker.mjs"]
