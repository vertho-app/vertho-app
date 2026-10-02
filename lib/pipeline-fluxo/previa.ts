/**
 * PRÉVIA do fluxo completo (IA4 → blueprint → auditoria → PDI → trilha → Gestor/RH) — função PURA.
 *
 * O admin escolhe as competências foco e aperta UM botão; o resto roda sozinho. Antes de disparar, esta prévia
 * responde, por etapa: quem está pronto agora, quem fica pronto depois da etapa anterior (PROJEÇÃO), quem já
 * tem o artefato (não será regerado) e quem está BLOQUEADO e por quê, mais uma faixa de custo.
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
};

export type EtapaId = 'ia4' | 'blueprint' | 'auditoria' | 'pdi' | 'trilha' | 'kit' | 'gestor' | 'rh';

export type FaixaUsd = { min: number; max: number };

export type EtapaPrevia = {
  id: EtapaId;
  titulo: string;
  /** Unidades que o custo cobra (respostas na IA4, pessoas nas demais, relatórios em Gestor/RH). */
  unidade: 'resposta' | 'pessoa' | 'relatorio' | 'kit';
  prontosAgora: number;
  /** Ficam prontos DEPOIS que a etapa anterior rodar (projeção). */
  aposEtapaAnterior: number;
  /** Já têm o artefato; não serão regerados. */
  jaFeitos: number;
  bloqueados: number;
  custoUsd: FaixaUsd;
  nota?: string;
};

export type BloqueioPrevia = { etapa: EtapaId; motivo: string; quantidade: number; exemplos: string[] };

export type PreviaFluxo = {
  totalPessoas: number;
  etapas: EtapaPrevia[];
  bloqueios: BloqueioPrevia[];
  custoTotalUsd: FaixaUsd;
  /** Nada a fazer: nenhuma etapa tem item pronto agora nem projetado. */
  nadaAFazer: boolean;
  avisos: string[];
};

/**
 * Custo por unidade, em US$, tirado do `ia_usage_log` dos últimos 90 dias (consulta de 01/10/2026):
 *  - IA4: US$ 0,1095 por avaliação + US$ 0,0404 por check (0,84 check por avaliação) ≈ 0,14; teto 0,20;
 *  - blueprint: US$ 0,126 por geração; a MÉDIA por pessoa foi 0,57 porque inclui reexecuções e testes;
 *  - auditoria do blueprint: US$ 0,036 por chamada, ~2 por blueprint;
 *  - PDI: US$ 0,065 por geração + ~2,3 checks de US$ 0,024; por pessoa observado 0,38 (com reexecuções);
 *  - trilha: US$ 0,14 por pessoa em `temporada_extracao` (o resto do build não aparece por pessoa — faixa FRACA);
 *  - Kit (unidade = tema × DISC, não pessoa): três formatos ≈ US$ 0,18 (texto 0,065 + case 0,059 + podcast 0,054),
 *    desafio 0,011, núcleo 0,011 dividido por 4 DISC, e o teto soma expansão de PDF e plano de layout; faixa FRACA
 *    (o lote não aparece inteiro por kit no ledger). Vídeo de célula fora (opção separada, ~US$ 0,90 cada);
 *  - Gestor: US$ 0,06; RH: US$ 0,07 por relatório.
 */
/**
 * Custo ADICIONAL do kit, por unidade, além dos textos (`CUSTO_POR_UNIDADE.kit`):
 *  - podcast pré-renderizado: US$ 0,053 a 0,12 por áudio (`tts_podcast`, ledger de 90 dias: 2.5 Flash 0,055; 3.1 preview 0,097);
 *  - vídeo de célula: US$ 0,60 a 0,90 (0,90 medido por célula; o avatar compartilhado do grupo corta ~0,30).
 */
export const CUSTO_EXTRA_KIT = {
  podcast: { min: 0.05, max: 0.12 },
  video: { min: 0.6, max: 0.9 },
};

export const CUSTO_POR_UNIDADE: Record<EtapaId, FaixaUsd> = {
  ia4: { min: 0.14, max: 0.20 },
  blueprint: { min: 0.13, max: 0.57 },
  auditoria: { min: 0.04, max: 0.08 },
  pdi: { min: 0.12, max: 0.38 },
  trilha: { min: 0.14, max: 0.30 },
  kit: { min: 0.20, max: 0.45 },
  gestor: { min: 0.06, max: 0.08 },
  rh: { min: 0.07, max: 0.10 },
};

const norm = (s: unknown): string => (s || '').toString().trim().toLowerCase();

const TITULOS: Record<EtapaId, string> = {
  ia4: 'IA4 — avaliar respostas + check',
  blueprint: 'Blueprint',
  auditoria: 'Auditoria do blueprint',
  pdi: 'PDI',
  trilha: 'Trilha (temporada)',
  kit: 'Kit semanal (conteúdos por DISC)',
  gestor: 'Relatório do Gestor',
  rh: 'Relatório do RH',
};

const UNIDADES: Record<EtapaId, EtapaPrevia['unidade']> = {
  ia4: 'resposta', blueprint: 'pessoa', auditoria: 'pessoa', pdi: 'pessoa', trilha: 'pessoa', kit: 'kit', gestor: 'relatorio', rh: 'relatorio',
};

const faixa = (unidades: number, por: FaixaUsd): FaixaUsd => ({
  min: Number((unidades * por.min).toFixed(2)),
  max: Number((unidades * por.max).toFixed(2)),
});

const somar = (a: FaixaUsd, b: FaixaUsd): FaixaUsd => ({ min: Number((a.min + b.min).toFixed(2)), max: Number((a.max + b.max).toFixed(2)) });

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

  const acc = Object.fromEntries((Object.keys(TITULOS) as EtapaId[]).map((id) => [id, { agora: 0, apos: 0, ja: 0, bloq: 0, unidades: 0 }])) as Record<EtapaId, { agora: number; apos: number; ja: number; bloq: number; unidades: number }>;
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
    if (pendIA4 > 0) { acc.ia4.agora++; acc.ia4.unidades += pendIA4; }

    // ── Blueprint e trilha dependem do mesmo critério de foco/mapeamento (a regra dos 100%). ──
    const semFoco = foco.length === 0;
    const todasMapeadas = !semFoco && foco.every((f) => assessed.has(norm(f)));
    const todasRespondidasOuMapeadas = !semFoco && foco.every((f) => assessed.has(norm(f)) || respondidas.has(norm(f)));
    const faltam = semFoco ? [] : foco.filter((f) => !assessed.has(norm(f)) && !respondidas.has(norm(f)));

    // Blueprint
    if (bp) acc.blueprint.ja++;
    else if (semFoco) bloquear('blueprint', 'Cargo sem competências foco definidas', p.nome);
    else if (todasMapeadas) { acc.blueprint.agora++; acc.blueprint.unidades++; }
    else if (todasRespondidasOuMapeadas) { acc.blueprint.apos++; acc.blueprint.unidades++; }
    else bloquear('blueprint', `Falta responder: ${faltam.join(', ')}`, p.nome);

    // Auditoria: SÓ do blueprint gerado NESTA rodada (roda depois dele). Blueprint que já existia, auditado ou não,
    // não entra: o fluxo não reavalia o passado (decisão do dono, 01/10/2026) — e na Macaé isso evitaria 57
    // auditorias retroativas de blueprints de agosto, que custariam e carimbariam um selo novo sobre conteúdo velho.
    if (bp) acc.auditoria.ja++;
    else if (!semFoco && todasRespondidasOuMapeadas) { acc.auditoria.apos++; acc.auditoria.unidades++; }
    // (quem está bloqueado no blueprint aparece UMA vez, lá; não se repete o motivo em cada etapa)

    // PDI: regra da fila real — avaliação COMPLETA do top5 (linhas de resposta avaliadas >= top5), sem PDI ainda.
    if (temPdi.has(p.id)) acc.pdi.ja++;
    else {
      const completoAgora = avaliadasLinhas > 0 && (esperadoTop5 === 0 || avaliadasLinhas >= esperadoTop5);
      const completoApos = (avaliadasLinhas + pendIA4) > 0 && (esperadoTop5 === 0 || avaliadasLinhas + pendIA4 >= esperadoTop5);
      if (completoAgora) { acc.pdi.agora++; acc.pdi.unidades++; algumPdi = true; }
      else if (completoApos) { acc.pdi.apos++; acc.pdi.unidades++; algumPdi = true; }
      else if (resp.length === 0) bloquear('pdi', 'Ainda não respondeu nenhum cenário', p.nome);
      else bloquear('pdi', `Avaliação incompleta (${avaliadasLinhas + pendIA4} de ${esperadoTop5} competências do top 5)`, p.nome);
    }

    // Trilha: precisa de foco do cargo e do mapeamento; sem trilha ainda. (Se o blueprint dirige a trilha, ela
    // também espera o blueprint — a etapa real confere.)
    if (temTrilha.has(p.id)) acc.trilha.ja++;
    else if (semFoco) bloquear('trilha', 'Cargo sem competências foco definidas', p.nome);
    else if (todasMapeadas) { acc.trilha.agora++; acc.trilha.unidades++; }
    else if (todasRespondidasOuMapeadas) { acc.trilha.apos++; acc.trilha.unidades++; }
    else bloquear('trilha', `Falta responder: ${faltam.join(', ')}`, p.nome);
  }

  // Kit: o que falta para as trilhas JÁ existentes (a medição é da varredura da coorte, não por pessoa).
  acc.kit.agora = entrada.kitPlano?.kits ?? 0; acc.kit.unidades = entrada.kitPlano?.kits ?? 0;

  // Gestor e RH: ao FINAL, uma vez por gestor e uma por empresa, SÓ se esta rodada gerar PDI NOVO (agora ou
  // projetado). PDI que já existia não reabre o relatório: o fluxo não reavalia o passado.
  if (algumPdi && entrada.empresaInteira !== false) {
    acc.gestor.apos = gestores.size; acc.gestor.unidades = gestores.size;
    acc.rh.apos = 1; acc.rh.unidades = 1;
  }

  const notas: Partial<Record<EtapaId, string>> = {
    ia4: 'Conta as respostas da fila da IA4 (pendentes + presas), não as pessoas.',
    auditoria: 'Só dos blueprints gerados nesta rodada; blueprint antigo não é reauditado.',
    trilha: 'Faixa de custo fraca: só a extração aparece por pessoa no ledger.',
    kit: entrada.kitPlano === undefined ? 'Não medido nesta prévia.' : `Kits (tema × DISC) que faltam para as trilhas já montadas, com os 2 primeiros formatos das preferências: ${entrada.kitPlano.podcasts} podcast(s) pré-renderizado(s) e ${entrada.kitPlano.videos} vídeo(s). Os das trilhas novas aparecem depois da etapa da trilha.`,
    gestor: entrada.empresaInteira === false ? 'Não incluído: o relatório não filtra por turma/cargo (gere manualmente se quiser).' : 'Gera ao final; um por gestor (agrupado por e-mail do gestor).',
    rh: entrada.empresaInteira === false ? 'Não incluído: o relatório não filtra por turma/cargo (gere manualmente se quiser).' : 'Gera ao final; um por empresa.',
  };

  const etapas: EtapaPrevia[] = (Object.keys(TITULOS) as EtapaId[]).map((id) => ({
    id, titulo: TITULOS[id], unidade: UNIDADES[id],
    prontosAgora: acc[id].agora, aposEtapaAnterior: acc[id].apos, jaFeitos: acc[id].ja, bloqueados: acc[id].bloq,
    custoUsd: faixa(acc[id].unidades, CUSTO_POR_UNIDADE[id]),
    ...(notas[id] ? { nota: notas[id] } : {}),
  }));

  // Podcast pré-renderizado e vídeo entram no custo do kit (a faixa base cobre núcleo, desafio e textos).
  const kitEtapa = etapas.find((e) => e.id === 'kit')!;
  if (entrada.kitPlano) {
    kitEtapa.custoUsd = somar(somar(kitEtapa.custoUsd, faixa(entrada.kitPlano.podcasts, CUSTO_EXTRA_KIT.podcast)), faixa(entrada.kitPlano.videos, CUSTO_EXTRA_KIT.video));
  }
  const custoTotalUsd = etapas.reduce((t, e) => somar(t, e.custoUsd), { min: 0, max: 0 });
  const nadaAFazer = etapas.every((e) => e.prontosAgora === 0 && e.aposEtapaAnterior === 0);

  const avisos: string[] = [];
  const semCargo = entrada.pessoas.filter((p) => !p.cargo || !cargoPorNome.has(p.cargo)).length;
  if (semCargo) avisos.push(`${semCargo} pessoa(s) sem cargo cadastrado na empresa: ficam sem foco e bloqueadas.`);
  if (nadaAFazer) avisos.push('Nada a fazer agora: nenhuma etapa tem pessoa pronta nem projetada. Veja os bloqueios.');

  return {
    totalPessoas: entrada.pessoas.length,
    etapas,
    bloqueios: [...bloqueios.values()].sort((a, b) => b.quantidade - a.quantidade),
    custoTotalUsd, nadaAFazer, avisos,
  };
}
