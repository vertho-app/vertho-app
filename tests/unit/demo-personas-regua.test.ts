import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEMO_PRESENTATION_VIDEO, DEMO_PRESENTATION_WEEK_VIDEO, DEMO_RESET_TABLES, DEMO_RH_PERSONA, PERSONAS, comportamentosDoDisc, focosValidosDemo, mesclarPersonaArtifacts, personaDemoComMapeamentoCompleto, personalizarArtefatoDemo, relatorioIndividualDemoValido } from '@/lib/demo/reset-acme-demo';
import { DEMO_PERSONAS } from '@/lib/sales/demo-personas';
import { computeDiscCompetenciesNatural } from '@/lib/disc-competencias';
import { deriveProfile, DISC_SOMA_ALVO } from '@/lib/disc-mapeamento';
import fixture from '@/lib/demo/acme-demo-fixture.json';
import extraArtifacts from '@/lib/demo/acme-demo-extra-artifacts.json';
import {
  ACME_DEMO_BEHIND_KEYS,
  ACME_DEMO_CONCLUDED_KEYS,
  ACME_DEMO_FUNNEL_TARGETS,
  ACME_DEMO_JOURNEY_SHOWCASE_KEY,
  ACME_DEMO_JOURNEY_KEYS,
  ACME_DEMO_MAPPED_KEYS,
  ACME_DEMO_REPORT_DIRECTORY,
  ACME_DEMO_TEAM_SIZE,
  ACME_DEMO_WITHOUT_PROFILE_KEYS,
  criarPdiAcmeDemo,
  criarRelatorioRhAcmeDemo,
} from '@/lib/demo/acme-rh-report-fixture';

/**
 * As personas do demo são o que o cliente vê. Se elas saírem da régua do
 * produto, a demonstração passa a exibir números que a plataforma real nunca
 * gera — foi o que aconteceu até 24/08/2026: DISC somando 180-204 (o real soma
 * 200), liderança pela fórmula do simulador e comp_* por uma TERCEIRA derivação
 * própria, que produzia o "Não recomendado" do Paulo a partir de um
 * `comp_persistencia = S = 24` impossível pela regressão canônica.
 */
describe('Personas do acme-demo seguem a régua do produto', () => {
  it('mantém 30 participantes na vitrine do RH sem transformar o RH em participante', () => {
    expect(PERSONAS.length + ACME_DEMO_REPORT_DIRECTORY.length).toBe(ACME_DEMO_TEAM_SIZE);
    expect(new Set([...PERSONAS, ...ACME_DEMO_REPORT_DIRECTORY].map((p) => p.email)).size).toBe(ACME_DEMO_TEAM_SIZE);
    expect(ACME_DEMO_REPORT_DIRECTORY.every((p) => p.email.endsWith('@vertho.ai'))).toBe(true);
    expect(ACME_DEMO_REPORT_DIRECTORY.filter((p) => p.role === 'gestor')).toHaveLength(3);
  });

  it('mantém o funil executivo em 30 / 28 / 25 / 20 / 17 / 3, com 16 concluídas', () => {
    expect(ACME_DEMO_FUNNEL_TARGETS).toEqual({
      people: 30,
      withProfile: 28,
      withMapping: 25,
      inJourney: 20,
      onTrack: 17,
      behind: 3,
      concluded: 16,
    });
    expect(ACME_DEMO_TEAM_SIZE - ACME_DEMO_WITHOUT_PROFILE_KEYS.length).toBe(28);
    expect(new Set(ACME_DEMO_MAPPED_KEYS).size).toBe(25);
    expect(new Set(ACME_DEMO_JOURNEY_KEYS).size).toBe(20);
    expect(new Set(ACME_DEMO_BEHIND_KEYS).size).toBe(3);
    expect(ACME_DEMO_JOURNEY_KEYS.filter((key) => !ACME_DEMO_BEHIND_KEYS.includes(key))).toHaveLength(17);
    expect(ACME_DEMO_JOURNEY_KEYS.every((key) => ACME_DEMO_MAPPED_KEYS.includes(key))).toBe(true);
  });

  it('gera PDIs válidos e um consolidado coerente para a central demonstrativa', () => {
    const pessoa = ACME_DEMO_REPORT_DIRECTORY[0];
    const pdi = criarPdiAcmeDemo(pessoa);
    const rh = criarRelatorioRhAcmeDemo();

    expect(relatorioIndividualDemoValido(pdi)).toBe(true);
    expect(pdi.competencias.length).toBeGreaterThan(0);
    expect(rh.indicadores.total_avaliados).toBe(ACME_DEMO_TEAM_SIZE);
    expect(rh.indicadores.total_avaliacoes).toBe(ACME_DEMO_TEAM_SIZE * 5);
  });

  it('limpa relatórios antes de colaboradores para o reset nunca ficar pela metade', () => {
    expect(DEMO_RESET_TABLES.indexOf('relatorios')).toBeLessThan(DEMO_RESET_TABLES.indexOf('colaboradores'));
  });

  it('mantém um vídeo editorial real no foco do usuário da apresentação', () => {
    expect(DEMO_PRESENTATION_VIDEO).toMatchObject({
      formato: 'video',
      competencia: 'Negociação e Fechamento',
      cargo: 'Representante Comercial',
      ativo: true,
    });
    expect(DEMO_PRESENTATION_VIDEO.bunny_video_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('mantém a célula e o vídeo nominal da semana 1 aquecidos após cada reset', () => {
    expect(DEMO_PRESENTATION_WEEK_VIDEO.personalizedBunnyVideoId).toMatch(/^[0-9a-f-]{36}$/);
    expect(DEMO_PRESENTATION_WEEK_VIDEO.byTenant['acme-demo']).toMatchObject({
      moduleId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      cellId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });

    const resetSource = readFileSync('lib/demo/reset-acme-demo.ts', 'utf8');
    expect(resetSource).toContain('videosPersonalizadosJornada');
    expect(resetSource).toContain("onConflict: 'cell_video_id,colaborador_id'");
    expect(resetSource).toContain('ensurePresentationVideo(demo.id, personaMap)');
  });

  it('só preserva PDI aquecido com competências entre N1 e N4', () => {
    expect(relatorioIndividualDemoValido({ competencias: [{ nivel_atual: 1 }, { nivel: 4 }] })).toBe(true);
    expect(relatorioIndividualDemoValido({ competencias: [{ nivel_atual: 0 }] })).toBe(false);
    expect(relatorioIndividualDemoValido({ competencias: [] })).toBe(false);
    expect(relatorioIndividualDemoValido('{"competencias":[{"nivel":2}]}')).toBe(true);
  });
  it('personaliza a marca do fixture sem alterar o artefato canônico', () => {
    const original = { descricao: 'A ACME Demo representa a ACME.', nested: ['time da ACME'] };
    const branded = personalizarArtefatoDemo(original, 'gruposinal');

    expect(branded).toEqual({ descricao: 'O Grupo Sinal representa o Grupo Sinal.', nested: ['time do Grupo Sinal'] });
    expect(original.descricao).toContain('ACME');
  });
  it('o RH existe como acesso, mas não entra na lista de participantes', () => {
    expect(PERSONAS.some((p) => p.email === DEMO_RH_PERSONA.email)).toBe(false);
    expect(DEMO_PERSONAS.find((p) => p.key === DEMO_RH_PERSONA.key)).toMatchObject({
      email: DEMO_RH_PERSONA.email,
      papel: 'RH',
      disc: null,
    });
  });

  it('todo DISC soma 200', () => {
    for (const p of PERSONAS as any[]) {
      const soma = p.d_natural + p.i_natural + p.s_natural + p.c_natural;
      expect(soma, `${p.nome_completo}: DISC soma ${soma}`).toBe(DISC_SOMA_ALVO);
    }
  });

  it('o perfil_dominante declarado é o que a régua deriva do DISC', () => {
    for (const p of PERSONAS as any[]) {
      const disc = { D: p.d_natural, I: p.i_natural, S: p.s_natural, C: p.c_natural };
      expect(p.perfil_dominante, `${p.nome_completo}`).toBe(deriveProfile(disc));
    }
  });

  it('comp_* vêm da regressão canônica e lid_* são metade do DISC', () => {
    for (const p of PERSONAS as any[]) {
      const { d_natural: D, i_natural: I, s_natural: S, c_natural: C } = p;
      const derivado: any = comportamentosDoDisc(D, I, S, C);
      const canon = computeDiscCompetenciesNatural({ D, I, S, C });

      expect(derivado.comp_persistencia, `${p.nome_completo} persistência`).toBe(canon['Persistência']);
      expect(derivado.comp_persuasao, `${p.nome_completo} persuasão`).toBe(canon['Persuasão']);
      expect(derivado.comp_organizacao, `${p.nome_completo} organização`).toBe(canon['Organização']);
      expect(derivado.lid_executivo).toBeCloseTo(D / 2, 1);
      expect(derivado.lid_metodico).toBe(Math.round(S / 2));
    }
  });

  it('o efeito de vitrine do Paulo é legítimo: Persistência abaixo do piso do cargo', () => {
    // O cargo Representante Comercial tem knockout de Persistência com piso 41.
    // Antes, isso vinha de uma comp_* fora da régua; agora tem que vir do DISC.
    const paulo: any = (PERSONAS as any[]).find((p) => p.key === 'paulo');
    const comp: any = comportamentosDoDisc(paulo.d_natural, paulo.i_natural, paulo.s_natural, paulo.c_natural);
    expect(comp.comp_persistencia).toBeLessThan(41);
    // …e sem derrubar a Persuasão, senão ele reprovaria por dois motivos e o
    // argumento da tela ("nota alta, barrado por UM requisito") se perde.
    expect(comp.comp_persuasao).toBeGreaterThan(41);
  });

  it('a Bruna fica abaixo do corte SEM bater knockout (o ranking discrimina, não bloqueia)', () => {
    const bruna: any = (PERSONAS as any[]).find((p) => p.key === 'bruna');
    const comp: any = comportamentosDoDisc(bruna.d_natural, bruna.i_natural, bruna.s_natural, bruna.c_natural);
    // Os dois knockouts do cargo têm piso 41 com rampa: abaixo de ~24,5 o fit do
    // traço cai de 0,45 e bloqueia. Ela precisa passar dos dois.
    expect(comp.comp_persistencia).toBeGreaterThan(25);
    expect(comp.comp_persuasao).toBeGreaterThan(25);
  });
});

describe('Artefatos congelados: merge por persona', () => {
  it('persona presente nas DUAS fontes mantém as chaves de ambas', () => {
    const merged = mesclarPersonaArtifacts(
      { 'x@demo': { report: { report_texts: { a: 1 } }, respostas: ['do fixture'] } },
      { 'x@demo': { descriptor_assessments: [1, 2, 3] } },
    );
    expect(merged['x@demo'].report).toBeTruthy();          // o spread raso perdia isto
    expect(merged['x@demo'].descriptor_assessments).toHaveLength(3);
    expect(merged['x@demo'].respostas).toEqual(['do fixture']);
  });

  it('a Mariana existe nas duas fontes e sai do merge com relatório E avaliações', () => {
    // Este é o caso REAL que quebrou: ela abria a tela de perfil disparando IA
    // ao vivo porque o relatório sumia em todo reset.
    const merged = mesclarPersonaArtifacts(
      (fixture as any).personaArtifacts,
      (extraArtifacts as any).personaArtifacts,
    );
    const mariana = merged['mariana.demo@vertho.ai'];
    expect(mariana, 'Mariana precisa ter artefato congelado').toBeTruthy();
    expect(mariana.report?.report_texts, 'relatório congelado da Mariana').toBeTruthy();
    expect(mariana.descriptor_assessments?.length, 'avaliações da Mariana').toBeGreaterThan(0);
  });

  it('todas as personas do demo têm relatório congelado (nenhuma gera IA ao vivo na demo)', () => {
    const merged = mesclarPersonaArtifacts(
      (fixture as any).personaArtifacts,
      (extraArtifacts as any).personaArtifacts,
    );
    const semReport = (PERSONAS as any[])
      .filter((p) => !merged[p.email]?.report?.report_texts)
      .map((p) => p.nome_completo);
    expect(semReport, `sem relatório congelado: ${semReport.join(', ')}`).toEqual([]);
  });

  it('só persona com mapeamento completo pode receber trilha congelada', () => {
    const bruna: any = (PERSONAS as any[]).find((p) => p.key === 'bruna');
    const paulo: any = (PERSONAS as any[]).find((p) => p.key === 'paulo');
    expect(personaDemoComMapeamentoCompleto(bruna)).toBe(true);
    expect(personaDemoComMapeamentoCompleto(paulo)).toBe(false);
  });

  it('corrige foco órfão do fixture e o mantém dentro do Top 5', () => {
    const top5 = [
      'Comunicação e Apresentação de Valor',
      'Negociação e Fechamento',
      'Relacionamento e Pós-venda',
      'Resiliência e Constância',
      'Orientação a Metas e Resultados',
    ];
    const focos = focosValidosDemo({
      nome: 'Representante Comercial',
      competencia_foco: 'Conhecimento Técnico de Produto e Solução',
    }, top5);
    expect(focos).toEqual(['Negociação e Fechamento']);
    expect(focos.every((foco) => top5.includes(foco))).toBe(true);
  });

  it('todos os níveis congelados de personas completas pertencem a N1–N4', () => {
    const merged = mesclarPersonaArtifacts(
      (fixture as any).personaArtifacts,
      (extraArtifacts as any).personaArtifacts,
    );
    for (const persona of (PERSONAS as any[]).filter(personaDemoComMapeamentoCompleto)) {
      for (const resposta of merged[persona.email]?.respostas || []) {
        expect([1, 2, 3, 4], `${persona.nome_completo} · ${resposta.competencia_nome}`).toContain(resposta.nivel_ia4);
      }
    }
  });
});
