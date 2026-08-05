import { describe, it, expect } from 'vitest';
import { manterUmDesafio } from '@/lib/season-engine/kit/entrega-semana';

/**
 * Jornada (05/08/2026): a semana entrega DUAS pílulas e UMA tarefa.
 *
 * O que se protege aqui é o que some sem avisar: o desafio da segunda entrega
 * é apagado do objeto que a tela lê. Se a escolha da entrega "principal" for
 * ingênua (sempre a primeira), uma semana em que só a segunda pílula tem kit
 * publicado fica SEM tarefa nenhuma — e ninguém percebe, porque a tela
 * simplesmente não mostra o bloco.
 */

const comDesafio = (texto: string): { conteudo: Record<string, unknown> } => ({
  conteudo: {
    desafio_texto: texto,
    acao_observavel: `observar: ${texto}`,
    criterio_de_execucao: `critério: ${texto}`,
    core_id: 'core-x',
    formatos_disponiveis: { texto: { id: 't1' } },
  },
});
const semDesafio = (): { conteudo: Record<string, unknown> } => ({
  conteudo: { core_id: 'core-y', formatos_disponiveis: { audio: { id: 'a1' } } },
});

describe('desafio único por semana', () => {
  it('mantém o da primeira entrega e limpa o da segunda', () => {
    const entregas = [comDesafio('fechar o combinado'), comDesafio('registrar por escrito')];
    manterUmDesafio(entregas);
    expect(entregas[0].conteudo.desafio_texto).toBe('fechar o combinado');
    expect(entregas[1].conteudo).not.toHaveProperty('desafio_texto');
    expect(entregas[1].conteudo).not.toHaveProperty('acao_observavel');
    expect(entregas[1].conteudo).not.toHaveProperty('criterio_de_execucao');
  });

  it('o CONTEÚDO da segunda pílula fica intacto — some a tarefa, não a pílula', () => {
    const entregas = [comDesafio('a'), comDesafio('b')];
    manterUmDesafio(entregas);
    expect(entregas[1].conteudo.core_id).toBe('core-x');
    expect(entregas[1].conteudo.formatos_disponiveis).toEqual({ texto: { id: 't1' } });
  });

  it('sem kit na primeira, a tarefa da semana vem da segunda (não fica vazia)', () => {
    const entregas = [semDesafio(), comDesafio('escalar quando faltar conferente')];
    manterUmDesafio(entregas);
    expect(entregas[1].conteudo.desafio_texto).toBe('escalar quando faltar conferente');
    expect(entregas[0].conteudo).not.toHaveProperty('desafio_texto');
  });

  it('nenhuma entrega com kit: não inventa nem quebra', () => {
    const entregas = [semDesafio(), semDesafio()];
    expect(() => manterUmDesafio(entregas)).not.toThrow();
    expect(entregas.every((e) => !e.conteudo.desafio_texto)).toBe(true);
  });

  it('semana de uma pílula só continua com a tarefa dela', () => {
    const entregas = [comDesafio('única')];
    manterUmDesafio(entregas);
    expect(entregas[0].conteudo.desafio_texto).toBe('única');
  });
});
