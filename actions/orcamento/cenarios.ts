'use server';

// Orçamentos salvos do deal desk (/admin/vertho/orcamento) — mig 253.
//
// Todo export aqui é endpoint HTTP (regra do repo): o gate é aplicado SEMPRE, em
// cada um, e a identidade vem 100% do cookie SSR — nunca de parâmetro do cliente.
//
// O recurso NÃO é de tenant nenhum: é a régua interna de precificação da Vertho.
// Por isso o gate é `requirePlataformaSupabase` (o mesmo de
// `actions/competencias-base.ts`), não `requireAdminSupabase` — este último
// autoriza por permissão apenas, e `sales_channel.*` não está no papel rh, mas a
// postura "recurso global = platform admin" é a decisão registrada na Sprint 2
// (24/08) em lib/admin-supabase.ts.
//
// DIVISÃO DE RESPONSABILIDADE NA VALIDAÇÃO
//   · server: identidade, nome, forma (entradas/resultado são objetos) e TAMANHO
//     do payload — o que impede gravar lixo ou jsonb ilimitado;
//   · client: as chaves de `preset` e `jornada`, via `normalizarEntradas`. Essas
//     listas pertencem à TELA (`PRESETS` do catálogo de IA e `JORNADAS` da
//     season-engine). Validá-las aqui exigiria duplicá-las ou arrastar o
//     catálogo inteiro pro bundle do server; e é na tela que uma chave obsoleta
//     quebraria (o `PRESETS[preset].label` lança).
//
// `resultado` é normalizado AQUI (não depende de lista nenhuma) para que a
// listagem deva números tipados, e não o jsonb cru do banco.

import { requirePlataformaSupabase } from '@/lib/admin-supabase';
import { getAuthenticatedEmailFromAction } from '@/lib/auth/action-context';
import type { ActionResult } from '@/lib/auth/protected-action';
import { logAdminAction } from '@/lib/audit';
import {
  normalizarResumo,
  validarIdentificacao,
  type EntradasOrcamento,
  type ResumoOrcamento,
} from '@/lib/orcamento/cenario';

/**
 * Teto do jsonb gravado. O cenário tem ~40 campos numéricos: passa longe disso.
 * O limite existe porque `entradas`/`resultado` são jsonb livre e sem ele um
 * payload hostil (ou um bug que serializa algo recursivo) vira linha gigante.
 */
const LIMITE_PAYLOAD_CHARS = 32_000;

/** A lista é consultada ao abrir a tela, não paginada — um teto basta. */
const LIMITE_LISTAGEM = 200;

const COLUNAS_LISTA =
  'id, nome, cliente, resultado, proposta_id, criado_por, atualizado_por, created_at, updated_at';

export type OrcamentoSalvo = {
  id: string;
  nome: string;
  cliente: string | null;
  /** Folha de decisão congelada no save. `null` = linha gravada antes de existir. */
  resultado: ResumoOrcamento | null;
  /** Proposta já gerada a partir deste cenário (mig 254). Impede converter duas vezes. */
  propostaId: string | null;
  criadoPor: string;
  atualizadoPor: string | null;
  criadoEm: string;
  atualizadoEm: string;
};

export type OrcamentoCarregado = {
  id: string;
  nome: string;
  cliente: string | null;
  /**
   * Jsonb como foi gravado. A TELA passa por `normalizarEntradas(bruto, listas)`
   * antes de aplicar — nunca aplique isto direto nos useState.
   */
  entradas: unknown;
  resultado: ResumoOrcamento | null;
  propostaId: string | null;
};

export type EntradaSalvar = {
  /** Nulo/ausente = cria. Presente = sobrescreve esse cenário. */
  id?: string | null;
  nome: string;
  cliente?: string | null;
  entradas: EntradasOrcamento;
  resultado: ResumoOrcamento;
};

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function textoOu(v: unknown, padrao: string): string {
  return typeof v === 'string' ? v : padrao;
}

function textoOuNulo(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

/** Auditoria best-effort: `logAdminAction` nunca lança, então não quebra a ação. */
async function auditar(
  adminEmail: string,
  acao: string,
  alvo: string,
  detalhes?: Record<string, any>,
) {
  await logAdminAction({ adminEmail, acao, alvo, detalhes });
}

function paraLinha(raw: any): OrcamentoSalvo | null {
  if (!raw?.id) return null;
  return {
    id: String(raw.id),
    nome: textoOu(raw.nome, ''),
    cliente: textoOuNulo(raw.cliente),
    resultado: normalizarResumo(raw.resultado),
    propostaId: textoOuNulo(raw.proposta_id),
    criadoPor: textoOu(raw.criado_por, ''),
    atualizadoPor: textoOuNulo(raw.atualizado_por),
    criadoEm: textoOu(raw.created_at, ''),
    atualizadoEm: textoOu(raw.updated_at, ''),
  };
}

/** Cenários salvos, mais recentes primeiro (a lista abre com o último trabalho). */
export async function listarOrcamentos(): Promise<ActionResult<OrcamentoSalvo[]>> {
  const sb = await requirePlataformaSupabase('sales_channel.view');
  const { data, error } = await sb
    .from('orcamento_cenarios')
    .select(COLUNAS_LISTA)
    .order('created_at', { ascending: false })
    .limit(LIMITE_LISTAGEM);
  if (error) return { success: false, error: error.message };

  const linhas = (data ?? []).map(paraLinha).filter((l): l is OrcamentoSalvo => l !== null);
  return { success: true, data: linhas };
}

/** Um cenário inteiro, com as `entradas` cruas para a tela normalizar. */
export async function carregarOrcamento(id: string): Promise<ActionResult<OrcamentoCarregado>> {
  const sb = await requirePlataformaSupabase('sales_channel.view');
  if (typeof id !== 'string' || !id) return { success: false, error: 'Id obrigatório' };

  const { data, error } = await sb
    .from('orcamento_cenarios')
    .select('id, nome, cliente, entradas, resultado, proposta_id')
    .eq('id', id)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: 'Orçamento não encontrado' };

  return {
    success: true,
    data: {
      id: String((data as any).id),
      nome: textoOu((data as any).nome, ''),
      cliente: textoOuNulo((data as any).cliente),
      entradas: (data as any).entradas,
      resultado: normalizarResumo((data as any).resultado),
      propostaId: textoOuNulo((data as any).proposta_id),
    },
  };
}

/**
 * Cria (sem `id`) ou sobrescreve (com `id`).
 *
 * `updated_at` é gravado à mão: o repo não usa trigger de timestamp (mesma
 * postura de `actions/sales/proposals.ts`).
 */
export async function salvarOrcamento(input: EntradaSalvar): Promise<ActionResult<string>> {
  const sb = await requirePlataformaSupabase('sales_channel.manage');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { success: false, error: 'Sessão expirada. Entre de novo para continuar.' };

  const bruto = (input ?? {}) as Record<string, unknown>;
  const ident = validarIdentificacao(bruto.nome, bruto.cliente);
  if (!ident.ok || !ident.valor) {
    return { success: false, error: ident.erro ?? 'Dê um nome ao orçamento' };
  }

  if (!ehObjeto(bruto.entradas) || !ehObjeto(bruto.resultado)) {
    return { success: false, error: 'Cenário incompleto — recarregue a tela e salve de novo.' };
  }
  const serializado = JSON.stringify({ entradas: bruto.entradas, resultado: bruto.resultado });
  if (serializado.length > LIMITE_PAYLOAD_CHARS) {
    return { success: false, error: 'Cenário grande demais para salvar.' };
  }

  const id = typeof bruto.id === 'string' && bruto.id ? bruto.id : null;
  const { nome, cliente } = ident.valor;
  const resumo = normalizarResumo(bruto.resultado);
  if (!resumo) return { success: false, error: 'Resumo do cenário inválido.' };

  if (id) {
    // Existência checada ANTES de escrever. Um `.update().eq('id', …)` sobre um id
    // inexistente afeta 0 linhas e volta `error: null` — sem esta leitura, apagar
    // o cenário no banco e depois salvá-lo de outra aba "funcionaria" sem gravar.
    const { data: existente, error: erroLeitura } = await sb
      .from('orcamento_cenarios')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (erroLeitura) return { success: false, error: erroLeitura.message };
    if (!existente) return { success: false, error: 'Orçamento não encontrado' };

    const { error } = await sb
      .from('orcamento_cenarios')
      .update({
        nome,
        cliente,
        entradas: bruto.entradas,
        resultado: resumo,
        atualizado_por: email,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) return { success: false, error: error.message };

    await auditar(email, 'orcamento.atualizar', nome, { id, valorFinal: resumo.valorFinal });
    return { success: true, data: id };
  }

  const { data, error } = await sb
    .from('orcamento_cenarios')
    .insert({ nome, cliente, entradas: bruto.entradas, resultado: resumo, criado_por: email })
    .select('id')
    .single();
  if (error) return { success: false, error: error.message };

  const novoId = String((data as any).id);
  await auditar(email, 'orcamento.salvar', nome, { id: novoId, valorFinal: resumo.valorFinal });
  return { success: true, data: novoId };
}

/**
 * Exclusão definitiva. Não há soft-delete aqui de propósito: é um cenário
 * interno de precificação, e quem apagou o quê fica em `admin_audit_log`.
 * Uma proposta já convertida sobrevive — o vínculo é `ON DELETE SET NULL`
 * (mig 254).
 */
export async function excluirOrcamento(id: string): Promise<ActionResult<void>> {
  const sb = await requirePlataformaSupabase('sales_channel.manage');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { success: false, error: 'Sessão expirada. Entre de novo para continuar.' };
  if (typeof id !== 'string' || !id) return { success: false, error: 'Id obrigatório' };

  // Lê antes de apagar: dá o nome certo para a auditoria e distingue "excluído"
  // de "já não existia" — o delete sozinho voltaria `error: null` nos dois casos.
  const { data: alvo, error: erroLeitura } = await sb
    .from('orcamento_cenarios')
    .select('id, nome')
    .eq('id', id)
    .maybeSingle();
  if (erroLeitura) return { success: false, error: erroLeitura.message };
  if (!alvo) return { success: false, error: 'Orçamento não encontrado' };

  const { error } = await sb.from('orcamento_cenarios').delete().eq('id', id);
  if (error) return { success: false, error: error.message };

  await auditar(email, 'orcamento.excluir', textoOu((alvo as any).nome, id), { id });
  return { success: true };
}
