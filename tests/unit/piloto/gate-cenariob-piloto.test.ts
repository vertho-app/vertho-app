import { describe, it, expect } from 'vitest';
import { gateAcumuladaPiloto } from '@/lib/season-engine/trilha-runtime';
import { escolherCenarioB, escolherEntreCandidatos, cenarioBUsavel, competenciasCobertas } from '@/lib/season-engine/cenario-b';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

// ── B2: gate da acumulada do piloto ────────────────────────────────────────
describe('gateAcumuladaPiloto (B2)', () => {
  const NOW = 1_000_000_000_000;
  const isoAtras = (min: number) => new Date(NOW - min * 60_000).toISOString();

  it("status 'done' → pronto, sem redisparar", () => {
    expect(gateAcumuladaPiloto({ acumulada_status: 'done' }, NOW)).toEqual({ pronto: true, redisparar: false });
  });

  it("'processing' RECENTE → não pronto, aguarda (não redispara)", () => {
    expect(gateAcumuladaPiloto({ acumulada_status: 'processing', acumulada_started_at: isoAtras(1) }, NOW))
      .toEqual({ pronto: false, redisparar: false });
  });

  it("'processing' STALE (>5min) → não pronto, redispara (self-heal)", () => {
    expect(gateAcumuladaPiloto({ acumulada_status: 'processing', acumulada_started_at: isoAtras(6) }, NOW))
      .toEqual({ pronto: false, redisparar: true });
  });

  it("'error' → não pronto, redispara", () => {
    expect(gateAcumuladaPiloto({ acumulada_status: 'error' }, NOW)).toEqual({ pronto: false, redisparar: true });
  });

  it('sem row / status null → não pronto, redispara (nunca disparou)', () => {
    expect(gateAcumuladaPiloto(null, NOW)).toEqual({ pronto: false, redisparar: true });
    expect(gateAcumuladaPiloto({ acumulada_status: null }, NOW)).toEqual({ pronto: false, redisparar: true });
  });
});

// ── B1 (18/09/2026): o Cenário B tem que ser da competência da trilha ──────
const iso = (dia: number) => `2026-09-${String(dia).padStart(2, '0')}T12:00:00Z`;
const PERGUNTAS = { p1: 'P1', p2: 'P2', p3: 'P3', p4: 'P4' };
const B = (id: string, cargo: string, competencia_id: string | null, dia: number, extra: Record<string, unknown> = {}) => ({
  id, titulo: `t-${id}`, descricao: `desc ${id}`, cargo, competencia_id, created_at: iso(dia),
  alternativas: { ...PERGUNTAS, ...extra },
});
const cand = (row: any, cobertas: string[]) => ({ ...row, cobertas });

describe('escolherEntreCandidatos: a régua pura', () => {
  it('Macaé: dois B no cargo Diretor, um por competência. Serve o da trilha, não o mais recente', () => {
    const conflitos = cand(B('b-c007', 'Diretor(a) Escolar', 'c007', 1), ['gerenciamento de conflitos']);
    const juridica = cand(B('b-c014', 'Diretor(a) Escolar', 'c014', 10), ['consciência organizacional e jurídica']);
    const r = escolherEntreCandidatos([juridica, conflitos], ['GERENCIAMENTO DE CONFLITOS'], 'Diretor(a) Escolar');
    expect(r?.id).toBe('b-c007');
  });

  it('nenhum B da competência: null, nunca o B de outra competência', () => {
    const outra = cand(B('b-outra', 'Diretor(a) Escolar', 'c014', 10), ['consciência organizacional e jurídica']);
    expect(escolherEntreCandidatos([outra], ['Gerenciamento de Conflitos'], 'Diretor(a) Escolar')).toBeNull();
  });

  it('Ibipeba (duas competências): o integrador que cobre as duas vence; o de uma só não é elegível', () => {
    const single = cand(B('b-single', 'Gestão Escolar', 'x', 20), ['planejamento e organização']);
    const integrador = cand(B('b-int', 'Gestão Escolar', 'x', 1), ['planejamento e organização', 'autocuidado e resiliência emocional']);
    const r = escolherEntreCandidatos(
      [single, integrador],
      ['Planejamento e Organização', 'Autocuidado e resiliência emocional'],
      'Gestão Escolar',
    );
    expect(r?.id).toBe('b-int');
  });

  it('Jornada de uma competência: o B dela vence o integrador que também a cobre', () => {
    const integrador = cand(B('b-int', 'Gestão Escolar', 'x', 20), ['planejamento e organização', 'autocuidado e resiliência emocional']);
    const proprio = cand(B('b-proprio', 'Gestão Escolar', 'x', 1), ['planejamento e organização']);
    expect(escolherEntreCandidatos([integrador, proprio], ['Planejamento e Organização'], 'Gestão Escolar')?.id).toBe('b-proprio');
  });

  it("cargo específico vence 'todos' da mesma competência; 'todos' serve quando o cargo não tem", () => {
    const todos = cand(B('b-todos', 'todos', 'x', 20), ['negociação']);
    const doCargo = cand(B('b-cargo', 'Vendedor', 'x', 1), ['negociação']);
    expect(escolherEntreCandidatos([todos, doCargo], ['Negociação'], 'Vendedor')?.id).toBe('b-cargo');
    expect(escolherEntreCandidatos([todos], ['Negociação'], 'Vendedor')?.id).toBe('b-todos');
  });

  it('empate: o mais recente', () => {
    const velho = cand(B('b-velho', 'Vendedor', 'x', 1), ['negociação']);
    const novo = cand(B('b-novo', 'Vendedor', 'x', 9), ['negociação']);
    expect(escolherEntreCandidatos([velho, novo], ['Negociação'], 'Vendedor')?.id).toBe('b-novo');
  });

  it('trilha sem competência: null', () => {
    const b = cand(B('b', 'Vendedor', 'x', 1), ['negociação']);
    expect(escolherEntreCandidatos([b], ['', null as any], 'Vendedor')).toBeNull();
  });
});

describe('cenarioBUsavel e competenciasCobertas', () => {
  it('B sem texto ou sem nenhuma pergunta não serve', () => {
    expect(cenarioBUsavel({ descricao: '  ', alternativas: PERGUNTAS })).toBe(false);
    expect(cenarioBUsavel({ descricao: 'texto', alternativas: {} })).toBe(false);
    expect(cenarioBUsavel({ descricao: 'texto', alternativas: { p3: 'só uma' } })).toBe(true);
  });

  it('cobre a âncora (pelo nome) e as integradas, normalizadas', () => {
    const nomes = new Map([['c1', '  Planejamento e Organização ']]);
    const row = { competencia_id: 'c1', alternativas: { competencias_integradas: ['Autocuidado e resiliência emocional', ''] } };
    expect(competenciasCobertas(row, nomes).sort()).toEqual(['autocuidado e resiliência emocional', 'planejamento e organização']);
  });
});

describe('escolherCenarioB: leitura no banco', () => {
  const COMPS = [
    { id: 'c007', nome: 'GERENCIAMENTO DE CONFLITOS' },
    { id: 'c014', nome: 'CONSCIÊNCIA ORGANIZACIONAL E JURÍDICA' },
  ];
  const ROWS = [
    B('b-c014', 'Diretor(a) Escolar', 'c014', 10),
    B('b-c007', 'Diretor(a) Escolar', 'c007', 1),
    { ...B('b-sem-texto', 'Diretor(a) Escolar', 'c007', 15), descricao: '' },
  ];
  const mock = (rows: any[] = ROWS, comps: any[] = COMPS) => criarSupabaseMock({
    lista: (tabela) => (tabela === 'banco_cenarios' ? rows : tabela === 'competencias' ? comps : []),
  });
  const inCargo = (sb: any, esperado: string[]) => sb.chamadas.some((c: any) =>
    c.tabela === 'banco_cenarios' && c.metodo === 'in' && c.args[0] === 'cargo'
    && JSON.stringify(c.args[1]) === JSON.stringify(esperado));

  it('pergunta pelo tenant, pelo tipo, pelo cargo e por todos, ordenado', async () => {
    const sb = mock();
    await escolherCenarioB(sb.client, 'emp', 'Diretor(a) Escolar', ['GERENCIAMENTO DE CONFLITOS']);
    expect(sb.usou('banco_cenarios', 'eq', 'empresa_id')).toBe(true);
    expect(sb.usou('banco_cenarios', 'eq', 'tipo_cenario')).toBe(true);
    expect(inCargo(sb, ['Diretor(a) Escolar', 'todos'])).toBe(true);
    expect(sb.usou('banco_cenarios', 'order', 'created_at')).toBe(true);
    expect(sb.usou('competencias', 'eq', 'empresa_id')).toBe(true);
  });

  it('Macaé: serve o B de Gerenciamento de Conflitos, ignorando o mais recente e o sem texto', async () => {
    const r = await escolherCenarioB(mock().client, 'emp', 'Diretor(a) Escolar', ['Gerenciamento de Conflitos']);
    expect(r.motivo).toBe('ok');
    expect(r.cenario?.id).toBe('b-c007');
    expect((r.cenario as any).cobertas).toBeUndefined();
  });

  it('sem B elegível: null e degradação CRÍTICA registrada', async () => {
    const sb = mock([B('b-c014', 'Diretor(a) Escolar', 'c014', 10)]);
    const r = await escolherCenarioB(sb.client, 'emp', 'Diretor(a) Escolar', ['Gerenciamento de Conflitos'], {
      colaboradorId: 'col1', trilhaId: 'tr1',
    });
    expect(r.cenario).toBeNull();
    expect(r.motivo).toBe('sem-elegivel');
    const reg = sb.escritas.find((e) => e.tabela === 'degradacao_log');
    expect(reg?.payload?.tipo).toBe('cenario-b-sem-elegivel');
    expect(reg?.payload?.severidade).toBe('critico');
    expect(reg?.payload?.colaborador_id).toBe('col1');
  });

  it('registrar: false (simulação) não grava degradação', async () => {
    const sb = mock([B('b-c014', 'Diretor(a) Escolar', 'c014', 10)]);
    await escolherCenarioB(sb.client, 'emp', 'Diretor(a) Escolar', ['Gerenciamento de Conflitos'], { registrar: false });
    expect(sb.escritas.some((e) => e.tabela === 'degradacao_log')).toBe(false);
  });

  it("cargo 'todos' consulta só 'todos'", async () => {
    const sb = mock();
    await escolherCenarioB(sb.client, 'emp', 'todos', ['Gerenciamento de Conflitos'], { registrar: false });
    expect(inCargo(sb, ['todos'])).toBe(true);
  });

  it('trilha sem competência: motivo próprio, sem degradação', async () => {
    const sb = mock();
    const r = await escolherCenarioB(sb.client, 'emp', 'Diretor(a) Escolar', [null, '']);
    expect(r.motivo).toBe('sem-competencia-na-trilha');
    expect(sb.escritas.some((e) => e.tabela === 'degradacao_log')).toBe(false);
  });

  it('erro ao ler banco_cenarios LANÇA (a rota responde 500), não vira "sem B"', async () => {
    const sb = mock();
    sb.falharEm({ tabela: 'banco_cenarios', op: 'select', mensagem: 'timeout no pool' });
    await expect(escolherCenarioB(sb.client, 'emp', 'Diretor(a) Escolar', ['Gerenciamento de Conflitos']))
      .rejects.toThrow(/timeout no pool/);
  });

  it('erro ao ler competencias LANÇA', async () => {
    const sb = mock();
    sb.falharEm({ tabela: 'competencias', op: 'select', mensagem: 'conexão caiu' });
    await expect(escolherCenarioB(sb.client, 'emp', 'Diretor(a) Escolar', ['Gerenciamento de Conflitos']))
      .rejects.toThrow(/conexão caiu/);
  });
});
