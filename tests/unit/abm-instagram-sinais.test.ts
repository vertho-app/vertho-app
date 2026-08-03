import { describe, it, expect } from 'vitest';
import { extrairSinais, sanitizarLegenda } from '@/lib/abm/instagram-sinais';

/**
 * ABM camada 4b — extração de sinal do Instagram.
 *
 * Dois eixos cobertos aqui, ambos por motivo concreto:
 *
 * 1. A ARMADILHA DO DOMÍNIO: em escola, "vagas abertas" quase sempre é
 *    MATRÍCULA de aluno, não contratação. Um detector ingênuo marcaria
 *    contratação em toda campanha de matrícula — e a hipótese da ficha Tier A
 *    sairia errada em cima do sinal mais comum do calendário escolar.
 *
 * 2. LGPD/menor: post de escola mostra criança. O módulo não pode devolver nem
 *    persistir nome de pessoa. Os testes de sanitização quebram se essa
 *    proteção for afrouxada.
 */

describe('sanitizarLegenda', () => {
  it('remove @menções, e-mail e telefone', () => {
    const s = sanitizarLegenda('Fale com @colegioexemplo ou contato@escola.com.br, (11) 98765-4321');
    expect(s).not.toContain('@colegioexemplo');
    expect(s).not.toContain('contato@escola.com.br');
    expect(s).not.toMatch(/98765/);
  });

  it('remove nome próprio provável (2+ palavras capitalizadas)', () => {
    const s = sanitizarLegenda('Parabéns à aluna Maria Eduarda Silva pela medalha!');
    expect(s).not.toContain('Maria');
    expect(s).not.toContain('Eduarda');
    expect(s).toContain('[nome]');
  });

  it('pega nome com preposição no meio', () => {
    const s = sanitizarLegenda('A professora Ana de Souza assume a coordenação');
    expect(s).not.toContain('Souza');
  });

  it('não destrói a legenda inteira', () => {
    const s = sanitizarLegenda('Estamos contratando professores para a nova unidade!');
    expect(s).toContain('contratando');
    expect(s).toContain('nova unidade');
  });
});

describe('extrairSinais — contratação vs. matrícula', () => {
  it('NÃO marca contratação em campanha de matrícula que fala em vagas', () => {
    // Regressão da armadilha: é o post mais comum de escola no ano.
    const casos = [
      'Vagas abertas para 2027! Matrículas abertas, venha conhecer.',
      'Últimas vagas para o Ensino Médio. Rematrícula até sexta.',
      'Processo seletivo de bolsistas: inscrições abertas.',
    ];
    for (const c of casos) {
      const tipos = extrairSinais(c).map((s) => s.tipo);
      expect(tipos, `falhou em: ${c}`).not.toContain('contratacao');
    }
  });

  it('marca contratação quando o termo é inequívoco de emprego', () => {
    const casos = [
      'Trabalhe conosco: estamos com vagas para professor de matemática.',
      'Estamos contratando! Faça parte do nosso time.',
      'Banco de talentos aberto para educadores.',
    ];
    for (const c of casos) {
      const tipos = extrairSinais(c).map((s) => s.tipo);
      expect(tipos, `falhou em: ${c}`).toContain('contratacao');
    }
  });
});

describe('extrairSinais — demais tipos', () => {
  it('detecta expansão', () => {
    expect(extrairSinais('Inauguramos nossa nova unidade em Niterói!').map((s) => s.tipo))
      .toContain('expansao');
  });

  it('detecta formação docente', () => {
    expect(extrairSinais('Semana pedagógica: formação continuada da nossa equipe.').map((s) => s.tipo))
      .toContain('formacao_docente');
  });

  it('detecta mudança de liderança', () => {
    expect(extrairSinais('Damos as boas-vindas à nova diretora pedagógica.').map((s) => s.tipo))
      .toContain('mudanca_lideranca');
  });

  it('acumula mais de um sinal na mesma legenda', () => {
    const tipos = extrairSinais(
      'Inauguramos a nova unidade e estamos contratando professores!',
    ).map((s) => s.tipo);
    expect(tipos).toContain('expansao');
    expect(tipos).toContain('contratacao');
  });

  it('legenda vazia, nula ou sem sinal devolve lista vazia', () => {
    expect(extrairSinais(null)).toEqual([]);
    expect(extrairSinais('')).toEqual([]);
    expect(extrairSinais('Bom fim de semana a todos! ☀️')).toEqual([]);
  });

  it('carrega data e permalink quando informados', () => {
    const [s] = extrairSinais('Nova unidade chegando em Santos!', {
      data: '2026-07-30T12:00:00+0000',
      permalink: 'https://instagram.com/p/abc',
    });
    expect(s.data).toBe('2026-07-30T12:00:00+0000');
    expect(s.permalink).toBe('https://instagram.com/p/abc');
  });

  it('a evidência já vem sanitizada — nome não vaza para a ficha', () => {
    const [s] = extrairSinais('A nova diretora Carla Menezes Prado assume em agosto');
    expect(s.tipo).toBe('mudanca_lideranca');
    expect(s.evidencia).not.toContain('Menezes');
    expect(s.evidencia).not.toContain('Prado');
  });
});
