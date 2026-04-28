import { readFileSync } from 'fs';
import { join } from 'path';

// Carregamento único (cold start). Memoizado via module scope.
let cachedLogoCover: string | null = null;
let cachedLogoCoverTried = false;

/**
 * Retorna o logo CLARO (Vertho H claro) usado na capa, headers e contracapa
 * dos PDFs, como data URI. Os layouts de PDI/Gestor/RH têm capa e barra
 * superior em navy, então o logo precisa ser a versão clara (alta visibilidade
 * sobre fundo escuro). Carregado uma vez por cold start.
 */
export function getLogoCoverBase64(): string | null {
  if (cachedLogoCoverTried) return cachedLogoCover;
  cachedLogoCoverTried = true;
  try {
    // logo-vertho.png é a versão "Logo Vertho H claro fundo transparente"
    const logoPath = join(process.cwd(), 'public', 'logo-vertho.png');
    const buffer = readFileSync(logoPath);
    cachedLogoCover = `data:image/png;base64,${buffer.toString('base64')}`;
  } catch {
    cachedLogoCover = null;
  }
  return cachedLogoCover;
}
