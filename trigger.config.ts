import { defineConfig } from '@trigger.dev/sdk';
import { ffmpeg } from '@trigger.dev/build/extensions/core';

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
  runtime: 'node',
  logLevel: 'info',
  maxDuration: 900, // 15 min — cobre vídeos longos
  dirs: ['./trigger'],
  build: {
    // ffmpeg para extrair/comprimir o áudio + yt-dlp standalone na imagem.
    extensions: [ffmpeg(), installYtDlp()],
  },
});
