import 'server-only';

/**
 * Lembrete automático da ENTRADA (pacote de clínicas, decisão do dono de 23/10/2026: "o lembrete sai pelo
 * sistema; a cobrança com o relatório é feita pela onlabel").
 *
 * Quem entra numa turma tem 1 semana para fazer o perfil e o diagnóstico; quem não fizer não começa. Hoje
 * a cadência automática só cobre quem já tem trilha (`project_cadencia_so_cobre_trilha_ativa`): a entrada
 * dependia de disparo manual, que fotografa o dia e esquece quem entra depois. Aqui, todo dia às 10h
 * (BRT), a pessoa cuja turma começa daqui a `DIAS_ANTES` dias recebe o lembrete do que falta.
 *
 * Régua única de quem recebe o quê: os três templates rodam sobre a MESMA população e o próprio lote
 * decide (`prepararLoteTemplate`, resolvedores disjuntos): sem perfil → convite do perfil; perfil e
 * nenhuma competência → convite do diagnóstico; diagnóstico começado e não terminado → "continue de onde
 * parou". Quem já fez tudo é excluído pelo lote, com o motivo no resultado.
 *
 * Travas: só empresa com `pacote_clinicas`, nunca demo, nunca com envios pausados; só a secretária (o RH
 * sai do lote pela chave do pacote); template que não estiver APPROVED e UTILITY na Meta é pulado e
 * registrado (a Meta já reclassificou textos depois de aprovados); uma vez por dia por pessoa e template
 * (chave com o dia, conferida antes e usada como id de deduplicação na fila).
 */

import { tenantDb } from '@/lib/tenant-db';
import { pacoteClinicasLigado } from '@/lib/pacote-clinicas';
import { pausaDeEnvios } from '@/lib/envios-pausados';
import { diaEmBrasilia, prepararLoteTemplate, enfileirarLoteTemplate, type LotePreparado } from '@/lib/notifications/envio-template-lote';
import { coletarDadosRelatorioClinicas } from '@/lib/relatorio-clinicas/coletar';

/** Dias antes do início da turma em que o lembrete sai (início na segunda: quarta e sexta). */
export const DIAS_ANTES = [5, 3] as const;

/**
 * Templates da entrada, nesta ordem. O convite do diagnóstico é o `inicio_temporada_v2` (nomeia todas as
 * competências do Top 5 e diz "4 perguntas, cerca de 10 minutos por competência"), e não o
 * `avaliacao_competencias`, que diz "São 4 cenários" e nomeia só a primeira (proposta de 23/10, a
 * confirmar com o dono).
 */
export const TEMPLATES_ENTRADA = ['avaliacao_pendente', 'inicio_temporada_v2', 'avaliacao_parcial'] as const;

export const KIND_LEMBRETE_ENTRADA = 'lembrete_entrada';

export function chaveDoLembrete(template: string, colaboradorId: string, hoje: string): string {
  return `${KIND_LEMBRETE_ENTRADA}:${template}:${colaboradorId}:${hoje}`;
}

/** Dias inteiros entre hoje e o início (datas AAAA-MM-DD de Brasília). */
export function diasAteOInicio(inicio: string, hoje: string): number {
  return Math.round((Date.parse(`${inicio}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000);
}

export interface StatusMeta { status: string; category: string }

/** Lê status e categoria dos templates na Meta. `null` = não foi possível consultar (o cron NÃO envia). */
export async function statusDosTemplatesNaMeta(): Promise<Record<string, StatusMeta> | null> {
  const waba = process.env.WABA_ID || '';
  const token = process.env.META_WHATSAPPBUSINESS_API || '';
  if (!waba || !token) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    const r = await fetch(
      `https://graph.facebook.com/v22.0/${waba}/message_templates?limit=200&fields=name,status,category&access_token=${encodeURIComponent(token)}`,
      { signal: ctrl.signal },
    );
    clearTimeout(timer);
    const j: any = await r.json();
    if (j?.error) return null;
    const out: Record<string, StatusMeta> = {};
    for (const t of j?.data || []) if (t?.name) out[t.name] = { status: String(t.status || ''), category: String(t.category || '') };
    return out;
  } catch {
    return null;
  }
}

export interface ResultadoLembrete {
  empresaId: string;
  empresa: string;
  pulada?: string;
  pessoasNoDia: number;
  porTemplate: Array<{
    template: string;
    enfileirados: number;
    jaReceberamHoje: number;
    adiadosPorTeto: number;
    excluidos: LotePreparado['excluidos'];
    indisponivel?: string;
    falhas: Array<{ nome: string; motivo: string }>;
    amostra?: Array<{ nome: string; params: string[] }>;
  }>;
}

export interface DepsLembrete {
  coletar?: typeof coletarDadosRelatorioClinicas;
  preparar?: typeof prepararLoteTemplate;
  enfileirar?: typeof enfileirarLoteTemplate;
  statusMeta?: () => Promise<Record<string, StatusMeta> | null>;
}

/**
 * @param sb cliente de servidor (o cron passa o dele). Lê `empresas` e prepara os lotes.
 * @param opts.enviar false = simulação: diz quem receberia o quê, sem enfileirar.
 */
export async function executarLembreteEntrada(
  sb: any,
  opts: { agora?: Date; enviar?: boolean; empresaId?: string; deps?: DepsLembrete } = {},
): Promise<{ hoje: string; empresas: ResultadoLembrete[]; metaIndisponivel?: boolean }> {
  const agora = opts.agora ?? new Date();
  const hoje = diaEmBrasilia(agora);
  const enviar = opts.enviar !== false;
  const coletar = opts.deps?.coletar ?? coletarDadosRelatorioClinicas;
  const preparar = opts.deps?.preparar ?? prepararLoteTemplate;
  const enfileirar = opts.deps?.enfileirar ?? enfileirarLoteTemplate;

  let q = sb.from('empresas').select('id, nome, is_demo, sys_config');
  if (opts.empresaId) q = q.eq('id', opts.empresaId);
  const { data: empresas, error } = await q;
  if (error) throw new Error(`lembrete da entrada: empresas: ${error.message}`);
  const alvos = (empresas || []).filter((e: any) => pacoteClinicasLigado(e.sys_config) && !e.is_demo);
  if (!alvos.length) return { hoje, empresas: [] };

  // A Meta é consultada uma vez por execução. Sem consulta, não envia nada (só a simulação segue).
  const meta = await (opts.deps?.statusMeta ?? statusDosTemplatesNaMeta)();
  if (!meta && enviar) {
    return {
      hoje,
      metaIndisponivel: true,
      empresas: alvos.map((e: any) => ({ empresaId: e.id, empresa: e.nome, pulada: 'não foi possível consultar a Meta: nenhum lembrete enfileirado', pessoasNoDia: 0, porTemplate: [] })),
    };
  }

  const resultados: ResultadoLembrete[] = [];
  for (const emp of alvos) {
    const r: ResultadoLembrete = { empresaId: emp.id, empresa: emp.nome, pessoasNoDia: 0, porTemplate: [] };
    resultados.push(r);
    const pausa = pausaDeEnvios(emp.sys_config, agora.toISOString());
    if (pausa) { r.pulada = `envios pausados: ${pausa.motivo}`; continue; }

    const dados = await coletar(emp.id);
    const ids = dados.pessoas
      .filter((p) => {
        const inicio = dados.inicioDaTurmaPorPessoa.get(p.id);
        if (!inicio || dados.trilhaPorPessoa.get(p.id)?.ativa) return false;
        return (DIAS_ANTES as readonly number[]).includes(diasAteOInicio(inicio, hoje));
      })
      .map((p) => p.id);
    r.pessoasNoDia = ids.length;
    if (!ids.length) continue;

    const tdb = tenantDb(emp.id);
    const { data: colabs, error: eC } = await tdb.from('colaboradores')
      .select('id, nome_completo, cargo, telefone, perfil_dominante, role').in('id', ids);
    if (eC) throw new Error(`lembrete da entrada: secretárias: ${eC.message}`);
    const chaves = TEMPLATES_ENTRADA.flatMap((t) => ids.map((id) => chaveDoLembrete(t, id, hoje)));
    const { data: ja, error: eJ } = await tdb.from('notification_deliveries')
      .select('dedupe_key').eq('status', 'sucesso').in('dedupe_key', chaves);
    if (eJ) throw new Error(`lembrete da entrada: envios de hoje: ${eJ.message}`);
    const recebidas = new Set((ja || []).map((d: any) => d.dedupe_key));

    for (const template of TEMPLATES_ENTRADA) {
      const linha: ResultadoLembrete['porTemplate'][number] = { template, enfileirados: 0, jaReceberamHoje: 0, adiadosPorTeto: 0, excluidos: [], falhas: [] };
      r.porTemplate.push(linha);
      const m = meta?.[template];
      if (meta && (m?.status !== 'APPROVED' || m?.category !== 'UTILITY')) {
        linha.indisponivel = m ? `na Meta: ${m.status} / ${m.category}` : 'não encontrado na Meta';
        continue;
      }
      const lote = await preparar(sb, { empresaId: emp.id, template, colabs: (colabs || []) as any[], agora });
      linha.excluidos = lote.excluidos;
      linha.adiadosPorTeto = lote.adiadosPorTeto;
      // A chave do lembrete leva o dia: um por dia por pessoa e template, mesmo com o cron rodando de novo.
      const doDia = lote.alvos.map((a) => ({ ...a, dedupeKey: chaveDoLembrete(template, a.colaboradorId, hoje) }));
      const novos = doDia.filter((a) => !recebidas.has(a.dedupeKey));
      linha.jaReceberamHoje = doDia.length - novos.length;
      if (!enviar) {
        linha.amostra = novos.map((a) => ({ nome: a.nome, params: a.params }));
        continue;
      }
      if (!novos.length) continue;
      const resumo = await enfileirar({ ...lote, alvos: novos }, emp.id, { dedupFila: true });
      linha.enfileirados = resumo.enfileirados;
      linha.falhas = resumo.falhas;
    }
  }
  return { hoje, empresas: resultados };
}
