/**
 * Etapa "Competência de cada pessoa" do fluxo completo (15/10/2026, Amazon Bowling): quem ganha a competência agora,
 * qual (regra pura em `lib/foco-individual.ts`) e a gravação em `colaboradores.foco_individual` (mig 287).
 *
 * Roda logo depois da IA4 e antes do blueprint, porque blueprint, PDI e trilha leem a competência da pessoa
 * (`focoDaPessoa`). Só existe com a regra ligada na empresa (`sys_config.foco_individual = 'menor_nota'`).
 *
 * REGRAS:
 *  - só quem ainda NÃO tem foco próprio e NÃO tem trilha (a trilha em curso segue a competência dela);
 *  - só com todas as respostas da pessoa avaliadas, checadas e com nota por descritor (`prontidaoParaFoco`);
 *    quem ainda não está pronto é CONTADO (some de blueprint, PDI e trilha, então não pode sumir em silêncio);
 *  - a escolha é entre as competências que a pessoa RESPONDEU (decisão do dono: quem não respondeu tudo entra
 *    com o que respondeu);
 *  - grava UMA vez: o update só pega a linha com o foco vazio, então rodar de novo nunca troca uma escolha feita.
 */
import { coletarEntradaPrevia, lerTudoPaginado } from './coletar';
import { escolherFocoMenorNota, normCompetencia, prontidaoParaFoco, regraFocoIndividual } from '@/lib/foco-individual';
import type { FilaFoco, FocoItem } from './executor';

const LOTE_IN = 150;

export async function filaFocoEscopo(
  tdb: any,
  sysConfig: unknown,
  escopo: { permitidos: Set<string> | null; cargos?: string[]; incluirInternos?: string[] },
): Promise<FilaFoco> {
  const regra = regraFocoIndividual(sysConfig);
  const fila: FilaFoco = { regraLigada: !!regra, itens: [], aguardandoIA4: 0, aguardandoCheck: 0, semNota: 0 };
  if (!regra) return fila;

  const c = await coletarEntradaPrevia(tdb, escopo);
  if (c.error || !c.entrada) throw new Error(`fila da competência de cada pessoa: ${c.error || 'sem dados'}`);
  const entrada = c.entrada;
  const temTrilha = new Set(entrada.trilhas);
  const candidatos = entrada.pessoas.filter((p) => !p.focoIndividual?.length && !temTrilha.has(p.id));
  if (!candidatos.length) return fila;

  // Notas por descritor: a MESMA leitura do blueprint (média = o número que o PDI mostra).
  const ids = candidatos.map((p) => p.id);
  const notas: any[] = [];
  for (let i = 0; i < ids.length; i += LOTE_IN) {
    const q = await lerTudoPaginado((de, ate) => tdb.from('descriptor_assessments')
      .select('colaborador_id, competencia, descritor, nota').in('colaborador_id', ids.slice(i, i + LOTE_IN)).order('id').range(de, ate));
    if (q.error) throw new Error(`notas por descritor: ${q.error}`);
    notas.push(...q.data);
  }
  // Top 5 de cada cargo: o último desempate.
  const cargosQ = await lerTudoPaginado((de, ate) => tdb.from('cargos_empresa').select('nome, top5_workshop').order('id').range(de, ate));
  if (cargosQ.error) throw new Error(`cargos_empresa: ${cargosQ.error}`);
  const top5 = new Map<string, string[]>(cargosQ.data.map((r: any) => [r.nome, Array.isArray(r.top5_workshop) ? r.top5_workshop : []]));

  const agrupar = <T extends { colaborador_id: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) (m.get(r.colaborador_id) || m.set(r.colaborador_id, []).get(r.colaborador_id)!).push(r);
    return m;
  };
  const respPorPessoa = agrupar(entrada.respostas);
  const notasPorPessoa = agrupar(notas);
  const agora = new Date().toISOString();

  for (const p of candidatos) {
    const resp = respPorPessoa.get(p.id) || [];
    const minhas = notasPorPessoa.get(p.id) || [];
    const comNota = new Set(minhas.filter((n: any) => n.nota != null).map((n: any) => normCompetencia(n.competencia)));
    const prontidao = prontidaoParaFoco(resp.map((r) => ({ competencia_nome: r.competencia_nome, avaliada: r.avaliada, checada: !!r.checada })), comNota);
    // Sem resposta nenhuma a pessoa não entra no programa; a prévia mostra quem é.
    if (prontidao === 'sem_resposta') continue;
    if (prontidao === 'aguardando_ia4') { fila.aguardandoIA4++; continue; }
    if (prontidao === 'aguardando_check') { fila.aguardandoCheck++; continue; }

    const respondidas = new Set(resp.map((r) => normCompetencia(r.competencia_nome)));
    const escolha = escolherFocoMenorNota(
      minhas.filter((n: any) => respondidas.has(normCompetencia(n.competencia))),
      (p.cargo && top5.get(p.cargo)) || [],
    );
    if (!escolha) { fila.semNota++; continue; }
    fila.itens.push({
      colaboradorId: p.id, nome: p.nome, cargo: p.cargo,
      competencia: escolha.competencia, media: escolha.media, criterio: escolha.criterio, empatadas: escolha.empatadas,
      meta: {
        regra, competencia: escolha.competencia, media: escolha.media, pior_descritor: escolha.piorDescritor,
        criterio: escolha.criterio, empatadas: escolha.empatadas, medias: escolha.medias,
        definido_em: agora, origem: 'fluxo-completo',
      },
    });
  }
  return fila;
}

/** Grava a competência NA PESSOA, só onde o foco ainda está vazio (nunca troca uma escolha já feita). */
export async function gravarFocoIndividual(tdb: any, item: FocoItem): Promise<{ ok: boolean; erro?: string }> {
  const { data, error } = await tdb.from('colaboradores')
    .update({ foco_individual: [item.competencia], foco_individual_meta: item.meta })
    .eq('id', item.colaboradorId)
    .or('foco_individual.is.null,foco_individual.eq.{}')
    .select('id');
  if (error) return { ok: false, erro: `${item.nome}: ${error.message}` };
  if (data?.length) return { ok: true };

  // Nenhuma linha: outra rodada gravou entre a fila e aqui, ou a pessoa não está nesta empresa. Dizer qual.
  const { data: atual, error: errAtual } = await tdb.from('colaboradores').select('foco_individual').eq('id', item.colaboradorId).maybeSingle();
  if (errAtual) return { ok: false, erro: `${item.nome}: ${errAtual.message}` };
  if (!atual) return { ok: false, erro: `${item.nome}: pessoa não encontrada nesta empresa` };
  const ja: string[] = Array.isArray(atual.foco_individual) ? atual.foco_individual : [];
  return ja.some((c) => normCompetencia(c) === normCompetencia(item.competencia))
    ? { ok: true }
    : { ok: false, erro: `${item.nome}: já tinha a competência "${ja.join(', ')}" definida; nada foi trocado` };
}
