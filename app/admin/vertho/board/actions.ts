'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getAuthenticatedEmailFromAction } from '@/lib/auth/action-context';
import { isPlatformAdmin } from '@/lib/authz';
import { PAINEL } from '@/lib/status';

/**
 * Board — fila dos painéis multi-modelo (ferramenta interna).
 *
 * Toda export aqui é um endpoint HTTP: o gate é aplicado SEMPRE, em cada uma,
 * e a identidade vem 100% do cookie SSR — nunca de parâmetro do cliente.
 * Esta tabela não é multi-tenant e não tem dado de cliente; mesmo assim o
 * acesso é restrito a platform admin, porque enfileirar painel consome as
 * assinaturas pessoais que rodam na máquina local.
 */

const MOTORES_VALIDOS = ['claude', 'codex', 'kimi', 'gemini'] as const;
type Motor = (typeof MOTORES_VALIDOS)[number];

/**
 * A pasta de contexto vira argumento de um comando executado na MÁQUINA LOCAL
 * pelo worker. Esta action é um endpoint HTTP — o valor vem do cliente, não do
 * formulário —, então caminho com sintaxe de shell nunca pode ser gravado.
 *
 * O worker também não interpola o valor no comando (viaja por variável de
 * ambiente) e revalida antes de executar. Três camadas de propósito: a entrada
 * é a única que impede o valor perigoso de existir no banco.
 */
const CAMINHO_OK = /^[A-Za-z]:[\\/][A-Za-z0-9 _.\-\\/À-ÿ]*$/;

function validarContextoDir(valor?: string): string | null {
  const p = (valor || '').trim();
  if (!p) return null;
  if (p.length > 400) throw new Error('Caminho da pasta de contexto longo demais.');
  if (p.includes('..')) throw new Error('Caminho da pasta de contexto inválido.');
  if (!CAMINHO_OK.test(p)) {
    throw new Error('Caminho da pasta de contexto inválido — use só letras, números, espaço, ponto, hífen e barras.');
  }
  return p;
}

async function garantirAdmin(): Promise<string> {
  const email = await getAuthenticatedEmailFromAction();
  if (!email) throw new Error('Sessão expirada. Entre de novo para continuar.');

  if (await isPlatformAdmin(email)) return email;

  const fallback = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (fallback.includes(email)) return email;

  throw new Error('Esta área é restrita.');
}

/** Texto puro: vai para o Storage como veio. */
const EXTENSOES_TEXTO = [
  '.md', '.txt', '.csv', '.json', '.yaml', '.yml', '.log',
  '.ts', '.tsx', '.js', '.jsx', '.sql', '.py', '.html', '.css',
];

/**
 * PDF e DOCX são aceitos, mas CONVERTIDOS para texto aqui — não repassados como
 * binário.
 *
 * O motivo: os quatro CLIs leem esses formatos de forma desigual, e um painel em
 * que um modelo abriu o arquivo e outro não opina sobre bases diferentes sem
 * ninguém perceber. Convertendo na entrada, os quatro leem exatamente o mesmo
 * conteúdo — e o que foi extraído fica visível para você conferir.
 */
const EXTENSOES_CONVERTE = ['.pdf', '.docx'];

const TAMANHO_MAX = 20 * 1024 * 1024;
const ARQUIVOS_MAX = 30;
/** Abaixo disso, a "extração" quase certamente falhou (PDF escaneado, por ex.). */
const TEXTO_MINIMO = 40;

export type ArquivoContexto = {
  nome: string;
  path: string;
  bytes: number;
  /** nome original, quando o arquivo foi convertido */
  origem?: string;
};

export type NovoPainel = {
  titulo?: string;
  pergunta: string;
  contexto?: string;
  contextoDir?: string;
  motores?: string[];
  arquivos?: ArquivoContexto[];
  lerRepositorio?: boolean;
};

/** Nome de arquivo vira chave de Storage e depois nome de arquivo no disco do
 *  worker: nada de caminho, nada fora de ASCII seguro. */
function chaveSegura(nome: string): string {
  const base = nome.replace(/^.*[\\/]/, '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const limpo = base.replace(/[^A-Za-z0-9._-]/g, '_').replace(/_{2,}/g, '_').slice(0, 120);
  return limpo || 'arquivo.txt';
}

/**
 * Sobe um arquivo de contexto. Recebe FormData porque é upload de verdade —
 * o conteúdo nunca passa por string no meio do caminho.
 */
export async function subirArquivoContexto(form: FormData): Promise<ArquivoContexto> {
  await garantirAdmin();

  const file = form.get('file');
  if (!(file instanceof File)) throw new Error('Nenhum arquivo recebido.');
  if (file.size === 0) throw new Error('Arquivo vazio.');
  if (file.size > TAMANHO_MAX) {
    throw new Error(`"${file.name}" tem ${(file.size / 1024 / 1024).toFixed(1)} MB — o limite é 20 MB.`);
  }

  const nomeLimpo = chaveSegura(file.name);
  const ext = nomeLimpo.slice(nomeLimpo.lastIndexOf('.')).toLowerCase();
  const converte = EXTENSOES_CONVERTE.includes(ext);

  if (!EXTENSOES_TEXTO.includes(ext) && !converte) {
    throw new Error(
      `"${file.name}" não é um formato que o painel consiga ler. ` +
        `Aceito: texto (.md, .txt, .csv, .json, código), .pdf e .docx. ` +
        `Planilha, imagem e slide precisam ser exportados como texto ou PDF antes.`
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let conteudo = buffer;
  let nome = nomeLimpo;
  let origem: string | undefined;

  if (converte) {
    // Mesmos parsers já usados na extração de manuscrito e no RAG
    const { parsePdf, parseDocx } = await import('@/lib/rag-ingest');
    let texto = '';
    try {
      const doc = ext === '.pdf' ? await parsePdf(buffer) : await parseDocx(buffer);
      texto = (doc.text || '').trim();
    } catch (e) {
      throw new Error(
        `Não consegui extrair o texto de "${file.name}": ${e instanceof Error ? e.message : 'erro na leitura'}.`
      );
    }

    if (texto.length < TEXTO_MINIMO) {
      throw new Error(
        ext === '.pdf'
          ? `"${file.name}" não tem texto extraível — provavelmente é um PDF escaneado (imagem). ` +
            `O painel leria uma página em branco e responderia como se tivesse lido. ` +
            `Passe por OCR ou envie o texto.`
          : `"${file.name}" não tem texto aproveitável (${texto.length} caracteres).`
      );
    }

    // O que vai para os modelos é ISTO — o binário original não é repassado.
    conteudo = Buffer.from(
      `# ${file.name}\n\n(texto extraído automaticamente do ${ext.slice(1).toUpperCase()} enviado)\n\n${texto}\n`,
      'utf8'
    );
    origem = file.name;
    nome = `${nomeLimpo.slice(0, nomeLimpo.lastIndexOf('.'))}.md`;
  }

  // pasta por dia só para o bucket não virar um monte plano
  const dia = new Date().toISOString().slice(0, 10);
  const path = `${dia}/${crypto.randomUUID()}-${nome}`;

  const sb = createSupabaseAdmin();
  const { error } = await sb.storage.from('board-contexto').upload(path, conteudo, {
    contentType: 'text/plain; charset=utf-8',
    upsert: false,
  });

  if (error) throw new Error(`Não foi possível enviar "${file.name}": ${error.message}`);

  return { nome, path, bytes: conteudo.length, origem };
}

/**
 * Orientação sobre o repositório, quando o painel for sobre código.
 *
 * Os modelos SEMPRE alcançam o disco (são CLIs locais) — o que faltava era
 * saber onde procurar. Sem isto, uma rodada inteira se perde varrendo caminho
 * que não existe: em 27/07 o Gemini gastou a rodada 1 atrás de um `src/`
 * inventado, e busca ampla trava ele em node_modules.
 */
const BRIEF_REPO = `
Esta pergunta é sobre o código da plataforma Vertho. O repositório está no diretório de trabalho informado acima.

Estrutura real (confira antes de assumir qualquer caminho):
- actions/ — Server Actions, incluindo o pipeline de IA (fase1..fase4) e ai-client.ts, o wrapper único de IA
- app/ — App Router: admin/, dashboard/, api/, representante/
- lib/ — núcleo: supabase.ts, tenant-db.ts, scoring/, season-engine/, status.ts
- tests/unit/ — vitest, com os guards de CI em tests/unit/security/
- migrations/ — NNN-nome.sql, sequencial
- docs/ — documentação canônica (PIPELINE-TRILHA, FMEA-PIPELINE, ARQUITETURA, KIT-SEMANAL...)

NÃO existe src/. Não existe pages/ (é App Router).

Ao investigar: escope a busca a um desses diretórios e exclua node_modules e .next — varrer a árvore inteira estoura o seu tempo. Prefira ler poucos arquivos certos a listar muitos.
`.trim();

function montarContexto(entrada: NovoPainel): string | null {
  const partes = [(entrada.contexto || '').trim(), entrada.lerRepositorio ? BRIEF_REPO : ''].filter(Boolean);
  return partes.length ? partes.join('\n\n') : null;
}

export async function criarPainel(entrada: NovoPainel): Promise<{ id: string }> {
  const email = await garantirAdmin();

  const pergunta = (entrada.pergunta || '').trim();
  if (pergunta.length < 15) {
    throw new Error('Escreva a pergunta com mais detalhe — o painel responde o que for perguntado.');
  }

  // Só motores conhecidos entram na fila; o worker ignora o resto de qualquer
  // forma, mas rejeitar aqui evita pedido que nasce impossível de executar.
  const motores = (entrada.motores || [...MOTORES_VALIDOS]).filter((m): m is Motor =>
    (MOTORES_VALIDOS as readonly string[]).includes(m)
  );
  if (motores.length < 2) {
    throw new Error('Escolha pelo menos dois modelos — um painel de um modelo só é uma conversa.');
  }

  const arquivos = (entrada.arquivos || []).slice(0, ARQUIVOS_MAX).filter(
    (a) => a && typeof a.path === 'string' && typeof a.nome === 'string'
  );
  if ((entrada.arquivos || []).length > ARQUIVOS_MAX) {
    throw new Error(`Máximo de ${ARQUIVOS_MAX} arquivos por painel.`);
  }

  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('board_paineis')
    .insert({
      titulo: (entrada.titulo || '').trim() || null,
      pergunta,
      // "ler o repositório" entra como instrução no contexto, não como flag
      // separada: o worker já expõe a raiz; o que faltava era orientação.
      contexto: montarContexto(entrada),
      contexto_dir: validarContextoDir(entrada.contextoDir),
      arquivos,
      motores,
      status: PAINEL.PENDENTE,
      criado_por: email,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Não foi possível enfileirar o painel: ${error.message}`);

  revalidatePath('/admin/vertho/board');
  return { id: data.id as string };
}

export async function cancelarPainel(id: string): Promise<void> {
  await garantirAdmin();

  const sb = createSupabaseAdmin();
  // Só cancela o que ainda não começou: matar um painel 'rodando' pelo banco não
  // para os processos na máquina — daria status mentiroso.
  const { error } = await sb
    .from('board_paineis')
    .update({ status: PAINEL.CANCELADO, concluido_em: new Date().toISOString() })
    .eq('id', id)
    .eq('status', PAINEL.PENDENTE);

  if (error) throw new Error(`Não foi possível cancelar: ${error.message}`);
  revalidatePath('/admin/vertho/board');
}

/** Estado de um painel, para a tela acompanhar enquanto o worker trabalha. */
export async function statusPainel(id: string): Promise<{
  status: string;
  progresso: unknown[];
  segundos: number | null;
  erro: string | null;
}> {
  await garantirAdmin();

  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('board_paineis')
    .select('status, progresso, segundos, erro')
    .eq('id', id)
    .single();

  if (error) throw new Error(`Não foi possível ler o painel: ${error.message}`);
  return {
    status: data.status as string,
    progresso: (data.progresso as unknown[]) || [],
    segundos: (data.segundos as number) ?? null,
    erro: (data.erro as string) ?? null,
  };
}
