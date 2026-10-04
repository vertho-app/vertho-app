import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';
import { semComentarios } from '../../helpers/fonte';
import { readFileSync } from 'node:fs';

/**
 * Lote 5b (04/10/2026): o relatório de RH gerado por IA deixa de ter média.
 *
 * Antes: o prompt recebia `MEDIA GERAL` e, por cargo, `media`, e devolvia
 * `indicadores.media_geral` e `visao_por_cargo[].media_nivel`; o PDF imprimia "Média
 * geral" e "Média: 2.3" por cargo, o painel do RH levava `average` ao navegador sem
 * desenhá-lo. A decisão do dono é que ninguém do cliente vê nota decimal.
 *
 * Aqui se prova as pontas: (1) a leitura dos DOIS formatos que convivem no banco;
 * (2) o que o prompt pede e o que a mensagem do usuário manda; (3) o PDF; (4) o
 * painel e a fronteira do servidor.
 */

const mocks = vi.hoisted(() => ({
  chamadasIA: [] as Array<{ system: string; user: string }>,
  resposta: '{}',
}));

vi.mock('server-only', () => ({}));
vi.mock('@/actions/ai-client', () => ({
  callAI: vi.fn(async (system: string, user: string) => {
    mocks.chamadasIA.push({ system, user });
    return mocks.resposta;
  }),
}));
vi.mock('@/actions/utils', () => ({ extractJSON: async (t: string) => JSON.parse(t) }));
vi.mock('@/lib/rag', () => ({ retrieveContext: vi.fn(async () => []), formatGroundingBlock: () => '' }));
// O PDF do core não precisa ser renderizado de verdade: só o `renderToBuffer` é trocado.
vi.mock('@react-pdf/renderer', async (original) => ({ ...(await original<any>()), renderToBuffer: vi.fn(async () => Buffer.from('%PDF')) }));

const EMPRESA = 'emp-rh-5b';
const PESSOAS = [
  { id: 'p1', nome_completo: 'Ana', cargo: 'Professor', perfil_dominante: 'Alto D' },
  { id: 'p2', nome_completo: 'Bia', cargo: 'Professor', perfil_dominante: 'Alto S' },
  { id: 'p3', nome_completo: 'Caio', cargo: 'Coordenador', perfil_dominante: 'Alto C' },
];
const nivel = (colaborador_id: string, competencia_id: string, n: number, nota_ia4 = n + 0.37) => ({
  colaborador_id, competencia_id, nivel_ia4: n, nota_ia4,
  avaliacao_ia: { consolidacao: { nivel_geral: n } },
});
const RESPOSTAS = [
  nivel('p1', 'c1', 3), nivel('p1', 'c2', 3), nivel('p2', 'c1', 2), nivel('p2', 'c2', 3),
  nivel('p3', 'c1', 1), nivel('p3', 'c2', 2),
];

const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'empresas' ? { nome: 'Empresa 5b', segmento: 'educacao' } : null),
  lista: (tabela, cols) => {
    if (tabela === 'respostas') return RESPOSTAS;
    if (tabela === 'colaboradores' && cols === 'id') return [];
    if (tabela === 'colaboradores') return PESSOAS;
    if (tabela === 'competencias') return [{ id: 'c1', nome: 'Planejamento' }, { id: 'c2', nome: 'Escuta' }];
    return [];
  },
});
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));

import { RELATORIO_RH_SYSTEM } from '@/lib/relatorios/prompts';
import { gerarRelatorioRHCore } from '@/lib/relatorios/gestor-rh-core';
import {
  cargosParaOPrompt, contarNiveis, lerDistribuicao, leituraDoCargo,
  linhasDeNiveisParaOPrompt, nivelDaDistribuicao, nivelGeralDosIndicadores,
} from '@/lib/relatorios/niveis-do-rh';
import { normalizeRhReportInsight, normalizeRhDescriptorAnalysis, normalizeManagerReportInsight } from '@/lib/relatorios/dashboard-insights';
import RelatorioRHPDF from '@/components/pdf/RelatorioRH';

/** Percorre a árvore React expandindo componentes de função (sem hooks) e junta todo o texto. */
function textoDaArvore(no: any, saida: string[] = []): string[] {
  if (no == null || typeof no === 'boolean') return saida;
  if (typeof no === 'string' || typeof no === 'number') { saida.push(String(no)); return saida; }
  if (Array.isArray(no)) { no.forEach((n) => textoDaArvore(n, saida)); return saida; }
  if (React.isValidElement(no)) {
    const { type, props } = no as any;
    if (typeof type === 'function') textoDaArvore((type as any)(props), saida);
    else textoDaArvore(props?.children, saida);
  }
  return saida;
}
const textoDoPdf = (conteudo: any) => textoDaArvore(RelatorioRHPDF({ data: { conteudo }, empresaNome: 'ACME' })).join('');

// Relatório GRAVADO antes do lote 5b (formato de 4 dos 6 relatórios de RH do banco).
const LEGADO = {
  resumo_executivo: { leitura_geral: 'Leitura.', principal_forca_organizacional: 'F', principal_risco_organizacional: 'R' },
  indicadores: { total_avaliados: 24, total_avaliacoes: 120, media_geral: 3.26, pct_nivel_1: 4.17, pct_nivel_2: 15.83, pct_nivel_3: 45, pct_nivel_4: 35 },
  visao_por_cargo: [
    { cargo: 'Representante Comercial', media_nivel: 3.24, principais_forcas: ['a'], principais_riscos: ['b'], leitura: 'x' },
    { cargo: 'Analista Financeiro', media_nivel: 3.17, principais_forcas: ['a'], principais_riscos: ['b'], leitura: 'y' },
  ],
};
// Formato mais antigo ainda (relatório de abril): `media`, `analise`, `ponto_forte`.
const LEGADO_ANTIGO = {
  indicadores: { total_avaliados: 5, total_avaliacoes: 25, media_geral: 2.04, pct_nivel_1: 20, pct_nivel_2: 56, pct_nivel_3: 24, pct_nivel_4: 0 },
  visao_por_cargo: [{ cargo: 'Gerente Comercial', media: 1.7, analise: 'z', ponto_forte: 'p', ponto_critico: 'c' }],
};
// Formato NOVO, o que o prompt de hoje pede.
const NOVO = {
  resumo_executivo: { leitura_geral: 'Leitura.', principal_forca_organizacional: 'F', principal_risco_organizacional: 'R' },
  indicadores: { total_avaliados: 3, total_avaliacoes: 6, nivel_mais_frequente: 3, pct_nivel_1: 16.7, pct_nivel_2: 33.3, pct_nivel_3: 50, pct_nivel_4: 0 },
  visao_por_cargo: [
    { cargo: 'Professor', nivel_mais_frequente: 3, distribuicao: { n1: 0, n2: 1, n3: 3, n4: 0 }, principais_forcas: ['a'], principais_riscos: ['b'], leitura: 'x' },
    { cargo: 'Coordenador', nivel_mais_frequente: 1, distribuicao: { n1: 1, n2: 1, n3: 0, n4: 0 }, principais_forcas: ['a'], principais_riscos: ['b'], leitura: 'y' },
  ],
};

describe('niveis-do-rh: a conta que substitui a média', () => {
  it('conta avaliações por nível e ignora o que não é nível de 1 a 4', () => {
    expect(contarNiveis([1, 2, 2, 3, 3, 3, 4, 0, 5, 2.5, null, undefined])).toEqual({ n1: 1, n2: 2, n3: 3, n4: 1 });
  });

  it('o nível mais frequente: maioria vence, empate vai para o MENOR, ninguém é null (nunca N1)', () => {
    expect(nivelDaDistribuicao({ n1: 1, n2: 2, n3: 3, n4: 1 })).toBe(3);
    expect(nivelDaDistribuicao({ n1: 0, n2: 2, n3: 0, n4: 2 })).toBe(2);
    expect(nivelDaDistribuicao({ n1: 0, n2: 0, n3: 0, n4: 0 })).toBeNull();
    expect(nivelDaDistribuicao(null)).toBeNull();
  });

  it('lerDistribuicao: lixo vira zero, tudo zero ou não-objeto vira null', () => {
    expect(lerDistribuicao({ n1: '2', n2: -3, n3: 'x', n4: 1.6 })).toEqual({ n1: 2, n2: 0, n3: 0, n4: 2 });
    expect(lerDistribuicao({ n1: 0, n2: 0, n3: 0, n4: 0 })).toBeNull();
    expect(lerDistribuicao([1, 2])).toBeNull();
    expect(lerDistribuicao('n1')).toBeNull();
    expect(lerDistribuicao(undefined)).toBeNull();
  });

  it('o nível geral vem dos percentuais, que existem nos dois formatos (a IA não decide)', () => {
    expect(nivelGeralDosIndicadores(LEGADO.indicadores)).toBe(3);
    expect(nivelGeralDosIndicadores(LEGADO_ANTIGO.indicadores)).toBe(2);
    expect(nivelGeralDosIndicadores(NOVO.indicadores)).toBe(3);
    expect(nivelGeralDosIndicadores({ media_geral: 3.2 })).toBeNull();
    expect(nivelGeralDosIndicadores(undefined)).toBeNull();
  });

  describe('leituraDoCargo lê os formatos que convivem no banco', () => {
    it('NOVO: a distribuição manda, e a IA copiando o nível errado não vence a conta', () => {
      const l = leituraDoCargo({ cargo: 'X', nivel_mais_frequente: 4, distribuicao: { n1: 1, n2: 4, n3: 2, n4: 0 } });
      expect(l).toEqual({ nivel: 2, origem: 'frequente', distribuicao: { n1: 1, n2: 4, n3: 2, n4: 0 } });
    });

    it('NOVO sem distribuição: vale o nível declarado, como número, "N2" ou "2"', () => {
      expect(leituraDoCargo({ nivel_mais_frequente: 3 }).nivel).toBe(3);
      expect(leituraDoCargo({ nivel_mais_frequente: 'N2' }).nivel).toBe(2);
      expect(leituraDoCargo({ nivel_mais_frequente: '4' }).nivel).toBe(4);
      expect(leituraDoCargo({ nivel_mais_frequente: 'N7' }).nivel).toBeNull();
      expect(leituraDoCargo({ nivel_mais_frequente: 2.5 }).nivel).toBeNull();
    });

    it('LEGADO (media_nivel e media): sai só o nível da média, marcado como tal; a nota não passa', () => {
      expect(leituraDoCargo({ media_nivel: 3.24 })).toEqual({ nivel: 3, origem: 'media', distribuicao: null });
      expect(leituraDoCargo({ media: 1.7 })).toEqual({ nivel: 1, origem: 'media', distribuicao: null });
      expect(leituraDoCargo({ media_nivel: 3.8 }).nivel).toBe(4);
    });

    it('média ausente, zero ou lixo não vira N1', () => {
      for (const ruim of [{}, { media_nivel: 0 }, { media_nivel: null }, { media_nivel: '' }, { media: 'abc' }, null, 'x']) {
        expect(leituraDoCargo(ruim), JSON.stringify(ruim)).toEqual({ nivel: null, origem: null, distribuicao: null });
      }
    });
  });

  it('cargosParaOPrompt: distribuição por cargo, pessoas distintas, nível pronto, sem média', () => {
    const cargos = cargosParaOPrompt([
      { cargo: 'Professor', colaboradorId: 'p1', nivel: 3 },
      { cargo: 'Professor', colaboradorId: 'p1', nivel: 3 },
      { cargo: 'Professor', colaboradorId: 'p2', nivel: 2 },
      { cargo: 'Coordenador', colaboradorId: 'p3', nivel: 1 },
      { cargo: 'Coordenador', colaboradorId: 'p3', nivel: 0 },
    ]);
    expect(cargos).toEqual([
      { cargo: 'Professor', pessoas: 2, avaliacoes: 3, distribuicao: { n1: 0, n2: 1, n3: 2, n4: 0 }, nivel_mais_frequente: 3 },
      { cargo: 'Coordenador', pessoas: 1, avaliacoes: 1, distribuicao: { n1: 1, n2: 0, n3: 0, n4: 0 }, nivel_mais_frequente: 1 },
    ]);
    expect(JSON.stringify(cargos)).not.toMatch(/media|média/i);
  });

  it('linhasDeNiveisParaOPrompt: nível mais frequente, contagens e percentuais (sem MEDIA)', () => {
    const linhas = linhasDeNiveisParaOPrompt([1, 2, 2, 3, 3, 3]);
    expect(linhas).toContain('NIVEL MAIS FREQUENTE: N3');
    expect(linhas).toContain('DISTRIBUICAO (avaliações por nível): N1=1 N2=2 N3=3 N4=0');
    expect(linhas).toContain('PERCENTUAIS (de 0 a 100): N1=16.7 N2=33.3 N3=50 N4=0');
    expect(linhas).not.toMatch(/MEDIA|média/i);
    expect(linhasDeNiveisParaOPrompt([])).toContain('NIVEL MAIS FREQUENTE: indisponível');
  });
});

describe('prompt do relatório de RH: sem média', () => {
  /** O exemplo do schema é JSON válido de propósito: o teste o lê como o leitor da tela lê. */
  function schema(): any {
    const ini = RELATORIO_RH_SYSTEM.indexOf('FORMATO OBRIGATÓRIO:') + 'FORMATO OBRIGATÓRIO:'.length;
    return JSON.parse(RELATORIO_RH_SYSTEM.slice(ini, RELATORIO_RH_SYSTEM.indexOf('REGRAS:')).trim());
  }

  it('o schema pede nível mais frequente e distribuição, e não pede média em lugar nenhum', () => {
    const s = schema();
    expect(s.indicadores).not.toHaveProperty('media_geral');
    expect(Number.isInteger(s.indicadores.nivel_mais_frequente)).toBe(true);
    expect(s.visao_por_cargo[0]).not.toHaveProperty('media_nivel');
    expect(Number.isInteger(s.visao_por_cargo[0].nivel_mais_frequente)).toBe(true);
    expect(Object.keys(s.visao_por_cargo[0].distribuicao)).toEqual(['n1', 'n2', 'n3', 'n4']);
    expect(RELATORIO_RH_SYSTEM).not.toMatch(/media_geral|media_nivel/);
  });

  it('proíbe média, nota decimal e "X de 4" no texto, e manda copiar o que vem calculado', () => {
    expect(RELATORIO_RH_SYSTEM).toContain('Nunca escreva nota decimal, média, pontuação nem "X de 4"');
    expect(RELATORIO_RH_SYSTEM).toContain('Copie-os: não recalcule');
    expect(RELATORIO_RH_SYSTEM).toContain('empate vai para o menor nível');
    expect(RELATORIO_RH_SYSTEM).toContain('AVALIAÇÕES por nível');
    expect(RELATORIO_RH_SYSTEM).not.toContain('Níveis são NUMÉRICOS');
  });

  it('o que o schema pede chega à tela: o leitor do painel lê o exemplo do PRÓPRIO prompt', () => {
    const lido = normalizeRhReportInsight(schema())!;
    expect(lido.roles[0].level).toBe(2);
    expect(lido.roles[0].distribution).toEqual([
      { level: 1, count: 0 }, { level: 2, count: 3 }, { level: 3, count: 2 }, { level: 4, count: 0 },
    ]);
  });

  it('o texto do prompt não tem travessão', () => {
    expect(RELATORIO_RH_SYSTEM).not.toMatch(new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']'));
  });
});

describe('gerarRelatorioRHCore: o que a IA recebe', () => {
  beforeEach(() => { sb.reset(); mocks.chamadasIA.length = 0; mocks.resposta = JSON.stringify(NOVO); });

  it('a mensagem do usuário não traz média, traz o nível mais frequente e a distribuição por cargo', async () => {
    const r = await gerarRelatorioRHCore(sb.client as any, EMPRESA);
    expect(r.success).toBe(true);
    const [chamada] = mocks.chamadasIA;
    expect(chamada.system).toBe(RELATORIO_RH_SYSTEM);
    const user = chamada.user;
    expect(user).not.toMatch(/MEDIA|média|"media"/i);
    // niveis: 3,3,2,3,1,2 => N3 em 3 de 6
    expect(user).toContain('NIVEL MAIS FREQUENTE: N3');
    expect(user).toContain('DISTRIBUICAO (avaliações por nível): N1=1 N2=2 N3=3 N4=0');
    const porCargo = JSON.parse(user.slice(user.indexOf('POR CARGO:') + 'POR CARGO:'.length, user.indexOf('REGISTROS INDIVIDUAIS:')).trim());
    expect(porCargo).toEqual([
      { cargo: 'Professor', pessoas: 2, avaliacoes: 4, distribuicao: { n1: 0, n2: 1, n3: 3, n4: 0 }, nivel_mais_frequente: 3 },
      { cargo: 'Coordenador', pessoas: 1, avaliacoes: 2, distribuicao: { n1: 1, n2: 1, n3: 0, n4: 0 }, nivel_mais_frequente: 1 },
    ]);
  });

  it('os registros individuais seguem em nível inteiro (nenhuma nota decimal vai à IA)', async () => {
    await gerarRelatorioRHCore(sb.client as any, EMPRESA);
    const user = mocks.chamadasIA[0].user;
    const registros = JSON.parse(user.slice(user.indexOf('REGISTROS INDIVIDUAIS:') + 'REGISTROS INDIVIDUAIS:'.length).trim());
    expect(registros).toHaveLength(6);
    for (const r of registros) expect(Number.isInteger(r.nivel)).toBe(true);
    expect(user).not.toMatch(/\d\.\d{2}/);
  });
});

describe('PDF do relatório de RH: sem "Média"', () => {
  it('relatório NOVO: nível mais frequente geral e por cargo, avaliações por nível, nenhuma média', () => {
    const texto = textoDoPdf(NOVO);
    expect(texto).toMatch(/Nível mais frequente\s*N3/);
    expect(texto).toContain('Professor · Nível mais frequente: N3');
    expect(texto).toContain('Avaliações por nível: N1:0 | N2:1 | N3:3 | N4:0');
    expect(texto).toContain('Coordenador · Nível mais frequente: N1');
    expect(texto).not.toMatch(/M[eé]dia/);
  });

  it('relatório GRAVADO (media_geral e media_nivel): só o nível sai, nenhuma nota decimal', () => {
    const texto = textoDoPdf(LEGADO);
    expect(texto).toMatch(/Nível mais frequente\s*N3/);
    expect(texto).toContain('Representante Comercial · Nível geral: N3');
    expect(texto).toContain('Analista Financeiro · Nível geral: N3');
    expect(texto).not.toMatch(/M[eé]dia/);
    for (const nota of ['3.26', '3.24', '3.17', '3,26', '3,24']) expect(texto, nota).not.toContain(nota);
    // sem distribuição por cargo no formato antigo: a linha simplesmente não existe
    expect(texto).not.toContain('Avaliações por nível');
  });

  it('o relatório mais antigo (`media`, `analise`) também: "Nível geral: N1" e sem "1.7"', () => {
    const texto = textoDoPdf(LEGADO_ANTIGO);
    expect(texto).toContain('Gerente Comercial · Nível geral: N1');
    expect(texto).toMatch(/Nível mais frequente\s*N2/);
    expect(texto).not.toMatch(/M[eé]dia|1\.7|2\.04/);
  });

  it('cargo sem nível nenhum imprime só o nome (nunca "N1" por ausência)', () => {
    const texto = textoDoPdf({ ...NOVO, visao_por_cargo: [{ cargo: 'Cargo Sem Dado', leitura: 'z' }] });
    expect(texto).toContain('Cargo Sem Dado');
    expect(texto).not.toMatch(/Cargo Sem Dado ·/);
  });

  it('percentual somado não vaza ponto flutuante (15.83 + 4.17 = 20, não 20.000000000000004)', () => {
    const texto = textoDoPdf({ indicadores: { total_avaliados: 1, total_avaliacoes: 1, pct_nivel_1: 15.83, pct_nivel_2: 4.17, pct_nivel_3: 15.83, pct_nivel_4: 4.17 } });
    expect(texto).toContain('Nível 3 e Nível 4: 20%');
    expect(texto).not.toMatch(/\d{2}\.\d{6,}/);
  });

  it('a fonte do PDF não chama toFixed nem imprime media_geral/media_nivel (fora de comentário)', () => {
    const fonte = semComentarios(readFileSync('components/pdf/RelatorioRH.tsx', 'utf8'));
    expect(fonte).not.toMatch(/toFixed/);
    expect(fonte).not.toMatch(/media_geral|media_nivel|\.media\b/);
  });
});

describe('o que o navegador recebe do painel do RH e do gestor', () => {
  it('RH, relatório GRAVADO: nenhum `average`, a média do relatório vira só `level`', () => {
    const insight = normalizeRhReportInsight(LEGADO)!;
    expect(insight.roles.map((r) => r.level)).toEqual([3, 3]);
    expect(insight.roles.every((r) => r.distribution === null)).toBe(true);
    expect(insight.indicators).not.toHaveProperty('average');
    const json = JSON.stringify(insight);
    expect(json).not.toContain('average');
    for (const nota of ['3.26', '3.24', '3.17']) expect(json, nota).not.toContain(nota);
  });

  it('RH, relatório NOVO: nível e contagens por nível chegam; o nível sai da distribuição', () => {
    const insight = normalizeRhReportInsight({ ...NOVO, visao_por_cargo: [{ cargo: 'P', nivel_mais_frequente: 4, distribuicao: { n1: 0, n2: 5, n3: 1, n4: 0 } }] })!;
    expect(insight.roles[0].level).toBe(2);
    expect(insight.roles[0].distribution).toEqual([
      { level: 1, count: 0 }, { level: 2, count: 5 }, { level: 3, count: 1 }, { level: 4, count: 0 },
    ]);
  });

  it('o DNA por descritor leva só distribuição: nem a competência nem o descritor têm `average`', () => {
    const dist = { n1: 10, n2: 20, n3: 50, n4: 20 };
    const dna: any = {
      semDados: false, avaliados: 4,
      competencias: [{
        nome: 'Comunicação', media: 3.2, prioridade: false, pct: dist,
        descritores: [{ descritor: 'Escuta', media: 2.87, totalColabs: 4, pct: dist }],
      }],
    };
    const analise = normalizeRhDescriptorAnalysis(dna)!;
    const json = JSON.stringify(analise);
    expect(json).not.toContain('average');
    expect(json).not.toMatch(/3\.2|2\.87/);
    expect(analise.organization.competencies[0].descriptors[0].levels).toHaveLength(4);
  });

  it('gestor: a competência leva a distribuição de pessoas e nenhuma média, mesmo no relatório gravado', () => {
    const insight = normalizeManagerReportInsight({
      analise_por_competencia: [{ competencia: 'Escuta', media_nivel: 2.34, distribuicao: { n1: 1, n2: 3, n3: 2, n4: 0 }, padrao_observado: 'p' }],
    })!;
    expect(insight.competencies[0].distribution.map((d) => d.people)).toEqual([1, 3, 2, 0]);
    expect(insight.competencies[0]).not.toHaveProperty('average');
    expect(JSON.stringify(insight)).not.toMatch(/2\.34|average/);
  });

  it('nenhum tipo do painel declara `average` (a fronteira é o tipo, não o cuidado de quem desenha)', () => {
    const fonte = semComentarios(readFileSync('lib/relatorios/dashboard-insights.ts', 'utf8'));
    expect(fonte).not.toMatch(/\baverage\b/);
    expect(fonte).not.toMatch(/\.media\b|media_geral/);
  });
});
