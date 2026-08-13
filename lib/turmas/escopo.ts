/**
 * ESCOPO OPERACIONAL de uma ação em lote.
 *
 * A regra que decide se as turmas resolvem o problema ou viram maquiagem:
 *
 * > Com **duas ou mais turmas ativas**, ação de lote sem escopo é **ERRO** —
 * > nunca "faz para a empresa inteira".
 *
 * Default silencioso reintroduz o bug no dia em que alguém esquecer, e é o pior
 * tipo de bug: a ação funciona, o operador vê "sucesso", e 156 professores
 * receberam algo que era para 38 diretores. Empresa com UMA turma (todos os
 * clientes de hoje) segue exatamente como antes — o escopo é inferido.
 *
 * ── A validação é de RUNTIME, não de tipo ───────────────────────────────────
 * Todo export `'use server'` é endpoint HTTP: o escopo chega do CLIENTE, e tipo
 * TypeScript não existe em runtime — não defende endpoint nenhum. O `type` aqui
 * ajuda quem escreve; o `z.discriminatedUnion` protege quem recebe. (O
 * `tsconfig` deste projeto ainda tem `strict: false`, então a exaustividade do
 * tipo também não é garantida em tempo de compilação — mais uma razão para a
 * régua real morar no schema.)
 */

import { z } from 'zod';
import { TURMA_MEMBRO } from '@/lib/status';
import { contarTurmasAtivas } from './contexto';

export const EscopoOperacionalSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('turma'),
    turmaId: z.string().min(1),
  }),
  z.object({
    tipo: z.literal('selecionados'),
    colaboradorIds: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    tipo: z.literal('empresa_inteira'),
    /**
     * Escolha CONSCIENTE, não default. Exigir a justificativa é o que separa
     * "eu quis mesmo atingir todo mundo" de "esqueci de escolher a turma" — e
     * ela vai para `admin_audit_log`, onde alguém pode cobrar depois.
     */
    justificativa: z.string().min(10, 'diga por que a ação deve atingir a empresa inteira'),
  }),
]);

export type EscopoOperacional = z.infer<typeof EscopoOperacionalSchema>;

export interface EscopoResolvido {
  /** Colaboradores efetivamente no alvo. */
  colaboradorIds: string[];
  /** Turma do escopo (null em `selecionados` e `empresa_inteira`). */
  turmaId: string | null;
  /** Rótulo para log e prévia: "turma Diretores escolares — 2026.2 (127)". */
  rotulo: string;
  total: number;
}

export class EscopoObrigatorioError extends Error {
  readonly codigo = 'ESCOPO_OBRIGATORIO';
  constructor(public readonly turmasAtivas: number) {
    super(
      `Esta empresa tem ${turmasAtivas} turmas ativas — escolha a turma antes de executar. ` +
      `Para atingir todas de propósito, informe escopo "empresa inteira" com justificativa.`,
    );
    this.name = 'EscopoObrigatorioError';
  }
}

/**
 * Resolve o escopo em uma lista de colaboradores.
 *
 * @param escopo `undefined` só é aceito quando a empresa tem no máximo UMA
 *        turma ativa (compatibilidade com todo o produto de hoje). Com duas ou
 *        mais, lança `EscopoObrigatorioError`.
 */
export async function resolverEscopoDeLote(
  sb: any,
  empresaId: string,
  escopo?: EscopoOperacional,
): Promise<EscopoResolvido> {
  if (!empresaId) throw new Error('resolverEscopoDeLote: empresaId obrigatório');

  if (!escopo) {
    const ativas = await contarTurmasAtivas(sb, empresaId);
    if (ativas >= 2) throw new EscopoObrigatorioError(ativas);
    // 0 ou 1 turma: comportamento idêntico ao anterior — a empresa inteira.
    const ids = await colaboradoresDaEmpresa(sb, empresaId);
    return { colaboradorIds: ids, turmaId: null, rotulo: `empresa inteira (${ids.length})`, total: ids.length };
  }

  if (escopo.tipo === 'turma') {
    const { data: turma } = await sb.from('turmas')
      .select('id, nome')
      .eq('id', escopo.turmaId)
      .eq('empresa_id', empresaId)     // a turma tem que ser DESTE tenant
      .maybeSingle();
    if (!turma) throw new Error('Turma não encontrada nesta empresa');

    const { data: membros } = await sb.from('turma_membros')
      .select('colaborador_id')
      .eq('empresa_id', empresaId)
      .eq('turma_id', escopo.turmaId)
      .eq('status', TURMA_MEMBRO.ATIVO);
    const ids = (membros || []).map((m: any) => m.colaborador_id);
    return { colaboradorIds: ids, turmaId: turma.id, rotulo: `turma ${turma.nome} (${ids.length})`, total: ids.length };
  }

  if (escopo.tipo === 'selecionados') {
    // Filtra pelo tenant: os ids vêm do cliente e `colaborador_id` sozinho não
    // isola empresa (o app roda service_role — o banco não barra).
    const { data: colabs } = await sb.from('colaboradores')
      .select('id')
      .eq('empresa_id', empresaId)
      .in('id', escopo.colaboradorIds);
    const ids = (colabs || []).map((c: any) => c.id);
    return { colaboradorIds: ids, turmaId: null, rotulo: `${ids.length} selecionado(s)`, total: ids.length };
  }

  const ids = await colaboradoresDaEmpresa(sb, empresaId);
  return { colaboradorIds: ids, turmaId: null, rotulo: `empresa inteira (${ids.length})`, total: ids.length };
}

async function colaboradoresDaEmpresa(sb: any, empresaId: string): Promise<string[]> {
  const { data } = await sb.from('colaboradores').select('id').eq('empresa_id', empresaId);
  return (data || []).map((c: any) => c.id);
}

/**
 * FILTRO fail-closed para ações que já varrem a empresa inteira.
 *
 * Pensado para os fluxos existentes, que recebem `filtros` e montam a própria
 * lista de colaboradores — trocar a arquitetura deles inteira seria refatoração
 * grande de uma vez só; o que não pode é continuarem cegos à turma.
 *
 * @returns `null` quando não há restrição a aplicar (empresa com ≤ 1 turma ativa,
 *          ou escopo `empresa_inteira` explícito). Um `Set` quando o alvo é uma
 *          turma. **Lança** `EscopoObrigatorioError` quando há 2+ turmas ativas e
 *          ninguém escolheu — que é o ponto inteiro.
 */
export async function idsDoEscopoOuFalhar(
  sb: any,
  empresaId: string,
  opts: { turmaId?: string | null; empresaInteiraJustificativa?: string | null } = {},
): Promise<Set<string> | null> {
  if (opts.turmaId) {
    const resolvido = await resolverEscopoDeLote(sb, empresaId, { tipo: 'turma', turmaId: opts.turmaId });
    return new Set(resolvido.colaboradorIds);
  }
  if (opts.empresaInteiraJustificativa && opts.empresaInteiraJustificativa.trim().length >= 10) {
    return null;  // escolha consciente e auditada
  }
  const ativas = await contarTurmasAtivas(sb, empresaId);
  if (ativas >= 2) throw new EscopoObrigatorioError(ativas);
  return null;
}

/** Mensagem curta e acionável para a UI quando o escopo faltou. */
export function mensagemEscopoObrigatorio(e: unknown): string | null {
  return e instanceof EscopoObrigatorioError ? e.message : null;
}
