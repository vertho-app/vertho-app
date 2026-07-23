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

let cachedReportCoverBg: string | null = null;
let cachedReportCoverBgTried = false;

/**
 * Fundo decorativo da capa dos relatórios (PDI etc.) como data URI: card navy
 * arredondado + onda gradiente cyan→purple + glow + textura de pontos. Assado
 * do CSS do design system (radial-gradient/blur/mask que o @react-pdf não faz)
 * por `scripts/_bake-cover-bg.mjs`. O texto é renderizado vivo por cima.
 */
export function getReportCoverBgBase64(): string | null {
  if (cachedReportCoverBgTried) return cachedReportCoverBg;
  cachedReportCoverBgTried = true;
  const dir = join(process.cwd(), 'public', 'report');
  // JPEG otimizado (~47KB) preferido; PNG (~937KB) como fallback.
  for (const [file, mime] of [['pdi-cover-bg.jpg', 'jpeg'], ['pdi-cover-bg.png', 'png']] as const) {
    try {
      cachedReportCoverBg = `data:image/${mime};base64,${readFileSync(join(dir, file)).toString('base64')}`;
      return cachedReportCoverBg;
    } catch { /* tenta próximo */ }
  }
  cachedReportCoverBg = null;
  return cachedReportCoverBg;
}

let cachedLogoDarkH: string | null = null;
let cachedLogoDarkHTried = false;

/**
 * Logo ESCURO HORIZONTAL (Vertho H escuro, 3148×800, ratio ~3.94) para headers
 * de página com fundo BRANCO. Diferente do `getLogoDarkBase64` (versão AC,
 * ~quadrada 2080×1956): num header fino a AC espremida estica/deforma — foi o
 * caso do Perfil Organizacional em 20/07/2026.
 * ⚠️ Nome do arquivo engana: `logo-vertho-cover.png` é o H ESCURO (conferido
 * visualmente — idêntico a "Logo Vertho H escuro fundo transparente (1).png");
 * quem serve a capa navy é o CLARO em `getLogoCoverBase64` (logo-vertho.png).
 */
export function getLogoDarkHBase64(): string | null {
  if (cachedLogoDarkHTried) return cachedLogoDarkH;
  cachedLogoDarkHTried = true;
  try {
    const logoPath = join(process.cwd(), 'public', 'logo-vertho-cover.png');
    cachedLogoDarkH = `data:image/png;base64,${readFileSync(logoPath).toString('base64')}`;
  } catch {
    cachedLogoDarkH = null;
  }
  return cachedLogoDarkH;
}

let cachedIconDark: string | null = null;
let cachedIconDarkTried = false;

/**
 * Ícone Vertho (marca "V", tinta escura ~1740×1812) para uso sobre fundo CLARO —
 * ex.: selo/medalhão do Certificado de Conclusão. Origem: design bundle
 * "Certificado Jornada Vertho" (assets/icone-escuro.png). Cache por cold start.
 */
export function getIconDarkBase64(): string | null {
  if (cachedIconDarkTried) return cachedIconDark;
  cachedIconDarkTried = true;
  try {
    const p = join(process.cwd(), 'public', 'vertho-icone-escuro.png');
    cachedIconDark = `data:image/png;base64,${readFileSync(p).toString('base64')}`;
  } catch {
    cachedIconDark = null;
  }
  return cachedIconDark;
}

let cachedLogoDark: string | null = null;
let cachedLogoDarkTried = false;

/**
 * Retorna o logo ESCURO (Vertho assinatura escura) usado em páginas de fundo
 * claro/branco — ex.: rodapé da página de reflexão final do conteúdo premium,
 * onde o logo claro sumiria. Carregado uma vez por cold start.
 */
export function getLogoDarkBase64(): string | null {
  if (cachedLogoDarkTried) return cachedLogoDark;
  cachedLogoDarkTried = true;
  try {
    const logoPath = join(process.cwd(), 'public', 'logo-vertho-ac-escuro.png');
    const buffer = readFileSync(logoPath);
    cachedLogoDark = `data:image/png;base64,${buffer.toString('base64')}`;
  } catch {
    cachedLogoDark = null;
  }
  return cachedLogoDark;
}
