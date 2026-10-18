/**
 * PRÉVIA do fluxo completo (IA4 → competência de cada pessoa → blueprint → auditoria → PDI → conteúdos → trilha → Kit →
 * Gestor/RH) — função PURA.
 *
 * O admin escolhe as competências foco e aperta UM botão; o resto roda sozinho. Antes de disparar, esta prévia
 * responde, por etapa: quem está pronto agora, quem fica pronto depois da etapa anterior (PROJEÇÃO), quem já
 * tem o artefato (não será regerado) e quem está BLOQUEADO e por quê. Não estima custo: a faixa de US$ foi retirada da tela a
 * pedido do dono (06/10/2026), e com ela o modelo de custo por unidade (nada mais o consumia).
 *
 * ⚠️ É uma ESTIMATIVA, e diz isso. Cada etapa real recalcula a SUA fila com a regra de produção (`buscarFilaIA4`,
 * `resolverFilaBlueprint100`, `buscarFilaPdi`…); aqui se projeta o que a etapa anterior vai entregar, e a
 * projeção pode errar para menos (a IA4 pode falhar numa resposta) ou, raramente, para mais. O que NÃO muda é o
 * critério de cada etapa, que reproduz o da fila real.
 *
 * Normalização de nome de competência = a do blueprint (`trim().toLowerCase()`), porque é a fila dele que
 * decide quem gera.
 */

export type PessoaPrevia = {
  id: string; nome: string; cargo: string | null; gestorEmail?: string | null;
  /** Foco gravado NA PESSOA (mig 287); quando existe, vence o do cargo (`focoDaPessoa`). */
  focoIndividual?: string[];
};
export type CargoPrevia = { nome: string; foco: string[]; top5: number };

export type EntradaPrevia = {
  pessoas: PessoaPrevia[];
  cargos: CargoPrevia[];
  /**
   * Regra de foco por pessoa ligada na empresa (`sys_config.foco_individual`). Ligada, quem ainda não tem foco
   * individual o ganha na etapa "Competência de cada pessoa", logo depois da IA4: a prévia projeta blueprint, PDI
   * e trilha para depois dela em vez de bloquear por "cargo sem foco". Ausente = desligada.
   */
  regraFoco?: 'menor_nota' | null;
  /** Respostas de cenário com r1 preenchido. `avaliada` = avaliacao_ia gravada; `checada` = passou pela 2ª IA. */
  respostas: Array<{ colaborador_id: string; competencia_nome: string | null; avaliada: boolean; checada?: boolean }>;
  /** A fila REAL da IA4 (pendentes + presas), de `buscarFilaIA4`. */
  filaIA4: Array<{ colaborador_id: string }>;
  /** `descriptor_assessments`: competências já mapeadas por pessoa. */
  assessments: Array<{ colaborador_id: string; competencia: string }>;
  blueprints: Array<{ colaborador_id: string; auditado: boolean }>;
  /** colaborador_id de quem já tem relatório individual (PDI). */
  pdis: string[];
  /** colaborador_id de quem já tem trilha. */
  trilhas: string[];
  /**
   * `false` quando o escopo é turma ou cargo: Gestor e RH não filtram por turma/cargo, então o fluxo NÃO os gera
   * (o executor faz o mesmo). Ausente = `true` (empresa inteira).
   */
  empresaInteira?: boolean;
  /**
   * Kits (tema × DISC) que FALTAM para as trilhas que já existem no escopo (`levantarPlanoKitsCoorte`), e o que cada
   * um leva por causa das preferências de aprendizagem: quantos podcasts serão PRÉ-RENDERIZADOS (TTS) e quantos
   * vídeos de célula serão gerados. Só enxerga trilha JÁ montada: o tema das trilhas que esta mesma rodada vai criar
   * só aparece depois da etapa da trilha. Ausente = não medido (a etapa aparece com 0 e a nota avisa).
   */
  kitPlano?: { kits: number; podcasts: number; videos: number };
  /**
   * Peças de BIBLIOTECA que faltam para quem vai ter trilha montada (`filaConteudoEscopo`), e quantas são podcasts (que levam
   * TTS). Ausente = não medido (a etapa aparece com 0 e a nota avisa).
   */
  conteudoPlano?: { pecas: number; audios: number };
};

export type EtapaId = 'ia4' | 'ia4_correcao' | 'foco' | 'blueprint' | 'auditoria' | 'pdi' | 'pdi_correcao' | 'conteudo' | 'trilha' | 'kit' | 'gestor' | 'rh';

export type EtapaPrevia = {
  id: EtapaId;
  titulo: string;
  prontosAgora: number;
  /** Ficam prontos DEPOIS que a etapa anterior rodar (projeção). */
  aposEtapaAnterior: number;
  /** Já têm o artefato; não serão regerados. */
  jaFeitos: number;
  bloqueados: number;
  nota?: string;
};

export type BloqueioPrevia = { etapa: EtapaId; motivo: string; quantidade: number; exemplos: string[] };

/**
 * Quantas pessoas têm (ou teriam) o fluxo INTEIRO, ou seja, os artefatos que são de cada pessoa: a competência dela
 * (só com a regra da menor nota ligada), blueprint, PDI e trilha. O Kit não entra: ele é por tema × DISC, não por pessoa.
 * Pedido do dono (16/10/2026): na simulação a tela listava etapa por etapa e não dizia quem sairia com tudo.
 */
export type ResumoPessoasPrevia = {
  total: number;
  /** Já têm tudo. */
  completas: number;
  /** Já têm tudo, ou terão se as etapas rodarem sem falha (projeção). */
  completasProjetadas: number;
  /** Quem não está com tudo AGORA, e o que falta (etapa: motivo, quando bloqueada). */
  incompletas: Array<{ nome: string; faltam: string[] }>;
  /** Quem não completaria nem rodando tudo: alguma etapa BLOQUEADA, com o motivo. */
  incompletasProjetadas: Array<{ nome: string; faltam: string[] }>;
};

export type PreviaFluxo = {
  totalPessoas: number;
  etapas: EtapaPrevia[];
  bloqueios: BloqueioPrevia[];
  /** Nada a fazer: nenhuma etapa tem item pronto agora nem projetado. */
  nadaAFazer: boolean;
  avisos: string[];
  pessoas: ResumoPessoasPrevia;
};

/** Situação de UMA pessoa numa etapa por pessoa: já tem, pronta agora, pronta depois da anterior, bloqueada. */
type SituacaoNaEtapa = 'ja' | 'agora' | 'apos' | 'bloq';

const norm = (s: unknown): string => (s || '').toString().trim().toLowerCase();

const TITULOS: Record<EtapaId, string> = {
  ia4: 'IA4 — avaliar respostas + check',
  ia4_correcao: 'IA4 — corrigir o texto do que ficou em "revisar"',
  foco: 'Competência de cada pessoa (menor nota)',
  blueprint: 'Blueprint',
  auditoria: 'Auditoria do blueprint (e correção guiada)',
  pdi: 'PDI',
  pdi_correcao: 'PDI — refazer o reprovado e o com alerta',
  conteudo: 'Conteúdos (biblioteca da trilha)',
  trilha: 'Trilha (temporada)',
  kit: 'Kit semanal (conteúdos por DISC)',
  gestor: 'Relatório do Gestor',
  rh: 'Relatório do RH',
};

/**
 * O foco que vale para a pessoa NA PRÉVIA E NAS FILAS do fluxo: o dela (mig 287) vence o do cargo. A mesma régua de
 * `focoDaPessoa` (lib/foco-cargo.ts), sobre os dados já coletados: blueprint, PDI e trilha leem de lá, e a fila que
 * olhasse só o cargo deixaria de fora quem tem foco próprio num cargo sem foco (a Amazon inteira, 15/10/2026).
 */
export function focoEfetivo(p: PessoaPrevia, cargoPorNome: Map<string, CargoPrevia>): string[] {
  if (p.focoIndividual?.length) return p.focoIndividual;
  return (p.cargo ? cargoPorNome.get(p.cargo)?.foco : undefined) || [];
}

/**
 * Quem a TRILHA toma agora: foco definido, TODAS as competências foco já mapeadas e nenhuma trilha ainda. É o mesmo
 * critério que `montarPreviaFluxo` conta como "trilha: prontos agora" (um teste trava a igualdade), exportado para o
 * executor usar como fila — uma regra só para a prévia e para o que realmente roda.
 */
export function idsTrilhaProntos(entrada: EntradaPrevia): string[] {
  const cargoPorNome = new Map(entrada.cargos.map((c) => [c.nome, c]));
  const assessPorPessoa = new Map<string, Set<string>>();
  for (const a of entrada.assessments) {
    const set = assessPorPessoa.get(a.colaborador_id) || new Set<string>();
    set.add(norm(a.competencia));
    assessPorPessoa.set(a.colaborador_id, set);
  }
  const temTrilha = new Set(entrada.trilhas);
  return entrada.pessoas
    .filter((p) => {
      if (temTrilha.has(p.id)) return false;
      const foco = focoEfetivo(p, cargoPorNome);
      if (foco.length === 0) return false;
      const assessed = assessPorPessoa.get(p.id) || new Set<string>();
      return foco.every((f) => assessed.has(norm(f)));
    })
    .map((p) => p.id);
}

export function montarPreviaFluxo(entrada: EntradaPrevia): PreviaFluxo {
  const cargoPorNome = new Map(entrada.cargos.map((c) => [c.nome, c]));

  const respPorPessoa = new Map<string, Array<{ competencia: string; avaliada: boolean; checada: boolean }>>();
  for (const r of entrada.respostas) {
    const arr = respPorPessoa.get(r.colaborador_id) || [];
    arr.push({ competencia: norm(r.competencia_nome), avaliada: r.avaliada, checada: !!r.checada });
    respPorPessoa.set(r.colaborador_id, arr);
  }
  const pendIA4PorPessoa = new Map<string, number>();
  for (const f of entrada.filaIA4) pendIA4PorPessoa.set(f.colaborador_id, (pendIA4PorPessoa.get(f.colaborador_id) || 0) + 1);
  const assessPorPessoa = new Map<string, Set<string>>();
  for (const a of entrada.assessments) {
    const s = assessPorPessoa.get(a.colaborador_id) || new Set<string>();
    s.add(norm(a.competencia));
    assessPorPessoa.set(a.colaborador_id, s);
  }
  const bpPorPessoa = new Map(entrada.blueprints.map((b) => [b.colaborador_id, b]));
  const temPdi = new Set(entrada.pdis);
  const temTrilha = new Set(entrada.trilhas);

  const acc = Object.fromEntries((Object.keys(TITULOS) as EtapaId[]).map((id) => [id, { agora: 0, apos: 0, ja: 0, bloq: 0 }])) as Record<EtapaId, { agora: number; apos: number; ja: number; bloq: number }>;
  const bloqueios = new Map<string, BloqueioPrevia>();
  const bloquear = (etapa: EtapaId, motivo: string, nome: string) => {
    acc[etapa].bloq++;
    const k = `${etapa}|${motivo}`;
    const b = bloqueios.get(k) || { etapa, motivo, quantidade: 0, exemplos: [] };
    b.quantidade++;
    if (b.exemplos.length < 6) b.exemplos.push(nome);
    bloqueios.set(k, b);
  };

  let algumPdi = false;
  const gestores = new Set<string>();
  const pessoas: ResumoPessoasPrevia = { total: entrada.pessoas.length, completas: 0, completasProjetadas: 0, incompletas: [], incompletasProjetadas: [] };

  for (const p of entrada.pessoas) {
    // Situação da pessoa em cada etapa POR PESSOA (competência, blueprint, PDI, trilha), para o "x de Y" da tela.
    const sit: Partial<Record<EtapaId, SituacaoNaEtapa>> = {};
    const motivo: Partial<Record<EtapaId, string>> = {};
    const conta = (etapa: EtapaId, s: 'ja' | 'agora' | 'apos') => { acc[etapa][s]++; sit[etapa] = s; };
    const bloq = (etapa: EtapaId, m: string) => { bloquear(etapa, m, p.nome); sit[etapa] = 'bloq'; motivo[etapa] = m; };
    const cargo = p.cargo ? cargoPorNome.get(p.cargo) : undefined;
    const foco = focoEfetivo(p, cargoPorNome);
    const individual = p.focoIndividual || [];
    const esperadoTop5 = cargo?.top5 || 0;
    const resp = respPorPessoa.get(p.id) || [];
    const respondidas = new Set(resp.map((r) => r.competencia));
    const avaliadasLinhas = resp.filter((r) => r.avaliada).length;
    const pendIA4 = pendIA4PorPessoa.get(p.id) || 0;
    const assessed = assessPorPessoa.get(p.id) || new Set<string>();
    const bp = bpPorPessoa.get(p.id);
    if (p.gestorEmail) gestores.add(p.gestorEmail.trim().toLowerCase());

    // ── IA4: as respostas da fila REAL (pendentes + presas). Quem não tem nada na fila não bloqueia nada aqui. ──
    if (pendIA4 > 0) acc.ia4.agora++;

    // ── Competência de cada pessoa (regra da empresa, mig 287). A etapa escolhe para quem ainda não tem foco próprio
    // nem trilha (a trilha em curso segue a competência dela), entre as competências que a pessoa respondeu, e só
    // depois de todas avaliadas e checadas (`prontidaoParaFoco`). Até lá blueprint, PDI e trilha ficam PROJETADOS. ──
    const focoADefinir = !!entrada.regraFoco && individual.length === 0 && !temTrilha.has(p.id) && resp.length > 0;
    if (entrada.regraFoco) {
      if (individual.length) conta('foco', 'ja');
      else if (temTrilha.has(p.id)) { /* segue a competência da trilha */ }
      else if (resp.length === 0) bloq('foco', 'Ainda não respondeu nenhum cenário');
      else if (resp.every((r) => r.avaliada && r.checada && assessed.has(r.competencia))) conta('foco', 'agora');
      else conta('foco', 'apos');
    }

    // ── Blueprint e trilha dependem do mesmo critério de foco/mapeamento (a regra dos 100%). ──
    const semFoco = foco.length === 0;
    const todasMapeadas = !semFoco && foco.every((f) => assessed.has(norm(f)));
    const todasRespondidasOuMapeadas = !semFoco && foco.every((f) => assessed.has(norm(f)) || respondidas.has(norm(f)));
    const faltam = semFoco ? [] : foco.filter((f) => !assessed.has(norm(f)) && !respondidas.has(norm(f)));

    // Blueprint
    if (bp) conta('blueprint', 'ja');
    else if (focoADefinir) conta('blueprint', 'apos');
    else if (semFoco) bloq('blueprint', 'Cargo sem competências foco definidas');
    else if (todasMapeadas) conta('blueprint', 'agora');
    else if (todasRespondidasOuMapeadas) conta('blueprint', 'apos');
    else bloq('blueprint', `Falta responder: ${faltam.join(', ')}`);

    // Auditoria: SÓ do blueprint gerado NESTA rodada (roda depois dele). Blueprint que já existia, auditado ou não,
    // não entra: o fluxo não reavalia o passado (decisão do dono, 01/10/2026) — e na Macaé isso evitaria 57
    // auditorias retroativas de blueprints de agosto, que custariam e carimbariam um selo novo sobre conteúdo velho.
    if (bp) acc.auditoria.ja++;
    else if (focoADefinir || (!semFoco && todasRespondidasOuMapeadas)) acc.auditoria.apos++;
    // (quem está bloqueado no blueprint aparece UMA vez, lá; não se repete o motivo em cada etapa)

    // PDI: regra da fila real — avaliação COMPLETA do top5 (linhas de resposta avaliadas >= top5), sem PDI ainda.
    // Quem tem foco próprio entra com o que respondeu (decisão do dono, 15/10/2026: prazo encerrado, "todos
    // entram"), e quem ainda vai ganhar o foco espera a etapa dele.
    if (temPdi.has(p.id)) conta('pdi', 'ja');
    else {
      const todasAvaliadas = resp.length > 0 && avaliadasLinhas >= resp.length;
      const completoAgora = !focoADefinir && avaliadasLinhas > 0
        && (esperadoTop5 === 0 || avaliadasLinhas >= esperadoTop5 || (individual.length > 0 && todasAvaliadas));
      const completoApos = (avaliadasLinhas + pendIA4) > 0
        && (esperadoTop5 === 0 || avaliadasLinhas + pendIA4 >= esperadoTop5 || individual.length > 0 || focoADefinir);
      if (completoAgora) { conta('pdi', 'agora'); algumPdi = true; }
      else if (completoApos) { conta('pdi', 'apos'); algumPdi = true; }
      else if (resp.length === 0) bloq('pdi', 'Ainda não respondeu nenhum cenário');
      else bloq('pdi', `Avaliação incompleta (${avaliadasLinhas + pendIA4} de ${esperadoTop5} competências do top 5)`);
    }

    // Trilha: precisa de foco do cargo e do mapeamento; sem trilha ainda. (Se o blueprint dirige a trilha, ela
    // também espera o blueprint — a etapa real confere.)
    if (temTrilha.has(p.id)) conta('trilha', 'ja');
    else if (focoADefinir) conta('trilha', 'apos');
    else if (semFoco) bloq('trilha', 'Cargo sem competências foco definidas');
    else if (todasMapeadas) conta('trilha', 'agora');
    else if (todasRespondidasOuMapeadas) conta('trilha', 'apos');
    else bloq('trilha', `Falta responder: ${faltam.join(', ')}`);

    // ── O fluxo INTEIRO desta pessoa: as etapas por pessoa que se aplicam a ela (a da competência só com a regra
    // ligada e sem trilha em curso). "Completa" = já tem tudo; "projetada" = nenhuma bloqueada. ──
    const relevantes = (['foco', 'blueprint', 'pdi', 'trilha'] as EtapaId[]).filter((e) => sit[e] !== undefined);
    const rotulo = (e: EtapaId) => (sit[e] === 'bloq' ? `${TITULOS[e]}: ${motivo[e]}` : `${TITULOS[e]}: ${sit[e] === 'agora' ? 'pronto para gerar' : 'depois da etapa anterior'}`);
    if (relevantes.every((e) => sit[e] === 'ja')) pessoas.completas++;
    else pessoas.incompletas.push({ nome: p.nome, faltam: relevantes.filter((e) => sit[e] !== 'ja').map(rotulo) });
    if (relevantes.every((e) => sit[e] !== 'bloq')) pessoas.completasProjetadas++;
    else pessoas.incompletasProjetadas.push({ nome: p.nome, faltam: relevantes.filter((e) => sit[e] === 'bloq').map(rotulo) });
  }

  // Conteúdos: biblioteca que a trilha precisa (peças = descritor × formato).
  acc.conteudo.agora = entrada.conteudoPlano?.pecas ?? 0;

  // Kit: o que falta para as trilhas JÁ existentes (a medição é da varredura da coorte, não por pessoa).
  acc.kit.agora = entrada.kitPlano?.kits ?? 0;

  // Gestor e RH: ao FINAL, uma vez por gestor e uma por empresa, SÓ se esta rodada gerar PDI NOVO (agora ou
  // projetado). PDI que já existia não reabre o relatório: o fluxo não reavalia o passado.
  if (algumPdi && entrada.empresaInteira !== false) {
    acc.gestor.apos = gestores.size;
    acc.rh.apos = 1;
  }

  const notas: Partial<Record<EtapaId, string>> = {
    ia4: 'Conta as respostas da fila da IA4 (pendentes + presas), não as pessoas.',
    foco: entrada.regraFoco
      ? 'Para quem ainda não tem: a competência de MENOR nota (média dos descritores; empate: o pior descritor, depois a ordem do Top 5), gravada uma vez. Só depois de todas as respostas da pessoa avaliadas e checadas.'
      : 'Desligada nesta empresa: vale a competência foco do cargo.',
    ia4_correcao: 'Só o que a 2ª IA deixar em "revisar": reescreve o TEXTO apontado (nota e nível não mudam), até 2 tentativas. Com a empresa pausada, também o de rodadas anteriores.',
    auditoria: 'Audita o blueprint desta rodada e, se reprovar, roda a correção guiada (até 2 tentativas). Com a empresa pausada, também o reprovado de rodadas anteriores (e o PDI e a trilha dessa pessoa são refeitos).',
    pdi_correcao: 'Refaz o PDI reprovado ou com alerta guardando a melhor versão, até 2 tentativas. Com a empresa pausada, também o de rodadas anteriores.',
    conteudo: entrada.conteudoPlano === undefined ? 'Não medido nesta prévia.' : `Biblioteca que falta (descritor × formato) para quem vai ter trilha montada, nos formatos que as pessoas precisam: ${entrada.conteudoPlano.audios} podcast(s) com áudio. Sem peça faltando, a etapa é pulada.`,
    kit: entrada.kitPlano === undefined ? 'Não medido nesta prévia.' : `Kits (tema × DISC) que faltam para as trilhas já montadas, com os 2 primeiros formatos das preferências: ${entrada.kitPlano.podcasts} podcast(s) pré-renderizado(s) e ${entrada.kitPlano.videos} vídeo(s). Os das trilhas novas aparecem depois da etapa da trilha.`,
    gestor: entrada.empresaInteira === false ? 'Não incluído: o relatório não filtra por turma/cargo (gere manualmente se quiser).' : 'Gera ao final; um por gestor (agrupado por e-mail do gestor).',
    rh: entrada.empresaInteira === false ? 'Não incluído: o relatório não filtra por turma/cargo (gere manualmente se quiser).' : 'Gera ao final; um por empresa.',
  };

  const etapas: EtapaPrevia[] = (Object.keys(TITULOS) as EtapaId[]).map((id) => ({
    id, titulo: TITULOS[id],
    prontosAgora: acc[id].agora, aposEtapaAnterior: acc[id].apos, jaFeitos: acc[id].ja, bloqueados: acc[id].bloq,
    ...(notas[id] ? { nota: notas[id] } : {}),
  }));

  const nadaAFazer = etapas.every((e) => e.prontosAgora === 0 && e.aposEtapaAnterior === 0);

  const avisos: string[] = [];
  const semCargo = entrada.pessoas.filter((p) => !p.cargo || !cargoPorNome.has(p.cargo)).length;
  if (semCargo) avisos.push(`${semCargo} pessoa(s) sem cargo cadastrado na empresa: ficam sem foco e bloqueadas.`);
  if (nadaAFazer) avisos.push('Nada a fazer agora: nenhuma etapa tem pessoa pronta nem projetada. Veja os bloqueios.');

  return {
    totalPessoas: entrada.pessoas.length,
    etapas,
    bloqueios: [...bloqueios.values()].sort((a, b) => b.quantidade - a.quantidade),
    nadaAFazer, avisos,
    pessoas,
  };
}

/**
 * As CORREÇÕES pendentes na prévia (18/10/2026). `montarPreviaFluxo` só vê o que falta GERAR; com a empresa pausada e só
 * correções a fazer (o "revisar" da IA4, o blueprint reprovado, o PDI reprovado ou com alerta, abaixo do teto), a prévia
 * dizia "nada a fazer" e a tela desabilitava o Rodar: a regra "com a empresa pausada o Rodar corrige o passado" ficava
 * inalcançável pela tela. As contagens vêm das MESMAS filas do fluxo (`correcoes.ts`); `null` = não foi possível medir,
 * e aí a prévia não afirma "nada a fazer" (avisa e deixa o Rodar, que confere as filas reais). PURO (devolve cópia).
 */
export function comCorrecoesNaPrevia(
  previa: PreviaFluxo,
  c: { ia4: number; auditoria: number; pdi: number } | null,
): PreviaFluxo {
  const etapas = previa.etapas.map((e) => {
    if (!c) return e;
    if (e.id === 'ia4_correcao') return { ...e, prontosAgora: e.prontosAgora + c.ia4 };
    if (e.id === 'auditoria') return { ...e, prontosAgora: e.prontosAgora + c.auditoria };
    if (e.id === 'pdi_correcao') return { ...e, prontosAgora: e.prontosAgora + c.pdi };
    return e;
  });
  const nadaAFazer = !!c && etapas.every((e) => e.prontosAgora === 0 && e.aposEtapaAnterior === 0);
  const avisos = previa.avisos.filter((a) => !a.startsWith('Nada a fazer agora'));
  if (!c) avisos.push('Não foi possível medir as correções pendentes (IA4, blueprint, PDI): o Rodar confere as filas reais.');
  if (nadaAFazer) avisos.push('Nada a fazer agora: nenhuma etapa tem pessoa pronta nem projetada. Veja os bloqueios.');
  return { ...previa, etapas, nadaAFazer, avisos };
}
