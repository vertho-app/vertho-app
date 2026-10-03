/**
 * Relatórios ORGANIZACIONAIS com dado de pessoa: onde moram e como se entregam.
 *
 * São quatro: Perfil Organizacional (nome e DISC de cada pessoa), DNA
 * Organizacional, Ranking de Adequação (ranking nominal por cargo) e Adequação
 * ao Cargo (PDF e o snapshot `.json` que alimenta o ranking).
 *
 * R-74 (revisão de 02/10/2026): os quatro iam para o bucket `conteudos`, que é
 * PÚBLICO, e a central do RH os abria pela URL pública permanente. Quem tivesse
 * o link (encaminhado, num histórico, num print) abria o PDF sem sessão, e a
 * tela prometia "Leitura segura". Medido em 03/10/2026: 132 objetos em
 * `conteudos/final/{perfil-org,dna,ranking-adequacao,adequacao-cargo}/`.
 *
 * A regra daqui em diante:
 *  · o escritor grava no bucket PRIVADO `relatorios-pdf`, em
 *    `{empresaId}/{tipo}/{nome}`, e devolve o CAMINHO (nunca uma URL pública);
 *  · o leitor autoriza quem pede (RH da própria empresa ou platform admin) e só
 *    então gera um link ASSINADO e curto, na hora do clique;
 *  · enquanto os arquivos antigos não forem migrados
 *    (`scripts/_migrar-relatorios-privados.mjs`), a leitura aceita também o
 *    formato antigo: `final/{tipo}/{empresaId}-{nome}` em `conteudos`, ou a URL
 *    pública que apontava para ele. O antigo também sai por link assinado: a
 *    aplicação não entrega mais a URL permanente a ninguém.
 *
 * Não há linha de banco apontando para esses arquivos (varredura de 03/10/2026
 * nas colunas de texto e JSON do schema `public`): o leitor descobre o arquivo
 * pela listagem da pasta da empresa.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** Bucket privado (sem URL pública). É o mesmo dos PDIs e relatórios individuais. */
export const BUCKET_RELATORIOS = 'relatorios-pdf';
/** Bucket PÚBLICO onde os relatórios moravam até 03/10/2026. Só leitura, até a migração. */
export const BUCKET_LEGADO = 'conteudos';
/**
 * Validade do link assinado. Curta de propósito: o link é gerado no clique e
 * consumido em seguida (o leitor da tela baixa o PDF na hora). Cinco minutos
 * cobrem o "Tentar novamente" do leitor sem virar um link para encaminhar.
 */
export const TTL_LINK_RELATORIO_SEGUNDOS = 300;
/** Rota que autoriza e redireciona para o link assinado. */
export const ROTA_RELATORIO = '/api/relatorios/organizacional';

export const TIPOS_RELATORIO = ['perfil-org', 'dna', 'ranking-adequacao', 'adequacao-cargo'] as const;
export type TipoRelatorio = (typeof TIPOS_RELATORIO)[number];

export type StorageClient = SupabaseClient['storage'];

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const TIPO = TIPOS_RELATORIO.join('|');
// Caracteres que `rotuloCargo` produz (encodeURIComponent sem o `%`), mais o
// ponto da extensão. Sem barra: um nome nunca sobe nem desce de pasta. E não
// começa com ponto, o que exclui `.` e `..`.
const NOME = "[A-Za-z0-9_!~*'()-][A-Za-z0-9._!~*'()-]*";

const RE_UUID = new RegExp(`^${UUID}$`);
const RE_NOME = new RegExp(`^${NOME}$`);
const RE_NOVO = new RegExp(`^(${UUID})/(${TIPO})/(${NOME})$`);
const RE_LEGADO = new RegExp(`^final/(${TIPO})/(${UUID})-(${NOME})$`);
const RE_URL_LEGADA = /^\/storage\/v1\/object\/public\/conteudos\/(.+)$/;

/**
 * Rótulo do cargo no nome do arquivo. É o mesmo que os arquivos antigos usam
 * (`encodeURIComponent` sem o `%`), então o leitor casa os dois formatos pela
 * mesma régua. Só ASCII: o Storage recusa chave com acento.
 */
export const rotuloCargo = (cargo: string) => encodeURIComponent(cargo).replace(/%/g, '');

/** Caminho NOVO, no bucket privado. Lança se a peça não cabe no formato que o leitor aceita. */
export function caminhoRelatorio(empresaId: string, tipo: TipoRelatorio, nome: string): string {
  if (!RE_UUID.test(String(empresaId || ''))) throw new Error(`caminhoRelatorio: empresaId inválido (${empresaId})`);
  if (!(TIPOS_RELATORIO as readonly string[]).includes(tipo)) throw new Error(`caminhoRelatorio: tipo inválido (${tipo})`);
  if (!RE_NOME.test(String(nome || ''))) throw new Error(`caminhoRelatorio: nome inválido (${nome})`);
  return `${empresaId}/${tipo}/${nome}`;
}

export type RefRelatorio = {
  bucket: typeof BUCKET_RELATORIOS | typeof BUCKET_LEGADO;
  /** Caminho DENTRO do bucket. */
  caminho: string;
  empresaId: string;
  tipo: TipoRelatorio;
  /** Nome do arquivo sem o prefixo da empresa (igual nos dois formatos). */
  nome: string;
  legado: boolean;
};

/**
 * Lê uma referência de relatório e diz de quem ela é. Aceita:
 *  · caminho novo: `{empresaId}/{tipo}/{nome}` (bucket privado);
 *  · caminho antigo: `final/{tipo}/{empresaId}-{nome}` (bucket `conteudos`);
 *  · a URL pública antiga que apontava para esse caminho.
 * Qualquer outra coisa é `null`: a rota nunca assina um caminho que ela não
 * consegue atribuir a uma empresa.
 */
export function interpretarRefRelatorio(ref: unknown): RefRelatorio | null {
  if (typeof ref !== 'string') return null;
  let caminho = ref.trim();
  if (!caminho) return null;

  if (/^https?:\/\//i.test(caminho)) {
    let url: URL;
    try { url = new URL(caminho); } catch { return null; }
    const m = url.pathname.match(RE_URL_LEGADA);
    if (!m) return null;
    try { caminho = decodeURIComponent(m[1]); } catch { return null; }
  }

  const novo = caminho.match(RE_NOVO);
  if (novo) {
    return { bucket: BUCKET_RELATORIOS, caminho, empresaId: novo[1], tipo: novo[2] as TipoRelatorio, nome: novo[3], legado: false };
  }
  const antigo = caminho.match(RE_LEGADO);
  if (antigo) {
    return { bucket: BUCKET_LEGADO, caminho, empresaId: antigo[2], tipo: antigo[1] as TipoRelatorio, nome: antigo[3], legado: true };
  }
  return null;
}

/** Link que a TELA recebe: a rota autoriza no clique. Nunca uma URL do Storage. */
export function hrefRelatorio(caminho: string, opts: { download?: boolean } = {}): string {
  return `${ROTA_RELATORIO}?ref=${encodeURIComponent(caminho)}${opts.download ? '&download=1' : ''}`;
}

/**
 * Quem pode ler um relatório organizacional da empresa X: o RH da PRÓPRIA
 * empresa (a mesma régua da central, `requireRoleAction(['rh'])` com o tenant
 * da sessão) ou o platform admin (a mesma régua do `/api/relatorios/pdf` para o
 * Relatório de RH). Gestor e colaborador, nunca: o Perfil Organizacional traz o
 * DISC de cada pessoa e o ranking é nominal.
 */
export function podeLerRelatorio(
  ctx: { isPlatformAdmin?: boolean | null; role?: string | null; empresaId?: string | null } | null | undefined,
  empresaId: string,
): boolean {
  if (!ctx || !empresaId) return false;
  if (ctx.isPlatformAdmin === true) return true;
  return ctx.role === 'rh' && !!ctx.empresaId && ctx.empresaId === empresaId;
}

/** Link assinado e curto para UMA referência já autorizada. */
export async function assinarRelatorio(
  storage: StorageClient,
  ref: Pick<RefRelatorio, 'bucket' | 'caminho'>,
  opts: { download?: string } = {},
): Promise<{ url: string } | { erro: string; naoEncontrado: boolean }> {
  const { data, error } = await storage
    .from(ref.bucket)
    .createSignedUrl(ref.caminho, TTL_LINK_RELATORIO_SEGUNDOS, opts.download ? { download: opts.download } : undefined);
  if (error || !data?.signedUrl) {
    const msg = error?.message || 'link não gerado';
    return { erro: msg, naoEncontrado: /not.?found|não encontrad/i.test(msg) };
  }
  return { url: data.signedUrl };
}

/** Grava no bucket PRIVADO e devolve o caminho. Falha de upload volta como erro, não como sucesso. */
export async function salvarRelatorio(
  storage: StorageClient,
  empresaId: string,
  tipo: TipoRelatorio,
  nome: string,
  corpo: Buffer | Uint8Array,
  contentType: string,
  opts: { upsert?: boolean; cacheControl?: string } = {},
): Promise<{ caminho: string } | { erro: string }> {
  const caminho = caminhoRelatorio(empresaId, tipo, nome);
  const { error } = await storage.from(BUCKET_RELATORIOS).upload(caminho, corpo, {
    contentType,
    upsert: opts.upsert ?? true,
    ...(opts.cacheControl ? { cacheControl: opts.cacheControl } : {}),
  });
  if (error) return { erro: error.message };
  return { caminho };
}

export type ArtefatoRelatorio = {
  bucket: typeof BUCKET_RELATORIOS | typeof BUCKET_LEGADO;
  caminho: string;
  /** Nome sem o prefixo da empresa. */
  nome: string;
  /**
   * O que vem antes do `-{timestamp}` no nome: o rótulo do cargo no ranking e
   * na adequação, `null` no Perfil e no DNA (o nome é só o timestamp).
   */
  rotulo: string | null;
  ts: number;
  legado: boolean;
};

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Lista os artefatos de UMA empresa num tipo, nos DOIS lugares (bucket privado
 * e a pasta antiga do público), do mais recente para o mais antigo.
 *
 * 🔴 Na pasta antiga o `search` do Storage é SUBSTRING, não prefixo: um arquivo
 * de outra empresa cujo nome CONTENHA o id passa no filtro do servidor. O
 * `startsWith(`${empresaId}-`)` em código é o que segura o tenant.
 *
 * Em empate de timestamp vence o bucket privado (o reset da demo regrava o
 * mesmo timestamp, e a cópia nova é a que deve abrir).
 *
 * Erro de listagem volta em `erros`, separado de "não há arquivo": quem chama
 * decide se degrada ou acusa, mas não confunde as duas coisas.
 */
export async function listarArtefatosRelatorio(
  storage: StorageClient,
  empresaId: string,
  tipo: TipoRelatorio,
  extensao: '.pdf' | '.json',
): Promise<{ artefatos: ArtefatoRelatorio[]; erros: string[] }> {
  const erros: string[] = [];
  const artefatos: ArtefatoRelatorio[] = [];
  const reNome = new RegExp(`^(?:(.+)-)?(\\d+)${escapar(extensao)}$`);

  const coletar = (bucket: ArtefatoRelatorio['bucket'], pasta: string, nome: string, legado: boolean) => {
    const m = nome.match(reNome);
    if (!m) return;
    artefatos.push({
      bucket,
      caminho: legado ? `${pasta}/${empresaId}-${nome}` : `${pasta}/${nome}`,
      nome,
      rotulo: m[1] ?? null,
      ts: Number(m[2]),
      legado,
    });
  };

  const pastaNova = `${empresaId}/${tipo}`;
  const pastaAntiga = `final/${tipo}`;
  const [novos, antigos] = await Promise.all([
    storage.from(BUCKET_RELATORIOS).list(pastaNova, { limit: 1000 }),
    storage.from(BUCKET_LEGADO).list(pastaAntiga, { limit: 1000, search: empresaId }),
  ]);

  if (novos.error) erros.push(`${BUCKET_RELATORIOS}/${pastaNova}: ${novos.error.message}`);
  else for (const f of novos.data || []) coletar(BUCKET_RELATORIOS, pastaNova, String((f as any).name || ''), false);

  if (antigos.error) erros.push(`${BUCKET_LEGADO}/${pastaAntiga}: ${antigos.error.message}`);
  else {
    const prefixo = `${empresaId}-`;
    for (const f of antigos.data || []) {
      const nome = String((f as any).name || '');
      if (nome.startsWith(prefixo)) coletar(BUCKET_LEGADO, pastaAntiga, nome.slice(prefixo.length), true);
    }
  }

  artefatos.sort((a, b) => b.ts - a.ts || Number(a.legado) - Number(b.legado));
  return { artefatos, erros };
}

/** Nome de download legível e só ASCII (`vertho-dna-1756555200000.pdf`). */
export function nomeDownloadRelatorio(ref: Pick<RefRelatorio, 'tipo' | 'nome'>): string {
  return `vertho-${ref.tipo}-${ref.nome}`;
}
