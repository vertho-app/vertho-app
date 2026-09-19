/**
 * Revisão humana da devolutiva (revisão de 18/09/2026, item 4.1): quem acompanha a
 * equipe registra se concorda com a avaliação da IA, com o motivo e as competências
 * em questão. Só se acrescenta: a nota original não muda e a revisão não se edita.
 *
 * Nasceu no atendimento (`recepcao_revisoes`, mig 241, código em lib/recepcao/equipe.ts);
 * vendas e liderança usam este núcleo com tabelas próprias (mig 264). Quem pode
 * revisar (enxergar a pessoa, não ser o dono, devolutiva pronta) fica em cada
 * simulador, porque cada um tem a sua régua de equipe.
 */
import { z } from 'zod';
import { maskTextPII } from '@/lib/pii-masker';
import { PARECERES, type RevisaoPublica } from './revisao-tipos';

export { PARECERES, type Parecer, type RevisaoPublica } from './revisao-tipos';

export const revisaoComandoSchema = z
  .object({
    acao: z.literal('revisar'),
    empresaId: z.uuid().optional(),
    requestId: z.uuid(),
    /** Sessão (vendas) ou jornada (liderança). */
    alvoId: z.uuid(),
    parecer: z.enum(PARECERES),
    motivo: z.string().trim().min(1).max(4000),
    dimensoes: z.array(z.string().trim().min(1).max(30)).max(40).default([]),
  })
  .strict();
export type ComandoRevisao = z.infer<typeof revisaoComandoSchema>;

export type TabelaRevisao = { tabela: 'sim_vendas_revisoes'; alvo: 'sessao_id' } | { tabela: 'sim_lideranca_revisoes'; alvo: 'jornada_id' };

export type ResultadoRevisao = { ok: true } | { ok: false; status: 400 | 409 | 503; mensagem: string };

/** Redução de identificadores comuns, como no atendimento; não detecta todo dado pessoal. */
export const motivoParaGravar = (motivo: string) => maskTextPII(motivo).trim();

/**
 * Grava a revisão pelo `tenantDb` (que injeta a empresa). Reenvio do mesmo pedido é
 * aceito só se for idêntico; o mesmo requestId com outro conteúdo é conflito.
 */
export async function registrarRevisao(
  tdb: { from: (t: string) => any },
  destino: TabelaRevisao,
  cmd: Pick<ComandoRevisao, 'requestId' | 'alvoId' | 'parecer' | 'motivo' | 'dimensoes'>,
  revisor: { key: string; nome: string },
): Promise<ResultadoRevisao> {
  const motivo = motivoParaGravar(cmd.motivo);
  if (!motivo) return { ok: false, status: 400, mensagem: 'Escreva o motivo do parecer.' };
  const { error } = await tdb.from(destino.tabela).insert({
    id: cmd.requestId,
    [destino.alvo]: cmd.alvoId,
    revisor_key: revisor.key,
    revisor_nome: revisor.nome,
    parecer: cmd.parecer,
    motivo,
    dimensoes: cmd.dimensoes,
  });
  if (!error) return { ok: true };
  if (error.code !== '23505') return { ok: false, status: 503, mensagem: 'Não foi possível registrar a revisão.' };
  const { data: anterior, error: erroLeitura } = await tdb.from(destino.tabela).select('*').eq('id', cmd.requestId).maybeSingle();
  if (erroLeitura) return { ok: false, status: 503, mensagem: 'Não foi possível recuperar a revisão.' };
  const mesma =
    !!anterior &&
    anterior[destino.alvo] === cmd.alvoId &&
    anterior.revisor_key === revisor.key &&
    anterior.parecer === cmd.parecer &&
    anterior.motivo === motivo &&
    JSON.stringify(anterior.dimensoes) === JSON.stringify(cmd.dimensoes);
  return mesma ? { ok: true } : { ok: false, status: 409, mensagem: 'Este envio já foi usado em outra revisão.' };
}

/** Revisões do alvo, mais recentes primeiro. `null` quando a leitura falha: nunca "sem revisão". */
export async function listarRevisoes(
  tdb: { from: (t: string) => any },
  destino: TabelaRevisao,
  alvoId: string,
): Promise<RevisaoPublica[] | null> {
  const linhas: RevisaoPublica[] = [];
  for (let de = 0; de < 5000; de += 500) {
    const { data, error } = await tdb
      .from(destino.tabela)
      .select('id,parecer,motivo,dimensoes,revisor_nome,created_at')
      .eq(destino.alvo, alvoId)
      .order('created_at', { ascending: false })
      .order('id')
      .range(de, de + 499);
    if (error) return null;
    linhas.push(...((data || []) as RevisaoPublica[]));
    if ((data || []).length < 500) break;
  }
  return linhas;
}
