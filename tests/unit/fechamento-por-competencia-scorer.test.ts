import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));

import { pontuarFechamento } from '@/lib/season-engine/fechamento-scorer';
import { PROGRAMA_ONBOARDING, PROGRAMA_REGULAR_DUO } from '@/lib/season-engine/programa-config';
import { callAI } from '@/actions/ai-client';

/**
 * O fechamento do Onboarding pontua UMA vez por competência (cada uma contra a
 * conversa do SEU cenário e os descritores DELA) e junta as saídas no formato de uma
 * competência só. Trinta descritores numa chamada estourariam o teto de saída do
 * scorer (11.000 tokens, medido 8.372 para um fechamento de uma competência).
 *
 * A fusão da arguição roda POR competência (cada uma tem a sua defesa oral, o padrão da
 * Jornada repetido por cenário); a redação e o auditor rodam UMA vez sobre o conjunto, lendo
 * as defesas juntas. O fechamento de uma competência não muda.
 */
const mockAI = vi.mocked(callAI);

const COMPETENCIAS = ['Comp A', 'Comp B', 'Comp C', 'Comp D', 'Comp E'];
const letra = (c: string) => c.slice(-1);
const descritoresDe = (c: string) => [1, 2, 3, 4].map((n) => ({
  competencia: c, descritor: `${letra(c)}-desc${n}`, nota_atual: 1.5, n1_gap: `régua N1 de ${letra(c)}${n}`, n3_meta: `régua N3 de ${letra(c)}${n}`,
}));

const entrada = (c: string) => ({
  competencia: c,
  descritores: descritoresDe(c),
  cenario: `## Caso de ${c}\n\ntexto do caso de ${c}`,
  resposta: `[SITUAÇÃO] pergunta\n→ resposta de ${c}`,
  evidenciasAcumuladas: `evidências de ${c}`,
  acumuladoPrimaria: null,
});

const todasAsEntradas = () => COMPETENCIAS.map(entrada);
const todosOsDescritores = () => COMPETENCIAS.flatMap(descritoresDe);

const argsBase = (extra: Record<string, unknown> = {}) => ({
  competencia: COMPETENCIAS.join(' + '),
  descritores: todosOsDescritores(),
  cenario: COMPETENCIAS.map((c) => `### Competência: ${c}\n\n## Caso de ${c}`).join('\n\n---\n\n'),
  resposta: COMPETENCIAS.map((c) => `### ${c}\n→ resposta de ${c}`).join('\n\n'),
  nomeColab: 'Alias',
  evidenciasAcumuladas: 'evidências do conjunto',
  acumuladoPrimaria: null,
  config: { ...PROGRAMA_ONBOARDING, arguicao: { ativa: true, maxTurnos: 6 } },
  porCompetencia: todasAsEntradas(),
  ...extra,
});

/** O scorer de UMA competência: 4 descritores, nota 2.0 → 3.0, e o texto dela. */
function saidaDoScorer(c: string, pos = 3.0) {
  return JSON.stringify({
    avaliacao_por_descritor: descritoresDe(c).map((d) => ({
      descritor: d.descritor, nota_pre: 2.0, nota_cenario: pos, nota_pos: pos, nota_acumulada: null,
      justificativa: `justificativa de ${d.descritor}`,
    })),
    resumo_avaliacao: {
      mensagem_geral: `texto de ${c}`, evidencias_citadas: [`ev ${c}`], principal_avanco: `avanço ${c}`,
      principal_ponto_de_atencao: `atenção ${c}`, mensagem_final: `fecho ${c}`, proximos_passos: [`passo ${c}`],
    },
    alertas_metodologicos: [],
  });
}
const REDACAO = JSON.stringify({
  resumo_avaliacao: {
    mensagem_geral: 'Alias, uma devolutiva só, sobre as cinco competências.', evidencias_citadas: ['ev'],
    principal_avanco: 'avanço do conjunto', principal_ponto_de_atencao: 'atenção do conjunto',
    mensagem_final: 'Fecho do conjunto, em segunda pessoa.', proximos_passos: ['Começar X'],
  },
});
const CHECK = JSON.stringify({ nota_auditoria: 90, status: 'aprovado', resumo_auditoria: 'ok' });

const competenciaDoPrompt = (user: string) => /COMPETÊNCIA: (.*)\n/.exec(user)?.[1];
const chamadas = (taskKey: string) => mockAI.mock.calls.filter((c) => (c[4] as any)?.taskKey === taskKey);

/** O mock de uma execução normal: o scorer responde pela competência do prompt. */
function aiNormal(opts: { posPorCompetencia?: Record<string, number> } = {}) {
  mockAI.mockImplementation(async (_system: any, user: any, _cfg: any, _max: any, o: any) => {
    if (o.taskKey === 'sem14_scorer') {
      const c = competenciaDoPrompt(user)!;
      return saidaDoScorer(c, opts.posPorCompetencia?.[c] ?? 3.0);
    }
    if (o.taskKey === 'sem14_redacao') return REDACAO;
    if (o.taskKey === 'sem14_check') return CHECK;
    throw new Error(`task inesperada: ${o.taskKey}`);
  });
}

const AGORA = Date.parse('2026-10-04T15:00:00Z');
beforeEach(() => {
  mockAI.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
});
afterEach(() => vi.useRealTimers());

describe('pontuarFechamento por competência: uma rodada do scorer por competência', () => {
  it('5 chamadas do scorer, cada uma com o cenário, as respostas e os 4 descritores DA competência', async () => {
    aiNormal();
    const r: any = await pontuarFechamento(argsBase({ prazoMs: AGORA + 285_000, ledger: { empresaId: 'emp', colaboradorId: 'col' } }) as any);
    expect(r.ok).toBe(true);
    const scorers = chamadas('sem14_scorer');
    expect(scorers).toHaveLength(5);
    for (const c of COMPETENCIAS) {
      const user = String(scorers.find((s) => competenciaDoPrompt(String(s[1])) === c)![1]);
      expect(user, c).toContain(`texto do caso de ${c}`);
      expect(user, c).toContain(`resposta de ${c}`);
      expect(user, c).toContain(`evidências de ${c}`);
      for (const d of descritoresDe(c)) expect(user, d.descritor).toContain(d.descritor);
      for (const outra of COMPETENCIAS.filter((x) => x !== c)) {
        expect(user, `${c} não vê ${outra}`).not.toContain(`texto do caso de ${outra}`);
        expect(user).not.toContain(`${letra(outra)}-desc1`);
      }
    }
    // o teto de tokens, o timeout e o ledger são os do scorer de sempre
    for (const s of scorers) expect(s[4]).toMatchObject({ taskKey: 'sem14_scorer', empresaId: 'emp', colaboradorId: 'col' });
    expect(scorers[0][3]).toBe(11_000);
  });

  it('as 5 rodadas rodam EM PARALELO (todas em voo antes de a primeira terminar)', async () => {
    const liberar: Array<() => void> = [];
    let emVoo = 0;
    let maxEmVoo = 0;
    mockAI.mockImplementation(async (_s: any, user: any, _c: any, _m: any, o: any) => {
      if (o.taskKey === 'sem14_scorer') {
        emVoo++; maxEmVoo = Math.max(maxEmVoo, emVoo);
        await new Promise<void>((res) => liberar.push(res));
        emVoo--;
        return saidaDoScorer(competenciaDoPrompt(user)!);
      }
      return o.taskKey === 'sem14_redacao' ? REDACAO : CHECK;
    });
    const p = pontuarFechamento(argsBase() as any);
    await vi.waitFor(() => expect(liberar).toHaveLength(5));
    expect(maxEmVoo).toBe(5);
    liberar.forEach((l) => l());
    expect((await p as any).ok).toBe(true);
  });

  it('as saídas são juntadas no formato de uma competência: 20 descritores, na ordem, com a competência', async () => {
    aiNormal();
    const r: any = await pontuarFechamento(argsBase() as any);
    const ds = r.parsed.avaliacao_por_descritor;
    expect(ds).toHaveLength(20);
    expect(ds.map((d: any) => d.descritor)).toEqual(todosOsDescritores().map((d) => d.descritor));
    expect(ds[4]).toMatchObject({ competencia: 'Comp B', descritor: 'B-desc1', nota_pre: 2, nota_pos: 3, delta: 1 });
    expect(r.parsed).toMatchObject({ nota_media_pre: 2, nota_media_pos: 3, delta_medio: 1 });
    expect(r.meta).toMatchObject({ competenciasPontuadas: 5, tentativas: 5 });
  });

  it('a redação roda UMA vez, mesmo sem nota alterada, e é ela que escreve a devolutiva (não 5 coladas)', async () => {
    aiNormal();
    const r: any = await pontuarFechamento(argsBase() as any);
    expect(chamadas('sem14_redacao')).toHaveLength(1);
    expect(r.parsed.resumo_avaliacao.mensagem_geral).toBe('Alias, uma devolutiva só, sobre as cinco competências.');
    expect(r.parsed.redacao_final).toMatchObject({ status: 'reescrita', texto_publicado: 'redacao', descritores_com_nota_alterada: 0 });
    // o rascunho que ela recebeu junta o texto de cada competência, e o prompt pede UMA devolutiva
    const [system, user] = chamadas('sem14_redacao')[0] as any[];
    expect(system).toContain('VÁRIAS COMPETÊNCIAS');
    expect(user).toContain('Comp A: texto de Comp A');
    expect(user).toContain('Comp E: texto de Comp E');
    expect(r.parsed.resumo_avaliacao_rascunho.mensagem_geral).toContain('Comp D: texto de Comp D');
  });

  it('o auditor roda UMA vez, sobre o conjunto (os 5 cenários, as respostas e os 20 descritores)', async () => {
    aiNormal();
    const r: any = await pontuarFechamento(argsBase() as any);
    expect(chamadas('sem14_check')).toHaveLength(1);
    const user = String(chamadas('sem14_check')[0][1]);
    for (const c of COMPETENCIAS) {
      expect(user).toContain(`## Caso de ${c}`);
      expect(user).toContain(`resposta de ${c}`);
    }
    expect(user).toContain('"competencia": "Comp C"');
    expect(user).toContain('E-desc4');
    expect(r.auditoria.status).toBe('aprovado');
  });

  // ── A arguição de cada competência: a fusão roda por competência ─────────────────────────────
  const ext = (leitura: string, evs: Array<[string, string, string]>) => ({
    resumo: { leitura_geral: leitura, sustentacao_mais_forte: `forte ${leitura}`, fragilidade_mais_relevante: `fraca ${leitura}` },
    evidencias_por_descritor: evs.map(([descritor, sustentou, forca]) => ({ descritor, sustentou, forca, citacao: `trecho ${descritor}` })) as any,
  });
  /** As entradas com a extração da arguição de cada competência (`null` = sem extração). */
  const entradasComArguicao = (porComp: Record<string, ReturnType<typeof ext> | null>) => COMPETENCIAS.map((c) => ({ ...entrada(c), evidenciasArguicao: porComp[c] ?? null }));

  it('cada competência é ajustada pela extração DA arguição dela, e a redação vê o que mudou', async () => {
    aiNormal();
    const porCompetencia = entradasComArguicao({
      'Comp A': ext('leu A', [['A-desc1', 'aprofundou', 'forte']]),
      'Comp E': ext('leu E', [['E-desc2', 'fragilizou', 'moderada']]),
    });
    const r: any = await pontuarFechamento(argsBase({ porCompetencia }) as any);
    const por = (nome: string) => r.parsed.avaliacao_por_descritor.find((d: any) => d.descritor === nome);
    expect(por('A-desc1')).toMatchObject({ nota_pos: 3.5, ajuste_arguicao: 0.5, nota_base_cenario: 3, competencia: 'Comp A' });
    expect(por('E-desc2')).toMatchObject({ nota_pos: 2.7, ajuste_arguicao: -0.35, competencia: 'Comp E' });
    // dentro de uma competência com defesa, o descritor que ela não tocou fica sem ajuste (como na Jornada)
    expect(por('A-desc2')).toMatchObject({ nota_pos: 3, ajuste_arguicao: 0, sustentacao_arguicao: 'sem_sinal' });
    // competência SEM extração (a defesa dela não saiu): nenhuma fusão nela, a nota fica a do scorer
    expect(por('B-desc1')).toMatchObject({ nota_pos: 3 });
    expect(por('B-desc1')).not.toHaveProperty('ajuste_arguicao');
    expect(r.parsed.redacao_final.descritores_com_nota_alterada).toBe(2);
    expect(r.meta.arguicaoAjustados).toBe(2);
    // a nota média do conjunto é refeita com as notas finais
    expect(r.parsed.nota_media_pos).toBe(3);
  });

  it('a extração de uma competência NÃO ajusta o descritor de outra (a fusão é por competência, não sobre o conjunto)', async () => {
    aiNormal();
    // a defesa de Comp B cita um descritor que é de Comp A: não tem o que ajustar em Comp B
    const porCompetencia = entradasComArguicao({ 'Comp B': ext('leu B', [['A-desc1', 'aprofundou', 'forte']]) });
    const r: any = await pontuarFechamento(argsBase({ porCompetencia }) as any);
    const a1 = r.parsed.avaliacao_por_descritor.find((d: any) => d.descritor === 'A-desc1');
    expect(a1).toMatchObject({ nota_pos: 3 });
    expect(a1.ajuste_arguicao ?? 0).toBe(0);
    expect(r.meta.arguicaoAjustados).toBe(0);
  });

  it('descritores com o MESMO nome em duas competências: cada defesa ajusta só o SEU descritor', async () => {
    const homonimos = ['Comp A', 'Comp B'].map((c) => ({
      ...entrada(c), descritores: [{ competencia: c, descritor: 'Escuta', nota_atual: 2 }],
    }));
    mockAI.mockImplementation(async (_s: any, user: any, _c: any, _m: any, o: any) => {
      if (o.taskKey === 'sem14_scorer') {
        return JSON.stringify({
          avaliacao_por_descritor: [{ descritor: 'Escuta', nota_pre: 2, nota_cenario: 3, nota_pos: 3, nota_acumulada: null, justificativa: `j ${competenciaDoPrompt(user)}` }],
          resumo_avaliacao: { mensagem_geral: 'm', evidencias_citadas: [], principal_avanco: 'a', principal_ponto_de_atencao: 'b', mensagem_final: 'c', proximos_passos: ['p'] },
          alertas_metodologicos: [],
        });
      }
      return o.taskKey === 'sem14_redacao' ? REDACAO : CHECK;
    });
    const porCompetencia = [
      { ...homonimos[0], evidenciasArguicao: ext('leu A', [['Escuta', 'aprofundou', 'forte']]) },
      { ...homonimos[1], evidenciasArguicao: null },
    ];
    const r: any = await pontuarFechamento(argsBase({ porCompetencia, descritores: homonimos.flatMap((e) => e.descritores) }) as any);
    const [a, b] = r.parsed.avaliacao_por_descritor;
    expect(a).toMatchObject({ competencia: 'Comp A', nota_pos: 3.5, ajuste_arguicao: 0.5 });
    expect(b).toMatchObject({ competencia: 'Comp B', nota_pos: 3 });
    expect(b.ajuste_arguicao ?? 0).toBe(0);
  });

  it('homônimos: cada descritor leva à redação a citação da defesa DA competência dele (não a do outro)', async () => {
    const homonimos = ['Comp A', 'Comp B'].map((c) => ({ ...entrada(c), descritores: [{ competencia: c, descritor: 'Escuta', nota_atual: 2 }] }));
    mockAI.mockImplementation(async (_s: any, user: any, _c: any, _m: any, o: any) => {
      if (o.taskKey === 'sem14_scorer') {
        return JSON.stringify({
          avaliacao_por_descritor: [{ descritor: 'Escuta', nota_pre: 2, nota_cenario: 3, nota_pos: 3, nota_acumulada: null, justificativa: `j ${competenciaDoPrompt(user)}` }],
          resumo_avaliacao: { mensagem_geral: 'm', evidencias_citadas: [], principal_avanco: 'a', principal_ponto_de_atencao: 'b', mensagem_final: 'c', proximos_passos: ['p'] },
          alertas_metodologicos: [],
        });
      }
      return o.taskKey === 'sem14_redacao' ? REDACAO : CHECK;
    });
    const porCompetencia = [
      { ...homonimos[0], evidenciasArguicao: ext('leu A', [['Escuta', 'aprofundou', 'forte']]) },
      { ...homonimos[1], evidenciasArguicao: ext('leu B', [['Escuta', 'fragilizou', 'fraca']]) },
    ];
    porCompetencia[0].evidenciasArguicao.evidencias_por_descritor[0].citacao = 'citação da defesa de A';
    porCompetencia[1].evidenciasArguicao.evidencias_por_descritor[0].citacao = 'citação da defesa de B';
    await pontuarFechamento(argsBase({ porCompetencia, descritores: homonimos.flatMap((e) => e.descritores) }) as any);
    const redacao = String(chamadas('sem14_redacao')[0][1]);
    expect(redacao).toContain('"citação da defesa de A"');
    expect(redacao).toContain('"citação da defesa de B"');
  });

  it('a redação e o auditor leem as defesas juntas, com a competência de cada uma', async () => {
    aiNormal();
    const porCompetencia = entradasComArguicao({
      'Comp A': ext('leu A', [['A-desc1', 'aprofundou', 'forte']]),
      'Comp C': ext('leu C', [['C-desc3', 'confirmou', 'moderada']]),
    });
    await pontuarFechamento(argsBase({ porCompetencia }) as any);
    const redacao = String(chamadas('sem14_redacao')[0][1]);
    expect(redacao).toContain('O QUE A DEFESA ORAL MOSTROU');
    expect(redacao).toContain('Comp A: leu A');
    expect(redacao).toContain('Comp C: leu C');
    const auditor = String(chamadas('sem14_check')[0][1]);
    expect(auditor).toContain('DEFESA ORAL');
    expect(auditor).toContain('Comp A / A-desc1: aprofundou (forte): "trecho A-desc1"');
    expect(auditor).toContain('Comp C / C-desc3: confirmou (moderada)');
  });

  it('nenhuma defesa com extração: sem fusão, sem bloco de defesa no auditor, e a nota fica a do scorer', async () => {
    aiNormal();
    const r: any = await pontuarFechamento(argsBase({ porCompetencia: entradasComArguicao({}) }) as any);
    expect(r.meta.arguicaoAjustados).toBeUndefined();
    expect(r.parsed.avaliacao_por_descritor.every((d: any) => d.nota_pos === 3)).toBe(true);
    expect(String(chamadas('sem14_check')[0][1])).not.toContain('DEFESA ORAL');
  });

  it('a extração única que vinha nos args (a arguição sobre o conjunto) não existe mais: o Onboarding lê só as das entradas', async () => {
    aiNormal();
    const evidenciasArguicao = ext('leu tudo', [['A-desc1', 'aprofundou', 'forte']]);
    const r: any = await pontuarFechamento(argsBase({ evidenciasArguicao }) as any);
    expect(r.parsed.avaliacao_por_descritor.find((d: any) => d.descritor === 'A-desc1')).toMatchObject({ nota_pos: 3 });
    expect(r.meta.arguicaoAjustados).toBeUndefined();
  });

  it('a redação não saiu: a devolutiva mínima, montada das notas finais do conjunto, é o texto publicado', async () => {
    mockAI.mockImplementation(async (_s: any, user: any, _c: any, _m: any, o: any) => {
      if (o.taskKey === 'sem14_scorer') return saidaDoScorer(competenciaDoPrompt(user)!);
      if (o.taskKey === 'sem14_redacao') return 'não é json';
      return CHECK;
    });
    const r: any = await pontuarFechamento(argsBase() as any);
    expect(r.ok).toBe(true);
    expect(r.parsed.redacao_final).toMatchObject({ status: 'falhou', texto_publicado: 'devolutiva_minima' });
    expect(r.parsed.resumo_avaliacao.mensagem_geral).toContain('Alias, este é o resultado do fechamento da sua jornada em Comp A + Comp B');
  });

  it('uma rodada que falha NÃO deixa as outras pagando em segundo plano: o erro só sobe depois de todas terminarem', async () => {
    const terminadas: string[] = [];
    mockAI.mockImplementation(async (_s: any, user: any, _c: any, _m: any, o: any) => {
      const c = competenciaDoPrompt(user)!;
      if (c === 'Comp B') throw new Error('timeout no provedor');
      await Promise.resolve();
      terminadas.push(c);
      return saidaDoScorer(c);
    });
    await expect(pontuarFechamento(argsBase() as any)).rejects.toThrow('timeout no provedor');
    expect(terminadas.sort()).toEqual(['Comp A', 'Comp C', 'Comp D', 'Comp E']);
    expect(chamadas('sem14_redacao')).toHaveLength(0);
    expect(chamadas('sem14_check')).toHaveLength(0);
  });

  it('tudo ou nada: se o parse de uma competência falha nas 2 tentativas, ok:false diz QUAL e nada é redigido nem auditado', async () => {
    mockAI.mockImplementation(async (_s: any, user: any, _c: any, _m: any, o: any) => {
      if (o.taskKey !== 'sem14_scorer') return o.taskKey === 'sem14_redacao' ? REDACAO : CHECK;
      const c = competenciaDoPrompt(user)!;
      return c === 'Comp D' ? 'isto não é json' : saidaDoScorer(c);
    });
    const r: any = await pontuarFechamento(argsBase() as any);
    expect(r.ok).toBe(false);
    expect(r.erro).toContain('Comp D');
    expect(r.erro).not.toContain('Comp A');
    expect(r.meta.tentativas).toBe(6); // 4 competências em 1 tentativa e a que falhou em 2
    expect(r.meta.warnings.some((w: string) => w.startsWith('Comp D: parse do scorer falhou (tentativa 2)'))).toBe(true);
    expect(chamadas('sem14_redacao')).toHaveLength(0);
    expect(chamadas('sem14_check')).toHaveLength(0);
  });

  it('a regeração do admin (feedback da auditoria) chega ao prompt de CADA competência', async () => {
    aiNormal();
    await pontuarFechamento(argsBase({ regeracao: { feedbackAuditoria: 'FEEDBACK-X' } }) as any);
    for (const s of chamadas('sem14_scorer')) expect(String(s[0])).toContain('FEEDBACK-X');
  });
});

describe('o fechamento de UMA competência não muda', () => {
  it('a arguição (uma só, nos args) ajusta o descritor como sempre, sem campo de competência na saída', async () => {
    mockAI.mockImplementation(async (_s: any, _u: any, _c: any, _m: any, o: any) => (o.taskKey === 'sem14_scorer' ? saidaDoScorer('Comp A') : o.taskKey === 'sem14_redacao' ? REDACAO : CHECK));
    const evidenciasArguicao = {
      resumo: { leitura_geral: 'leu', sustentacao_mais_forte: 'a', fragilidade_mais_relevante: 'b' },
      evidencias_por_descritor: [{ descritor: 'A-desc1', sustentou: 'aprofundou', forca: 'forte', citacao: 'trecho' }],
    };
    const r: any = await pontuarFechamento({
      competencia: 'Comp A', descritores: descritoresDe('Comp A'), cenario: '## C', resposta: 'r', nomeColab: 'Alias',
      evidenciasAcumuladas: 'e', acumuladoPrimaria: null, config: PROGRAMA_REGULAR_DUO, evidenciasArguicao,
    } as any);
    const a1 = r.parsed.avaliacao_por_descritor.find((d: any) => d.descritor === 'A-desc1');
    expect(a1).toMatchObject({ nota_pos: 3.5, ajuste_arguicao: 0.5, nota_base_cenario: 3 });
    expect(a1).not.toHaveProperty('competencia');
    expect(r.meta.arguicaoAjustados).toBe(1);
    expect(String(chamadas('sem14_check')[0][1])).not.toContain('Comp A / A-desc1');
  });

  const unica = {
    competencia: 'Comp A', descritores: descritoresDe('Comp A'), cenario: '## C', resposta: 'r', nomeColab: 'Alias',
    evidenciasAcumuladas: 'e', acumuladoPrimaria: null, config: PROGRAMA_REGULAR_DUO,
  };

  it.each([
    ['sem porCompetencia', {}],
    ['porCompetencia ausente', { porCompetencia: undefined }],
    ['porCompetencia com uma só entrada', { porCompetencia: [entrada('Comp A')] }],
  ])('%s: UM scorer com o cenário e as respostas dos args, e o auditor, sem redação nem prefixo', async (_nome, extra) => {
    mockAI.mockImplementation(async (_s: any, _u: any, _c: any, _m: any, o: any) => (o.taskKey === 'sem14_scorer' ? saidaDoScorer('Comp A') : CHECK));
    const r: any = await pontuarFechamento({ ...unica, ...extra } as any);
    expect(r.ok).toBe(true);
    expect(chamadas('sem14_scorer')).toHaveLength(1);
    expect(chamadas('sem14_redacao')).toHaveLength(0);
    expect(chamadas('sem14_check')).toHaveLength(1);
    const user = String(chamadas('sem14_scorer')[0][1]);
    expect(user).toContain('## C');
    expect(user).toContain('"r"');
    expect(r.parsed.redacao_final.status).toBe('desnecessaria');
    expect(r.parsed.avaliacao_por_descritor[0]).not.toHaveProperty('competencia');
    expect(r.meta.competenciasPontuadas).toBeUndefined();
    expect(r.parsed.resumo_avaliacao.mensagem_geral).toBe('texto de Comp A');
  });
});
