import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { montarVereditos, resumoComVereditos, lerVereditos, temPendencia } from '@/lib/pipeline-fluxo/vereditos';
import { seloComVeredito } from '@/lib/pipeline-fluxo/selo-etapa';
import { CORTE_RETENCAO_PDI_REPROVADO } from '@/lib/relatorios/pdi-retido';

/**
 * Pedido do dono (16/10/2026): "na tela aparece tudo verde concluído... falsa impressão de estar ok quando na verdade
 * tem coisa não aprovada (PDI por exemplo)". Na Amazon, "PDI ok 14/14" com os 14 reprovados e retidos, e "auditoria
 * do blueprint ok 14/14" com 10 reprovados. Gerado não é aprovado: a tela passa a ler o veredito de cada auditoria.
 */
const DEPOIS = '2026-10-16T18:00:00.000Z';
const ANTES = '2026-09-01T12:00:00.000Z';
it('as datas do teste ficam dos dois lados do corte da retenção', () => {
  expect(DEPOIS >= CORTE_RETENCAO_PDI_REPROVADO && ANTES < CORTE_RETENCAO_PDI_REPROVADO).toBe(true);
});

const entrada = () => ({
  pessoas: [
    { id: 'ana', nome: 'Ana', competenciaTrilha: 'Rotina' },
    { id: 'bia', nome: 'Bia', competenciaTrilha: 'Simplicidade' },
    { id: 'caio', nome: 'Caio', competenciaTrilha: 'Rotina' },
  ],
  respostas: [
    { colaborador_id: 'ana', competencia_nome: 'Rotina', status_ia4: 'revisar' },
    { colaborador_id: 'ana', competencia_nome: 'Foco', status_ia4: 'aprovado_com_ajustes' },
    { colaborador_id: 'bia', competencia_nome: 'Simplicidade', status_ia4: 'aprovado' },
    { colaborador_id: 'bia', competencia_nome: 'Rotina', status_ia4: 'revisar' },
    { colaborador_id: 'caio', competencia_nome: 'Rotina', status_ia4: null },
    { colaborador_id: 'fora-do-escopo', competencia_nome: 'Rotina', status_ia4: 'revisar' },
  ],
  blueprints: [
    { colaborador_id: 'ana', auditado: true, ok: true },
    { colaborador_id: 'bia', auditado: true, ok: false },
    { colaborador_id: 'caio', auditado: false, ok: false },
  ],
  pdis: [
    { colaborador_id: 'ana', status: 'fail', gerado_em: DEPOIS },
    { colaborador_id: 'bia', status: 'warn', gerado_em: DEPOIS },
    { colaborador_id: 'caio', status: 'pass', gerado_em: DEPOIS },
  ],
});

describe('montarVereditos', () => {
  it('conta, por etapa, aprovado, não aprovado e sem veredito, com as réguas que já existem', () => {
    const { porEtapa } = montarVereditos(entrada());
    expect(porEtapa.ia4).toMatchObject({ aprovados: 2, naoAprovados: 2, semVeredito: 1, pessoas: ['Ana', 'Bia', 'Caio'] });
    expect(porEtapa.auditoria).toMatchObject({ aprovados: 1, naoAprovados: 1, semVeredito: 1, pessoas: ['Bia', 'Caio'] });
    expect(porEtapa.pdi).toMatchObject({ aprovados: 2, naoAprovados: 1, semVeredito: 0, pessoas: ['Ana'] });
    expect(porEtapa.pdi.rotulo).toMatch(/2 liberado\(s\), 1 reprovado\(s\) e retido\(s\)/);
  });

  it('pendência da pessoa: a IA4 só conta na competência da TRILHA dela; blueprint e PDI sempre', () => {
    const { pendencias } = montarVereditos(entrada());
    const de = (n: string) => pendencias.find((p) => p.nome === n)?.itens || [];
    expect(de('Ana')).toEqual(['avaliação da IA4 da competência da trilha em "revisar"', 'PDI reprovado pela auditoria (retido: a pessoa não vê)']);
    expect(de('Bia')).toEqual(['blueprint reprovado na auditoria']); // o "revisar" dela é em Rotina, fora da trilha
    expect(de('Caio')).toEqual(['avaliação da IA4 da competência da trilha sem check', 'blueprint sem auditoria']);
  });

  it('PDI reprovado ANTES do corte da retenção (R-60) não está retido: conta como liberado', () => {
    const e = entrada();
    e.pdis[0] = { colaborador_id: 'ana', status: 'fail', gerado_em: ANTES };
    expect(montarVereditos(e).porEtapa.pdi).toMatchObject({ aprovados: 3, naoAprovados: 0 });
  });

  it('tudo aprovado: nenhuma pendência e nenhum selo de atenção', () => {
    const v = montarVereditos({
      pessoas: [{ id: 'a', nome: 'A', competenciaTrilha: 'X' }],
      respostas: [{ colaborador_id: 'a', competencia_nome: 'X', status_ia4: 'aprovado_com_ajustes' }],
      blueprints: [{ colaborador_id: 'a', auditado: true, ok: true }],
      pdis: [{ colaborador_id: 'a', status: 'warn', gerado_em: DEPOIS }],
    });
    expect(v.pendencias).toEqual([]);
    expect(Object.values(v.porEtapa).some((x) => temPendencia(x))).toBe(false);
  });
});

describe('seloComVeredito: gerado não é aprovado', () => {
  const pend = { naoAprovados: 1, semVeredito: 0 };
  it('"passou" e "sem ação" com algo não aprovado viram "atenção"', () => {
    expect(seloComVeredito('passou', pend)).toBe('atencao');
    expect(seloComVeredito('neutro', { naoAprovados: 0, semVeredito: 2 })).toBe('atencao');
  });
  it('sem pendência (ou sem veredito para a etapa) o selo fica como estava', () => {
    expect(seloComVeredito('passou', { naoAprovados: 0, semVeredito: 0 })).toBe('passou');
    expect(seloComVeredito('passou', undefined)).toBe('passou');
  });
  it('rodando, aguardando e falhou não são trocados', () => {
    expect(seloComVeredito('rodando', pend)).toBe('rodando');
    expect(seloComVeredito('falhou', pend)).toBe('falhou');
  });
});

describe('resumoComVereditos: "x de Y" só conta quem tem tudo aprovado', () => {
  it('quem era completo e tem pendência sai da conta e entra na lista; quem já faltava ganha o motivo junto', () => {
    const r = resumoComVereditos(
      { completas: 3, incompletas: [{ nome: 'Dan', faltam: ['Trilha: falhou'] }] },
      [{ nome: 'Ana', itens: ['PDI reprovado'] }, { nome: 'Dan', itens: ['blueprint reprovado na auditoria'] }],
    );
    expect(r.completas).toBe(2);
    expect(r.incompletas).toEqual([
      { nome: 'Dan', faltam: ['Trilha: falhou', 'blueprint reprovado na auditoria'] },
      { nome: 'Ana', faltam: ['PDI reprovado'] },
    ]);
  });
  it('sem pendências, nada muda', () => {
    const base = { completas: 2, incompletas: [] };
    expect(resumoComVereditos(base, [])).toBe(base);
  });
});

describe('lerVereditos', () => {
  function bancoFalso(linhas: Record<string, any[]>, falhar?: string) {
    const from = (tabela: string) => {
      const q: any = {
        select: () => q, in: () => q, not: () => q, eq: () => q, is: () => q, order: () => q, or: () => q, neq: () => q, filter: () => q,
        range: (de: number) => Promise.resolve(falhar === tabela ? { data: null, error: { message: 'boom' } } : { data: de === 0 ? (linhas[tabela] || []) : [], error: null }),
      };
      return q;
    };
    return { from, raw: { from } };
  }
  const linhas = {
    colaboradores: [{ id: 'ana', nome_completo: 'Ana', email: 'ana@x.com', foco_individual: ['Rotina'] }],
    respostas: [{ colaborador_id: 'ana', competencia_nome: 'Rotina', status_ia4: 'aprovado' }],
    development_blueprints: [
      { colaborador_id: 'ana', gerado_em: '2026-10-01', auditado_em: '2026-10-01', ok: 'false' },
      { colaborador_id: 'ana', gerado_em: '2026-10-16', auditado_em: '2026-10-16', ok: 'true' },
    ],
    relatorios: [{ colaborador_id: 'ana', gerado_em: DEPOIS, status: 'pass' }],
    trilhas: [],
  };

  it('usa o blueprint MAIS RECENTE e cai na competência própria quando não há trilha', async () => {
    const r = await lerVereditos(bancoFalso(linhas), { permitidos: null });
    expect(r.error).toBeUndefined();
    expect(r.vereditos!.porEtapa.auditoria).toMatchObject({ aprovados: 1, naoAprovados: 0 });
    expect(r.vereditos!.pendencias).toEqual([]);
  });

  it('erro de leitura volta como erro (a tela diz que não leu, não pinta de verde)', async () => {
    for (const t of ['colaboradores', 'respostas', 'development_blueprints', 'relatorios', 'trilhas']) {
      const r = await lerVereditos(bancoFalso(linhas, t), { permitidos: null });
      expect(r.vereditos).toBeUndefined();
      expect(r.error).toBeTruthy();
    }
  });

  it('do PDI lê só o veredito, não o documento inteiro', () => {
    const fonte = readFileSync(join(process.cwd(), 'lib', 'pipeline-fluxo', 'vereditos.ts'), 'utf8');
    expect(fonte).toContain("status:conteudo->auditoria->>status");
    expect(fonte).not.toMatch(/from\('relatorios'\)[\s\S]{0,80}select\('[^']*\bconteudo\b,/);
  });
});

describe('a tela usa os vereditos', () => {
  const pagina = readFileSync(join(process.cwd(), 'app', 'admin', 'empresas', '[empresaId]', 'fluxo', 'page.tsx'), 'utf8');
  it('o selo de cada linha passa pelo veredito, e sem conseguir ler a etapa auditada não fica verde', () => {
    expect(pagina).toMatch(/seloComVeredito\(seloDaEtapa\(e, \{ dryRun: fluxo\.dryRun[^)]*\}\), vereditoOuDuvida\(e\.id\)\)/);
    expect(pagina).toMatch(/vereditosErro && ETAPAS_COM_VEREDITO\.includes\(id\)/);
  });
  it('os dois resumos de pessoas descontam as pendências e recebem o erro de leitura', () => {
    expect((pagina.match(/\{\.\.\.resumoComVereditos\(/g) || []).length).toBe(2);
    expect((pagina.match(/vereditosErro=\{vereditosErro\}/g) || []).length).toBe(2);
    expect(pagina).toContain('o fluxo inteiro e aprovado');
  });
});
