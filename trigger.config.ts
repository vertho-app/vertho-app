import { defineConfig } from '@trigger.dev/sdk';
import { ffmpeg, additionalFiles, additionalPackages } from '@trigger.dev/build/extensions/core';

// Libs de sistema que o Chrome headless (Remotion renderMedia) precisa no Linux.
// O binário do Chrome é baixado em runtime por ensureBrowser(); estas libs são
// obrigatórias pra ele iniciar. (Spike de render de vídeo — task render-spike.)
function installChromeDeps(): any {
  return {
    name: 'install-chrome-deps',
    onBuildComplete(context: any) {
      context.addLayer({
        id: 'chrome-deps',
        image: {
          instructions: [
            `RUN apt-get update && apt-get install -y --no-install-recommends \
              libnss3 libdbus-1-3 libatk1.0-0 libgbm1 libasound2 libxrandr2 libxkbcommon0 \
              libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 \
              libcairo2 libcups2 libxext6 libxrender1 libx11-6 fonts-liberation \
              && apt-get clean && rm -rf /var/lib/apt/lists/*`,
          ],
        },
      });
    },
  };
}

// O postinstall do youtube-dl-exec (que baixaria o binário do yt-dlp) é
// pulado no build do trigger.dev, então o binário fica ausente (ENOENT).
// Baixamos o yt-dlp_linux standalone (PyInstaller, self-contained, não
// precisa de Python) direto na imagem e apontamos o youtube-dl-exec pra ele.
// Tipos inline (any) — @trigger.dev/core/build não está nas deps do app Next.
function installYtDlp(): any {
  return {
    name: 'install-yt-dlp',
    onBuildComplete(context: any) {
      context.addLayer({
        id: 'yt-dlp',
        image: {
          instructions: [
            `RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
              && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp \
              && chmod +x /usr/local/bin/yt-dlp \
              && apt-get clean && rm -rf /var/lib/apt/lists/*`,
          ],
        },
        deploy: { env: { YT_DLP_PATH: '/usr/local/bin/yt-dlp' }, override: true },
      });
    },
  };
}

export default defineConfig({
  project: 'proj_wunoneqnozqrfzlvpqjv',
  // node-22: o supabase-js ≥2.108 (realtime-js) exige WebSocket NATIVO — no
  // node 21 do runtime 'node' a construção de qualquer client service-role
  // explode ("native WebSocket not found"; medido no run_06foofcl…, 22/07).
  // Quebrou TODAS as tasks que tocam Supabase após o redeploy 20260722.1
  // rebundlar com o supabase-js novo.
  runtime: 'node-22',
  logLevel: 'info',
  maxDuration: 1800, // 30 min — cobre vídeos longos e o render do Remotion
  dirs: ['./trigger'],
  build: {
    // NÃO bundlar o renderer: o esbuild do trigger (keepNames) injeta `__name`
    // nas funções que o Remotion serializa pro browser (puppeteer evaluate) →
    // "__name is not defined". External = roda intacto do node_modules.
    external: ['@remotion/renderer'],
    // ffmpeg + yt-dlp (extração) · chrome deps + bundle do spike (render).
    extensions: [
      ffmpeg(),
      installYtDlp(),
      installChromeDeps(),
      // O binário nativo do Remotion (compositor) é por-plataforma. Instalei o
      // renderer no Windows (staging), então força-se o de Linux x64 (gnu) no
      // container — senão renderMedia falha com "Cannot find module
      // @remotion/compositor-linux-x64-gnu".
      additionalPackages({ packages: ['@remotion/compositor-linux-x64-gnu@4.0.476'] }),
      additionalFiles({ files: ['spike-bundle/**'] }),
    ],
  },
});
