import { describe, expect, it } from 'vitest';
import { catalogoInicial } from '@/lib/recepcao/catalogo';
import { catalogoDesafiador } from '@/lib/recepcao/catalogo-desafiador';
import { catalogoLimites } from '@/lib/recepcao/catalogo-limites';
import { aplicarMatrizAtendimento } from '@/lib/recepcao/matriz-avaliacao';
import { abrirSessao, encerrar, promptAvaliador, promptPaciente } from '@/lib/recepcao/core';
import { DOMINIOS, dominioAtendimento } from '@/lib/recepcao/dominio';
import { COMPETENCIAS_ATENDIMENTO, competenciasAtendimento } from '@/lib/recepcao/matriz';
import { cenarioSchema, type Cenario } from '@/lib/recepcao/schema';
import { descreverMensagem } from '@/lib/recepcao/texto';
import { promptAvaliadorLegado, promptPacienteLegado } from '../fixtures/recepcao-prompts-legado';

/**
 * Domínio por empresa (decisão do dono, 18/09/2026): o motor não fala mais de
 * paciente, secretária e clínica; o segmento do caso fornece os termos. O
 * segmento médico reproduz o texto calibrado byte a byte.
 */
const todos: Cenario[] = [...catalogoInicial, ...catalogoDesafiador, ...catalogoLimites];
// "impaciente" e "secretaria escolar" (o setor, sem acento) não são termo médico.
const MEDICO = /\bpacientes?\b|secretária|\bcl[ií]nic|\bm[eé]dic|\bsintoma|\bconsulta/i;
const noSegmento = (c: Cenario, id: string): Cenario => {
  const d = dominioAtendimento(id);
  return aplicarMatrizAtendimento({
    ...structuredClone(c),
    dominio: id as Cenario['dominio'],
    ocorrenciasCriticas: d.ocorrencias.map((o) => o.id),
    publico: { ...structuredClone(c.publico), escopoAvaliacao: undefined },
  });
};

describe('segmento recepcao_medica: o texto calibrado não muda', () => {
  it('prompt da pessoa simulada idêntico em todos os casos, pessoas e posturas', () => {
    let comparados = 0;
    for (const c of todos)
      for (const pessoa of [c.paciente, ...(c.variantes || [])])
        for (const caso of [c, aplicarMatrizAtendimento(c)]) {
          const x = { ...structuredClone(caso), paciente: pessoa };
          expect(promptPaciente(x)).toBe(promptPacienteLegado(x));
          comparados++;
        }
    expect(comparados).toBeGreaterThanOrEqual(60);
  });

  it('prompt do avaliador idêntico, com e sem matriz, nas duas escalas', () => {
    for (const c of todos) {
      expect(promptAvaliador(c)).toBe(promptAvaliadorLegado(c));
      const m = aplicarMatrizAtendimento(c);
      expect(promptAvaliador(m)).toBe(promptAvaliadorLegado(m));
    }
  });

  it('a matriz do segmento médico é a publicada até 18/09', () => {
    expect(competenciasAtendimento('recepcao_medica')).toEqual(COMPETENCIAS_ATENDIMENTO);
    const pro2 = COMPETENCIAS_ATENDIMENTO.flatMap((c) => c.descritores).find((d) => d.codigo === 'pro2')!;
    expect(pro2.niveis.n1).toBe('Oferece orientação clínica ou toma decisão administrativa fora de sua autorização.');
  });
});

describe('outros segmentos: o motor não fala de saúde', () => {
  const outros = DOMINIOS.filter((d) => d.id !== 'recepcao_medica');

  it.each(outros.map((d) => d.id))('%s: prompts e matriz sem termos médicos', (id) => {
    const c = noSegmento(catalogoLimites[0], id);
    expect(cenarioSchema.safeParse(c).success).toBe(true);
    // A ficha e a rubrica do caso são conteúdo (aqui, um caso médico reaproveitado);
    // o que se confere é o texto do MOTOR, antes delas.
    expect(promptPaciente(c).split('FICHA OPERACIONAL:')[0]).not.toMatch(MEDICO);
    const avaliador = promptAvaliador(c).split('RUBRICA:')[0];
    expect(avaliador).not.toMatch(MEDICO);
    expect(avaliador).toContain(`participante="${dominioAtendimento(id).idAtendente}"`);
    expect(JSON.stringify(competenciasAtendimento(id))).not.toMatch(/orientação clínica/);
    expect(JSON.stringify(c.matriz)).not.toMatch(/orientação clínica/);
  });

  it('segmento desconhecido e ocorrência de outro segmento são recusados', () => {
    const c = catalogoLimites[0];
    expect(cenarioSchema.safeParse({ ...c, dominio: 'oficina' }).success).toBe(false);
    const r = cenarioSchema.safeParse({ ...c, dominio: 'atendimento_loja' });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('fora do segmento');
  });

  it('a revisão da equipe fala de quem atende pelo termo do segmento', () => {
    const h = [
      { id: 'm0', role: 'assistant' as const },
      { id: 'm1', role: 'user' as const },
    ];
    expect(descreverMensagem(h, 'm1', undefined, 'terceira')).toBe('1ª resposta da secretária');
    expect(descreverMensagem(h, 'm1', undefined, 'terceira', 'atendimento_loja')).toBe('1ª resposta da pessoa que atende');
    expect(descreverMensagem(h, 'm0', undefined, 'terceira', 'secretaria_escolar')).toBe('1ª fala da pessoa atendida');
  });
});

describe('avaliador: participantes do segmento e orçamento único de tempo', () => {
  const sessao = (id: string) => {
    const s = abrirSessao(noSegmento(catalogoLimites[0], id), 0);
    s.respostas = 1;
    s.historico.push({ id: 'm1', role: 'user', content: 'Posso ajudar com isso agora.' });
    return s;
  };

  it('o histórico que o avaliador lê usa os ids do segmento', async () => {
    const vistos: string[] = [];
    await expect(
      encerrar(sessao('atendimento_loja'), async (a) => {
        vistos.push(...JSON.parse(a.messages[0].content).map((m: { participante: string }) => m.participante));
        throw new Error('falha simulada');
      }),
    ).rejects.toThrow('falha simulada');
    expect(new Set(vistos)).toEqual(new Set(['pessoa_atendida', 'atendente']));
  });

  it('a correção usa o que sobrou do orçamento; sem 60 s, não há segunda tentativa', async () => {
    let relogio = 0;
    const tetos: number[] = [];
    const gerarLento = (gasto: number) => async (a: { timeoutMs?: number }) => {
      tetos.push(a.timeoutMs!);
      relogio += gasto;
      throw new Error('demorou');
    };
    await expect(encerrar(sessao('recepcao_medica'), gerarLento(200_000), async () => {}, () => relogio)).rejects.toThrow();
    expect(tetos).toEqual([180_000, 70_000]);
    relogio = 0;
    tetos.length = 0;
    await expect(encerrar(sessao('recepcao_medica'), gerarLento(230_000), async () => {}, () => relogio)).rejects.toThrow();
    expect(tetos).toEqual([180_000]);
  });
});
