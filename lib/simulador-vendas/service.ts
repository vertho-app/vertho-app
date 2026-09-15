import 'server-only';
import { VENDAS_SESSAO } from '@/lib/status';
import { randomUUID } from 'node:crypto';
import { can } from '@/lib/permissions';
import { maskTextPII } from '@/lib/pii-masker';
import { gerador, snapshotPrompts } from './ai';
import { SimuladorError, executarCore, recebido, visaoPublica } from './core';
import type { Contexto } from './access';
import { REGUA_VERSION, type Estado, type Comando } from './schema';
import { periodoVigente } from './prazo';
import { TRACOS_DIVERSIDADE } from './diversidade';
import { podeVerEquipe } from './equipe';
import { aplicarCursor, COLUNAS_HISTORICO, paginaDeHistorico, type LinhaResumo } from './historico';

type Row = {
  id: string;
  estado: Estado;
  revisao: number;
  lock_until: string | null;
  created_at: string;
};
const owned = (c: Contexto, colunas = 'id,estado,revisao,lock_until,created_at') =>
  c.tdb.from('sim_vendas_sessoes').select(colunas).eq('owner_key', c.ownerKey);
function banco(error: { message?: string } | null) {
  if (!error) return;
  if (error.message?.includes('SIM_ABERTA'))
    throw new SimuladorError(
      409,
      'Você já tem um treino aberto. Retome ou encerre esse treino antes de começar outro.',
    );
  if (error.message?.includes('SIM_PERIODO'))
    throw new SimuladorError(
      403,
      'O prazo de acesso ao treinamento não está vigente. Seu histórico foi preservado.',
    );
  if (error.message?.includes('SIM_CONFIG'))
    throw new SimuladorError(403, 'A configuração comercial ainda não está disponível.');
  throw new SimuladorError(503, 'Não foi possível salvar ou recuperar o treino. Tente novamente.');
}
const publico = (row: Row) => ({
  ...visaoPublica(row.estado),
  processando: !!row.lock_until && Date.parse(row.lock_until) > Date.now(),
  processandoAte: row.lock_until,
});

export async function consultarHistorico(c: Contexto, cursor?: string | null) {
  const list = await aplicarCursor(owned(c, COLUNAS_HISTORICO), cursor)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(31);
  banco(list.error);
  const pagina = paginaDeHistorico(list.data as LinhaResumo[], 30);
  // A nota final faz parte do resumo do treino no histórico do participante.
  // O relatório detalhado continua protegido pela avaliação da experiência;
  // por isso seu indicador não é exposto nesta lista de navegação.
  return {
    ...pagina,
    historico: pagina.historico.map((item) => ({
      ...item,
      temRelatorio: false,
    })),
  };
}
export async function consultar(c: Contexto, id?: string | null) {
  const pagina = await consultarHistorico(c);
  const aberta = pagina.historico.find((r) =>
    [VENDAS_SESSAO.PREPARANDO, VENDAS_SESSAO.EM_ANDAMENTO].some((status) => status === r.status),
  );
  const alvo = id || aberta?.id || pagina.historico[0]?.id;
  let row: Row | null = null;
  if (alvo) {
    const result = await owned(c).eq('id', alvo).maybeSingle();
    banco(result.error);
    if (id && !result.data) throw new SimuladorError(404, 'Treino não encontrado.');
    row = result.data;
  }
  const vigente = c.auth.isPlatformAdmin || periodoVigente(c.config);
  return {
    empresaId: c.empresaId,
    empresaNome: c.empresaNome,
    habilitado: c.config?.habilitado === true,
    configurado: !!c.config,
    admin: c.auth.isPlatformAdmin,
    podeTreinar: vigente && (await can(c.auth, 'assessments.answer')),
    prazo: {
      inicio: c.config?.periodo_inicio || null,
      fim: c.config?.periodo_fim || null,
      vigente,
    },
    podeVerEquipe: await podeVerEquipe(c.auth),
    podeConfigurar: c.auth.isPlatformAdmin && (await can(c.auth, 'settings.company.manage')),
    ...(c.auth.isPlatformAdmin ? { config: c.config } : {}),
    sessao: row ? publico(row) : null,
    ...pagina,
  };
}

export async function executar(c: Contexto, original: Comando) {
  const deadline = Date.now() + 270000;
  const cmd: Comando =
    original.acao === 'responder'
      ? { ...original, mensagem: maskTextPII(original.mensagem).trim() }
      : original.acao === 'planejar'
        ? {
            ...original,
            planejamento: maskTextPII(original.planejamento).trim(),
          }
        : original;
  const exigirPrazo = () => {
    if (
      ['iniciar', 'planejar', 'responder', 'encerrar'].includes(cmd.acao) &&
      !c.auth.isPlatformAdmin &&
      !periodoVigente(c.config)
    ) {
      throw new SimuladorError(
        403,
        'O prazo de acesso ao treinamento não está vigente. Seu histórico foi preservado.',
      );
    }
  };
  let row: Row;
  if (cmd.acao === 'iniciar') {
    const existing = await owned(c).eq('id', cmd.requestId).maybeSingle();
    banco(existing.error);
    if (existing.data) row = existing.data;
    else {
      exigirPrazo();
      if (!c.config)
        throw new SimuladorError(400, 'Salve o briefing comercial da empresa antes de iniciar.');
      const { data: ultimos, error: diversidadeError } = await owned(
        c,
        'traco:estado->cenario->personagem->>traco_dominante',
      )
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(10);
      banco(diversidadeError);
      const anteriores = ultimos
        .map((r: { traco?: string }) => r.traco)
        .filter(Boolean) as string[];
      const tracos = TRACOS_DIVERSIDADE;
      const opcoes = tracos.filter((t) => !anteriores.includes(t));
      const indice = Number.parseInt(cmd.requestId.slice(0, 8), 16);
      const estado: Estado = {
        id: cmd.requestId,
        revisao: 0,
        status: VENDAS_SESSAO.PREPARANDO,
        nivel: cmd.nivel,
        versaoRegua: REGUA_VERSION,
        diversidade: {
          seed: (opcoes.length ? opcoes : tracos)[indice % (opcoes.length || tracos.length)],
          anteriores,
        },
        nomeVendedor: c.nomeVendedor || 'Vendedor',
        briefing: c.config.briefing,
        prompts: await snapshotPrompts(c.empresaId),
        cenario: null,
        fase: 'preparar',
        mensagens: [],
        moderacoes: [],
        intencao: null,
        relatorio: null,
        feedback: null,
        criadoEm: new Date().toISOString(),
        encerradoEm: null,
        recibos: [],
      };
      const created = await c.tdb.rpc('sim_vendas_criar', {
        p_id: estado.id,
        p_empresa: c.empresaId,
        p_owner: c.ownerKey,
        p_colaborador: c.colaboradorId,
        p_estado: estado,
        p_admin: c.auth.isPlatformAdmin,
      });
      banco(created.error);
      const loaded = await owned(c).eq('id', estado.id).single();
      banco(loaded.error);
      row = loaded.data;
    }
  } else {
    const loaded = await owned(c).eq('id', cmd.sessaoId).maybeSingle();
    banco(loaded.error);
    if (!loaded.data) throw new SimuladorError(404, 'Treino não encontrado.');
    row = loaded.data;
  }
  if (
    recebido(row.estado, cmd) ||
    (cmd.acao === 'encerrar' && row.estado.status === VENDAS_SESSAO.CONCLUIDA)
  )
    return { sessao: publico(row) };
  // Um recibo já persistido continua recuperável depois do prazo, sem nova geração.
  exigirPrazo();
  if (cmd.acao !== 'iniciar' && cmd.revisao !== row.revisao)
    throw new SimuladorError(409, 'O treino mudou em outra aba. Atualize a conversa.');
  const token = randomUUID();
  const args = {
    p_id: row.id,
    p_empresa: c.empresaId,
    p_owner: c.ownerKey,
    p_revisao: row.revisao,
    p_token: token,
  };
  const claim = await c.tdb.rpc('sim_vendas_claim', args);
  banco(claim.error);
  if (!claim.data) {
    const atual = await owned(c).eq('id', row.id).maybeSingle();
    banco(atual.error);
    if (atual.data?.revisao !== row.revisao)
      throw new SimuladorError(409, 'O treino mudou em outra aba. Atualize a conversa.');
    throw new SimuladorError(409, 'Há um envio em processamento. Aguarde e atualize a conversa.');
  }
  try {
    const base = {
      ...row.estado,
      dadosMascarados:
        row.estado.dadosMascarados ||
        (original.acao === 'responder' &&
          cmd.acao === 'responder' &&
          original.mensagem !== cmd.mensagem) ||
        (original.acao === 'planejar' &&
          cmd.acao === 'planejar' &&
          original.planejamento !== cmd.planejamento),
    };
    const next = await executarCore(base, cmd, gerador(c, row.estado, cmd.requestId, deadline));
    const committed = await c.tdb.rpc('sim_vendas_commit', {
      ...args,
      p_estado: next,
    });
    banco(committed.error);
    if (!committed.data)
      throw new SimuladorError(
        409,
        'O treino mudou durante o envio. Atualize para recuperar a conversa.',
      );
    return {
      sessao: {
        ...visaoPublica(next),
        processando: false,
        processandoAte: null,
      },
    };
  } finally {
    const release = await c.tdb
      .from('sim_vendas_sessoes')
      .update({ lock_token: null, lock_until: null })
      .eq('id', row.id)
      .eq('owner_key', c.ownerKey)
      .eq('lock_token', token);
    if (release.error)
      console.error('[sim-vendas] lease aguardará expiração', {
        sessao: row.id,
      });
  }
}
