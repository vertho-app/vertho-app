import 'server-only';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { tenantDb } from '@/lib/tenant-db';
import { RECEPCAO_SESSAO, VENDAS_SESSAO } from '@/lib/status';
import { executarCore, SimuladorError, type Gerar } from '@/lib/simulador-vendas/core';
import type { Comando, Estado as EstadoVendas } from '@/lib/simulador-vendas/schema';
import { encerrarSemRelatorio } from '@/lib/recepcao/core';
import type { Estado as EstadoAtendimento } from '@/lib/recepcao/model';
import {
  HORAS_SEM_ATIVIDADE,
  LIMITE_LISTA,
  type ListaTreinosParados,
  type SimuladorEncerravel,
  type TreinoParado,
} from './treinos-parados-regras';

export { HORAS_SEM_ATIVIDADE, LIMITE_LISTA, MOTIVO_MAXIMO, MOTIVO_MINIMO } from './treinos-parados-regras';
export type { ListaTreinosParados, SimuladorEncerravel, TreinoParado } from './treinos-parados-regras';

/**
 * Treino parado nos simuladores e o "Encerrar sem devolutiva" da equipe da
 * Vertho (R-96, decisão do dono em 04/10/2026).
 *
 * O PROBLEMA, medido em 04/10: depois da primeira fala a pessoa não descarta o
 * treino de vendas (`service.executar`), e `sim_vendas_criar` recusa abrir outro
 * enquanto houver sessão `preparando`/`em_andamento` (`SIM_ABERTA`). Se a
 * avaliação não fecha, a pessoa fica presa, cada nova tentativa paga a IA, e a
 * mensagem manda "falar com o suporte", que só liberava mexendo no banco. A
 * recuperação automática (`sim_vendas_recuperar`) só cobre `preparando` sem
 * cenário. No atendimento nada impede iniciar outro, mas a sessão com conversa
 * fica como "Retomar" para sempre e cada "Encerrar e avaliar" paga a IA.
 *
 * A SAÍDA: encerrar a sessão como o estado terminal que o código JÁ tem, sem
 * chamar IA e sem custo.
 *  · Vendas: `ABANDONADA`, a transição `abandonar` do próprio núcleo
 *    (`executarCore`), que o serviço já reserva à "recuperação administrativa" e
 *    que a tela rotula "Encerrado sem relatório". NÃO é `INTERROMPIDA`: ali o
 *    significado é "interrompido por conduta" (o moderador encerrou), e a tela
 *    diz exatamente isso à pessoa.
 *  · Atendimento: `INTERROMPIDA` (nova nesse domínio) quando há resposta, que
 *    preserva a conversa; `DESCARTADA` quando não há nenhuma, como o serviço já
 *    faz ao iniciar outro atendimento (`encerrarSemRelatorio`).
 * A conversa não é apagada em nenhum caso: só o estado muda.
 *
 * COMO NÃO PAGA IA: `executarCore` recebe um `gerar` que lança, e o atendimento
 * usa uma troca de estado pura. O teste prova as duas coisas.
 *
 * ESTE ARQUIVO NÃO AUTORIZA: quem chama (`app/admin/treinos-parados/actions.ts`)
 * já passou por `requireAdminAction('simulador.sessoes.manage')`. Aqui só se
 * confronta a sessão com a empresa pedida e com o estado em que ela está.
 */

/**
 * Os estados que o tratamento cobre. Vendas só `em_andamento`: o `preparando`
 * nunca tem cenário e o banco o recupera sozinho (`sim_vendas_recuperar`) na
 * próxima tentativa da pessoa. Atendimento inclui `aguardando_avaliacao`, que é
 * o limite de respostas esperando uma avaliação que pode não fechar.
 */
const STATUS_ENCERRAVEIS: Record<SimuladorEncerravel, readonly string[]> = {
  vendas: [VENDAS_SESSAO.EM_ANDAMENTO],
  atendimento: [RECEPCAO_SESSAO.EM_ANDAMENTO, RECEPCAO_SESSAO.AGUARDANDO_AVALIACAO],
};

const HORA_MS = 3_600_000;
const LOTE_IN = 100;

type Banco = SupabaseClient;

/** A tabela de sessões do simulador, com o literal à vista dos guards de tenant. */
const sessoesDe = (tdb: ReturnType<typeof tenantDb>, simulador: SimuladorEncerravel) =>
  simulador === 'vendas' ? tdb.from('sim_vendas_sessoes') : tdb.from('recepcao_sessoes');

function emBlocos<T>(lista: T[], tamanho: number): T[][] {
  const blocos: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) blocos.push(lista.slice(i, i + tamanho));
  return blocos;
}

async function empresasDaLista(sb: Banco, empresaId?: string | null) {
  const empresas: Array<{ id: string; nome: string }> = [];
  for (let de = 0; ; de += 1000) {
    let q = sb.from('empresas').select('id,nome').order('nome').order('id').range(de, de + 999);
    if (empresaId) q = q.eq('id', empresaId);
    const { data, error } = await q;
    if (error) throw new Error('empresas');
    empresas.push(...(data || []));
    if ((data || []).length < 1000) break;
  }
  return empresas;
}

/**
 * Treinos em andamento sem atividade há mais de `HORAS_SEM_ATIVIDADE` horas, de
 * pessoas (o teste de administrador não entra), por empresa. Só campos não
 * sensíveis: nem a conversa nem o estado saem daqui. Falha de leitura LANÇA: a
 * tela mostra erro, nunca "nenhum treino parado".
 */
export async function listarTreinosParados(
  sb: Banco,
  opcoes: { empresaId?: string | null; agora?: number } = {},
): Promise<ListaTreinosParados> {
  const agora = opcoes.agora ?? Date.now();
  const corte = new Date(agora - HORAS_SEM_ATIVIDADE * HORA_MS).toISOString();
  const empresas = await empresasDaLista(sb, opcoes.empresaId);
  const nomeDaEmpresa = new Map(empresas.map((e) => [e.id, e.nome]));

  type Bruta = {
    simulador: SimuladorEncerravel;
    id: string;
    empresa_id: string;
    colaborador_id: string | null;
    updated_at: string;
    lock_until: string | null;
    status: string;
    temConversa: boolean;
  };
  const brutas: Bruta[] = [];
  let truncado = false;

  for (const bloco of emBlocos(empresas.map((e) => e.id), LOTE_IN)) {
    // `.in('empresa_id', ...)` é o escopo de tenant desta leitura entre empresas
    // (a lista é da plataforma por desenho; `requirePlataformaSupabase` já passou).
    const vendas = await sb
      .from('sim_vendas_sessoes')
      .select(
        'id,empresa_id,colaborador_id,updated_at,lock_until,status:resumo->>status,primeira:estado->mensagens->0->>autor',
      )
      .in('empresa_id', bloco)
      .in('resumo->>status', [...STATUS_ENCERRAVEIS.vendas])
      .like('owner_key', 'colab:%')
      .lt('updated_at', corte)
      .order('updated_at', { ascending: true })
      .order('id')
      .limit(LIMITE_LISTA + 1);
    if (vendas.error) throw new Error('vendas');
    if ((vendas.data || []).length > LIMITE_LISTA) truncado = true;
    for (const r of (vendas.data || []).slice(0, LIMITE_LISTA) as any[])
      brutas.push({
        simulador: 'vendas',
        id: r.id,
        empresa_id: r.empresa_id,
        colaborador_id: r.colaborador_id ?? null,
        updated_at: r.updated_at,
        lock_until: r.lock_until ?? null,
        status: r.status,
        // A fala do vendedor abre a conversa: sem a primeira mensagem não há conversa.
        temConversa: r.primeira != null,
      });

    const atendimento = await sb
      .from('recepcao_sessoes')
      .select(
        'id,empresa_id,colaborador_id,updated_at,lock_until,status:estado->>status,respostas:estado->respostas',
      )
      .in('empresa_id', bloco)
      .in('estado->>status', [...STATUS_ENCERRAVEIS.atendimento])
      .like('owner_key', 'colab:%')
      .lt('updated_at', corte)
      .order('updated_at', { ascending: true })
      .order('id')
      .limit(LIMITE_LISTA + 1);
    if (atendimento.error) throw new Error('atendimento');
    if ((atendimento.data || []).length > LIMITE_LISTA) truncado = true;
    for (const r of (atendimento.data || []).slice(0, LIMITE_LISTA) as any[])
      brutas.push({
        simulador: 'atendimento',
        id: r.id,
        empresa_id: r.empresa_id,
        colaborador_id: r.colaborador_id ?? null,
        updated_at: r.updated_at,
        lock_until: r.lock_until ?? null,
        status: r.status,
        temConversa: Number(r.respostas ?? 0) > 0,
      });
  }

  // Quem está sendo processado agora (lease viva) não está parado.
  const paradas = brutas.filter((r) => !r.lock_until || Date.parse(r.lock_until) <= agora);

  const nomes = new Map<string, string>();
  const idsDePessoas = [...new Set(paradas.map((r) => r.colaborador_id).filter((v): v is string => !!v))];
  for (const bloco of emBlocos(idsDePessoas, LOTE_IN)) {
    const empresasDoBloco = [...new Set(paradas.filter((r) => r.colaborador_id && bloco.includes(r.colaborador_id)).map((r) => r.empresa_id))];
    const { data, error } = await sb
      .from('colaboradores')
      .select('id,empresa_id,nome_completo')
      .in('id', bloco)
      .in('empresa_id', empresasDoBloco);
    if (error) throw new Error('colaboradores');
    for (const c of data || []) nomes.set(`${c.empresa_id}:${c.id}`, c.nome_completo);
  }

  const itens: TreinoParado[] = paradas
    .map((r) => ({
      simulador: r.simulador,
      sessaoId: r.id,
      empresaId: r.empresa_id,
      empresa: nomeDaEmpresa.get(r.empresa_id) || r.empresa_id,
      pessoa: r.colaborador_id ? (nomes.get(`${r.empresa_id}:${r.colaborador_id}`) ?? null) : null,
      status: r.status,
      ultimaAtividade: r.updated_at,
      temConversa: r.temConversa,
    }))
    .sort(
      (a, b) =>
        a.empresa.localeCompare(b.empresa, 'pt-BR') ||
        a.ultimaAtividade.localeCompare(b.ultimaAtividade) ||
        a.sessaoId.localeCompare(b.sessaoId),
    );
  if (itens.length > LIMITE_LISTA) truncado = true;
  return { itens: itens.slice(0, LIMITE_LISTA), truncado, horas: HORAS_SEM_ATIVIDADE };
}

export type EncerramentoRecusa =
  | 'nao_encontrada'
  | 'nao_elegivel'
  | 'recente'
  | 'em_processamento'
  | 'mudou'
  | 'falha';

export type ResultadoEncerramento =
  | {
      ok: true;
      simulador: SimuladorEncerravel;
      empresaId: string;
      sessaoId: string;
      colaboradorId: string | null;
      statusAnterior: string;
      statusNovo: string;
      temConversa: boolean;
      horasParado: number;
    }
  | { ok: false; codigo: EncerramentoRecusa; mensagem: string };

const recusa = (codigo: EncerramentoRecusa, mensagem: string): ResultadoEncerramento => ({
  ok: false,
  codigo,
  mensagem,
});

/** O `gerar` do núcleo de vendas: encerrar sem devolutiva não chama IA, e se chamar é bug. */
const semIA: Gerar = async () => {
  throw new Error('Encerrar sem devolutiva não chama IA');
};

/**
 * Encerra UMA sessão presa. O `empresaId` e o `sessaoId` vêm do cliente: a
 * sessão só é encontrada se for DESSA empresa (`tenantDb`), e só é encerrada se
 * for de uma pessoa, estiver em andamento, parada há `HORAS_SEM_ATIVIDADE` ou
 * mais e sem lease viva. A escrita passa pelo claim/commit com a revisão lida:
 * uma resposta que chegou no meio vence o encerramento (`mudou`).
 */
export async function encerrarSemDevolutiva(
  entrada: { simulador: SimuladorEncerravel; empresaId: string; sessaoId: string },
  opcoes: { agora?: number } = {},
): Promise<ResultadoEncerramento> {
  const { simulador, empresaId, sessaoId } = entrada;
  const agora = opcoes.agora ?? Date.now();
  const tdb = tenantDb(empresaId);

  const lida = await sessoesDe(tdb, simulador)
    .select('id,owner_key,colaborador_id,estado,revisao,lock_until,updated_at')
    .eq('id', sessaoId)
    .maybeSingle();
  if (lida.error) return recusa('falha', 'Não foi possível ler o treino. Tente novamente.');
  const row = lida.data as {
    id: string;
    owner_key: string;
    colaborador_id: string | null;
    estado: EstadoVendas | EstadoAtendimento;
    revisao: number;
    lock_until: string | null;
    updated_at: string;
  } | null;
  if (!row) return recusa('nao_encontrada', 'Treino não encontrado nesta empresa.');

  if (!String(row.owner_key).startsWith('colab:'))
    return recusa('nao_elegivel', 'Este treino é um teste de administrador. Encerre-o pela tela do simulador.');
  const statusAnterior = String(row.estado?.status);
  if (!STATUS_ENCERRAVEIS[simulador].includes(statusAnterior))
    return recusa('nao_elegivel', 'Este treino não está em andamento.');
  const horasParado = Math.floor((agora - Date.parse(row.updated_at)) / HORA_MS);
  if (!(agora - Date.parse(row.updated_at) >= HORAS_SEM_ATIVIDADE * HORA_MS))
    return recusa('recente', `Este treino teve atividade nas últimas ${HORAS_SEM_ATIVIDADE} horas.`);
  if (row.lock_until && Date.parse(row.lock_until) > agora)
    return recusa('em_processamento', 'Há um envio em processamento neste treino. Tente de novo em alguns minutos.');

  const temConversa =
    simulador === 'vendas'
      ? ((row.estado as EstadoVendas).mensagens || []).some((m) => m.autor === 'vendedor')
      : (row.estado as EstadoAtendimento).respostas > 0;

  const token = randomUUID();
  const args = {
    p_id: row.id,
    p_empresa: empresaId,
    p_owner: row.owner_key,
    p_revisao: row.revisao,
    p_token: token,
  };
  const claim = await tdb.rpc(simulador === 'vendas' ? 'sim_vendas_claim' : 'recepcao_claim_v2', args);
  if (claim.error) return recusa('falha', 'Não foi possível reservar o treino. Tente novamente.');
  if (!claim.data)
    return recusa('mudou', 'O treino mudou ou está em processamento agora. Atualize a lista e tente de novo.');

  try {
    let proximo: EstadoVendas | EstadoAtendimento;
    try {
      if (simulador === 'vendas') {
        const cmd: Comando = { acao: 'abandonar', requestId: randomUUID(), sessaoId: row.id, revisao: row.revisao };
        proximo = await executarCore(row.estado as EstadoVendas, cmd, semIA);
      } else {
        proximo = encerrarSemRelatorio(row.estado as EstadoAtendimento);
      }
    } catch (e) {
      // O núcleo recusa o que não é transição válida (ex.: já encerrado). Nada foi gravado.
      return recusa('nao_elegivel', e instanceof SimuladorError || e instanceof Error ? e.message : 'Transição inválida.');
    }
    const commit = await tdb.rpc(
      simulador === 'vendas' ? 'sim_vendas_commit' : 'recepcao_commit_v2',
      simulador === 'vendas' ? { ...args, p_estado: proximo } : { ...args, p_estado: proximo, p_chamadas: [] },
    );
    if (commit.error) return recusa('falha', 'Não foi possível gravar o encerramento. Tente novamente.');
    if (!commit.data)
      return recusa('mudou', 'O treino mudou durante o encerramento. Atualize a lista e tente de novo.');
    return {
      ok: true,
      simulador,
      empresaId,
      sessaoId: row.id,
      colaboradorId: row.colaborador_id ?? null,
      statusAnterior,
      statusNovo: String(proximo.status),
      temConversa,
      horasParado,
    };
  } finally {
    // O commit zera o lease; se a transição ou a gravação falharam, o token do claim
    // é liberado aqui (só ele: um lease de outro processo não é tocado).
    const liberado = await sessoesDe(tdb, simulador)
      .update({ lock_token: null, lock_until: null })
      .eq('id', row.id)
      .eq('owner_key', row.owner_key)
      .eq('lock_token', token);
    if (liberado.error)
      console.error('[treinos-parados] lease aguardará expiração', { sessao: row.id, simulador });
  }
}
