import { describe, it, expect } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classificarMapeamento, filtroDoLoteDeTemplate, lerMapeamentoProgresso, passaNoFiltroMapeamento, type EstadoMapeamento } from '@/lib/mapeamento-progresso';

/**
 * Andamento do mapeamento: completo / em andamento / não iniciado. Nasceu de uma pergunta da tela de envios (08/10/2026): duas pessoas
 * da 4Life, sem perfil, com 1 de 2 competências respondidas, não apareciam em "Sem perfil + Concluído", e em "Pendente" vinham
 * misturadas com quem nunca abriu. "Concluído" exige TODAS as competências do cargo; quem começou e parou precisava de um estado próprio.
 */
const resp = (colaborador_id: string, competencia_id: string | null, cargo: string | null = 'PROF') => ({ colaborador_id, competencia_id, cargo });
const cen = (cargo: string | null, competencia_id: string | null) => ({ cargo, competencia_id });
const CENARIOS = [cen('PROF', 'c1'), cen('PROF', 'c2'), cen('PROF', 'c2'), cen('COORD', 'c9')];

describe('classificarMapeamento', () => {
  it('todas as competências do cargo: completo; parte delas: em andamento; nenhuma: não iniciado', () => {
    const p = classificarMapeamento([resp('a', 'c1'), resp('a', 'c2'), resp('b', 'c1')], CENARIOS);
    expect(p.estadoDe('a')).toBe('completo');
    expect(p.estadoDe('b')).toBe('andamento');
    expect(p.estadoDe('ninguem')).toBe('nao_iniciado');
  });

  it('o esperado é por CARGO: 1 competência basta para o cargo que só tem 1', () => {
    const p = classificarMapeamento([resp('coord', 'c9', 'COORD'), resp('prof', 'c1', 'PROF')], CENARIOS);
    expect(p.estadoDe('coord')).toBe('completo');
    expect(p.estadoDe('prof')).toBe('andamento');
  });

  it('o retrato da 4Life (08/10): professores com 1 de 2 estão em andamento, coordenação com 1 de 1 está completa', () => {
    const professores = Array.from({ length: 15 }, (_, i) => resp(`prof${i}`, 'c1'));
    const p = classificarMapeamento([...professores, resp('jessica', 'c9', 'COORD'), resp('yasmim', 'c9', 'COORD')], CENARIOS);
    for (let i = 0; i < 15; i++) expect(p.estadoDe(`prof${i}`)).toBe('andamento');
    expect(p.estadoDe('jessica')).toBe('completo');
    expect(p.estadoDe('yasmim')).toBe('completo');
  });

  it('respondeu uma competência a mais do que o cargo espera: continua completo (o que conta é cobrir as esperadas)', () => {
    expect(classificarMapeamento([resp('a', 'c1'), resp('a', 'c2'), resp('a', 'cx')], CENARIOS).estadoDe('a')).toBe('completo');
  });

  it('competência repetida não conta duas vezes', () => {
    expect(classificarMapeamento([resp('a', 'c1'), resp('a', 'c1'), resp('a', 'c1')], CENARIOS).estadoDe('a')).toBe('andamento');
  });

  it('cargo sem nenhum cenário não tem como completar: fica em andamento, nunca completo', () => {
    expect(classificarMapeamento([resp('a', 'c1', 'CARGO_SEM_CENARIO')], CENARIOS).estadoDe('a')).toBe('andamento');
    expect(classificarMapeamento([resp('a', 'c1', 'PROF')], []).estadoDe('a')).toBe('andamento');
  });

  it('linha sem competência (resposta ou cenário) é ignorada: quem só tem isso não começou', () => {
    const p = classificarMapeamento([resp('a', null), resp('b', 'c1'), resp('b', 'c2')], [...CENARIOS, cen('PROF', null)]);
    expect(p.estadoDe('a')).toBe('nao_iniciado');
    expect(p.estadoDe('b')).toBe('completo');
  });

  it('o cargo vem da primeira resposta da pessoa (a regra que já existia)', () => {
    const p = classificarMapeamento([resp('a', 'c9', 'COORD'), resp('a', 'c1', 'PROF')], CENARIOS);
    expect(p.estadoDe('a')).toBe('completo'); // cargo COORD espera só c9
  });
});

describe('passaNoFiltroMapeamento (a tabela que a tela, o e-mail, o magic link e o lote de template usam)', () => {
  const estados: EstadoMapeamento[] = ['completo', 'andamento', 'nao_iniciado'];
  it.each([
    ['completo', [true, false, false]],
    ['andamento', [false, true, false]],
    ['pendente', [false, true, true]], // pendente = tudo o que NÃO é completo: inclui quem nem começou
  ])('filtro %s', (filtro, esperado) => {
    expect(estados.map((e) => passaNoFiltroMapeamento(filtro as string, e))).toEqual(esperado);
  });

  it('em andamento e pendente NÃO são a mesma coisa (era a lacuna: quem começou se confundia com quem nunca abriu)', () => {
    expect(passaNoFiltroMapeamento('pendente', 'nao_iniciado')).toBe(true);
    expect(passaNoFiltroMapeamento('andamento', 'nao_iniciado')).toBe(false);
  });
});

describe('lerMapeamentoProgresso', () => {
  const montar = (opts: { respostas?: any[]; cenarios?: any[] } = {}) => criarSupabaseMock({
    lista: (tabela, _c, cadeia) => {
      const de = cadeia.find((x) => x.metodo === 'range')?.args[0] ?? 0;
      const linhas = tabela === 'respostas' ? (opts.respostas ?? []) : tabela === 'banco_cenarios' ? (opts.cenarios ?? CENARIOS) : [];
      return linhas.slice(de, de + 1000);
    },
  });

  it('lê as duas tabelas COM empresa_id (tenant) e classifica', async () => {
    const sb = montar({ respostas: [resp('a', 'c1'), resp('a', 'c2'), resp('b', 'c1')] });
    const p = await lerMapeamentoProgresso(sb.client, 'e1');
    expect(p.estadoDe('a')).toBe('completo');
    expect(p.estadoDe('b')).toBe('andamento');
    for (const t of ['respostas', 'banco_cenarios']) {
      expect(sb.chamadas.some((c) => c.tabela === t && c.metodo === 'eq' && c.args[0] === 'empresa_id' && c.args[1] === 'e1'), t).toBe(true);
    }
  });

  it('PAGINA: a pessoa cujas respostas estão depois da linha 1.000 não some (o PostgREST corta em 1.000 sem avisar)', async () => {
    const enchimento = Array.from({ length: 1100 }, (_, i) => resp(`x${i}`, 'c1'));
    const sb = montar({ respostas: [...enchimento, resp('do-fim', 'c1'), resp('do-fim', 'c2')] });
    const p = await lerMapeamentoProgresso(sb.client, 'e1');
    expect(p.estadoDe('do-fim')).toBe('completo');
    expect(p.estadoDe('x1099')).toBe('andamento');
    expect(sb.chamadas.filter((c) => c.tabela === 'respostas' && c.metodo === 'range').length).toBe(2);
  });

  it('erro ao ler `respostas` LANÇA (antes virava "ninguém concluiu", e um disparo por "pendente" ia para todo mundo)', async () => {
    const sb = montar();
    sb.falharEm({ tabela: 'respostas', op: 'select', mensagem: 'timeout' });
    await expect(lerMapeamentoProgresso(sb.client, 'e1')).rejects.toThrow(/respostas: timeout/);
  });

  it('erro ao ler `banco_cenarios` LANÇA (sem o esperado, todo mundo viraria "em andamento")', async () => {
    const sb = montar();
    sb.falharEm({ tabela: 'banco_cenarios', op: 'select', mensagem: 'sem acesso' });
    await expect(lerMapeamentoProgresso(sb.client, 'e1')).rejects.toThrow(/cenários: sem acesso/);
  });
});

describe('filtroDoLoteDeTemplate: o valor da caixa vira o filtro do lote de template', () => {
  it('cada valor da caixa', () => {
    expect(filtroDoLoteDeTemplate('todos')).toEqual({});
    expect(filtroDoLoteDeTemplate('completo')).toEqual({ mapeamentoCompleto: true });
    expect(filtroDoLoteDeTemplate('pendente')).toEqual({ mapeamentoCompleto: false });
    expect(filtroDoLoteDeTemplate('andamento')).toEqual({ mapeamentoEmAndamento: true });
  });
  it('"em andamento" NÃO carrega `mapeamentoCompleto` (false seria o "pendente", que inclui quem nem começou)', () => {
    expect(filtroDoLoteDeTemplate('andamento')).not.toHaveProperty('mapeamentoCompleto');
  });
});

describe('a tela de envios', () => {
  const pagina = readFileSync(join(process.cwd(), 'app', 'admin', 'whatsapp', 'page.tsx'), 'utf8');
  it('as DUAS caixas de mapeamento (abas WhatsApp e e-mail/magic link) oferecem "Em andamento"', () => {
    expect(pagina.match(/<option value="andamento">\{t\('filters\.mappingInProgress'\)\}<\/option>/g)).toHaveLength(2);
    expect(pagina.match(/<option value="pendente">/g)).toHaveLength(2);
  });
  it('o filtro do lote de template vem da função da lib (não de uma expressão solta na tela)', () => {
    expect(pagina).toContain("from '@/lib/mapeamento-progresso'");
    expect(pagina).toContain('...filtroDoLoteDeTemplate(filtroMapeamento)');
    expect(pagina).not.toMatch(/mapeamentoCompleto:\s*filtroMapeamento/);
  });
  it('a lista local filtra "em andamento" pelo estado, não pelo booleano de concluído', () => {
    expect(pagina).toMatch(/filtroMapeamento === 'andamento' && c\.estadoMapeamento !== 'andamento'/);
  });
  it('avisa quando o servidor não leu o andamento (estado nulo em todas as linhas)', () => {
    expect(pagina).toContain("c.estadoMapeamento === null");
    expect(pagina.match(/filters\.mappingUnavailable/g)).toHaveLength(2);
  });
});
