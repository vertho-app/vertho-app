import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  executarCore,
  resumoAvaliacao,
  diagnosticarAvaliacao,
  gravarAvaliacao,
  sinteseDaJornada,
  linhasDoEncontro,
  competenciasDoEncontro,
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
import { REGRA_COBERTURA } from '@/lib/simuladores/cobertura';
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
        expect(dados).not.toHaveProperty('consequencia');
        // Só os descritores do encontro, e dos antecedentes só acordos e pendências.
        expect((dados as any).matriz).toHaveLength(18);
        expect(JSON.stringify((dados as any).antecedentes)).not.toContain('narrativa');
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
  const linhas0 = () => linhasDoEncontro(estado().matriz, 0);
  it('cada encontro avalia foco + 2 secundárias (18 descritores), foco primeiro', () => {
    expect(competenciasDoEncontro(0)).toEqual([
      'Análise e Diagnóstico de Situações',
      'Comunicação e Conversas de Liderança',
      'Priorização e Tomada de Decisão',
    ]);
    for (let i = 0; i < 5; i++) expect(linhasDoEncontro(estado().matriz, i)).toHaveLength(18);
    // Distribuição equilibrada: cada competência avaliada em 3 dos 5 encontros.
    const contagem = new Map<string, number>();
    for (let i = 0; i < 5; i++)
      for (const c of competenciasDoEncontro(i)) contagem.set(c, (contagem.get(c) ?? 0) + 1);
    expect([...contagem.values()]).toEqual([3, 3, 3, 3, 3]);
  });
  it('aceita citações reais e aplica a regra de cobertura (menos de 4 descritores: sem nível)', () => {
    const e = episodio();
    const gravada = gravarAvaliacao(avaliacao(), e, linhas0());
    expect(gravada.regraCobertura).toBe(REGRA_COBERTURA.versao);
    expect(gravada.descartados).toEqual([]);
    const r = resumoAvaliacao(gravada, estado().matriz, 0);
    expect(r.competencias.map((c) => [c.nome, c.foco])).toEqual([
      ['Análise e Diagnóstico de Situações', true],
      ['Comunicação e Conversas de Liderança', false],
      ['Priorização e Tomada de Decisão', false],
    ]);
    expect(r.competencias[0]).toMatchObject({ observados: 1, total: 6, nota: null, nivel: null, suficiente: false });
    expect(r.media.nota).toBeNull();
  });
  it('com 4 descritores observados a competência ganha nível; a média exige 3 competências', () => {
    const e = episodio();
    const a = avaliacao();
    for (const d of a.descritores.slice(0, 4)) {
      d.nivel = 3;
      d.evidencias = [{ fonte: 'fala', turno: 1, trecho: FALA }];
    }
    const r = resumoAvaliacao(gravarAvaliacao(a, e, linhas0()), estado().matriz, 0);
    expect(r.competencias[0]).toMatchObject({ observados: 4, nota: 3, nivel: 3, suficiente: true });
    expect(r.media).toMatchObject({ nota: null, competencias: 1, suficiente: false });
  });
  it.each(['codigo', 'sem-evidencia', 'null-evidencia', 'faltando'])(
    'erro de ESTRUTURA recusa a avaliação inteira: %s',
    (tipo) => {
      const a = avaliacao();
      const alvo = a.descritores.findIndex((d) => d.nivel !== null);
      if (tipo === 'codigo') a.descritores[1].codigo = a.descritores[0].codigo;
      if (tipo === 'sem-evidencia') a.descritores[alvo].evidencias = [];
      if (tipo === 'null-evidencia') a.descritores[alvo].nivel = null;
      if (tipo === 'faltando') a.descritores.pop();
      expect(() => diagnosticarAvaliacao(a, episodio(), linhas0())).toThrow();
    },
  );
  it.each(['citacao', 'turno', 'fonte-proibida'])(
    'citação ruim em POUCOS descritores rebaixa só esses: %s',
    (tipo) => {
      const a = avaliacao();
      const alvo = a.descritores.findIndex((d) => d.evidencias[0]?.fonte === 'planejamento');
      if (tipo === 'fonte-proibida') {
        // Preparação sustentando um descritor que não é o de preparação e propósito.
        const outro = a.descritores.findIndex((d) => d.nivel === null);
        a.descritores[outro].nivel = 4;
        a.descritores[outro].evidencias = [{ fonte: 'planejamento', turno: 0, trecho: PLANO }];
        const g = gravarAvaliacao(a, episodio(), linhas0());
        expect(g.descartados).toEqual([a.descritores[outro].codigo]);
        expect(g.descritores[outro]).toMatchObject({ nivel: null, evidencias: [] });
        return;
      }
      if (tipo === 'citacao') a.descritores[alvo].evidencias[0].trecho = 'texto inventado';
      if (tipo === 'turno') a.descritores[alvo].evidencias[0].turno = 1;
      const g = gravarAvaliacao(a, episodio(), linhas0());
      expect(g.descartados).toEqual([a.descritores[alvo].codigo]);
      expect(g.descritores[alvo]).toMatchObject({ nivel: null, evidencias: [] });
    },
  );
  it('tipografia não é conteúdo: caixa e pontuação final diferentes ainda contam', () => {
    const a = avaliacao();
    const alvo = a.descritores.findIndex((d) => d.evidencias[0]?.fonte === 'fala');
    a.descritores[alvo].evidencias[0].trecho = FALA.replace('Vamos', 'VAMOS').replace('amanhã e', 'amanhã  e');
    expect(gravarAvaliacao(a, episodio(), linhas0()).descartados).toEqual([]);
  });
  it('citação ruim em MUITOS descritores recusa a avaliação inteira', () => {
    const a = avaliacao();
    for (const d of a.descritores.slice(0, 10)) {
      d.nivel = 3;
      d.evidencias = [{ fonte: 'fala', turno: 1, trecho: 'paráfrase que ninguém disse' }];
    }
    expect(() => diagnosticarAvaliacao(a, episodio(), linhas0())).toThrow('Citação');
  });
  it('futuro líder: a devolutiva casa a competência pelo NOME (a matriz dele usa FL0x)', () => {
    // Até 18/09 o casamento era pelo código LD0x e o futuro líder via "0 de 0" nas cinco.
    const matriz = linhasDaVariante('futuro');
    const g = gravarAvaliacao(avaliacao(0, 'futuro'), episodio(), linhasDoEncontro(matriz, 0));
    const r = resumoAvaliacao(g, matriz, 0);
    expect(r.competencias.map((c) => c.codigo)).toEqual(['FL01', 'FL03', 'FL04']);
    expect(r.competencias.every((c) => c.total === 6)).toBe(true);
    expect(r.competencias[0].observados).toBe(1);
  });
  it('avaliação LEGADA (v1, 30 descritores, sem regra) é lida como foi gerada', () => {
    const matriz = estado().matriz;
    const legada = {
      sintese: 's',
      proximaPratica: 'p',
      descritores: matriz.map((d, i) => ({
        codigo: d.cod_desc,
        nivel: i === 0 ? 3 : null,
        justificativa: 'j',
        evidencias: i === 0 ? [{ fonte: 'planejamento' as const, turno: 0, trecho: PLANO }] : [],
      })),
    };
    const r = resumoAvaliacao(legada, matriz, 0);
    expect(r.competencias).toHaveLength(5);
    expect(r.competencias[0]).toMatchObject({ observados: 1, nota: 3, nivel: 3 });
  });
  it('síntese da jornada: maior nível demonstrado, sem mostrar queda', () => {
    const matriz = estado().matriz;
    const comNivel = (indice: number, nivel: number, quando: string) => {
      const linhas = linhasDoEncontro(matriz, indice);
      const a = avaliacao(indice);
      const foco = linhas[0].cod_comp;
      for (const d of a.descritores.filter((x) => x.codigo.startsWith(foco)).slice(0, 4)) {
        d.nivel = nivel;
        d.evidencias = [{ fonte: 'fala', turno: 1, trecho: FALA }];
      }
      return {
        indice,
        repeticao: false,
        encerradoEm: quando,
        avaliacao: gravarAvaliacao(a, episodio(indice), linhas),
      };
    };
    // Análise é foco no encontro 1 (N2), sobe na 1ª repetição (N3) e cai na 2ª (N2).
    const s = sinteseDaJornada(
      [
        comNivel(0, 2, '2026-09-18T10:00:00Z'),
        { ...comNivel(0, 3, '2026-09-18T11:00:00Z'), repeticao: true },
        { ...comNivel(0, 2, '2026-09-18T12:00:00Z'), repeticao: true },
      ],
      matriz,
      1,
    );
    const analise = s.competencias.find((c) => c.nome === 'Análise e Diagnóstico de Situações')!;
    expect(analise).toMatchObject({ avaliada: 3, comNivel: 3, primeiroNivel: 2, nivelAlcancado: 3, subiu: true });
    expect(s.media.nota).toBeNull(); // só uma competência com nível
    expect(s.concluida).toBe(false);
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
