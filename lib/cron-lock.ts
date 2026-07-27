/**
 * Lock de execução diária dos crons (F-C3 do docs/FMEA-PIPELINE.md).
 *
 * `triggerDiario` lê os carimbos em T0 e só grava depois de publicar — check-then-act
 * sem atomicidade. Duas execuções sobrepostas (retry do Vercel após timeout, disparo
 * manual concorrente) leem os mesmos `null` e ambas enviam: pílula duplicada nos dois
 * canais e o avanço de semana aplicado 2×, o que PULA uma semana de conteúdo.
 *
 * Vive em `lib/` porque num arquivo `'use server'` todo export vira endpoint HTTP.
 */
import { createSupabaseAdmin } from '@/lib/supabase';

/** Depois disto, uma execução sem `concluido_em` é considerada morta (lambda expirou). */
const MINUTOS_ATE_CONSIDERAR_MORTA = 30;

export interface Lock {
  adquirido: boolean;
  motivo?: string;
  liberar: (resultado: string) => Promise<void>;
}

/**
 * Tenta reservar a execução de `job` para hoje (UTC).
 *
 * A atomicidade vem do `INSERT ... ON CONFLICT DO NOTHING` sobre a PK (job, dia):
 * duas invocações simultâneas disputam no banco, não no código — uma insere, a
 * outra recebe 0 linhas e desiste. Sem transação, sem advisory lock.
 */
export async function adquirirLockDiario(job: string, dia = new Date().toISOString().slice(0, 10)): Promise<Lock> {
  const sb = createSupabaseAdmin();
  const naoLibera = async () => {};

  const { data, error } = await sb.from('cron_execucoes')
    .insert({ job, dia })
    .select('job')
    .maybeSingle();

  if (!error && data) {
    return {
      adquirido: true,
      liberar: async (resultado: string) => {
        await sb.from('cron_execucoes')
          .update({ concluido_em: new Date().toISOString(), resultado: String(resultado).slice(0, 500) })
          .eq('job', job).eq('dia', dia);
      },
    };
  }

  // 23505 = unique_violation: já existe execução hoje. Só relevante se ela AINDA
  // estiver viva — uma que morreu no meio (lambda expirou antes do `concluido_em`)
  // deixaria o job travado para sempre, o que trocaria "duplicar" por "nunca mais
  // enviar". Nesse caso o retry reclama o lock.
  if (error && (error as any).code === '23505') {
    const { data: atual } = await sb.from('cron_execucoes')
      .select('iniciado_em, concluido_em').eq('job', job).eq('dia', dia).maybeSingle();

    if (atual?.concluido_em) {
      return { adquirido: false, motivo: `já executado hoje (concluído ${atual.concluido_em})`, liberar: naoLibera };
    }
    const idadeMin = atual?.iniciado_em ? (Date.now() - new Date(atual.iniciado_em).getTime()) / 60_000 : Infinity;
    if (idadeMin < MINUTOS_ATE_CONSIDERAR_MORTA) {
      return { adquirido: false, motivo: `execução em andamento há ${Math.round(idadeMin)}min`, liberar: naoLibera };
    }

    console.warn(`[cron-lock] ${job}/${dia}: execução anterior parada há ${Math.round(idadeMin)}min — reclamando o lock`);
    await sb.from('cron_execucoes').update({ iniciado_em: new Date().toISOString() }).eq('job', job).eq('dia', dia);
    return {
      adquirido: true,
      liberar: async (resultado: string) => {
        await sb.from('cron_execucoes')
          .update({ concluido_em: new Date().toISOString(), resultado: `(retomado) ${String(resultado).slice(0, 480)}` })
          .eq('job', job).eq('dia', dia);
      },
    };
  }

  // Falha inesperada do lock (tabela ausente, banco fora). FAIL-OPEN deliberado:
  // recusar o envio porque o LOCK falhou seria transformar um problema de
  // infraestrutura em coorte inteira sem pílula. Duplicar é recuperável; não enviar,
  // com o cron rodando 1×/dia, não é.
  console.error(`[cron-lock] ${job}: lock indisponível (${error?.message}) — seguindo SEM proteção contra concorrência`);
  return { adquirido: true, motivo: 'lock indisponível (fail-open)', liberar: naoLibera };
}
