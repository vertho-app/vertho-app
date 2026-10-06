/**
 * PRÉVIA do fluxo completo (IA4 → blueprint → auditoria → PDI → conteúdos → trilha → Kit → Gestor/RH) — função PURA.
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

export type PessoaPrevia = { id: string; nome: string; cargo: string | null; gestorEmail?: string | null };
export type CargoPrevia = { nome: string; foco: string[]; top5: number };

export type EntradaPrevia = {
  pessoas: PessoaPrevia[];
  cargos: CargoPrevia[];
  /** Respostas de cenário com r1 preenchido. `avaliada` = avaliacao_ia gravada. */
  respostas: Array<{ colaborador_id: string; competencia_nome: string | null; avaliada: boolean }>;
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

export type EtapaId = 'ia4' | 'blueprint' | 'auditoria' | 'pdi' | 'conteudo' | 'trilha' | 'kit' | 'gestor' | 'rh';

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

export type PreviaFluxo = {
  totalPessoas: number;
  etapas: EtapaPrevia[];
  bloqueios: BloqueioPrevia[];
  /** Nada a fazer: nenhuma etapa tem item pronto agora nem projetado. */
  nadaAFazer: boolean;
  avisos: string[];
};

const norm = (s: unknown): string => (s || '').toString().trim().toLowerCase();

const TITULOS: Record<EtapaId, string> = {
  ia4: 'IA4 — avaliar respostas + check',
  blueprint: 'Blueprint',
  auditoria: 'Auditoria do blueprint',
  pdi: 'PDI',
  conteudo: 'Conteúdos (biblioteca da trilha)',
  trilha: 'Trilha (temporada)',
  kit: 'Kit semanal (conteúdos por DISC)',
  gestor: 'Relatório do Gestor',
  rh: 'Relatório do RH',
};

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
      const foco = (p.cargo ? cargoPorNome.get(p.cargo)?.foco : undefined) || [];
      if (foco.length === 0) return false;
      const assessed = assessPorPessoa.get(p.id) || new Set<string>();
      return foco.every((f) => assessed.has(norm(f)));
    })
    .map((p) => p.id);
}

export function montarPreviaFluxo(entrada: EntradaPrevia): PreviaFluxo {
  const cargoPorNome = new Map(entrada.cargos.map((c) => [c.nome, c]));

  const respPorPessoa = new Map<string, Array<{ competencia: string; avaliada: boolean }>>();
  for (const r of entrada.respostas) {
    const arr = respPorPessoa.get(r.colaborador_id) || [];
    arr.push({ competencia: norm(r.competencia_nome), avaliada: r.avaliada });
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

  for (const p of entrada.pessoas) {
    const cargo = p.cargo ? cargoPorNome.get(p.cargo) : undefined;
    const foco = cargo?.foco || [];
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

    // ── Blueprint e trilha dependem do mesmo critério de foco/mapeamento (a regra dos 100%). ──
    const semFoco = foco.length === 0;
    const todasMapeadas = !semFoco && foco.every((f) => assessed.has(norm(f)));
    const todasRespondidasOuMapeadas = !semFoco && foco.every((f) => assessed.has(norm(f)) || respondidas.has(norm(f)));
    const faltam = semFoco ? [] : foco.filter((f) => !assessed.has(norm(f)) && !respondidas.has(norm(f)));

    // Blueprint
    if (bp) acc.blueprint.ja++;
    else if (semFoco) bloquear('blueprint', 'Cargo sem competências foco definidas', p.nome);
    else if (todasMapeadas) acc.blueprint.agora++;
    else if (todasRespondidasOuMapeadas) acc.blueprint.apos++;
    else bloquear('blueprint', `Falta responder: ${faltam.join(', ')}`, p.nome);

    // Auditoria: SÓ do blueprint gerado NESTA rodada (roda depois dele). Blueprint que já existia, auditado ou não,
    // não entra: o fluxo não reavalia o passado (decisão do dono, 01/10/2026) — e na Macaé isso evitaria 57
    // auditorias retroativas de blueprints de agosto, que custariam e carimbariam um selo novo sobre conteúdo velho.
    if (bp) acc.auditoria.ja++;
    else if (!semFoco && todasRespondidasOuMapeadas) acc.auditoria.apos++;
    // (quem está bloqueado no blueprint aparece UMA vez, lá; não se repete o motivo em cada etapa)

    // PDI: regra da fila real — avaliação COMPLETA do top5 (linhas de resposta avaliadas >= top5), sem PDI ainda.
    if (temPdi.has(p.id)) acc.pdi.ja++;
    else {
      const completoAgora = avaliadasLinhas > 0 && (esperadoTop5 === 0 || avaliadasLinhas >= esperadoTop5);
      const completoApos = (avaliadasLinhas + pendIA4) > 0 && (esperadoTop5 === 0 || avaliadasLinhas + pendIA4 >= esperadoTop5);
      if (completoAgora) { acc.pdi.agora++; algumPdi = true; }
      else if (completoApos) { acc.pdi.apos++; algumPdi = true; }
      else if (resp.length === 0) bloquear('pdi', 'Ainda não respondeu nenhum cenário', p.nome);
      else bloquear('pdi', `Avaliação incompleta (${avaliadasLinhas + pendIA4} de ${esperadoTop5} competências do top 5)`, p.nome);
    }

    // Trilha: precisa de foco do cargo e do mapeamento; sem trilha ainda. (Se o blueprint dirige a trilha, ela
    // também espera o blueprint — a etapa real confere.)
    if (temTrilha.has(p.id)) acc.trilha.ja++;
    else if (semFoco) bloquear('trilha', 'Cargo sem competências foco definidas', p.nome);
    else if (todasMapeadas) acc.trilha.agora++;
    else if (todasRespondidasOuMapeadas) acc.trilha.apos++;
    else bloquear('trilha', `Falta responder: ${faltam.join(', ')}`, p.nome);
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
    auditoria: 'Só dos blueprints gerados nesta rodada; blueprint antigo não é reauditado.',
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
  };
}
