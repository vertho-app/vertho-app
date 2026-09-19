import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  executarCore,
  resumoAvaliacao,
  validarAvaliacao,
  validarConsequencia,
  visaoPublica,
} from '@/lib/simulador-lideranca/core';
import {
  comandoSchema,
  MAX_TURNOS,
  SAIDAS,
  type Comando,
} from '@/lib/simulador-lideranca/schema';
import { DOSSIÊS } from '@/lib/simulador-lideranca/prompts';
import { linhasDaVariante } from '@/lib/simuladores/lideranca/matriz-global';
import {
  estado,
  episodio,
  avaliacao,
  gerarFixture,
  FALA,
  PLANO,
  REFLEXAO,
} from '../fixtures/simulador-lideranca';
const cmd = (acao: Comando['acao'], extra: object = {}) =>
  comandoSchema.parse({ acao, requestId: randomUUID(), revisao: 0, ...extra });

describe('jornada interativa de liderança', () => {
  it('percorre cinco encontros e carrega os acordos anteriores sem acesso à preparação pelo personagem', async () => {
    let s = estado();
    const calls: Array<[string, unknown]> = [];
    const gerar: typeof gerarFixture = async (etapa, dados, validar) => {
      calls.push([etapa, dados]);
      return gerarFixture(etapa, dados, validar);
    };
    for (let i = 0; i < 5; i++) {
      s = (
        await executarCore(s, cmd(i ? 'avancar' : 'iniciar'), gerar, DOSSIÊS)
      ).estado;
      expect(s.ativo?.indice).toBe(i);
      expect(s.ativo?.antecedentes).toHaveLength(i);
      if (i) expect(s.ativo?.antecedentes[0].acordos[0].trecho).toBe(FALA);
      s = (
        await executarCore(s, cmd('planejar', { texto: PLANO }), gerar, DOSSIÊS)
      ).estado;
      for (let n = 0; n < 3; n++)
        s = (
          await executarCore(
            s,
            cmd('responder', { texto: FALA }),
            gerar,
            DOSSIÊS,
          )
        ).estado;
      const res = await executarCore(
        s,
        cmd('encerrar', { texto: REFLEXAO }),
        gerar,
        DOSSIÊS,
      );
      expect(res.arquivo?.indice).toBe(i);
      s = res.estado;
    }
    expect(visaoPublica(s).concluida).toBe(true);
    expect(s.ativo).toBeNull();
    await expect(
      executarCore(s, cmd('avancar'), gerar, DOSSIÊS),
    ).rejects.toThrow('Jornada concluída');
    for (const [etapa, dados] of calls) {
      if (etapa === 'personagem')
        expect(JSON.stringify(dados)).not.toContain(PLANO);
      if (etapa === 'avaliador') {
        expect(dados).not.toHaveProperty('dossie');
        expect(dados).not.toHaveProperty('antecedentes');
        expect(dados).not.toHaveProperty('consequencia');
      }
    }
  });
  it('repetir preserva a sequência original e usa os antecedentes daquele encontro, sem acontecimentos futuros', async () => {
    const s = estado();
    s.concluidos = [0, 1, 2].map((i) => ({
      ...episodio(i),
      encerradoEm: '2026-09-17T12:30:00Z',
      avaliacao: avaliacao(),
      consequencia: { narrativa: `efeito ${i}`, acordos: [], pendencias: [] },
    }));
    let r = (
      await executarCore(
        s,
        cmd('repetir', { episodio: 1 }),
        gerarFixture,
        DOSSIÊS,
      )
    ).estado;
    expect(r.ativo?.antecedentes).toEqual([s.concluidos[0].consequencia]);
    r.ativo = {
      ...episodio(1),
      id: r.ativo!.id,
      repeticao: true,
      antecedentes: r.ativo!.antecedentes,
    };
    const fim = await executarCore(
      r,
      cmd('encerrar', { texto: REFLEXAO }),
      gerarFixture,
      DOSSIÊS,
    );
    expect(fim.estado.concluidos).toEqual(s.concluidos);
    expect(fim.arquivo?.repeticao).toBe(true);
    const proximo = await executarCore(
      fim.estado,
      cmd('avancar'),
      gerarFixture,
      DOSSIÊS,
    );
    expect(proximo.estado.ativo?.indice).toBe(3);
  });
  it('desistir só vale para REPETIÇÃO, sem chamada paga e sem mexer na jornada original', async () => {
    const s = estado();
    s.concluidos = [0, 1].map((i) => ({
      ...episodio(i),
      encerradoEm: '2026-09-17T12:30:00Z',
      avaliacao: avaliacao(),
      consequencia: { narrativa: `efeito ${i}`, acordos: [], pendencias: [] },
    }));
    s.ativo = { ...episodio(0), repeticao: true };
    const gerar = vi.fn(gerarFixture);
    const r = await executarCore(
      s,
      cmd('abandonar'),
      gerar as unknown as typeof gerarFixture,
      DOSSIÊS,
    );
    expect(r.estado.ativo).toBeNull();
    expect(r.arquivo).toBeNull();
    expect(r.estado.concluidos).toEqual(s.concluidos);
    expect(gerar).not.toHaveBeenCalled();
    // A jornada original não tem volta: o encontro aberto dela não pode ser descartado.
    const original = estado();
    original.ativo = episodio(0);
    await expect(
      executarCore(original, cmd('abandonar'), gerarFixture, DOSSIÊS),
    ).rejects.toThrow('repetição');
  });
  it('não abre encontro futuro nem sobrescreve encontro em andamento', async () => {
    const s = estado();
    await expect(
      executarCore(s, cmd('repetir', { episodio: 1 }), gerarFixture, DOSSIÊS),
    ).rejects.toThrow('já concluídos');
    s.ativo = episodio();
    await expect(
      executarCore(s, cmd('avancar'), gerarFixture, DOSSIÊS),
    ).rejects.toThrow('Conclua');
  });
  it('exige preparação imutável e três rodadas antes da reflexão', async () => {
    const s = estado();
    s.ativo = { ...episodio(), plano: null, mensagens: [] };
    await expect(
      executarCore(s, cmd('responder', { texto: FALA }), gerarFixture, DOSSIÊS),
    ).rejects.toThrow('preparação');
    s.ativo.plano = PLANO;
    await expect(
      executarCore(s, cmd('planejar', { texto: PLANO }), gerarFixture, DOSSIÊS),
    ).rejects.toThrow('já foi registrada');
    await expect(
      executarCore(
        s,
        cmd('encerrar', { texto: REFLEXAO }),
        gerarFixture,
        DOSSIÊS,
      ),
    ).rejects.toThrow('três rodadas');
  });
  it('limita rodadas e não altera o estado se uma geração falha', async () => {
    const s = estado();
    s.ativo = episodio();
    const antes = structuredClone(s);
    const gerar = vi.fn().mockRejectedValue(new Error('rede'));
    await expect(
      executarCore(s, cmd('responder', { texto: FALA }), gerar, DOSSIÊS),
    ).rejects.toThrow('rede');
    expect(s).toEqual(antes);
    s.ativo.mensagens = Array.from({ length: MAX_TURNOS }, (_, i) => ({
      turno: i + 1,
      autor: 'lider',
      texto: FALA,
    }));
    await expect(
      executarCore(s, cmd('responder', { texto: FALA }), gerar, DOSSIÊS),
    ).rejects.toThrow('Conclua sua reflexão');
  });
  it('não conclui se a consequência falha após a avaliação', async () => {
    const s = estado();
    s.ativo = episodio();
    const gerar: typeof gerarFixture = async (e, d, v) => {
      if (e === 'consequencia') throw new Error('falha');
      return gerarFixture(e, d, v);
    };
    await expect(
      executarCore(s, cmd('encerrar', { texto: REFLEXAO }), gerar, DOSSIÊS),
    ).rejects.toThrow('falha');
    expect(s.ativo.avaliacao).toBeNull();
    expect(s.concluidos).toHaveLength(0);
  });
  it('não entrega modelos, prompts, recibos ou antecedentes privados ao navegador', () => {
    const s = estado();
    s.ativo = episodio();
    const p = visaoPublica(s);
    for (const key of ['modelos', 'prompts', 'recibos'])
      expect(p).not.toHaveProperty(key);
    expect(p.ativo).not.toHaveProperty('antecedentes');
  });
});
describe('avaliação ancorada na matriz', () => {
  it('aceita citações reais e calcula média apenas com observações', () => {
    const a = avaliacao(),
      e = episodio(),
      s = estado();
    expect(() => validarAvaliacao(a, e, s.matriz)).not.toThrow();
    const resumo = resumoAvaliacao(a, s.matriz);
    expect(resumo[0]).toMatchObject({
      nota: 3,
      nivel: 3,
      observados: 1,
      total: 6,
    });
    expect(resumo[1]).toMatchObject({ nota: null, nivel: null, observados: 0 });
  });
  it('futuro líder: a devolutiva casa a competência pelo NOME (a matriz dele usa FL0x)', () => {
    // Até 18/09 o casamento era pelo código LD0x e o futuro líder via "0 de 0" nas cinco.
    const matriz = linhasDaVariante('futuro');
    const a = avaliacao();
    a.descritores = matriz.map((d, i) => ({
      ...a.descritores[i],
      codigo: d.cod_desc,
    }));
    const resumo = resumoAvaliacao(a, matriz);
    expect(resumo.map((c) => c.codigo)).toEqual([
      'FL01',
      'FL02',
      'FL03',
      'FL04',
      'FL05',
    ]);
    expect(resumo.every((c) => c.total === 6)).toBe(true);
    expect(resumo[0]).toMatchObject({ nota: 3, nivel: 3, observados: 1 });
  });
  it.each([
    'codigo',
    'citacao',
    'fonte',
    'sem-evidencia',
    'null-evidencia',
    'turno',
  ])('recusa avaliação inválida: %s', (tipo) => {
    const a = avaliacao();
    if (tipo === 'codigo') a.descritores[1].codigo = a.descritores[0].codigo;
    if (tipo === 'citacao')
      a.descritores[0].evidencias[0].trecho = 'texto inventado';
    if (tipo === 'fonte')
      a.descritores[0].evidencias[0] = {
        fonte: 'fala',
        turno: 0,
        trecho: episodio().mensagens[0].texto,
      };
    if (tipo === 'sem-evidencia') a.descritores[0].evidencias = [];
    if (tipo === 'null-evidencia') a.descritores[0].nivel = null;
    if (tipo === 'turno') a.descritores[0].evidencias[0].turno = 1;
    expect(() => validarAvaliacao(a, episodio(), estado().matriz)).toThrow();
  });
  it('recusa acordo apoiado numa fala do personagem', () => {
    expect(() =>
      validarConsequencia(
        {
          narrativa: 'ok',
          acordos: [
            {
              descricao: 'inventado',
              turno: 1,
              trecho: 'Posso trazer os pedidos',
            },
          ],
          pendencias: [],
        },
        episodio(),
      ),
    ).toThrow('Acordo sem');
  });
  it('schemas fechados recusam instruções e identificadores adicionais do cliente', () => {
    expect(
      comandoSchema.safeParse({
        acao: 'iniciar',
        requestId: randomUUID(),
        revisao: 0,
        ownerKey: 'outro',
      }).success,
    ).toBe(false);
    expect(SAIDAS.personagem.safeParse({ fala: 'Olá', nota: 4 }).success).toBe(
      false,
    );
  });
});
