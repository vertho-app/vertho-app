import { readFileSync } from 'fs';
import { join } from 'path';

// Carregamento único (cold start). Memoizado via module scope.
let cachedLogoCover: string | null = null;
let cachedLogoCoverTried = false;

/**
 * Retorna o logo escuro (fundo branco) usado na capa dos PDFs, como data URI.
 * Carregado uma vez por cold start. Se o arquivo não existir, retorna null.
 */
export function getLogoCoverBase64(): string | null {
  if (cachedLogoCoverTried) return cachedLogoCover;
  cachedLogoCoverTried = true;
  try {
    const logoPath = join(process.cwd(), 'public', 'logo-vertho-cover.png');
    const buffer = readFileSync(logoPath);
    cachedLogoCover = `data:image/png;base64,${buffer.toString('base64')}`;
  } catch {
    cachedLogoCover = null;
  }
  return cachedLogoCover;
}
