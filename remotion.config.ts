// Config do Remotion (spike de vídeo isolado). NÃO afeta o Next.js — o Remotion
// usa bundler próprio (esbuild) e só lê este arquivo via @remotion/cli.
import { Config } from '@remotion/cli/config';

// publicDir dedicado ao spike → o Remotion não copia/serve o public gigante do app.
Config.setPublicDir('public/video-spike');
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setConcurrency(4);
