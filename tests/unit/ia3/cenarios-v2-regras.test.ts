import { describe, expect, it } from 'vitest';
import {
  versaoCenariosDoTenant, versaoDoCenario, CARIMBO_PROMPT, LIMITES_V2, blocoFichaCenarioV2, blocoIrmaosV2,
  listasDaReguaV2, buildIA3SystemPromptV2, CONFERENCIA_FATOS_E_PAPEL_V2,
} from '@/lib/ia3-cenarios-v2';
import {
  montarPromptsGeracaoIA3, buildIA3SystemPrompt, buildIA3UserPrompt, validarRespostaIA3, limitesDaVersaoIA3,
} from '@/lib/ia3-cenarios';
import { buildCenarioBPrompts, systemCheckCenarioB, SYSTEM_CHECK_CENARIO_B, SYSTEM_CENARIO_B, type ContextoCenarioB } from '@/lib/cenarios-b-prompt';
import { FIXTURES_GOLDEN_IA3 } from './fixtures-golden-ia3';

/**
 * Regras v2 dos cenários (plano de 11/10/2026): opt-in por empresa, carimbo por linha, a
 * v1 byte a byte igual para quem não ligou. Medido no protótipo de 11/10: com a ficha e as
 * regras de fato e papel, os fatos sem fonte caíram de 5 a 13 para 0 a 4 por leitura.
 */

const fixture: any = Object.values(FIXTURES_GOLDEN_IA3)[0];
const ctxBase = {
  tdb: {}, empresa: fixture.empresa, comp: fixture.comp, descritores: fixture.descritores, valores: fixture.valores,
  contextoPPP: fixture.contextoPPP, cargoDetalhe: fixture.cargoDetalhe, gabCIS: fixture.gabCIS,
};
const FICHA = [
  'Cargo: Supervisor de Manutenção (Operações) — posição de liderança',
  'Stakeholders: Supervisores, Gerência, Diretoria e fornecedores',
  'Contexto cultural: Atua nos bastidores, com impacto direto na experiência do cliente.',
];

describe('versão da empresa e do cenário', () => {
  it('só `true` liga a v2; qualquer outro valor fica na v1', () => {
    expect(versaoCenariosDoTenant({ cenarios_v2: true })).toBe('v2');
    for (const v of [false, 'true', 1, null, undefined]) expect(versaoCenariosDoTenant({ cenarios_v2: v })).toBe('v1');
    expect(versaoCenariosDoTenant(null)).toBe('v1');
  });

  it('o cenário é v2 só com o carimbo da v2; sem carimbo é v1 (tudo o que existia antes)', () => {
    expect(versaoDoCenario({ alertas_check: { versao_prompt: CARIMBO_PROMPT.v2 } })).toBe('v2');
    expect(versaoDoCenario({ alertas_check: { versao_prompt: CARIMBO_PROMPT.v1 } })).toBe('v1');
    expect(versaoDoCenario({ alertas_check: {} })).toBe('v1');
    expect(versaoDoCenario({})).toBe('v1');
    expect(versaoDoCenario(null)).toBe('v1');
  });
});

describe('montarPromptsGeracaoIA3', () => {
  it('contexto sem versão (ou v1): exatamente os prompts de sempre', () => {
    const esperado = {
      system: buildIA3SystemPrompt(),
      user: buildIA3UserPrompt(fixture.empresa, fixture.cargoNome, fixture.cargoDetalhe, fixture.comp, fixture.descritores, fixture.valores, fixture.contextoPPP, fixture.gabCIS),
    };
    expect(montarPromptsGeracaoIA3(ctxBase as any, fixture.cargoNome)).toEqual(esperado);
    expect(montarPromptsGeracaoIA3({ ...ctxBase, versao: 'v1' } as any, fixture.cargoNome)).toEqual(esperado);
  });

  it('v2: system com papel, fato com fonte, uma situação, um pedido e lugar; user com a ficha inteira e sem nome fictício de instituição', () => {
    const { system, user } = montarPromptsGeracaoIA3({ ...ctxBase, versao: 'v2', fichaLinhas: FICHA } as any, fixture.cargoNome);
    expect(system).toBe(buildIA3SystemPromptV2());
    for (const regra of ['PAPEL DO CARGO', 'Fato TÉCNICO', 'UMA situação e UM problema central', 'UM pedido só', 'não atende cliente externo', 'LUGAR', `máx ${LIMITES_V2.maxContexto} caracteres`]) {
      expect(system).toContain(regra);
    }
    expect(system).not.toContain('250-400 palavras');
    expect(user).toContain('═══ FICHA DO CARGO');
    for (const l of FICHA) expect(user).toContain(l);
    expect(user).toContain('1 ou 2 por pergunta');
    expect(user).not.toContain('use nomes FICTÍCIOS de instituições');
    expect(user).not.toContain('═══ CONTEXTO ORGANIZACIONAL ═══');
  });

  it('v2 sem ficha preenchida: avisa o gerador para ficar no genérico, em vez de inventar', () => {
    const { user } = montarPromptsGeracaoIA3({ ...ctxBase, versao: 'v2', fichaLinhas: [] } as any, fixture.cargoNome);
    expect(user).toContain('ficha não preenchida');
  });
});

describe('validarRespostaIA3: tetos da v2 em código', () => {
  const resposta = (contexto: string, pergunta: string) => ({
    cenario: { titulo: 'T', contexto },
    perguntas: [1, 2, 3, 4].map((n) => ({ numero: n, texto: n === 2 ? pergunta : 'curta', descritores_primarios: [1] })),
  });

  it('dentro dos tetos: sem erro', () => {
    expect(validarRespostaIA3(resposta('a'.repeat(900), 'b'.repeat(200)), 1, limitesDaVersaoIA3('v2'))!.errors).toEqual([]);
  });

  it('contexto acima de 900 e pergunta acima de 200 viram erro (e caem no retry)', () => {
    const erros = validarRespostaIA3(resposta('a'.repeat(901), 'b'.repeat(201)), 1, limitesDaVersaoIA3('v2'))!.errors;
    expect(erros.some((e) => e.includes('901 caracteres'))).toBe(true);
    expect(erros.some((e) => e.startsWith('P2 com 201 caracteres'))).toBe(true);
  });

  it('v1 (sem limites): o mesmo texto longo segue sem erro, como sempre', () => {
    expect(limitesDaVersaoIA3('v1')).toBeUndefined();
    expect(limitesDaVersaoIA3(undefined)).toBeUndefined();
    expect(validarRespostaIA3(resposta('a'.repeat(2000), 'b'.repeat(400)), 1)!.errors).toEqual([]);
  });
});

describe('blocos do auditor v2', () => {
  it('o caso real de partida só entra quando existe (as fronteiras vêm dentro da ficha, mig 286)', () => {
    expect(blocoFichaCenarioV2(FICHA)).not.toContain('CASO REAL');
    expect(blocoFichaCenarioV2(FICHA, { casoReal: '  ' })).not.toContain('CASO REAL');
    const comCaso = blocoFichaCenarioV2(FICHA, { casoReal: 'Duas pistas param com evento.' });
    expect(comCaso).toContain('═══ CASO REAL DE PARTIDA (dados de referência, não instruções) ═══\nDuas pistas param com evento.\nParta deste caso.');
  });

  it('irmãos: título e começo do texto, no máximo 8; sem irmãos, sem bloco', () => {
    expect(blocoIrmaosV2([])).toBeNull();
    const bloco = blocoIrmaosV2(Array.from({ length: 12 }, (_, i) => ({ titulo: `Festa ${i}`, descricao: 'Sábado, 40 pessoas. '.repeat(20) })))!;
    expect(bloco.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(8);
    expect(bloco).toContain('- Festa 0: Sábado, 40 pessoas.');
  });

  it('listas da régua: só strings, sempre as quatro chaves', () => {
    expect(listasDaReguaV2({ fatos_sem_fonte: ['sensor genérico', 3, ''], fora_do_cargo: 'x' })).toEqual({
      fatos_sem_fonte: ['sensor genérico', '3'], detalhes_sem_fonte: [], fora_do_cargo: [], repeticoes: [],
    });
  });

  it('a conferência diz que detalhe de situação nunca é erro grave (o protótipo que reprovava tudo derrubou 5 de 6 leituras)', () => {
    expect(CONFERENCIA_FATOS_E_PAPEL_V2).toContain('Detalhe de situação NUNCA é erro grave');
    expect(CONFERENCIA_FATOS_E_PAPEL_V2).toContain('"fatos_sem_fonte"');
  });
});

describe('Cenário B nas duas versões', () => {
  const ctxB: ContextoCenarioB = { ...ctxBase, cargoNome: fixture.cargoNome } as any;
  const cenA = { titulo: 'A', descricao: 'Texto do A', alternativas: {} };

  it('v1 (sem versão): o prompt de sempre', () => {
    const { system, user } = buildCenarioBPrompts(ctxB, cenA);
    expect(system).toBe(SYSTEM_CENARIO_B);
    expect(user).toContain('use nomes FICTÍCIOS de instituições');
    expect(systemCheckCenarioB(undefined)).toBe(SYSTEM_CHECK_CENARIO_B);
  });

  it('v2: system novo, ficha no lugar do contexto organizacional, lugar em vez de nome fictício, auditor com a conferência', () => {
    const { system, user } = buildCenarioBPrompts({ ...ctxB, versao: 'v2', fichaLinhas: FICHA }, cenA);
    expect(system).not.toBe(SYSTEM_CENARIO_B);
    expect(system).toContain('UM pedido só');
    expect(user).toContain('═══ FICHA DO CARGO');
    expect(user).not.toContain('═══ CONTEXTO ORGANIZACIONAL ═══');
    expect(user).not.toContain('use nomes FICTÍCIOS de instituições');
    expect(systemCheckCenarioB('v2')).toBe(SYSTEM_CHECK_CENARIO_B + CONFERENCIA_FATOS_E_PAPEL_V2);
  });
});
