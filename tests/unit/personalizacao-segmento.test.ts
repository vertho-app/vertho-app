import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { contextoDeEscolaVale } from '@/lib/escola-brief';
import { buildPersonalizacaoPrompt } from '@/lib/season-engine/prompts/personalizacao';
import { formaDaSaidaAoCliente, sanitizarSaidaDaTarefa } from '@/lib/ai-saida-sem-travessao';

/**
 * PDF personalizado de empresa (23/10/2026, Amazon Bowling): a camada anexada ao texto e ao case trazia
 * "No contexto da sua escola", com estudantes, sala de aula e laboratório, para quem trabalha num boliche.
 * O resumo do contexto (`resumirPPP`) tem molde de escola e inventa uma quando a empresa não é escola.
 * E a camada vinha cheia de travessão, contra a regra de voz da Vertho.
 */
describe('lente de escola só no segmento educação', () => {
  it.each([
    ['educacao', true],
    ['corporativo', false],
    [null, false],
    [undefined, false],
    ['', false],
  ])('segmento %s → %s', (segmento, esperado) => {
    expect(contextoDeEscolaVale(segmento as any)).toBe(esperado);
  });

  it('o PDF personalizado consulta o segmento ANTES de ler o brief manual e o contexto da empresa', () => {
    const source = readFileSync(path.join(process.cwd(), 'actions', 'conteudos.ts'), 'utf8');
    const inicio = source.indexOf('export async function gerarConteudoFinalPersonalizado');
    const fim = source.indexOf('export async function prepararAudioPersonalizado', inicio);
    const funcao = source.slice(inicio, fim);

    expect(funcao).toMatch(/select\('segmento'\)/);
    const trava = funcao.indexOf('contextoDeEscolaVale(seg?.segmento)');
    expect(trava, 'a trava do segmento sumiu do PDF personalizado').toBeGreaterThan(-1);
    expect(trava, 'o brief manual não pode ser lido antes da trava').toBeLessThan(funcao.indexOf('video_escola'));
    expect(trava, 'o contexto da empresa não pode ser resolvido antes da trava').toBeLessThan(funcao.indexOf('resolverContextoEmpresa('));
  });
});

describe('camada do PDF sem travessão', () => {
  it('a tarefa da camada está no registro de saídas ao cliente, como texto', () => {
    expect(formaDaSaidaAoCliente('conteudo_personalizacao')).toBe('texto');
  });

  it('o que o modelo devolver com travessão chega limpo, com os títulos da camada intactos', () => {
    const bruto = '## Para o seu perfil: Comandante\nVocê decide rápido — e isso ajuda.\n\n- Confira o recado — antes de sair.';
    const limpo = sanitizarSaidaDaTarefa('conteudo_personalizacao', bruto);
    expect(limpo).not.toMatch(/[–—―]/);
    expect(limpo).toContain('## Para o seu perfil: Comandante');
  });

  it('o prompt da camada não traz travessão no molde que o modelo copia', () => {
    const { system, user } = buildPersonalizacaoPrompt({
      competencia: 'Rotina e Disciplina', descritor: 'Organização do trabalho', conteudoCore: 'Núcleo sem travessão.',
      arquetipoNome: 'Comandante', arquetipoDesc: 'direto, decidido', escolaBrief: null,
    });
    expect(system).not.toMatch(/[–—―]/);
    expect(user).not.toMatch(/[–—―]/);
  });
});
