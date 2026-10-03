/**
 * Inscrição na cadência semanal — NÚCLEO sem gate.
 *
 * POR QUE FORA DA ACTION
 * ──────────────────────
 * `fase4_envios` é o que o motor (`triggerDiario`) varre: sem linha lá, a
 * cadência não manda nada, por mais pronta que a trilha esteja. Abrir uma turma
 * é, portanto, uma operação de OPERAÇÃO — acontece em janela marcada, às vezes
 * fora do horário de alguém abrir a tela, e precisa ser repetível por script.
 *
 * 🔴 O caminho headless é ESTE, e não uma flag na action. Num arquivo
 * `'use server'` todo export é endpoint HTTP, e um parâmetro que pula o gate
 * passa a ser escolhido pelo CLIENTE — o furo que esta base já pagou em
 * `gerarBlueprint`. A action aplica `requireAdminAction` SEMPRE e delega aqui.
 *
 * ⚠️ Idempotente por `(empresa_id, email)`: reinscrever reativa sem duplicar e
 * sem zerar carimbo — o `upsert` mantém a linha existente atualizada.
 *
 * 🔴 QUEM JÁ ESTÁ ATIVO NÃO É REESCRITO (R-15, 03/10/2026). O upsert gravava
 * `semana_atual: 1` em TODA linha com trilha ativa, e "Iniciar envios" era o
 * único conserto de quem tinha ficado fora da cadência: apertá-lo rebobinava a
 * coorte inteira para a semana 1. Agora a linha `ativo` fica como está, e quem
 * entra (nova, `concluido` ou `pausado`) começa no relógio da TRILHA: a semana
 * do calendário dela pela data (`semanaPorData`), nunca abaixo de 1.
 */
import { TRILHA, ENVIO } from '@/lib/status';
import { lerPaginas } from '@/lib/db/ler-paginas';
import { semanaPorData } from '@/lib/season-engine/week-gating';

export interface ResultadoInscricao {
  success: boolean;
  inscritos: number;
  message: string;
}

/** Data de hoje em YYYY-MM-DD (UTC). */
function hojeYMD(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Inscreve em `fase4_envios` (status `ativo`) quem tem trilha ATIVA e ainda não
 * está ativo na cadência. O relógio de quem entra é a semana do calendário da
 * trilha mais recente dela (1 antes de começar).
 *
 * `tdb` é um `tenantDb(empresaId)` — o escopo de tenant vem dele, não de um
 * `empresa_id` solto no payload.
 */
export async function inscreverNaCadencia(
  tdb: any,
  opts: { colabIds?: string[]; agora?: Date } = {},
): Promise<ResultadoInscricao> {
  const { data: trilhas, error: errTrilhas } = await tdb.from('trilhas')
    .select('colaborador_id, numero_temporada, data_inicio')
    .eq('status', TRILHA.ATIVA);
  if (errTrilhas) return { success: false, inscritos: 0, message: errTrilhas.message };

  // A trilha ATIVA mais recente de cada pessoa: é o calendário dela que vale.
  const inicioPorColab = new Map<string, { numero: number; dataInicio: string | null }>();
  for (const t of (trilhas || []) as any[]) {
    if (!t?.colaborador_id) continue;
    const numero = Number(t.numero_temporada) || 1;
    const atual = inicioPorColab.get(t.colaborador_id);
    if (!atual || numero > atual.numero) inicioPorColab.set(t.colaborador_id, { numero, dataInicio: t.data_inicio ?? null });
  }

  let idsAtivos: string[] = Array.from(inicioPorColab.keys());
  if (opts.colabIds?.length) {
    const filtro = new Set(opts.colabIds);
    idsAtivos = idsAtivos.filter((id) => filtro.has(id));
  }
  if (!idsAtivos.length) {
    return { success: true, inscritos: 0, message: 'Nenhum colaborador com trilha ativa para inscrever' };
  }

  const { data: colabs, error: errColabs } = await tdb.from('colaboradores')
    .select('id, nome_completo, email, cargo, whatsapp')
    .in('id', idsAtivos);
  if (errColabs) return { success: false, inscritos: 0, message: errColabs.message };

  // Quem JÁ está ativo na cadência. Todas as linhas da empresa, PAGINADAS: o
  // que decide reescrever é a AUSÊNCIA de uma linha ativa, e o corte calado de
  // 1.000 linhas do PostgREST faria a cauda da coorte voltar à semana 1 (F-V5).
  // Por e-mail, que é a chave do upsert (`empresa_id, email`).
  const { data: envios, error: errEnvios } = await lerPaginas((de, ate) => tdb.from('fase4_envios')
    .select('email, status')
    .order('id')
    .range(de, ate));
  if (errEnvios) return { success: false, inscritos: 0, message: errEnvios.message };
  const jaAtivos = new Set(
    (envios || []).filter((e: any) => e?.status === ENVIO.ATIVO && e?.email).map((e: any) => e.email),
  );

  const hoje = hojeYMD();
  const agora = opts.agora ?? new Date();
  // `fase4_envios.email` é NOT NULL: quem não tem e-mail fica de fora aqui, e
  // o número disso é o que a mensagem devolve (silêncio esconderia a lacuna).
  const comEmail = (colabs || []).filter((c: any) => c.email);
  const rows = comEmail
    .filter((c: any) => !jaAtivos.has(c.email))
    .map((c: any) => {
      const dataInicio = inicioPorColab.get(c.id)?.dataInicio ?? null;
      return {
        colaborador_id: c.id,
        email: c.email,
        nome: c.nome_completo || null,
        cargo: c.cargo || null,
        whatsapp: c.whatsapp || null,
        data_inicio: dataInicio || hoje,
        // A semana da TRILHA hoje, não 1: reativar quem está no meio não pode
        // mandá-lo de volta ao começo. Antes de a trilha começar, 1.
        semana_atual: Math.max(1, semanaPorData(dataInicio, agora) ?? 1),
        status: ENVIO.ATIVO, // MINÚSCULO: a query do cron filtra .eq('status','ativo')
      };
    });
  const mantidos = comEmail.length - rows.length;

  if (!rows.length) {
    return {
      success: true,
      inscritos: 0,
      message: mantidos
        ? `Nenhuma inscrição nova · ${mantidos} já estava(m) ativo(s) e ficaram como estavam`
        : 'Nenhum colaborador elegível (sem e-mail)',
    };
  }

  const { error: errUp } = await tdb.from('fase4_envios')
    .upsert(rows, { onConflict: 'empresa_id,email' });
  if (errUp) return { success: false, inscritos: 0, message: errUp.message };

  const semEmail = (colabs || []).length - comEmail.length;
  return {
    success: true,
    inscritos: rows.length,
    message: `${rows.length} colaborador(es) inscrito(s) no envio semanal`
      + (mantidos ? ` · ${mantidos} já estava(m) ativo(s) e ficaram como estavam` : '')
      + (semEmail ? ` · ${semEmail} sem e-mail ficaram de fora` : ''),
  };
}

export type ResultadoReativacao = { linhas: number } | { erro: string };

/**
 * Reativa a cadência de UMA pessoa para a trilha que acabou de nascer no
 * encadeamento (jornada seguinte, 2ª competência do Personalizado).
 *
 * 🔴 POR QUE (R-15, 03/10/2026). O encadeamento criava a trilha 2 e não tocava
 * em `fase4_envios`: o cron seguia com o relógio da 1 (cobrava a "semana 7" da
 * jornada nova) e, passado o fim do plano, marcava a linha `concluido`, que ele
 * nunca mais lê. A jornada 2 nascia sem nenhum envio semanal.
 *
 * Relógio em 1 porque a trilha nova começa na próxima segunda: o cron não envia
 * nem avança para quem ainda não começou (`semanaPorData` = 0), e na segunda do
 * início a semana 1 abre junto com o relógio.
 *
 * Só linhas `ativo` ou `concluido`. `pausado` foi decisão de um operador e não
 * é desfeita aqui; ao retomar ("Iniciar envios"), a inscrição alinha o relógio
 * pela data da trilha. Pessoa sem linha nenhuma nunca foi inscrita na cadência
 * (escolha da operação) e continua assim: nada é criado.
 */
export async function reativarCadencia(
  tdb: any,
  colaboradorId: string,
  opts: { dataInicio?: string | null } = {},
): Promise<ResultadoReativacao> {
  const { data, error } = await tdb.from('fase4_envios')
    .update({
      status: ENVIO.ATIVO,
      semana_atual: 1,
      ...(opts.dataInicio ? { data_inicio: opts.dataInicio } : {}),
    })
    .eq('colaborador_id', colaboradorId)
    .in('status', [ENVIO.ATIVO, ENVIO.CONCLUIDO])
    .select('id');
  if (error) return { erro: error.message };
  return { linhas: Array.isArray(data) ? data.length : 0 };
}
