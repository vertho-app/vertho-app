/**
 * A extração estruturada do fim de uma conversa que falhou (R-92, 04/10/2026).
 *
 * 🔴 O DEFEITO. As rotas de conversa (`reflection` e `evaluation`, a qualitativa)
 * extraem, no último turno, os campos que o fechamento e o relatório leem: descritores,
 * insight, compromisso. Se a extração lançava, o `catch` fazia `console.error` e seguia:
 * a semana ficava CONCLUÍDA com o slot sem nada disso, e nenhuma camada sabia (o log da
 * função expira, o `degradacao_log` não via, ninguém reprocessava). Era o caso típico
 * da régua da casa, "falha de entrega degrada, mas REGISTRANDO", sem o registro.
 *
 * Derrubar a conversa não resolve: a pessoa acabou de terminar, a IA já falou e foi
 * paga, e mandá-la responder de novo não traz a mesma conversa de volta. Então:
 *
 *  1. a falha vira linha no `degradacao_log` (`aviso`, estado `reextraindo`);
 *  2. DEPOIS da resposta (`after()`), a extração é refeita uma vez sobre o MESMO
 *     transcript, e o resultado é MESCLADO no slot atual (nunca substitui o que a
 *     conversa gravou);
 *  3. se dá certo, a linha é fechada; se falha de novo, sobe para `critico`
 *     (`desistiu`): o transcript está inteiro no slot, e refazer a leitura é trabalho
 *     de quem opera, que agora sabe qual semana de quem.
 *
 * Nada aqui lança: roda no caminho de uma resposta já devolvida.
 *
 * Fora de `'use server'` de propósito.
 */
import { registrarDegradacao, resolverDegradacao, DEGRADACAO } from '@/lib/degradacao';

export interface ContextoExtracao {
  sb: any;
  empresaId: string;
  colaboradorId: string;
  trilhaId: string;
  semana: number;
  /** Onde a conversa mora no progresso da semana: `reflexao` ou `feedback`. */
  slotKey: 'reflexao' | 'feedback';
  /** `socratic`, `analytic`, `missao_feedback` ou `sem13_qualitativa`: só descreve. */
  tipoConversa: string;
}

const chaveDe = (ctx: ContextoExtracao) => `${ctx.trilhaId}:${ctx.semana}`;
const motivoDe = (erro: unknown) => String((erro as any)?.message ?? erro ?? 'erro').slice(0, 300);

/** A 1ª extração falhou: registra, para a falha não depender de o reprocesso dar certo. */
export async function registrarExtracaoFalhou(ctx: ContextoExtracao, erro: unknown): Promise<void> {
  console.error('[VERTHO] extração do fim da conversa falhou:', ctx.tipoConversa, chaveDe(ctx), motivoDe(erro));
  await registrarDegradacao({
    fluxo: 'chat',
    tipo: DEGRADACAO.EXTRACAO_CONVERSA_FALHOU,
    chave: chaveDe(ctx),
    empresaId: ctx.empresaId,
    colaboradorId: ctx.colaboradorId,
    severidade: 'aviso',
    detalhe: { estado: 'reextraindo', semana: ctx.semana, slot: ctx.slotKey, tipo_conversa: ctx.tipoConversa, motivo: motivoDe(erro) },
  }, ctx.sb);
}

/**
 * Segunda chance, fora do caminho da pessoa. `extrair` devolve os campos JÁ
 * desmascarados, no mesmo formato que a rota mescla no slot na primeira tentativa.
 * Devolve se a leitura ficou gravada.
 */
export async function reextrairEmSegundoPlano(
  ctx: ContextoExtracao,
  extrair: () => Promise<Record<string, any>>,
): Promise<boolean> {
  try {
    const extracao = await extrair();
    if (!extracao || typeof extracao !== 'object' || !Object.keys(extracao).length) {
      throw new Error('a extração voltou vazia');
    }

    // Lê o slot ATUAL e mescla: a conversa pode ter ganhado campos desde a 1ª gravação, e a
    // extração nunca traz o transcript.
    const { data: atual, error: errLeitura } = await ctx.sb.from('temporada_semana_progresso')
      .select(`id, ${ctx.slotKey}`)
      .eq('trilha_id', ctx.trilhaId).eq('semana', ctx.semana).eq('empresa_id', ctx.empresaId)
      .maybeSingle();
    if (errLeitura) throw new Error(`leitura do slot: ${errLeitura.message}`);
    if (!atual?.id) throw new Error('semana sem linha de progresso para gravar a leitura');

    const slot = { ...((atual as any)[ctx.slotKey] || {}), ...extracao };
    const { error: errGravacao } = await ctx.sb.from('temporada_semana_progresso')
      .update({ [ctx.slotKey]: slot })
      .eq('id', atual.id).eq('empresa_id', ctx.empresaId);
    if (errGravacao) throw new Error(`gravação do slot: ${errGravacao.message}`);

    await resolverDegradacao(
      { fluxo: 'chat', tipo: DEGRADACAO.EXTRACAO_CONVERSA_FALHOU, chave: chaveDe(ctx) },
      'extração refeita em segundo plano',
      ctx.sb,
    );
    return true;
  } catch (erro) {
    console.error('[VERTHO] a segunda extração também falhou:', ctx.tipoConversa, chaveDe(ctx), motivoDe(erro));
    await registrarDegradacao({
      fluxo: 'chat',
      tipo: DEGRADACAO.EXTRACAO_CONVERSA_FALHOU,
      chave: chaveDe(ctx),
      empresaId: ctx.empresaId,
      colaboradorId: ctx.colaboradorId,
      severidade: 'critico',
      detalhe: { estado: 'desistiu', semana: ctx.semana, slot: ctx.slotKey, tipo_conversa: ctx.tipoConversa, motivo: motivoDe(erro) },
    }, ctx.sb);
    return false;
  }
}
