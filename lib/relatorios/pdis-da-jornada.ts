/**
 * O PDI ATUAL e os PDIs ANTERIORES da pessoa, por jornada (18/10/2026).
 *
 * Pedido do dono na 2ª jornada de Ibipeba: a pessoa tem que poder ver os PDIs anteriores. Desde a mig 289 a versão
 * que o escritor sobrescreve vai para `artefatos_jornada_historico`; a linha viva de `relatorios` continua sendo uma
 * só por pessoa. A régua:
 *  - ATUAL = a linha viva, se nasceu na janela da jornada atual (`lib/turmas/janela.ts`). Sem participação com marco,
 *    a janela é aberta e a linha viva é a atual, como sempre foi. Na Temporada 2, antes do PDI novo, o da Temporada 1
 *    NÃO é o atual: é um anterior.
 *  - ANTERIORES = um por jornada já encerrada (a janela de cada participação anterior), a versão MAIS RECENTE daquela
 *    jornada. Regerações dentro da mesma jornada (rascunhos que a pessoa nunca viu, refeitos pela auditoria) não
 *    aparecem: só a última de cada jornada, e nunca uma retida pela auditoria (R-60).
 *
 * Quem não passou por mais de uma jornada não tem PDI anterior nenhum.
 */
import { TURMA_MEMBRO } from '@/lib/status';
import {
  JANELA_ABERTA,
  dentroDaJanela,
  janelaTemCorte,
  janelasDasParticipacoes,
  type Janela,
  type ParticipacaoLinha,
} from '@/lib/turmas/janela';
import { pdiRetidoPelaAuditoria } from '@/lib/relatorios/pdi-retido';

/** Prefixo da referência: de onde a versão vem (a linha viva ou o histórico). */
export const REF_VIVO = 'vivo:';
export const REF_HISTORICO = 'hist:';

export interface VersaoPdi {
  /** `vivo:<relatorios.id>` ou `hist:<artefatos_jornada_historico.id>`. */
  ref: string;
  gerado_em: string;
  conteudo: unknown;
  pdf_path?: string | null;
}

export interface PdiAnterior {
  ref: string;
  geradoEm: string;
  /** Nome da turma daquela jornada (pode faltar). */
  turma: string | null;
}

export interface PdisDaJornada {
  janelaAtual: Janela;
  atual: VersaoPdi | null;
  anteriores: PdiAnterior[];
}

const ms = (v: string | null | undefined) => (v ? Date.parse(v) : NaN);

/** A regra, pura. `participacoes` são as da PESSOA (qualquer status); `turmaNome` traduz `turma_id` em nome. */
export function escolherPdisDaJornada(args: {
  participacoes: ParticipacaoLinha[];
  turmaNome?: (turmaId: string) => string | null;
  versoes: VersaoPdi[];
}): PdisDaJornada {
  const participacoes = args.participacoes || [];
  const versoes = (args.versoes || []).filter((v) => Number.isFinite(ms(v.gerado_em)));
  const janelas = janelasDasParticipacoes(participacoes);
  const ativa = participacoes.find((p) => p.status === TURMA_MEMBRO.ATIVO) || null;
  const janelaAtual = (ativa && janelas.get(ativa.id)) || JANELA_ABERTA;

  const vivo = versoes.find((v) => v.ref.startsWith(REF_VIVO)) || null;
  const atual = vivo && dentroDaJanela(vivo.gerado_em, janelaAtual) ? vivo : null;
  if (!janelaTemCorte(janelaAtual) || janelaAtual.de === null) return { janelaAtual, atual, anteriores: [] };

  // Jornadas anteriores: a janela de cada participação que não é a ativa, agrupada pela janela (duas participações da
  // MESMA jornada, como um desmembramento sem marco, têm a mesma janela e viram uma jornada só). Participação
  // removida não tem janela (`janelasDasParticipacoes` só conta ativa e concluída), então não vira jornada.
  const anteriores: PdiAnterior[] = [];
  const vistas = new Set<string>();
  const ordenadas = [...participacoes]
    .filter((p) => p.id !== ativa?.id)
    .sort((a, b) => (ms(a.created_at) || 0) - (ms(b.created_at) || 0));
  for (const p of ordenadas) {
    const j = janelas.get(p.id);
    if (!j) continue;
    const chave = `${j.de}|${j.ate}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    const daJornada = versoes
      .filter((v) => dentroDaJanela(v.gerado_em, j))
      .filter((v) => !pdiRetidoPelaAuditoria(v.conteudo, v.gerado_em))
      .sort((a, b) => ms(b.gerado_em) - ms(a.gerado_em));
    const ultima = daJornada[0];
    if (ultima) anteriores.push({ ref: ultima.ref, geradoEm: ultima.gerado_em, turma: args.turmaNome?.(p.turma_id) ?? null });
  }
  anteriores.sort((a, b) => ms(b.geradoEm) - ms(a.geradoEm));
  return { janelaAtual, atual, anteriores };
}

/**
 * Lê o que a regra precisa (participações e nomes das turmas, a linha viva, o histórico) e a aplica. Todas as
 * leituras com o `{ error }` checado: "não li o histórico" não pode virar "não há PDI anterior".
 */
export async function carregarPdisDaJornada(
  sb: any,
  empresaId: string,
  colaboradorId: string,
): Promise<PdisDaJornada & { versoes: VersaoPdi[] }> {
  const [partRes, vivoRes, histRes] = await Promise.all([
    sb.from('turma_membros')
      .select('id, turma_id, colaborador_id, status, created_at, marco_jornada')
      .eq('empresa_id', empresaId).eq('colaborador_id', colaboradorId),
    sb.from('relatorios')
      .select('id, conteudo, gerado_em, pdf_path')
      .eq('empresa_id', empresaId).eq('colaborador_id', colaboradorId).eq('tipo', 'individual')
      .order('gerado_em', { ascending: false }).limit(1),
    sb.from('artefatos_jornada_historico')
      .select('id, conteudo, gerado_em, pdf_path')
      .eq('empresa_id', empresaId).eq('colaborador_id', colaboradorId).eq('tipo', 'pdi')
      .order('gerado_em', { ascending: false }),
  ]);
  if (partRes.error) throw new Error(`não foi possível ler as participações: ${partRes.error.message}`);
  if (vivoRes.error) throw new Error(`não foi possível ler o PDI: ${vivoRes.error.message}`);
  if (histRes.error) throw new Error(`não foi possível ler os PDIs anteriores: ${histRes.error.message}`);

  const participacoes = (partRes.data || []) as ParticipacaoLinha[];
  const turmaIds = [...new Set(participacoes.map((p) => p.turma_id).filter(Boolean))];
  const nomes = new Map<string, string>();
  if (turmaIds.length) {
    const { data: turmas, error: errTurmas } = await sb.from('turmas').select('id, nome').eq('empresa_id', empresaId).in('id', turmaIds);
    if (errTurmas) throw new Error(`não foi possível ler as turmas: ${errTurmas.message}`);
    for (const t of turmas || []) nomes.set(t.id, t.nome);
  }

  const versoes: VersaoPdi[] = [
    ...((vivoRes.data || []) as any[]).map((r) => ({ ref: `${REF_VIVO}${r.id}`, gerado_em: r.gerado_em, conteudo: r.conteudo, pdf_path: r.pdf_path })),
    ...((histRes.data || []) as any[]).map((r) => ({ ref: `${REF_HISTORICO}${r.id}`, gerado_em: r.gerado_em, conteudo: r.conteudo, pdf_path: r.pdf_path })),
  ];
  const escolha = escolherPdisDaJornada({ participacoes, turmaNome: (id) => nomes.get(id) ?? null, versoes });
  return { ...escolha, versoes };
}
