import { defineConfig } from '@trigger.dev/sdk';
import { ffmpeg } from '@trigger.dev/build/extensions/core';

export default defineConfig({
  // ⚠️ Troque pelo ref do seu projeto trigger.dev (Dashboard → Project settings),
  // formato proj_xxxxxxxxxxxx.
  project: 'proj_REPLACE_WITH_YOUR_REF',
  runtime: 'node',
  logLevel: 'info',
  maxDuration: 900, // 15 min — cobre vídeos longos
  dirs: ['./trigger'],
  build: {
    // ffmpeg para extrair/comprimir o áudio. O yt-dlp vem do npm
    // (youtube-dl-exec baixa o binário na instalação).
    extensions: [ffmpeg()],
  },
});
