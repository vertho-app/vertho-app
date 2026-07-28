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

export type NovoPainel = {
  titulo?: string;
  pergunta: string;
  contexto?: string;
  contextoDir?: string;
  motores?: string[];
};

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

  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('board_paineis')
    .insert({
      titulo: (entrada.titulo || '').trim() || null,
      pergunta,
      contexto: (entrada.contexto || '').trim() || null,
      contexto_dir: validarContextoDir(entrada.contextoDir),
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
