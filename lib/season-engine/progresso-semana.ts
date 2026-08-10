import { PROGRESSO } from '@/lib/status';

/**
 * Gravação do progresso da semana — em UM lugar, e falhando alto.
 *
 * F10 da auditoria de 09-10/08/2026. As duas rotas gêmeas
 * (`/api/temporada/evaluation` e `/api/temporada/reflection` — **as de maior
 * churn do repo**, 35 e 34 commits) gravavam assim:
 *
 *     await sb.from('temporada_semana_progresso').update(payload).eq('id', prog.id);
 *
 * sem `{ error }`. O supabase-js **retorna** o erro em vez de lançar, então
 * constraint violada ou pool esgotado produziam: a rota responde 200, a UI
 * mostra a semana como concluída, `liberarProxima` destrava a semana N+1 logo
 * em seguida — e a semana N fica `em_andamento` com o slot VAZIO. A pessoa
 * perde a conversa que acabou de ter e o sistema segue em frente.
 *
 * Aqui as duas falham alto: o handler das rotas tem try/catch que vira 500, e
 * 500 é exatamente o que o cliente precisa ver para não marcar como concluído.
 *
 * As duas rotas passaram a usar ESTE helper porque elas divergiam na forma
 * (uma tinha `upsertProg`, a outra era inline) — e divergência entre gêmeos é
 * como uma correção acaba aplicada só em um dos dois caminhos.
 *
 * O `.eq('empresa_id')` não é cerimônia: `temporada_semana_progresso` é
 * tenant-owned, e sem ele o `tenant-mutation-guard` (com razão) cobraria uma
 * entrada de allowlist.
 */
export async function gravarProgressoSemana(
  sb: any,
  payload: Record<string, any>,
  progId?: string | null,
): Promise<void> {
  const empresaId = payload.empresa_id;
  const { error } = progId
    ? await sb.from('temporada_semana_progresso').update(payload).eq('id', progId).eq('empresa_id', empresaId)
    : await sb.from('temporada_semana_progresso').insert(payload);

  if (error) {
    throw new Error(
      `não foi possível gravar o progresso da semana ${payload.semana}: ${error.message}`,
    );
  }
}

/**
 * Destrava a semana seguinte. Só é chamada DEPOIS de `gravarProgressoSemana`
 * ter dado certo — se a gravação falhou, aquela linha lançou e esta não roda.
 * A ordem importa: liberar a semana N+1 quando a N não gravou é o estado que o
 * usuário mais sente (avançou sem ter concluído nada).
 */
export async function liberarProximaSemana(
  sb: any,
  trilhaId: string,
  proxima: number,
  empresaId: string,
): Promise<void> {
  const { error } = await sb.from('temporada_semana_progresso')
    .update({ status: PROGRESSO.EM_ANDAMENTO })
    .eq('trilha_id', trilhaId)
    .eq('semana', proxima)
    .eq('status', PROGRESSO.PENDENTE)
    .eq('empresa_id', empresaId);

  if (error) {
    throw new Error(`não foi possível liberar a semana ${proxima}: ${error.message}`);
  }
}
