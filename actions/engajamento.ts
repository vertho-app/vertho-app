'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { requireUserAction, requireAdminAction } from '@/lib/auth/action-context';
import { PROGRESSO } from '@/lib/status';
import {
  buildEngagementEvolutionDashboard,
  type EngagementEvolutionDashboard,
} from '@/lib/engagement-evolution';
import { rollUpEngajamento } from '@/lib/engajamento/roll-up';

/**
 * Telemetria de engajamento da trilha. Duas frentes:
 *  - registrarEventoTrilha: loga eventos do colaborador na tela da semana —
 *    'abertura' (deep-link da pílula), 'formato' (abriu um formato: vídeo/áudio/
 *    texto/caso) e 'audio_fim' (terminou o áudio). Atribuição por pílula/formato.
 *  - getEngajamentoEmpresa: junta esses eventos + playback de vídeo (videos_watched)
 *    + consumo explícito, evidência (semana concluída) e uso do Tira-Dúvidas
 *    (temporada_semana_progresso) num roll-up por colaborador, pra tela
 *    /admin/engajamento. Filtrável por semana; abertura/formato quebrados
 *    por pílula (P1/P2).
 */

const FORMATOS = ['video', 'audio', 'texto', 'case'];
// 'bloqueio' (20/08/2026): a pessoa CHEGOU na semana mas ela estava trancada —
// tentativa frustrada, não consumo. Antes caía no default 'abertura' e inflava a
// métrica justamente de quem não conseguiu ver nada. Os consumidores filtram por
// `tipo === 'abertura'`, então o valor novo não entra em nenhuma contagem
// existente: ele só deixa de mentir na que já havia.
const TIPOS = ['abertura', 'formato', 'audio_fim', 'bloqueio'];

/**
 * Loga um evento do colaborador na tela da semana. Best-effort: NUNCA lança pro
 * client. empresa/colaborador vêm da TRILHA (não do client) → o evento nunca é
 * atribuído a outro tenant. `pilula` (1|2) vem do ?p= ou do índice do descritor.
 *
 * SÓ O DONO registra a própria telemetria: este export é `'use server'`, ou seja,
 * um endpoint HTTP, e o `trilhaId` é escolhido pelo CLIENTE. Sem comparar a trilha
 * com o colaborador da sessão, qualquer autenticado (de qualquer tenant) poderia
 * injetar eventos na trilha alheia — atribuídos corretamente ao dono dela, o que
 * torna o lixo indistinguível do dado real na /admin/engajamento.
 */
export async function registrarEventoTrilha(input: {
  trilhaId: string; semana: number; pilula?: number | null; formato?: string | null; tipo?: string;
}) {
  try {
    const ctx = await requireUserAction();
    const trilhaId = input?.trilhaId;
    const semana = Number(input?.semana);
    if (!trilhaId || !Number.isFinite(semana)) return { ok: false };

    const sb = createSupabaseAdmin();
    const { data: t } = await sb.from('trilhas')
      .select('empresa_id, colaborador_id').eq('id', trilhaId).maybeSingle();
    if (!t?.empresa_id) return { ok: false };
    if (!ctx.colaborador?.id || t.colaborador_id !== ctx.colaborador.id) return { ok: false };

    const pilula = input.pilula === 1 || input.pilula === 2 ? input.pilula : null;
    const formato = FORMATOS.includes(String(input.formato)) ? input.formato : null;
    const tipo = TIPOS.includes(String(input.tipo)) ? input.tipo : 'abertura';

    // O supabase-js RETORNA `{ error }`: sem esta checagem o evento sumia e a
    // action devolvia `ok: true`. O estrago não é perder um insert — é a
    // /admin/engajamento SUBNOTIFICAR e ninguém saber, porque "evento não
    // gravado" e "pessoa não abriu" produzem exatamente o mesmo gráfico.
    const { error } = await sb.from('trilha_eventos').insert({
      empresa_id: t.empresa_id, colaborador_id: t.colaborador_id, trilha_id: trilhaId,
      semana, pilula, formato, tipo,
    });
    if (error) {
      console.error('[engajamento] evento não gravado:', error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * Roll-up de engajamento do TENANT INTEIRO, para /admin/engajamento.
 *
 * As reguas moram em `lib/engajamento/roll-up.ts` — o mesmo nucleo que serve a
 * tela do time, na visao do gestor. Aqui fica so o que e proprio de uma action:
 * o gate.
 */
export async function getEngajamentoEmpresa(empresaId: string, semana?: number | null) {
  await requireAdminAction();
  if (!empresaId) return { resumo: null, colaboradores: [], semanas: [] };
  return rollUpEngajamento(empresaId, semana);
}

/**
 * Leitura longitudinal usada exclusivamente pela página B. Faz um único lote
 * de consultas sem filtro de semana e monta as séries em memória, evitando
 * repetir 5 queries para cada semana da jornada.
 *
 * O índice é operacional e transparente:
 * ativou (20) + consumiu (30) + enviou evidência (40) + usou tutor (10).
 * Não representa qualidade, competência ou nota pedagógica.
 */
export async function getEvolucaoEngajamentoEmpresa(
  empresaId: string,
  area?: string | null,
): Promise<
  | { ok: true; data: EngagementEvolutionDashboard }
  | { ok: false; error: string }
> {
  await requireAdminAction();
  if (!empresaId) return { ok: false, error: 'Selecione uma empresa' };

  const tdb = tenantDb(empresaId);
  const [
    { data: envios, error: enviosError },
    { data: eventos, error: eventosError },
    { data: videos, error: videosError },
    { data: progresso, error: progressoError },
    { data: tutorRows, error: tutorError },
  ] = await Promise.all([
    tdb.from('fase4_envios')
      .select('colaborador_id, semana_atual, colaboradores!inner(nome_completo, cargo, area_depto)'),
    tdb.from('trilha_eventos')
      .select('colaborador_id, semana, tipo'),
    tdb.from('videos_watched')
      .select('colaborador_id, semana, event_type')
      .in('event_type', ['play_started', 'play_progress', 'play_finished']),
    tdb.from('temporada_semana_progresso')
      .select('colaborador_id, semana, tipo, status, conteudo_consumido'),
    tdb.from('temporada_semana_progresso')
      .select('colaborador_id, semana')
      .not('tira_duvidas', 'is', null),
  ]);

  const queryError = enviosError || eventosError || videosError || progressoError || tutorError;
  if (queryError) return { ok: false, error: queryError.message };

  const dashboard = buildEngagementEvolutionDashboard({
    enrollments: (envios || []).map((row: any) => ({
      colaboradorId: row.colaborador_id,
      nome: row.colaboradores?.nome_completo || '—',
      cargo: row.colaboradores?.cargo || '',
      area: row.colaboradores?.area_depto || 'Sem área',
      semanaAtual: Number(row.semana_atual) || 1,
    })),
    events: (eventos || []).map((row: any) => ({
      colaboradorId: row.colaborador_id,
      semana: row.semana,
      tipo: row.tipo,
    })),
    videos: (videos || []).map((row: any) => ({
      colaboradorId: row.colaborador_id,
      semana: row.semana,
      eventType: row.event_type,
    })),
    progress: (progresso || []).map((row: any) => ({
      colaboradorId: row.colaborador_id,
      semana: row.semana,
      tipo: row.tipo,
      status: row.status,
      conteudoConsumido: row.conteudo_consumido,
    })),
    tutorUses: (tutorRows || []).map((row: any) => ({
      colaboradorId: row.colaborador_id,
      semana: row.semana,
    })),
    completedStatus: PROGRESSO.CONCLUIDO,
    area,
  });

  return { ok: true, data: dashboard };
}

/**
 * A pessoa JÁ ABRIU o conteúdo desta semana — em qualquer sessão, qualquer dia?
 *
 * 🔴 POR QUE ISTO EXISTE (medido 25/08/2026). A tela guardava essa resposta num
 * `useState(false)` que só era setado por um clique da sessão ATUAL. Quem abria
 * o conteúdo na segunda e voltava na terça encontrava o botão "Marcar como
 * realizado" desabilitado, com a mensagem "abra o conteúdo antes de concluir" —
 * tendo aberto. E como "Iniciar Evidências" exigia a marcação, a semana inteira
 * ficava trancada por um estado de React que não sobrevive a um F5.
 *
 * O tamanho disso: das 61 pessoas travadas em Ibipeba e Macaé, **24 tinham
 * evento de abertura registrado na semana em que estavam paradas**. Não era
 * desinteresse — era um botão cinza que deveria estar verde.
 *
 * A fonte é `trilha_eventos`, que já registrava tudo o que era preciso desde
 * sempre. Nenhuma coluna nova: o dado existia e ninguém o lia de volta.
 *
 * ⚠️ `tipo: 'bloqueio'` NÃO conta como abertura. Quem cai na semana trancada
 * pelo link da cadência gera evento toda semana, e tratá-lo como abertura
 * destravaria o botão de quem nunca viu o conteúdo — o mesmo motivo pelo qual a
 * telemetria separa os dois tipos.
 */
export async function jaAbriuConteudoDaSemana(semana: number) {
  try {
    const ctx = await requireUserAction();
    const colaboradorId = ctx.colaborador?.id;
    if (!colaboradorId || !ctx.empresaId || !Number.isFinite(Number(semana))) return { abriu: false };

    // 🔑 NADA VINDO DO CLIENTE DECIDE ESCOPO. A 1ª versão recebia `trilhaId` do
    // cliente, lia `trilhas` com service-role para descobrir o dono e comparava
    // — o padrão do `registrarEventoTrilha` ao lado. Aqui isso é
    // desnecessário: quem pergunta "já abri o conteúdo?" só pode perguntar por
    // si mesmo, e o colaborador e o tenant vêm da SESSÃO. Sem parâmetro de
    // escopo não há o que forjar, e `tenantDb` põe o `empresa_id` no WHERE.
    const tdb = tenantDb(ctx.empresaId);
    const { data, error } = await tdb.from('trilha_eventos')
      .select('id')
      .eq('colaborador_id', colaboradorId)
      .eq('semana', Number(semana))
      .in('tipo', ['abertura', 'formato'])
      .limit(1);

    // O supabase-js RETORNA `{ error }`. Falha de leitura NÃO pode virar "não
    // abriu": isso reintroduziria exatamente o botão travado que esta função
    // existe para destravar. Devolve o erro e a tela mantém o comportamento da
    // sessão — o clique de agora ainda libera.
    if (error) {
      console.error('[engajamento] jaAbriuConteudoDaSemana:', error.message);
      return { abriu: false, erro: error.message };
    }
    return { abriu: (data?.length || 0) > 0 };
  } catch {
    return { abriu: false };
  }
}
