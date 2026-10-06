import { describe, it, expect } from 'vitest';
import {
  competenciasQueODuoResolve, montarPrerequisitos, MAX_EXEMPLOS,
  type EntradaPrerequisitos, type PessoaPrereq,
} from '@/lib/pipeline-fluxo/prerequisitos';

/**
 * O painel de pré-requisitos diz, ANTES de gastar, o que falta na base da empresa. Cada item tem três estados que NÃO podem se
 * confundir: ok (conferido), atenção (roda diferente do esperado, ou não deu para medir) e crítico (vai falhar para quem for afetado).
 * O pior erro possível aqui é um "ok" que não mediu nada: por isso há um teste de "não foi possível medir" para cada item.
 */
const PREF_TEXTO_AUDIO = { pref_texto: 5, pref_audio: 4 };       // top 2 = texto, áudio (sem vídeo)
const PREF_VIDEO = { pref_video_curto: 5, pref_texto: 4 };       // top 2 = vídeo, texto

const pessoa = (id: string, over: Partial<PessoaPrereq> & { colab?: Record<string, any> } = {}): PessoaPrereq => ({
  id, nome: `Pessoa ${id}`, cargo: 'CAIXA', modo: 'jornada', competenciasDuo: 2,
  ...over,
  colab: { perfil_dominante: 'D', ...PREF_TEXTO_AUDIO, ...(over.colab || {}) },
});

const entrada = (over: Partial<EntradaPrerequisitos> = {}): EntradaPrerequisitos => ({
  pessoas: [pessoa('p1'), pessoa('p2')],
  cargos: [{ nome: 'CAIXA', foco: ['Rotina'] }],
  moduloBase: [{ cargo: 'CAIXA', competencia: 'Rotina', achou: true }],
  render: { temToken: true, temSnapshot: true, temDatabaseUrl: true },
  ...over,
});

const item = (e: EntradaPrerequisitos, id: string) => montarPrerequisitos(e).itens.find((i) => i.id === id)!;

describe('montarPrerequisitos: o conjunto', () => {
  it('tudo conferido: 5 itens ok, nenhum crítico nem atenção, nenhum "como resolver"', () => {
    const r = montarPrerequisitos(entrada());
    expect(r.itens.map((i) => i.id).sort()).toEqual(['disc', 'modulo-base', 'preferencias', 'programa', 'render']);
    expect(r.itens.every((i) => i.gravidade === 'ok' && i.comoResolver === null && i.quantidade === 0)).toBe(true);
    expect(r).toMatchObject({ criticos: 0, atencoes: 0 });
  });

  it('os contadores somam por gravidade', () => {
    const r = montarPrerequisitos(entrada({
      moduloBase: [{ cargo: 'CAIXA', competencia: 'Rotina', achou: false }],           // crítico
      pessoas: [pessoa('p1', { colab: { perfil_dominante: null } }), pessoa('p2')],    // DISC: atenção
    }));
    expect(r).toMatchObject({ criticos: 1, atencoes: 1 });
  });
});

describe('1) módulo-base', () => {
  it('par sem módulo: crítico, com o cargo e a competência no exemplo', () => {
    const r = item(entrada({ moduloBase: [{ cargo: 'CAIXA', competencia: 'Rotina', achou: false }, { cargo: 'GERENTE', competencia: 'Metas', achou: true }] }), 'modulo-base');
    expect(r).toMatchObject({ gravidade: 'critico', quantidade: 1, exemplos: ['CAIXA: Rotina'] });
    expect(r.resumo).toMatch(/1 competência foco sem módulo-base publicado \(de 2\)/);
    expect(r.comoResolver).toMatch(/catálogo de módulos/);
  });

  it('exemplos limitados, quantidade completa', () => {
    const pares = Array.from({ length: MAX_EXEMPLOS + 3 }, (_, i) => ({ cargo: 'C', competencia: `K${i}`, achou: false }));
    const r = item(entrada({ moduloBase: pares }), 'modulo-base');
    expect(r.quantidade).toBe(MAX_EXEMPLOS + 3);
    expect(r.exemplos).toHaveLength(MAX_EXEMPLOS);
  });

  it('nenhum par (ninguém com foco): atenção, NÃO ok', () => {
    const r = item(entrada({ moduloBase: [] }), 'modulo-base');
    expect(r.gravidade).toBe('atencao');
    expect(r.resumo).toMatch(/não há módulo-base a conferir/);
  });

  it('falha ao consultar: atenção "não foi possível medir", NUNCA ok', () => {
    const r = item(entrada({ moduloBase: { erro: 'rede' } }), 'modulo-base');
    expect(r).toMatchObject({ gravidade: 'atencao' });
    expect(r.resumo).toMatch(/Não foi possível medir: rede/);
  });
});

describe('2) DISC', () => {
  it('parte sem DISC: atenção, com quantos e quem', () => {
    const r = item(entrada({ pessoas: [pessoa('a', { colab: { perfil_dominante: null } }), pessoa('b'), pessoa('c', { colab: { perfil_dominante: '' } })] }), 'disc');
    expect(r).toMatchObject({ gravidade: 'atencao', quantidade: 2 });
    expect(r.exemplos).toEqual(['Pessoa a', 'Pessoa c']);
    expect(r.resumo).toMatch(/2 de 3 pessoas sem DISC/);
    expect(r.resumo).toMatch(/FORA do Kit, do vídeo e da saudação/);
  });

  it('ninguém com DISC: crítico (o Kit inteiro fica vazio)', () => {
    const r = item(entrada({ pessoas: [pessoa('a', { colab: { perfil_dominante: null } }), pessoa('b', { colab: { perfil_dominante: undefined } })] }), 'disc');
    expect(r.gravidade).toBe('critico');
    expect(r.resumo).toMatch(/Ninguém no escopo tem DISC/);
  });

  it('perfil só com espaços conta como sem DISC', () => {
    expect(item(entrada({ pessoas: [pessoa('a', { colab: { perfil_dominante: '   ' } }), pessoa('b')] }), 'disc').quantidade).toBe(1);
  });

  it('falha ao ler os colaboradores: não medido (atenção), nunca ok', () => {
    const r = item(entrada({ colaboradoresErro: 'colaboradores: timeout' }), 'disc');
    expect(r.gravidade).toBe('atencao');
    expect(r.resumo).toMatch(/timeout/);
  });

  it('escopo vazio: atenção', () => {
    expect(item(entrada({ pessoas: [] }), 'disc').gravidade).toBe('atencao');
  });
});

describe('3) programa × competências do cargo', () => {
  it('Jornada: ok, e diz o programa efetivo por pessoa', () => {
    const r = item(entrada(), 'programa');
    expect(r.gravidade).toBe('ok');
    expect(r.resumo).toMatch(/Jornada \(2\)/);
  });

  it('DUO com o cargo resolvendo menos de 2: crítico, conta PESSOAS e nomeia o cargo', () => {
    const r = item(entrada({ pessoas: [pessoa('a', { modo: 'regular_duo', competenciasDuo: 1 }), pessoa('b', { modo: 'regular_duo', competenciasDuo: 1 }), pessoa('c')] }), 'programa');
    expect(r).toMatchObject({ gravidade: 'critico', quantidade: 2 });
    expect(r.resumo).toMatch(/2 pessoas estão em programa DUO/);
    expect(r.resumo).toMatch(/DUO indisponível/);
    expect(r.exemplos).toEqual(['CAIXA: 2 pessoas, o cargo resolve 1 competência(s)']);
    expect(r.comoResolver).toMatch(/Jornada/);
  });

  it('DUO com 2 competências resolvidas: ok, e avisa que a avaliação das duas fica para a trilha', () => {
    const r = item(entrada({ pessoas: [pessoa('a', { modo: 'regular_duo', competenciasDuo: 2 })] }), 'programa');
    expect(r.gravidade).toBe('ok');
    expect(r.resumo).toMatch(/Regular DUO \(1\)/);
    expect(r.resumo).toMatch(/etapa da trilha/);
  });

  it('só quem está em DUO conta: pessoa em Jornada com poucas competências NÃO é problema', () => {
    const r = item(entrada({ pessoas: [pessoa('a', { modo: 'jornada', competenciasDuo: 0 }), pessoa('b', { modo: 'onboarding', competenciasDuo: 0 })] }), 'programa');
    expect(r.gravidade).toBe('ok');
  });

  it('dois cargos curtos viram dois exemplos', () => {
    const r = item(entrada({ pessoas: [pessoa('a', { modo: 'regular_duo', competenciasDuo: 1, cargo: 'CAIXA' }), pessoa('b', { modo: 'regular_duo', competenciasDuo: 0, cargo: 'GERENTE' })] }), 'programa');
    expect(r.quantidade).toBe(2);
    expect(r.exemplos).toHaveLength(2);
  });

  it('falha ao ler o programa: não medido (atenção), mesmo havendo gente em DUO curto', () => {
    const r = item(entrada({ programaErro: 'turma_membros: x', pessoas: [pessoa('a', { modo: 'regular_duo', competenciasDuo: 1 })] }), 'programa');
    expect(r.gravidade).toBe('atencao');
    expect(r.resumo).toMatch(/Não foi possível medir: turma_membros: x/);
  });
});

describe('competenciasQueODuoResolve (mesma ordem de gerarTemporadaRegularDuo)', () => {
  it.each([
    ['foco com 2', { foco: ['A', 'B'], top10Nomes: [] }, 2],
    ['foco com 3 (o DUO usa 2)', { foco: ['A', 'B', 'C'], top10Nomes: [] }, 2],
    ['foco 1, sem mais nada', { foco: ['A'], top10Nomes: [] }, 1],
    ['sem foco, sem mais nada', { foco: [], top10Nomes: [] }, 0],
    ['foco 1 + competencias_regular_duo da config com 2', { foco: ['A'], regularDuo: ['X', 'Y'], top10Nomes: [] }, 2],
    ['foco 1 + config com 1 só', { foco: ['A'], regularDuo: ['X'], top10Nomes: [] }, 1],
    ['config que não é lista é ignorada', { foco: ['A'], regularDuo: 'X,Y', top10Nomes: [] }, 1],
    ['foco 1 + top 10 traz outra competência', { foco: ['A'], top10Nomes: ['B'] }, 2],
    ['foco 1 + top 10 só repete a do foco', { foco: ['A'], top10Nomes: ['A'] }, 1],
    ['sem foco + top 10 com 2 diferentes', { foco: [], top10Nomes: ['A', 'B', 'C'] }, 2],
  ])('%s', (_nome, entradaDuo, esperado) => {
    expect(competenciasQueODuoResolve(entradaDuo as any)).toBe(esperado);
  });
});

describe('4) preferências', () => {
  it('quem não respondeu: atenção, com quantos, quem e o que acontece', () => {
    const r = item(entrada({ pessoas: [pessoa('a', { colab: { pref_texto: 0, pref_audio: 0, pref_video_curto: 0, pref_video_longo: 0, pref_estudo_caso: 0 } }), pessoa('b')] }), 'preferencias');
    expect(r).toMatchObject({ gravidade: 'atencao', quantidade: 1, exemplos: ['Pessoa a'] });
    expect(r.resumo).toMatch(/1 de 2 pessoas não responderam/);
    expect(r.resumo).toMatch(/texto \+ estudo de caso, sem vídeo nem podcast/);
  });

  it('todas responderam: ok', () => {
    expect(item(entrada(), 'preferencias').gravidade).toBe('ok');
  });

  it('a régua é a do Kit: só as 5 colunas do kit contam como resposta', () => {
    const r = item(entrada({ pessoas: [pessoa('a', { colab: { pref_texto: 0, pref_audio: 0, pref_infografico: 5 } })] }), 'preferencias');
    expect(r.quantidade).toBe(1);
  });

  it('falha ao ler os colaboradores: não medido, nunca ok', () => {
    expect(item(entrada({ colaboradoresErro: 'colaboradores: x' }), 'preferencias').gravidade).toBe('atencao');
  });
});

describe('5) render (vídeo)', () => {
  const comVideo = [pessoa('a', { colab: PREF_VIDEO }), pessoa('b')];

  it('ninguém com vídeo no top 2: ok, MESMO sem nenhuma variável de render (não há o que renderizar)', () => {
    const r = item(entrada({ render: { temToken: false, temSnapshot: false, temDatabaseUrl: false } }), 'render');
    expect(r.gravidade).toBe('ok');
    expect(r.resumo).toMatch(/não há vídeo a renderizar/);
  });

  it('vídeo no top 2 e variável faltando: atenção, nomeando a variável', () => {
    const r = item(entrada({ pessoas: comVideo, render: { temToken: true, temSnapshot: false, temDatabaseUrl: true } }), 'render');
    expect(r).toMatchObject({ gravidade: 'atencao', quantidade: 1, exemplos: ['RENDER_SNAPSHOT_ID'] });
    expect(r.resumo).toMatch(/Trigger\.dev/);
  });

  it('as três ausentes: três nomes', () => {
    const r = item(entrada({ pessoas: comVideo, render: { temToken: false, temSnapshot: false, temDatabaseUrl: false } }), 'render');
    expect(r.exemplos).toEqual(['HCLOUD_TOKEN', 'RENDER_SNAPSHOT_ID', 'DATABASE_URL']);
  });

  it('vídeo no top 2 e tudo presente: ok, sem prometer o que não vê (as envs do Trigger)', () => {
    const r = item(entrada({ pessoas: comVideo }), 'render');
    expect(r.gravidade).toBe('ok');
    expect(r.resumo).toMatch(/não são visíveis daqui/);
  });

  it('falha ao ler os colaboradores: não medido (não dá para saber quem tem vídeo)', () => {
    expect(item(entrada({ colaboradoresErro: 'x' }), 'render').gravidade).toBe('atencao');
  });
});
