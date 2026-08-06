// `short_name` do manifest por tenant (app/manifest.webmanifest/route.ts).
//
// É o texto que aparece SOB o ícone na tela de início, onde o sistema corta
// perto de ~12 caracteres. "Secretaria Municipal de Ibipeba/BA" viraria
// "Secretaria…", que não identifica cliente nenhum — e o manifest existia
// justamente porque o nome errado na tela de início é o problema.
import { describe, expect, it } from 'vitest';
import { derivarNomeCurto } from '@/lib/tenant-nome-curto';

describe('derivarNomeCurto', () => {
  // Asserção pela INTENÇÃO (identifica + cabe), não pela formatação exata:
  // "Ibipeba/BA" é um short_name melhor que "Ibipeba" e cabe igual — travar a
  // string exata transformaria uma melhoria futura em teste vermelho.
  it('pula palavras genéricas e pega a que identifica', () => {
    for (const [nome, esperado] of [
      ['Secretaria Municipal de Ibipeba/BA', 'Ibipeba'],
      ['Prefeitura de Macaé', 'Macaé'],
      ['Grupo Marista', 'Marista'],
    ] as const) {
      const curto = derivarNomeCurto(nome);
      expect(curto, `${nome} → ${curto}`).toContain(esperado);
      expect(curto.length).toBeLessThanOrEqual(12);
    }
  });

  it('mantém nome curto que já identifica', () => {
    expect(derivarNomeCurto('Bett')).toBe('Bett');
    expect(derivarNomeCurto('UniAnchieta')).toBe('UniAnchieta');
  });

  it('trunca o que não cabe, com reticências', () => {
    const curto = derivarNomeCurto('Universidade Politecnicamente Extensa');
    expect(curto.length).toBeLessThanOrEqual(12);
    expect(curto.endsWith('…')).toBe(true);
  });

  it('sem tenant cai no padrão, nunca em vazio', () => {
    expect(derivarNomeCurto(null)).toBe('Vertho');
    expect(derivarNomeCurto(undefined)).toBe('Vertho');
    expect(derivarNomeCurto('   ')).toBe('Vertho');
  });

  it('nome só de palavras genéricas ainda devolve algo utilizável', () => {
    // Não pode devolver string vazia: o ícone ficaria sem legenda na tela.
    expect(derivarNomeCurto('Escola Municipal').length).toBeGreaterThan(0);
  });

  it('não deixa pontuação pendurada no fim', () => {
    expect(derivarNomeCurto('Colégio Ibipeba.')).not.toMatch(/[/,.]$/);
    expect(derivarNomeCurto('Instituto Alfa,')).not.toMatch(/[/,.]$/);
  });
});
