/**
 * R-97 (revisão de 02/10/2026): leitura tolerante e CSV no horário de Brasília
 * nos três simuladores.
 *
 * 1. No atendimento, a aba da equipe, a de cenários e os botões de voz faziam
 *    `r.json()` cru: um 502/504 do gateway em HTML virava "Unexpected token
 *    '<'" em inglês, e a queda de rede, "Failed to fetch". O leitor tolerante
 *    do vendas virou comum (`lib/simuladores/ler-resposta.ts`).
 * 2. Os CSVs da equipe do vendas e do atendimento cortavam o ISO em UTC
 *    (`slice(0, 10)`): treino depois das 21h saía com o dia seguinte. O
 *    histórico do vendas exportava o ISO cru. A data agora sai por
 *    `dataHoraBrasilia`, a mesma da liderança.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { comRede, lerResposta } from '@/lib/simuladores/ler-resposta';
import { dataHoraBrasilia } from '@/lib/simuladores/csv';
import { linhasCsvEquipe as csvAtendimento } from '@/components/recepcao/equipe-visao';
import { linhasCsvEquipe as csvVendas } from '@/components/simulador-vendas/painel-equipe';

const MSG = { semCorpo: 'ilegível', generica: 'genérica' };
const html = (status: number) => new Response('<html>502 Bad Gateway</html>', { status, headers: { 'Content-Type': 'text/html' } });
const json = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

describe('lerResposta comum aos simuladores', () => {
  it('HTML do gateway vira a mensagem traduzida, nunca "Unexpected token"', async () => {
    await expect(lerResposta(html(502), MSG)).rejects.toThrow('ilegível');
  });

  it('erro JSON com texto usa o texto do servidor; sem texto, a genérica', async () => {
    await expect(lerResposta(json(409, { error: 'Treino aberto.' }), MSG)).rejects.toThrow('Treino aberto.');
    await expect(lerResposta(json(500, {}), MSG)).rejects.toThrow('genérica');
  });

  it('`traduzir` troca o texto do servidor quando reconhece o corpo', async () => {
    const r = json(429, { error: 'texto em pt-BR', codigo: 'x', limite: 6 });
    await expect(
      lerResposta(r, MSG, (c, status) => (c.codigo === 'x' && status === 429 ? `traduzida ${c.limite}` : null)),
    ).rejects.toThrow('traduzida 6');
    // Sem reconhecer, cai no texto do servidor.
    await expect(lerResposta(json(429, { error: 'do servidor' }), MSG, () => null)).rejects.toThrow('do servidor');
  });

  it('resposta ok devolve o corpo', async () => {
    await expect(lerResposta(json(200, { texto: 'oi' }), MSG)).resolves.toEqual({ texto: 'oi' });
  });

  it('`comRede` troca o TypeError do navegador pela mensagem traduzida e deixa os outros passarem', async () => {
    await expect(comRede(Promise.reject(new TypeError('Failed to fetch')), 'sem conexão')).rejects.toThrow('sem conexão');
    await expect(comRede(Promise.reject(new Error('outro')), 'sem conexão')).rejects.toThrow('outro');
    await expect(comRede(Promise.resolve(1), 'sem conexão')).resolves.toBe(1);
  });

  it('atendimento: equipe, cenários e voz não leem `r.json()` cru', () => {
    for (const arquivo of ['components/recepcao/gestao.tsx', 'components/recepcao/voz.tsx']) {
      const fonte = readFileSync(arquivo, 'utf8');
      expect(fonte, arquivo).not.toMatch(/await r\.json\(\)/);
      expect(fonte, arquivo).toMatch(/lerResposta\(/);
    }
  });
});

describe('CSV da equipe no horário de Brasília', () => {
  // 01:30 UTC do dia 29 = 22:30 do dia 28 em Brasília: o corte em UTC dizia 29.
  const ultimo = '2026-09-29T01:30:00Z';

  it('dataHoraBrasilia converte o ISO em UTC para Brasília', () => {
    expect(dataHoraBrasilia(ultimo)).toBe('2026-09-28 22:30');
    expect(dataHoraBrasilia(null)).toBe('');
    expect(dataHoraBrasilia('não é data')).toBe('');
  });

  it('atendimento exporta a data de Brasília', () => {
    const linhas = csvAtendimento(
      {
        pessoas: [{ id: 'p', nome: 'Ana', cargo: 'Recepção', iniciadas: 2, concluidas: 1, ultimo, competencias: [{ nivelAlcancado: 3 } as any] }],
        competencias: [{ codigo: 'acolhimento', niveis: [0, 0, 1, 0], semNivel: 0 }],
      },
      ['Pessoa', 'Cargo', 'Atendimentos', 'Concluídos', 'Último'],
      (c) => c.toUpperCase(),
    );
    expect(linhas[0]).toEqual(['Pessoa', 'Cargo', 'Atendimentos', 'Concluídos', 'Último', 'ACOLHIMENTO']);
    expect(linhas[1]).toEqual(['Ana', 'Recepção', 2, 1, '2026-09-28 22:30', 3]);
  });

  it('vendas exporta a data de Brasília', () => {
    const linhas = csvVendas(
      {
        pessoas: [{ id: 'p', nome: 'Bia', cargo: null, treinos: 3, concluidos: 2, ultimo, competencias: [{ nivelAlcancado: null } as any] }] as any,
        competencias: [{ codigo: 'P' as any, niveis: [0, 0, 0, 0], semNivel: 1 }],
      },
      ['Pessoa', 'Cargo', 'Treinos', 'Concluídos', 'Último'],
      (c) => `comp ${c}`,
    );
    expect(linhas[0]).toEqual(['Pessoa', 'Cargo', 'Treinos', 'Concluídos', 'Último', 'comp P']);
    expect(linhas[1]).toEqual(['Bia', '', 3, 2, '2026-09-28 22:30', '']);
  });

  it('o histórico do vendas exporta a data por `dataHoraBrasilia`, não o ISO cru', () => {
    const fonte = readFileSync('components/simulador-vendas/gestao.tsx', 'utf8');
    expect(fonte).toMatch(/dataHoraBrasilia\(r\.criadoEm\)/);
  });
});
