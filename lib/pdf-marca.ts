/**
 * Marca dos PDFs por tenant.
 *
 * Alguns clientes entregam o material como próprio e não podem exibir nenhuma
 * identificação da Vertho — logo, "vertho.ai", slogan. Isso é decisão comercial
 * POR EMPRESA (`sys_config.pdf_sem_marca`), nunca por slug hardcoded: o próximo
 * cliente que pedir o mesmo liga a flag e pronto.
 *
 * ⚠️ Tirar o logo NÃO basta. `PdfReportCover` tem fallback que ESCREVE
 * "vertho.ai" quando não recebe imagem — sem a flag, remover o logo piora. Por
 * isso o resolvedor devolve as duas coisas juntas: a imagem e o `mostrarVertho`
 * que apaga os textos.
 *
 * 🔴 O fallback de erro é SEM LOGO, jamais o da Vertho: se o logo do cliente não
 * carregar, um PDF sem imagem é um contratempo estético; um PDF com a marca
 * errada quebra o combinado com o cliente.
 */
import { createSupabaseAdmin } from '@/lib/supabase';
import { getLogoCoverBase64 } from '@/lib/pdf-assets';

export interface MarcaPdf {
  /** Data URI para a capa/cabeçalho, ou null (nenhuma imagem). */
  logoBase64: string | null;
  /** false = o PDF não pode conter nenhuma identificação da Vertho. */
  mostrarVertho: boolean;
}

/**
 * Tira o "vertho-" do nome do arquivo baixado quando o tenant é white-label —
 * o nome do arquivo é identificação como qualquer outra, e é o que aparece na
 * pasta de Downloads de quem recebe.
 */
export function nomeArquivoMarca(prefixo: string, marca: MarcaPdf): string {
  return marca.mostrarVertho ? prefixo : prefixo.replace(/^vertho-?/, '') || 'relatorio';
}

const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { marca: MarcaPdf; at: number }>();

/** Baixa o logo do tenant e converte para data URI. Null em qualquer falha. */
async function logoDoTenant(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) {
      console.warn(`[pdf-marca] logo do tenant respondeu ${r.status}; seguindo sem logo`);
      return null;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    // O react-pdf aceita jpeg e png. `content-type` do Storage é confiável aqui;
    // na dúvida, jpeg (é o que o upload de branding grava).
    const mime = (r.headers.get('content-type') || 'image/jpeg').split(';')[0];
    if (!/^image\/(jpeg|jpg|png)$/i.test(mime)) {
      console.warn(`[pdf-marca] logo do tenant em formato não suportado (${mime}); seguindo sem logo`);
      return null;
    }
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (e: any) {
    console.warn('[pdf-marca] falha ao baixar logo do tenant; seguindo sem logo:', e?.message || e);
    return null;
  }
}

/**
 * Resolve a marca do PDF de uma empresa. Sem `empresaId` (ou em erro de leitura)
 * devolve a marca Vertho — é o comportamento de sempre, e o modo sem marca só
 * existe para quem ligou a flag explicitamente.
 */
export async function resolverMarcaPdf(empresaId: string | null | undefined): Promise<MarcaPdf> {
  const padrao: MarcaPdf = { logoBase64: getLogoCoverBase64(), mostrarVertho: true };
  if (!empresaId) return padrao;

  const hit = cache.get(empresaId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.marca;

  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('empresas')
    .select('sys_config, ui_config')
    .eq('id', empresaId)
    .maybeSingle();
  // supabase-js RETORNA `{ error }`. Sem esta checagem a falha de leitura viraria
  // "cliente não pediu white-label" — e o PDF sairia com a marca proibida.
  if (error) {
    console.warn('[pdf-marca] falha ao ler config da empresa, mantendo marca padrão:', error.message);
    return padrao;
  }

  const semMarca = (data as any)?.sys_config?.pdf_sem_marca === true;
  if (!semMarca) {
    cache.set(empresaId, { marca: padrao, at: Date.now() });
    return padrao;
  }

  // O logo do CLIENTE é opt-in à parte (`pdf_logo_tenant`): pôr o brasão de uma
  // prefeitura num documento de RH é decisão institucional dela, não nossa — e o
  // que está cadastrado costuma ser JPG de fundo branco, que sobre o navy da capa
  // vira um retângulo branco. Sem ele, o título ocupa o espaço e fica limpo.
  const usarLogoTenant = (data as any)?.sys_config?.pdf_logo_tenant === true;
  const marca: MarcaPdf = {
    logoBase64: usarLogoTenant ? await logoDoTenant((data as any)?.ui_config?.logo_url) : null,
    mostrarVertho: false,
  };
  cache.set(empresaId, { marca, at: Date.now() });
  return marca;
}

/** Limpa o cache (usar após mudar a flag ou o logo do tenant). */
export function resetMarcaPdfCache() {
  cache.clear();
}
