/**
 * VEREDITOS das auditorias no painel do Fluxo completo (pedido do dono, 16/10/2026: "na tela aparece tudo verde
 * concluído... falsa impressão de estar ok quando na verdade tem coisa não aprovada (PDI por exemplo)").
 *
 * A etapa "ok" diz que o artefato foi GERADO, não que foi APROVADO. Medido na Amazon Bowling (16/10): PDI "ok 14/14"
 * com os 14 reprovados pela 2ª IA (e retidos, R-60); "Auditoria do blueprint ok 14/14" com 10 blueprints reprovados.
 *
 * LIDO NA HORA, não gravado no `progress`: o veredito muda quando algo é refeito (regerar um PDI, reauditar), e a tela
 * tem de acompanhar sem rodar o fluxo de novo. As réguas são as que já existem, nenhuma inventada aqui:
 *  - IA4: o check da 2ª IA (`respostas.status_ia4`). "revisar" e "sem check" não estão aprovados; "aprovado com
 *    ajustes" está (é a faixa de 80 a 89 do próprio check, `check-ia4-core.ts`);
 *  - blueprint: `auditoria.ok`. Sem auditoria gravada é "sem auditoria", que também não é aprovado;
 *  - PDI: `pdiRetidoPelaAuditoria` (reprovado = retido, a pessoa não vê). "Com alerta" não fica retido e conta como
 *    aprovado; sem auditoria gravada (PDI anterior a 27/08/2026) é "sem auditoria".
 */
import { pdiRetidoPelaAuditoria } from '@/lib/relatorios/pdi-retido';
import { excludeInternalEmails } from '@/lib/internal-emails';
import { lerTudoPaginado } from '@/lib/paginacao';
import type { EtapaId } from './previa';

export type EtapaComVeredito = Extract<EtapaId, 'ia4' | 'auditoria' | 'pdi'>;

export interface VereditoEtapa {
  aprovados: number;
  naoAprovados: number;
  /** Sem veredito (sem check / sem auditoria): também não é aprovado. */
  semVeredito: number;
  /** Quem tem algo não aprovado nesta etapa (nomes, sem repetir). */
  pessoas: string[];
  /** Frase pronta para a linha do painel. */
  rotulo: string;
}

export interface VereditosFluxo {
  porEtapa: Record<EtapaComVeredito, VereditoEtapa>;
  /** Por pessoa, o que é DELA e não está aprovado (IA4 da competência da trilha, blueprint, PDI). */
  pendencias: Array<{ nome: string; itens: string[] }>;
}

export interface EntradaVereditos {
  pessoas: Array<{ id: string; nome: string; competenciaTrilha: string | null }>;
  respostas: Array<{ colaborador_id: string; competencia_nome: string | null; status_ia4: string | null }>;
  /** O blueprint MAIS RECENTE de cada pessoa. */
  blueprints: Array<{ colaborador_id: string; auditado: boolean; ok: boolean }>;
  pdis: Array<{ colaborador_id: string; status: string | null; gerado_em: string | null }>;
}

/** O selo verde só com zero não aprovados e zero sem veredito. */
export const temPendencia = (v: Pick<VereditoEtapa, 'naoAprovados' | 'semVeredito'> | null | undefined) =>
  !!v && v.naoAprovados + v.semVeredito > 0;

export function montarVereditos(e: EntradaVereditos): VereditosFluxo {
  const nomeDe = new Map(e.pessoas.map((p) => [p.id, p.nome]));
  const daPessoa = (id: string) => nomeDe.has(id);
  const pend = new Map<string, string[]>();
  const anotar = (id: string, item: string) => {
    const nome = nomeDe.get(id);
    if (!nome) return;
    (pend.get(nome) || pend.set(nome, []).get(nome)!).push(item);
  };
  const unicos = (ids: string[]) => [...new Set(ids.map((id) => nomeDe.get(id)!).filter(Boolean))];

  // IA4: cada resposta respondida tem o seu check.
  const resps = e.respostas.filter((r) => daPessoa(r.colaborador_id));
  const revisar = resps.filter((r) => r.status_ia4 === 'revisar');
  const semCheck = resps.filter((r) => !r.status_ia4);
  const trilhaDe = new Map(e.pessoas.map((p) => [p.id, p.competenciaTrilha]));
  for (const r of [...revisar, ...semCheck]) {
    const comp = trilhaDe.get(r.colaborador_id);
    if (comp && r.competencia_nome === comp) anotar(r.colaborador_id, r.status_ia4 ? 'avaliação da IA4 da competência da trilha em "revisar"' : 'avaliação da IA4 da competência da trilha sem check');
  }
  const ia4: VereditoEtapa = {
    aprovados: resps.length - revisar.length - semCheck.length,
    naoAprovados: revisar.length,
    semVeredito: semCheck.length,
    pessoas: unicos([...revisar, ...semCheck].map((r) => r.colaborador_id)),
    rotulo: '',
  };
  ia4.rotulo = `check da 2ª IA: ${ia4.aprovados} aprovada(s), ${ia4.naoAprovados} em "revisar"${ia4.semVeredito ? `, ${ia4.semVeredito} sem check` : ''}`;

  // Blueprint: o mais recente de cada pessoa.
  const bps = e.blueprints.filter((b) => daPessoa(b.colaborador_id));
  const bpReprovados = bps.filter((b) => b.auditado && !b.ok);
  const bpSem = bps.filter((b) => !b.auditado);
  for (const b of bpReprovados) anotar(b.colaborador_id, 'blueprint reprovado na auditoria');
  for (const b of bpSem) anotar(b.colaborador_id, 'blueprint sem auditoria');
  const auditoria: VereditoEtapa = {
    aprovados: bps.length - bpReprovados.length - bpSem.length,
    naoAprovados: bpReprovados.length,
    semVeredito: bpSem.length,
    pessoas: unicos([...bpReprovados, ...bpSem].map((b) => b.colaborador_id)),
    rotulo: '',
  };
  auditoria.rotulo = `${auditoria.aprovados} aprovado(s), ${auditoria.naoAprovados} reprovado(s)${auditoria.semVeredito ? `, ${auditoria.semVeredito} sem auditoria` : ''}`;

  // PDI: reprovado = retido (a pessoa não vê); "com alerta" não fica retido.
  const pdis = e.pdis.filter((p) => daPessoa(p.colaborador_id));
  const retidos = pdis.filter((p) => pdiRetidoPelaAuditoria({ auditoria: { status: p.status } }, p.gerado_em));
  const pdiSem = pdis.filter((p) => !p.status);
  for (const p of retidos) anotar(p.colaborador_id, 'PDI reprovado pela auditoria (retido: a pessoa não vê)');
  for (const p of pdiSem) anotar(p.colaborador_id, 'PDI sem auditoria');
  const pdi: VereditoEtapa = {
    aprovados: pdis.length - retidos.length - pdiSem.length,
    naoAprovados: retidos.length,
    semVeredito: pdiSem.length,
    pessoas: unicos([...retidos, ...pdiSem].map((p) => p.colaborador_id)),
    rotulo: '',
  };
  pdi.rotulo = `${pdi.aprovados} liberado(s), ${pdi.naoAprovados} reprovado(s) e retido(s)${pdi.semVeredito ? `, ${pdi.semVeredito} sem auditoria` : ''}`;

  return {
    porEtapa: { ia4, auditoria, pdi },
    pendencias: [...pend.entries()].map(([nome, itens]) => ({ nome, itens })).sort((a, b) => a.nome.localeCompare(b.nome)),
  };
}

/**
 * "x de Y com o fluxo inteiro" passa a exigir tudo APROVADO: quem o resumo contava como completo mas tem pendência de
 * auditoria sai da conta e entra na lista de quem fica de fora, com o motivo. PURO: a tela só desenha.
 */
export function resumoComVereditos(
  r: { completas: number; incompletas: Array<{ nome: string; faltam: string[] }> },
  pendencias: VereditosFluxo['pendencias'] | null | undefined,
): { completas: number; incompletas: Array<{ nome: string; faltam: string[] }> } {
  if (!pendencias?.length) return r;
  const porNome = new Map(r.incompletas.map((i) => [i.nome, { nome: i.nome, faltam: [...i.faltam] }]));
  let saem = 0;
  for (const p of pendencias) {
    const ja = porNome.get(p.nome);
    if (ja) ja.faltam.push(...p.itens.filter((x) => !ja.faltam.includes(x)));
    else { porNome.set(p.nome, { nome: p.nome, faltam: [...p.itens] }); saem++; }
  }
  return { completas: Math.max(0, r.completas - saem), incompletas: [...porNome.values()] };
}

/**
 * Leitura dos vereditos no escopo do fluxo (sem contas internas, como a prévia). Só os campos do veredito: o PDI
 * inteiro (`conteudo`) é grande e a tela relê isto a cada mudança de etapa. Todo `{ error }` volta ao chamador.
 */
export async function lerVereditos(
  tdb: any,
  escopo: { permitidos: Set<string> | null; incluirInternos?: string[] },
): Promise<{ vereditos?: VereditosFluxo; error?: string }> {
  const pessoasQ = await lerTudoPaginado((de, ate) => excludeInternalEmails(
    tdb.from('colaboradores').select('id, nome_completo, email, foco_individual'),
  ).order('id').range(de, ate));
  if (pessoasQ.error) return { error: `colaboradores: ${pessoasQ.error}` };
  const pessoasBrutas: any[] = [...pessoasQ.data];
  if (escopo.incluirInternos?.length) {
    const extra = await lerTudoPaginado((de, ate) => tdb.from('colaboradores')
      .select('id, nome_completo, email, foco_individual').in('id', escopo.incluirInternos).order('id').range(de, ate));
    if (extra.error) return { error: `colaboradores (exceção de contas internas): ${extra.error}` };
    const ja = new Set(pessoasBrutas.map((p) => p.id));
    for (const p of extra.data) if (!ja.has(p.id)) pessoasBrutas.push(p);
  }
  const pessoas = pessoasBrutas.filter((p) => !escopo.permitidos || escopo.permitidos.has(p.id));
  const ids = new Set(pessoas.map((p) => p.id));

  const respQ = await lerTudoPaginado((de, ate) => tdb.from('respostas')
    .select('id, colaborador_id, competencia_nome, status_ia4').not('r1', 'is', null).order('id').range(de, ate));
  if (respQ.error) return { error: `respostas: ${respQ.error}` };
  const bpQ = await lerTudoPaginado((de, ate) => tdb.from('development_blueprints')
    .select('id, colaborador_id, gerado_em, auditado_em, ok:auditoria->>ok').order('id').range(de, ate));
  if (bpQ.error) return { error: `blueprints: ${bpQ.error}` };
  const pdiQ = await lerTudoPaginado((de, ate) => tdb.from('relatorios')
    .select('id, colaborador_id, gerado_em, status:conteudo->auditoria->>status').eq('tipo', 'individual').order('id').range(de, ate));
  if (pdiQ.error) return { error: `PDIs: ${pdiQ.error}` };
  const trilhaQ = await lerTudoPaginado((de, ate) => tdb.from('trilhas')
    .select('id, colaborador_id, competencia_foco, criado_em').order('id').range(de, ate));
  if (trilhaQ.error) return { error: `trilhas: ${trilhaQ.error}` };

  // O mais recente por pessoa (blueprint e trilha podem ter mais de uma linha).
  const maisRecente = (linhas: any[], campo: string) => {
    const m = new Map<string, any>();
    for (const l of linhas) {
      if (!ids.has(l.colaborador_id)) continue;
      const atual = m.get(l.colaborador_id);
      if (!atual || String(l[campo] || '') > String(atual[campo] || '')) m.set(l.colaborador_id, l);
    }
    return [...m.values()];
  };
  const trilhaDe = new Map(maisRecente(trilhaQ.data, 'criado_em').map((t) => [t.colaborador_id, t.competencia_foco || null]));

  return {
    vereditos: montarVereditos({
      pessoas: pessoas.map((p) => ({
        id: p.id,
        nome: p.nome_completo,
        competenciaTrilha: trilhaDe.get(p.id) || (Array.isArray(p.foco_individual) && p.foco_individual[0]) || null,
      })),
      respostas: respQ.data.filter((r: any) => ids.has(r.colaborador_id)),
      blueprints: maisRecente(bpQ.data, 'gerado_em').map((b) => ({ colaborador_id: b.colaborador_id, auditado: !!b.auditado_em || b.ok != null, ok: b.ok === 'true' || b.ok === true })),
      pdis: pdiQ.data.filter((r: any) => ids.has(r.colaborador_id)).map((r: any) => ({ colaborador_id: r.colaborador_id, status: r.status ?? null, gerado_em: r.gerado_em ?? null })),
    }),
  };
}
