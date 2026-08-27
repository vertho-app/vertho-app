import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chaveDoPar, arrayLiteralPg, resolverDesafioDaSemana } from '@/lib/season-engine/kit/desafio-par';
import { resolverDesafiosDaSemana } from '@/lib/season-engine/kit/entrega-semana';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * A TAREFA da semana quando ela entrega 2 descritores da mesma competência.
 *
 * O kit é por DESCRITOR, então a unificação da rodada anterior apenas ESCOLHIA
 * um dos dois: a tarefa falava de um assunto e a semana entregava dois. Esta
 * peça escreve uma tarefa olhando os dois — e a chave dela é o par.
 */

describe('chaveDoPar — a chave de reuso', () => {
  it('ORDENA: [A,B] e [B,A] são a mesma semana', () => {
    // Sem ordenar, a matriz dobraria por acidente de ordenação do blueprint e
    // duas pessoas com os mesmos dois assuntos pagariam duas gerações.
    expect(chaveDoPar(['Neutralidade', 'Escuta das partes']))
      .toEqual(chaveDoPar(['Escuta das partes', 'Neutralidade']));
  });

  it('normaliza o código da matriz — o plano guarda com prefixo, o brief sem', () => {
    expect(chaveDoPar(['COO03_D6 — Busca de apoio', 'Neutralidade']))
      .toEqual(chaveDoPar(['Busca de apoio', 'NEUTRALIDADE']));
  });

  it('dedupe: o mesmo descritor duas vezes não vira par', () => {
    expect(chaveDoPar(['Neutralidade', 'neutralidade'])).toHaveLength(1);
  });

  it('vazios e nulos não entram na chave', () => {
    expect(chaveDoPar(['Neutralidade', null, '', undefined])).toEqual(['neutralidade']);
  });
});

describe('arrayLiteralPg — o bug que só aparece na 1ª execução real', () => {
  it('🔴 monta o literal `{"a","b"}`, não `a,b`', () => {
    // `.eq('descritores_norm', ['a','b'])` serializa como `a,b` e o Postgres
    // responde `malformed array literal`. Nenhum typecheck pega — o supabase-js
    // aceita o array. Custou a primeira execução do gerador, em 27/08.
    expect(arrayLiteralPg(['acompanhamento', 'aprendizado institucional']))
      .toBe('{"acompanhamento","aprendizado institucional"}');
  });

  it('a barra de "Uso de CNV/mediação" passa intacta', () => {
    expect(arrayLiteralPg(['uso de cnv/mediacao'])).toBe('{"uso de cnv/mediacao"}');
  });

  it('aspas e contrabarra são escapadas', () => {
    expect(arrayLiteralPg(['diz "oi"'])).toBe('{"diz \\"oi\\""}');
    expect(arrayLiteralPg(['a\\b'])).toBe('{"a\\\\b"}');
  });
});

describe('resolverDesafioDaSemana — só LÊ, e sabe distinguir vazio de falha', () => {
  const ARGS = {
    empresaId: 'e1', competencia: 'Gerenciamento de conflitos',
    descritores: ['Neutralidade', 'Escuta das partes'], disc: 'S', cargo: 'Diretor(a) Escolar',
  };

  it('devolve a tarefa do cargo quando existe', async () => {
    const sb = criarSupabaseMock({
      lista: () => [
        { cargo: 'todos', desafio: { desafio_texto: 'a genérica' } },
        { cargo: 'Diretor(a) Escolar', desafio: { desafio_texto: 'a do cargo' } },
      ],
    });
    const r = await resolverDesafioDaSemana(sb.client, ARGS);
    expect(r?.desafio_texto).toBe('a do cargo');
  });

  it('cai na genérica (`todos`) quando não há a do cargo', async () => {
    const sb = criarSupabaseMock({ lista: () => [{ cargo: 'todos', desafio: { desafio_texto: 'a genérica' } }] });
    expect((await resolverDesafioDaSemana(sb.client, ARGS))?.desafio_texto).toBe('a genérica');
  });

  it('🔑 NÃO serve a tarefa de OUTRO cargo — pior que a genérica', async () => {
    // Mesma regra de `cargoServe`: conteúdo do cargo errado afirma um contexto
    // que não é o da pessoa. Custou 18 leituras em ibipeba, em 29/07.
    const sb = criarSupabaseMock({ lista: () => [{ cargo: 'Coordenador(a)', desafio: { desafio_texto: 'de outro cargo' } }] });
    expect(await resolverDesafioDaSemana(sb.client, ARGS)).toBeNull();
  });

  it('🔴 falha de LEITURA lança — não vira "não existe"', async () => {
    // Devolver null aqui faria o consumidor cair no desafio do descritor
    // principal em silêncio: o F-C4 outra vez.
    const sb = criarSupabaseMock({ lista: () => [] });
    sb.falharEm({ tabela: 'kit_desafios_semana', op: 'select', mensagem: 'timeout no pool' });
    await expect(resolverDesafioDaSemana(sb.client, ARGS)).rejects.toThrow(/timeout no pool/);
  });

  it('sem par (1 descritor) nem consulta o banco', async () => {
    const sb = criarSupabaseMock({ lista: () => [] });
    expect(await resolverDesafioDaSemana(sb.client, { ...ARGS, descritores: ['Neutralidade'] })).toBeNull();
    expect(sb.chamadas.some((c) => c.tabela === 'kit_desafios_semana')).toBe(false);
  });

  it('DISC inválido não consulta o banco', async () => {
    const sb = criarSupabaseMock({ lista: () => [] });
    expect(await resolverDesafioDaSemana(sb.client, { ...ARGS, disc: null })).toBeNull();
    expect(sb.chamadas.some((c) => c.tabela === 'kit_desafios_semana')).toBe(false);
  });
});

describe('a semana serve a tarefa do PAR quando ela existe', () => {
  const semanaPlan = {
    tipo: 'conteudo',
    conteudos_dia: [
      { competencia: 'Gerenciamento de conflitos', descritor: 'Neutralidade', conteudo: { desafio_texto: 'tarefa do descritor 1' } },
      { competencia: 'Gerenciamento de conflitos', descritor: 'Escuta das partes', conteudo: { desafio_texto: 'tarefa do descritor 2' } },
    ],
  };
  const ARGS = { empresaId: 'e1', disc: 'S', cargo: 'Diretor(a) Escolar', desafioUnicoPorCompetencia: true };

  it('🔴 com a peça do par, a tarefa da semana passa a ser a INTEGRADA', async () => {
    const sb = criarSupabaseMock({
      lista: (tabela) => tabela === 'kit_desafios_semana'
        ? [{ cargo: 'Diretor(a) Escolar', desafio: { desafio_texto: 'a tarefa que cobre os dois', criterio_de_execucao: 'os dois aparecem' } }]
        : [],
    });
    const out = await resolverDesafiosDaSemana(sb.client, semanaPlan, ARGS);
    expect(out).toHaveLength(1);
    expect(out[0].desafio_texto).toBe('a tarefa que cobre os dois');
    expect(out[0].criterio_de_execucao).toBe('os dois aparecem');
  });

  it('sem a peça, fica a do descritor principal — o comportamento que já estava no ar', async () => {
    const sb = criarSupabaseMock({ lista: () => [] });
    const out = await resolverDesafiosDaSemana(sb.client, semanaPlan, ARGS);
    expect(out).toHaveLength(1);
    expect(out[0].desafio_texto).toBe('tarefa do descritor 1');
  });

  it('🔑 sem a peça E em entrega real, a degradação é REGISTRADA', async () => {
    const sb = criarSupabaseMock({ lista: () => [] });
    await resolverDesafiosDaSemana(sb.client, semanaPlan, { ...ARGS, colaboradorId: 'c1' });
    const reg = sb.escritas.find((e) => e.tabela === 'degradacao_log');
    expect(reg, 'nada foi registrado — a degradação ficaria invisível').toBeTruthy();
    expect(reg!.payload.tipo).toBe('desafio-par-ausente');
  });

  it('sem `colaboradorId` (varredura) NÃO registra — alarme mede gente, não varredura', async () => {
    // 622 de 622 ocorrências do alarme de 04/08 eram a tela de admin varrendo o
    // futuro. Contador sem janela de experiência vira alarme crônico.
    const sb = criarSupabaseMock({ lista: () => [] });
    await resolverDesafiosDaSemana(sb.client, semanaPlan, ARGS);
    expect(sb.escritas.some((e) => e.tabela === 'degradacao_log')).toBe(false);
  });

  it('duas competências distintas não viram par — cada uma mantém a sua', async () => {
    const sb = criarSupabaseMock({ lista: () => [] });
    const out = await resolverDesafiosDaSemana(sb.client, {
      tipo: 'conteudo',
      conteudos_dia: [
        { competencia: 'Gestão', descritor: 'd1', conteudo: { desafio_texto: 'tarefa A' } },
        { competencia: 'Avaliação', descritor: 'd2', conteudo: { desafio_texto: 'tarefa B' } },
      ],
    }, ARGS);
    expect(out.map((d) => d.desafio_texto)).toEqual(['tarefa A', 'tarefa B']);
    expect(sb.chamadas.some((c) => c.tabela === 'kit_desafios_semana')).toBe(false);
  });
});

describe('geração e leitura são SEPARADAS', () => {
  const CONSUMIDOR = readFileSync(join(process.cwd(), 'lib/season-engine/kit/entrega-semana.ts'), 'utf-8');

  it('🔑 o caminho de ENTREGA não gera desafio por IA', () => {
    // Gerar aqui poria uma chamada de IA no caminho de quem abriu a conversa —
    // latência imprevisível na cara da pessoa e custo não planejado (a matriz de
    // pares é ~2,5× a de descritores). A régua: na entrega, degrade registrando.
    expect(CONSUMIDOR).toContain('resolverDesafioDaSemana(');
    expect(CONSUMIDOR).not.toContain('gerarDesafioDaSemana(');
  });
});
