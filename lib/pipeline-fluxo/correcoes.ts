/**
 * CORREÇÕES AUTOMÁTICAS do fluxo completo (decisão do dono, 17/10/2026, 4Life: "corrigir a origem das reprovações,
 * para não termos de fazer tudo à parte depois").
 *
 * Medido na 4Life (22 pessoas, 1ª rodada): IA4 4 em "revisar", blueprint 14 reprovados, PDI 4 reprovados e 2 com
 * alerta. Na Amazon (15-17/10) os mesmos defeitos foram fechados À MÃO, por script, depois do fluxo: correção só do
 * texto da IA4, correção guiada do blueprint (7 de 7 adotáveis), cascata (PDI e trilha de quem teve o blueprint
 * corrigido) e "refazer o PDI guardando a melhor versão" (14 de 14 aprovados). Aqui as MESMAS bibliotecas rodam
 * dentro do fluxo, cada uma antes da etapa que lê o que ela corrige:
 *  · IA4 (`corrigirIA4`): só o "revisar" e só o TEXTO (`corrigirTextoAvaliacaoCore`, adota se o check melhorar);
 *    roda antes do blueprint e do PDI, que leem a avaliação.
 *  · blueprint (`auditarECorrigirBlueprint`): auditoria e, se reprovar, a correção guiada (estrutura travada, adoção
 *    pela régua de 2 rodadas); roda antes do PDI, então o PDI já nasce do blueprint corrigido.
 *  · PDI (`refazerPdiGuardandoMelhor`): o reprovado E o com alerta (decisão do dono), guardando a melhor versão.
 *
 * Teto: `MAX_CORRECOES` tentativas por artefato, CONTADAS no próprio artefato, para nenhuma execução (nem a
 * continuação automática, nem o botão de novo) pagar a mesma correção sem fim. O que sobra fica no painel, com nome
 * e motivo (o auditor tem ruído: não há promessa de zero).
 *
 * O PASSADO só com a empresa PAUSADA (`revisitar`, decisão do dono), e NUNCA de quem já teve o PDI anunciado
 * (`entregues`, `notification_deliveries` kind `plano`): pausa não prova que nada saiu (Ibipeba estava pausada com a
 * 1ª temporada entregue, medido 17/10/2026). A CASCATA (PDI e trilha de quem teve o blueprint corrigido) só vale para o
 * blueprint que ESTA automação corrigiu (`correcao_guiada.cascata_automatica`): a correção à mão da Amazon (16-17/10)
 * já fez a dela por script e não deixou a marca, e sem esta trava 14 trilhas e 4 PDIs de lá seriam refeitos à toa.
 * Trilha só é refeita se ainda não começou. Sem pausa, o fluxo continua sem revisitar o passado.
 */
import { lerTudoPaginado } from '@/lib/paginacao';
import { isInternalEmail } from '@/lib/internal-emails';
import { corrigirTextoAvaliacaoCore } from '@/lib/ia4-correcao-texto';
import { auditarBlueprintCore } from '@/lib/blueprint/core';
import { corrigirBlueprintCore, gravarBlueprintCorrigido } from '@/lib/blueprint/correcao';
import { gerarRelatorioIndividualCore } from '@/lib/relatorios/individual-core';

/** Tentativas de correção por artefato (somadas entre execuções). */
export const MAX_CORRECOES = 2;

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const msg = (e: unknown) => String((e as any)?.message || e).slice(0, 200);
const parse = (v: any) => (typeof v === 'string' ? JSON.parse(v) : v);

/** Quem pode entrar numa fila de correção: dentro do escopo e fora das contas internas (salvo a exceção explícita). */
export type Dentro = (colaboradorId: string | null | undefined) => boolean;
/** O que uma fila de correção sabe: escopo, o que esta rodada tratou, se pode revisitar o passado e quem já recebeu o PDI. */
export interface OpcoesFila { dentro: Dentro; alvo: string[]; revisitar: boolean; entregues?: Set<string> }
/** Item do PASSADO pode entrar: empresa pausada e a pessoa ainda sem PDI anunciado. */
const passadoPode = (o: OpcoesFila, colaboradorId: string | null | undefined) => o.revisitar && !!colaboradorId && !o.entregues?.has(colaboradorId);
export function dentroDoEscopo(permitidos: Set<string> | null, internos: Set<string>): Dentro {
  return (id) => !!id && !internos.has(id) && (!permitidos || permitidos.has(id));
}

/** Quem já teve o PDI ANUNCIADO (o aviso saiu): o passado dessas pessoas não se revisita. */
export async function idsComPdiEntregue(tdb: any): Promise<Set<string>> {
  const q = await lerTudoPaginado((de, ate) => tdb.from('notification_deliveries')
    .select('colaborador_id').eq('kind', 'plano').eq('status', 'sucesso').order('colaborador_id').range(de, ate));
  if (q.error) throw new Error(`PDIs já anunciados: ${q.error}`);
  return new Set(q.data.map((d: any) => d.colaborador_id).filter(Boolean));
}

/**
 * Ids das contas internas (`@vertho.ai`, menos as personas de demo) que o fluxo NÃO trata, salvo as da exceção
 * explícita do pedido. Medido na 4Life (17/10/2026): a conta de teste entrou na IA4, no blueprint e no PDI, porque
 * só a fila da trilha aplicava o filtro.
 */
export async function idsInternos(tdb: any, incluirInternos?: string[] | null): Promise<Set<string>> {
  const q = await lerTudoPaginado((de, ate) => tdb.from('colaboradores').select('id, email').order('id').range(de, ate));
  if (q.error) throw new Error(`contas internas: ${q.error}`);
  const excecao = new Set(incluirInternos || []);
  return new Set(q.data.filter((c: any) => isInternalEmail(c.email) && !excecao.has(c.id)).map((c: any) => c.id as string));
}

// ─── Seleção das filas (PURAS) ──────────────────────────────────────────────────────────────────────────────────

/** IA4: o "revisar" desta rodada (ou de qualquer rodada, com a empresa pausada), abaixo do teto de correções. */
export function selecionarCorrecaoIA4(
  linhas: Array<{ id: string; colaborador_id: string | null; status_ia4: string | null; tentativas?: unknown }>,
  o: OpcoesFila,
): string[] {
  const alvo = new Set(o.alvo);
  return linhas
    .filter((r) => r.status_ia4 === 'revisar' && o.dentro(r.colaborador_id) && (alvo.has(r.id) || passadoPode(o, r.colaborador_id)) && num(r.tentativas) < MAX_CORRECOES)
    .map((r) => r.id);
}

/**
 * Auditoria do blueprint: o desta rodada que ainda não foi auditado (como antes) e o REPROVADO abaixo do teto de
 * correções (desta rodada ou, com a empresa pausada, de qualquer uma). Pausada, o blueprint antigo sem auditoria também.
 */
export function selecionarAuditoria(
  linhas: Array<{ colaborador_id: string; auditado_em: string | null; ok: unknown; tentativas?: unknown }>,
  o: OpcoesFila,
): string[] {
  const alvo = new Set(o.alvo);
  return linhas.filter((b) => {
    if (!o.dentro(b.colaborador_id)) return false;
    const pode = alvo.has(b.colaborador_id) || passadoPode(o, b.colaborador_id);
    if (b.auditado_em == null) return pode;
    const reprovado = String(b.ok) !== 'true';
    return reprovado && pode && num(b.tentativas) < MAX_CORRECOES;
  }).map((b) => b.colaborador_id);
}

/** PDI: o reprovado e o com alerta desta rodada (ou de qualquer uma, pausada), abaixo do teto. */
export function selecionarCorrecaoPdi(
  linhas: Array<{ colaborador_id: string; status: string | null; tentativas?: unknown }>,
  o: OpcoesFila,
): string[] {
  const alvo = new Set(o.alvo);
  return linhas
    .filter((p) => (p.status === 'fail' || p.status === 'warn') && o.dentro(p.colaborador_id) && (alvo.has(p.colaborador_id) || passadoPode(o, p.colaborador_id)) && num(p.tentativas) < MAX_CORRECOES)
    .map((p) => p.colaborador_id);
}

/** Blueprint visto pela cascata: a marca e a data da correção guiada que ESTA automação fez. */
export interface BlueprintCascata { colaborador_id: string; cascata?: unknown; corrigido_em?: string | null; trilha_refeita_em?: string | null }
const daCascata = (b: BlueprintCascata | undefined): b is BlueprintCascata => !!b && String(b.cascata) === 'true' && !!b.corrigido_em;

/** Cascata (só pausada): o PDI mais velho que a correção automática do blueprint, de quem ainda não o recebeu. */
export function selecionarPdiDesatualizado(
  pdis: Array<{ colaborador_id: string; gerado_em: string | null }>,
  blueprints: BlueprintCascata[],
  dentro: Dentro,
  entregues?: Set<string>,
): string[] {
  const bp = new Map(blueprints.map((b) => [b.colaborador_id, b]));
  return pdis.filter((p) => {
    const b = bp.get(p.colaborador_id);
    return dentro(p.colaborador_id) && !entregues?.has(p.colaborador_id) && daCascata(b) && !!p.gerado_em && String(p.gerado_em) < String(b.corrigido_em);
  }).map((p) => p.colaborador_id);
}

/**
 * Cascata (só pausada): a trilha de quem teve o blueprint corrigido DEPOIS de a trilha nascer, ainda não refeita. A
 * trilha regravada preserva `criado_em` e `data_inicio` (F-I1), então "refeita" é a marca `trilha_refeita_em` que a
 * cascata grava na correção do blueprint, não a data da trilha.
 */
export function selecionarTrilhaDesatualizada(
  trilhas: Array<{ colaborador_id: string; criado_em: string | null; data_inicio?: string | null }>,
  blueprints: BlueprintCascata[],
  dentro: Dentro,
  o: { entregues?: Set<string>; hojeISO: string },
): string[] {
  const bp = new Map(blueprints.map((b) => [b.colaborador_id, b]));
  return trilhas.filter((t) => {
    const b = bp.get(t.colaborador_id);
    const naoComecou = !t.data_inicio || String(t.data_inicio).slice(0, 10) > o.hojeISO.slice(0, 10);
    return dentro(t.colaborador_id) && !o.entregues?.has(t.colaborador_id) && daCascata(b) && !b.trilha_refeita_em
      && naoComecou && !!t.criado_em && String(t.criado_em) < String(b.corrigido_em);
  }).map((t) => t.colaborador_id);
}

const RANK_PDI: Record<string, number> = { fail: 0, warn: 1, pass: 2 };
const ocorrenciasPdi = (aud: any) => (Array.isArray(aud?.checks) ? aud.checks : [])
  .filter((c: any) => c?.status !== 'pass')
  .reduce((n: number, c: any) => n + Math.max(1, Array.isArray(c?.ocorrencias) ? c.ocorrencias.length : 0), 0);

/** A melhor de duas versões do PDI pela auditoria: pass > warn > fail; empate, a de menos ocorrências (empate de novo: a atual). PURO. */
export function melhorVersaoPdi<T extends { conteudo?: any }>(atual: T, nova: T): T {
  const a = atual?.conteudo?.auditoria; const b = nova?.conteudo?.auditoria;
  const ra = RANK_PDI[a?.status] ?? 0; const rb = RANK_PDI[b?.status] ?? 0;
  if (rb !== ra) return rb > ra ? nova : atual;
  return ocorrenciasPdi(b) < ocorrenciasPdi(a) ? nova : atual;
}

// ─── Leitura das filas (I/O, tenant-scoped) ────────────────────────────────────────────────────────────────────

export async function filaCorrecaoIA4(tdb: any, o: OpcoesFila): Promise<string[]> {
  const q = await lerTudoPaginado((de, ate) => tdb.from('respostas')
    .select('id, colaborador_id, status_ia4, tentativas:avaliacao_ia->_correcao_texto_tentativas')
    .eq('status_ia4', 'revisar').order('id').range(de, ate));
  if (q.error) throw new Error(`fila da correção da IA4: ${q.error}`);
  return selecionarCorrecaoIA4(q.data, o);
}

export async function filaAuditoriaComCorrecao(tdb: any, o: OpcoesFila): Promise<string[]> {
  if (!o.revisitar && !o.alvo.length) return [];
  const q = await lerTudoPaginado((de, ate) => tdb.from('development_blueprints')
    .select('colaborador_id, auditado_em, ok:auditoria->>ok, tentativas:auditoria->>correcao_guiada_tentativas')
    .order('colaborador_id').range(de, ate));
  if (q.error) throw new Error(`blueprints a auditar: ${q.error}`);
  return selecionarAuditoria(q.data, o);
}

export async function filaCorrecaoPdi(tdb: any, o: OpcoesFila): Promise<string[]> {
  if (!o.revisitar && !o.alvo.length) return [];
  const q = await lerTudoPaginado((de, ate) => tdb.from('relatorios')
    .select('colaborador_id, status:conteudo->auditoria->>status, tentativas:conteudo->>_refazer_tentativas')
    .eq('tipo', 'individual').order('colaborador_id').range(de, ate));
  if (q.error) throw new Error(`fila da correção do PDI: ${q.error}`);
  return selecionarCorrecaoPdi(q.data, o);
}

const SELECT_CASCATA = 'colaborador_id, cascata:auditoria->correcao_guiada->>cascata_automatica, corrigido_em:auditoria->correcao_guiada->>corrigido_em, trilha_refeita_em:auditoria->correcao_guiada->>trilha_refeita_em';

export async function filaPdiDesatualizado(tdb: any, dentro: Dentro, entregues?: Set<string>): Promise<string[]> {
  const [pdis, bps] = await Promise.all([
    lerTudoPaginado((de, ate) => tdb.from('relatorios').select('colaborador_id, gerado_em').eq('tipo', 'individual').order('colaborador_id').range(de, ate)),
    lerTudoPaginado((de, ate) => tdb.from('development_blueprints').select(SELECT_CASCATA).order('colaborador_id').range(de, ate)),
  ]);
  if (pdis.error || bps.error) throw new Error(`PDIs desatualizados: ${pdis.error || bps.error}`);
  return selecionarPdiDesatualizado(pdis.data, bps.data, dentro, entregues);
}

export async function filaTrilhaDesatualizada(tdb: any, dentro: Dentro, entregues?: Set<string>): Promise<string[]> {
  const [trilhas, bps] = await Promise.all([
    lerTudoPaginado((de, ate) => tdb.from('trilhas').select('colaborador_id, criado_em, data_inicio').order('colaborador_id').range(de, ate)),
    lerTudoPaginado((de, ate) => tdb.from('development_blueprints').select(SELECT_CASCATA).order('colaborador_id').range(de, ate)),
  ]);
  if (trilhas.error || bps.error) throw new Error(`trilhas desatualizadas: ${trilhas.error || bps.error}`);
  return selecionarTrilhaDesatualizada(trilhas.data, bps.data, dentro, { entregues, hojeISO: new Date().toISOString() });
}

// ─── As correções (I/O; `sb` é o client service-role, o tenant vai em cada consulta) ───────────────────────────

/**
 * Corrige o TEXTO de UMA avaliação em "revisar" até sair de "revisar" ou bater no teto. Cada tentativa, adotada ou
 * não, conta em `avaliacao_ia._correcao_texto_tentativas`. `ok` = saiu de "revisar".
 */
export async function corrigirIA4(sb: any, empresaId: string, respostaId: string): Promise<{ ok: boolean; erro?: string }> {
  for (;;) {
    const { data: r, error } = await sb.from('respostas').select('status_ia4, avaliacao_ia, payload_ia4')
      .eq('empresa_id', empresaId).eq('id', respostaId).maybeSingle();
    if (error || !r) return { ok: false, erro: `resposta: ${error?.message || 'não encontrada'}` };
    if (r.status_ia4 !== 'revisar') return { ok: true };
    const av = parse(r.avaliacao_ia) || {};
    const n = num(av._correcao_texto_tentativas);
    if (n >= MAX_CORRECOES) return { ok: false, erro: `segue em "revisar" (check ${num(parse(r.payload_ia4)?.nota)}) depois de ${n} correção(ões) do texto` };
    let falha: string | undefined;
    try {
      const c = await corrigirTextoAvaliacaoCore(sb, { empresaId, respostaId }, { aplicar: true });
      if (!c.success) falha = c.error;
    } catch (e) { falha = msg(e); }
    // A contagem relê a avaliação: a correção adotada acabou de regravá-la.
    const { data: depois, error: e2 } = await sb.from('respostas').select('avaliacao_ia').eq('empresa_id', empresaId).eq('id', respostaId).maybeSingle();
    if (e2 || !depois) return { ok: false, erro: `contagem da correção: ${e2?.message || 'resposta sumiu'}` };
    const { error: e3 } = await sb.from('respostas').update({ avaliacao_ia: { ...(parse(depois.avaliacao_ia) || {}), _correcao_texto_tentativas: n + 1 } })
      .eq('empresa_id', empresaId).eq('id', respostaId);
    if (e3) return { ok: false, erro: `contagem da correção: ${e3.message}` };
    if (falha) console.warn(`[fluxo:correcao-ia4] ${respostaId.slice(0, 8)} tentativa ${n + 1}: ${falha}`);
  }
}

/**
 * Audita o blueprint (se ainda não foi auditado) e, reprovado, roda a correção guiada até o teto. Adotada, grava com o
 * histórico e a marca da cascata (`cascata_automatica`, ver `selecionarPdiDesatualizado`). Não adotada, soma
 * as tentativas em `auditoria.correcao_guiada_tentativas`. `ok` = blueprint aprovado no fim.
 */
export async function auditarECorrigirBlueprint(sb: any, empresaId: string, colaboradorId: string): Promise<{ ok: boolean; erro?: string }> {
  const ler = async () => {
    const { data, error } = await sb.from('development_blueprints').select('blueprint, auditoria, auditado_em')
      .eq('empresa_id', empresaId).eq('colaborador_id', colaboradorId).maybeSingle();
    if (error || !data) throw new Error(`blueprint: ${error?.message || 'não encontrado'}`);
    return data;
  };
  try {
    let row = await ler();
    if (!row.auditado_em) {
      const a: any = await auditarBlueprintCore(sb, { colaboradorId, empresaIdEsperado: empresaId });
      if (a?.error) return { ok: false, erro: String(a.error) };
      row = await ler();
    }
    if (row.auditoria?.ok === true) return { ok: true };
    const n = num(row.auditoria?.correcao_guiada_tentativas);
    if (n >= MAX_CORRECOES) return { ok: false, erro: `segue reprovado depois de ${n} correção(ões) guiada(s)` };
    const r = await corrigirBlueprintCore(sb, { empresaId, colaboradorId }, { maxTentativas: MAX_CORRECOES - n });
    if (r.blueprint && r.relatorio) {
      // `cascata_automatica`: a cascata (PDI e trilha) só vale para o blueprint que esta automação corrigiu.
      const g = await gravarBlueprintCorrigido(sb, { empresaId, colaboradorId, blueprint: r.blueprint, relatorio: r.relatorio, anterior: { blueprint: row.blueprint, auditoria: row.auditoria }, marcas: { cascata_automatica: true } });
      return g.error ? { ok: false, erro: `gravação do blueprint corrigido: ${g.error}` } : { ok: true };
    }
    if (r.error && !r.tentativas.length) return { ok: false, erro: r.error };
    const feitas = Math.max(1, r.tentativas.length);
    const ult = r.tentativas[r.tentativas.length - 1]?.relatorio;
    const falhas = (ult?.checks || []).filter((c: any) => c.status === 'fail').map((c: any) => c.id);
    const { error: eUp } = await sb.from('development_blueprints')
      .update({ auditoria: { ...(row.auditoria || {}), correcao_guiada_tentativas: n + feitas } })
      .eq('empresa_id', empresaId).eq('colaborador_id', colaboradorId);
    if (eUp) return { ok: false, erro: `contagem da correção: ${eUp.message}` };
    return { ok: false, erro: `segue reprovado depois de ${n + feitas} correção(ões) guiada(s)${falhas.length ? ` (${falhas.join(', ')})` : ''}` };
  } catch (e) {
    return { ok: false, erro: msg(e) };
  }
}

/** Marca, no blueprint corrigido, que a cascata já refez a trilha (ela não volta para a fila). */
export async function marcarTrilhaRefeita(sb: any, empresaId: string, colaboradorId: string): Promise<void> {
  const { data, error } = await sb.from('development_blueprints').select('auditoria').eq('empresa_id', empresaId).eq('colaborador_id', colaboradorId).maybeSingle();
  if (error || !data?.auditoria?.correcao_guiada) return;
  const auditoria = { ...data.auditoria, correcao_guiada: { ...data.auditoria.correcao_guiada, trilha_refeita_em: new Date().toISOString() } };
  const { error: eUp } = await sb.from('development_blueprints').update({ auditoria }).eq('empresa_id', empresaId).eq('colaborador_id', colaboradorId);
  if (eUp) console.warn(`[fluxo:cascata] ${colaboradorId.slice(0, 8)}: marca da trilha refeita não gravada: ${eUp.message}`);
}

/**
 * Refaz o PDI reprovado ou com alerta até "aprovado" ou o teto, guardando a MELHOR versão (`melhorVersaoPdi`). O
 * banco fica com a última tentativa; se a melhor for outra, ela é restaurada com `pdf_path` nulo (o arquivo do PDF foi
 * regravado pela tentativa; o download gera de novo a partir do texto restaurado, como na Amazon, 17/10/2026). As
 * tentativas somam em `conteudo._refazer_tentativas`. `ok` = terminou aprovado.
 */
export async function refazerPdiGuardandoMelhor(
  sb: any, empresaId: string, colaboradorId: string, aiConfig: Record<string, unknown>,
): Promise<{ ok: boolean; erro?: string }> {
  const ler = async () => {
    const { data, error } = await sb.from('relatorios').select('conteudo, pdf_path, gerado_em')
      .eq('empresa_id', empresaId).eq('colaborador_id', colaboradorId).eq('tipo', 'individual').maybeSingle();
    if (error || !data) throw new Error(`PDI: ${error?.message || 'não encontrado'}`);
    return data as { conteudo: any; pdf_path: string | null; gerado_em: string | null };
  };
  try {
    let melhor = await ler();
    let n = num(melhor.conteudo?._refazer_tentativas);
    let ultimoErro: string | undefined;
    while (n < MAX_CORRECOES && melhor.conteudo?.auditoria?.status !== 'pass') {
      n++;
      const g = await gerarRelatorioIndividualCore(sb, empresaId, colaboradorId, aiConfig as any);
      if (!g.success) { ultimoErro = g.error; continue; }
      melhor = melhorVersaoPdi(melhor, await ler());
    }
    const atual = await ler();
    const restaurar = melhor.gerado_em !== atual.gerado_em;
    const { error: eUp } = await sb.from('relatorios').update({
      conteudo: { ...melhor.conteudo, _refazer_tentativas: n },
      ...(restaurar ? { pdf_path: null, gerado_em: melhor.gerado_em } : {}),
    }).eq('empresa_id', empresaId).eq('colaborador_id', colaboradorId).eq('tipo', 'individual');
    if (eUp) return { ok: false, erro: `gravação do PDI: ${eUp.message}` };
    const st = melhor.conteudo?.auditoria?.status;
    return st === 'pass' ? { ok: true } : { ok: false, erro: `PDI segue ${st === 'warn' ? 'com alerta' : 'reprovado'} depois de ${n} tentativa(s)${ultimoErro ? ` · ${ultimoErro}` : ''}` };
  } catch (e) {
    return { ok: false, erro: msg(e) };
  }
}

