import { describe, it, expect } from 'vitest';
import { buildIA3UserPrompt, REGRA_ANONIMIZACAO_INSTITUICOES } from '@/lib/ia3-cenarios';
import {
  buildCenarioBPrompts, buildCheckCenarioBUser, blocosDeContextoB,
  SYSTEM_CENARIO_B, SYSTEM_CHECK_CENARIO_B, type ContextoCenarioB,
} from '@/lib/cenarios-b-prompt';
import { FIXTURES_GOLDEN_IA3 } from './ia3/fixtures-golden-ia3';

// Até 18/09/2026 o gerador do Cenário B recebia só o NOME do cargo, e o bloco
// "CONTEXTO PPP / DOSSIÊ" levava apenas a lista de valores em JSON; não havia
// regra de anonimização. O B é comparado com o A no fechamento: tem que ver o
// mesmo contexto.

const ctxDe = (f: any): ContextoCenarioB => ({
  empresa: f.empresa, cargoNome: f.cargoNome, cargoDetalhe: f.cargoDetalhe, comp: f.comp,
  descritores: f.descritores as any[], valores: f.valores as any[], contextoPPP: f.contextoPPP, gabCIS: f.gabCIS,
});
const promptA = (f: any) =>
  buildIA3UserPrompt(f.empresa, f.cargoNome, f.cargoDetalhe, f.comp, f.descritores, f.valores, f.contextoPPP, f.gabCIS);

const CEN_A = {
  titulo: 'Conselho no limite', descricao: 'Descrição do A.',
  alternativas: { faceta_testada_principal: 'Escuta antes de decidir', tradeoff_testado: 'Prazo x escuta' },
};

describe('Cenário B: o MESMO contexto do Cenário A', () => {
  for (const [nome, f] of Object.entries(FIXTURES_GOLDEN_IA3)) {
    it(`os blocos de contexto do B são exatamente o começo do prompt do A (${nome})`, () => {
      const contexto = blocosDeContextoB(ctxDe(f)).join('\n\n');
      expect(promptA(f).startsWith(`${contexto}\n\n═══ INSTRUÇÃO DE LEITURA ═══`)).toBe(true);
    });
  }

  it('o prompt do B traz o contexto organizacional, a régua, os valores, o perfil ideal e o PPP', () => {
    const { user } = buildCenarioBPrompts(ctxDe(FIXTURES_GOLDEN_IA3.completo), CEN_A);
    for (const trecho of ['CONTEXTO ORGANIZACIONAL', 'Principais entregas:', 'N3 (Meta):', 'VALORES ORGANIZACIONAIS', 'PERFIL IDEAL DO CARGO', 'CONTEXTO PPP / DOSSIÊ ═══\nEscola urbana']) {
      expect(user, trecho).toContain(trecho);
    }
  });

  it('o bloco de PPP não é mais a lista de valores em JSON', () => {
    const { user } = buildCenarioBPrompts(ctxDe(FIXTURES_GOLDEN_IA3.completo), CEN_A);
    expect(user).not.toMatch(/CONTEXTO PPP \/ DOSSIÊ ═══\n\[/);
  });

  it('o Cenário A de referência chega com a faceta e o trade-off', () => {
    const { user } = buildCenarioBPrompts(ctxDe(FIXTURES_GOLDEN_IA3.completo), CEN_A);
    expect(user).toContain('Faceta avaliada: Escuta antes de decidir');
    expect(user).toContain('Trade-off: Prazo x escuta');
  });

  it('feedback da revisão anterior entra quando existe', () => {
    const { user } = buildCenarioBPrompts(ctxDe(FIXTURES_GOLDEN_IA3.minimo), CEN_A, 'P2 aceita resposta genérica');
    expect(user).toContain('FEEDBACK DA REVISÃO ANTERIOR');
    expect(user).toContain('P2 aceita resposta genérica');
  });
});

describe('Cenário B: anonimização e fechamento sem número de semana', () => {
  it('o gerador tem a regra de anonimização do A', () => {
    expect(SYSTEM_CENARIO_B).toContain(REGRA_ANONIMIZACAO_INSTITUICOES);
    const { user } = buildCenarioBPrompts(ctxDe(FIXTURES_GOLDEN_IA3.completo), CEN_A);
    expect(user).toContain('ANONIMIZE');
  });

  it('nenhum dos prompts fala em "semana 14" ou "13 semanas" (a Jornada fecha na 7)', () => {
    const { system, user } = buildCenarioBPrompts(ctxDe(FIXTURES_GOLDEN_IA3.completo), CEN_A);
    const checkUser = buildCheckCenarioBUser(ctxDe(FIXTURES_GOLDEN_IA3.completo), { titulo: 't', descricao: 'd', alternativas: {} }, CEN_A);
    for (const texto of [system, user, SYSTEM_CHECK_CENARIO_B, checkUser]) {
      // A única "sem14" permitida é a chave do JSON que a tela lê.
      expect(texto.replaceAll('"adequacao_sem14"', '')).not.toMatch(/semana 14|sem14|13 semanas/i);
    }
  });

  it('o auditor mantém a chave adequacao_sem14 no JSON (a tela da Fase 4 lê essa chave)', () => {
    expect(SYSTEM_CHECK_CENARIO_B).toContain('"adequacao_sem14"');
  });
});

describe('auditor do Cenário B: a mesma lente do gerador', () => {
  const B = {
    titulo: 'B', descricao: 'Descrição do B.',
    alternativas: { p1: 'Pergunta 1', p2: 'Pergunta 2', p3: 'Pergunta 3', p4: 'Pergunta 4', objetivo_diagnostico: { p1: 'ler o caso' } },
  };

  it('vê o mesmo contexto, o A de referência, o B e as perguntas', () => {
    const ctx = ctxDe(FIXTURES_GOLDEN_IA3.completo);
    const user = buildCheckCenarioBUser(ctx, B, CEN_A);
    expect(user.startsWith(blocosDeContextoB(ctx).join('\n\n'))).toBe(true);
    expect(user).toContain('CENÁRIO A ORIGINAL (pra comparação)');
    expect(user).toContain('CENÁRIO B GERADO');
    expect(user).toContain('P1: Pergunta 1\n  Objetivo: ler o caso');
    expect(user).toContain('P4: Pergunta 4');
  });

  it('sem A de referência, o bloco do A não aparece', () => {
    const user = buildCheckCenarioBUser(ctxDe(FIXTURES_GOLDEN_IA3.minimo), B);
    expect(user).not.toContain('CENÁRIO A ORIGINAL');
  });
});
