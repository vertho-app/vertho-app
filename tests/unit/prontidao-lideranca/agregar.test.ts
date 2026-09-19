import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * A agregação junta as duas camadas por pessoa a partir do banco. Aqui se
 * prova com o mock do Supabase o que o núcleo puro não consegue provar
 * sozinho: quem entra na população, quem fica de fora e POR QUÊ, e que uma
 * falha de leitura vira erro — nunca "sem dados".
 */

const LID = ['Priorização', 'Delegação'];
const cenario = {
  colabs: [] as any[],
  notas: [] as any[],
  respostas: [] as any[],
  adequacao: null as any,
  cargoAlvo: { nome: 'Gerente', gabarito: { tela4: {} }, top5_workshop: LID } as any,
};

const adequacaoDe = (pessoas: any[]) => ({
  cargo: 'Gerente', avaliados: pessoas.length, semGabarito: false, semColaboradores: false, avisosCalibracao: [],
  perfilIdeal: { faixas: { recomendadoMin: 86.5, ressalvasMin: 75.4 } },
  pessoas,
});
const pessoaAdeq = (id: string, pct: number, extra: Partial<any> = {}) => ({
  id, nome: id, beta: { pct }, status: pct >= 75.4 ? 'recomendado_com_ressalvas' : 'abaixo_do_corte', statusLabel: '',
  knockoutFailed: false, knockoutMotivos: [], gaps: [], borderline: false, ...extra,
});
const nota = (colaboradorId: string, competencia: string, descritor: string, nota: number) => ({ colaborador_id: colaboradorId, competencia, descritor, nota });

vi.mock('@/lib/adequacao-cargo/aggregate', () => ({ aggregateAdequacao: vi.fn(async () => cenario.adequacao) }));
// O instrumento é a matriz do PROGRAMA (global), não o Top 5 do cargo-alvo.
// Aqui ela é reduzida a duas competências para o cenário caber no teste.
vi.mock('@/lib/prontidao-lideranca/config', async (original) => ({
  ...(await original<typeof import('@/lib/prontidao-lideranca/config')>()),
  competenciasDoPrograma: vi.fn(() => [...LID]),
}));

import { agregarProntidaoLideranca, carregarParecer } from '@/lib/prontidao-lideranca/agregar';
import { aggregateAdequacao } from '@/lib/adequacao-cargo/aggregate';

const cfg = { cargo_alvo: 'gerente', escopo: { tipo: 'empresa_inteira' as const }, um_por_dia: true, corte_nota: 3 };

function mock() {
  return criarSupabaseMock({
    lista: (tabela, cols) => {
      if (tabela === 'colaboradores') return cenario.colabs;
      if (tabela === 'cargos_empresa') return [cenario.cargoAlvo];
      if (tabela === 'descriptor_assessments') return cenario.notas;
      if (tabela === 'respostas') return cols.includes('avaliacao_ia') ? cenario.respostas.filter((r) => r.avaliacao_ia) : cenario.respostas;
      return [];
    },
  });
}

describe('agregarProntidaoLideranca', () => {
  beforeEach(() => {
    cenario.colabs = [
      { id: 'ana', nome_completo: 'Ana', cargo: 'Vendedor', email: 'ana@cliente.com', role: 'colaborador' },
      { id: 'bia', nome_completo: 'Bia', cargo: 'Vendedor', email: 'bia@cliente.com', role: 'colaborador' },
      { id: 'caio', nome_completo: 'Caio', cargo: 'SDR', email: 'caio@cliente.com', role: 'colaborador' },
      { id: 'dora', nome_completo: 'Dora', cargo: 'SDR', email: 'dora@cliente.com', role: 'colaborador' },
      { id: 'rh', nome_completo: 'RH', cargo: 'RH', email: 'rh@cliente.com', role: 'rh' },
      { id: 'int', nome_completo: 'Interno', cargo: 'Vendedor', email: 'x@vertho.ai', role: 'colaborador' },
    ];
    cenario.notas = [
      ...[3.5, 3.6].map((n, i) => nota('ana', 'Priorização', `D${i}`, n)), ...[3.4, 3.5].map((n, i) => nota('ana', 'Delegação', `D${i}`, n)),  // 3,50 demonstra
      ...[2.0, 2.2].map((n, i) => nota('bia', 'Priorização', `D${i}`, n)), ...[2.4, 2.4].map((n, i) => nota('bia', 'Delegação', `D${i}`, n)),  // 2,25 não demonstra
      ...[3.9].map((n, i) => nota('caio', 'Priorização', `D${i}`, n)),                                                                    // incompleto
      ...[4.0].map((n, i) => nota('int', 'Priorização', `D${i}`, n)), ...[4.0].map((n, i) => nota('int', 'Delegação', `D${i}`, n)),          // interno: fora
    ];
    cenario.respostas = [
      { colaborador_id: 'bia', competencia_nome: 'Delegação', status_ia4: 'revisar' },
      { colaborador_id: 'ana', competencia_nome: 'Priorização', status_ia4: 'aprovado' },
    ];
    cenario.adequacao = adequacaoDe([pessoaAdeq('ana', 88), pessoaAdeq('bia', 60), pessoaAdeq('int', 99)]);
    cenario.cargoAlvo = { nome: 'Gerente', gabarito: { tela4: {} }, top5_workshop: LID };
    vi.mocked(aggregateAdequacao).mockClear();
  });

  it('cruza as duas camadas por id, exclui rh e internos, e lista quem ficou de fora com o motivo', async () => {
    const r = await agregarProntidaoLideranca(mock().client, 'emp', cfg);
    expect(r.cargoAlvo).toBe('Gerente');
    expect(r.competencias).toEqual(LID);
    expect(r.populacao).toBe(4);
    expect(r.linhas.map((l) => [l.nome, l.quadrante])).toEqual([['Ana', 'pronta'], ['Bia', 'nao_agora']]);
    expect(r.porQuadrante).toEqual({ pronta: 1, pronta_com_custo: 0, potencial: 0, nao_agora: 1 });
    expect(r.incompletos).toEqual([{ colaboradorId: 'caio', nome: 'Caio', cargo: 'SDR', cobertas: 1, total: 2, faltantes: ['Delegação'] }]);
    expect(r.naoIniciados).toBe(1); // Dora
    expect(r.semEstilo).toEqual([]);
    expect(r.faixas).toEqual({ recomendadoMin: 86.5, ressalvasMin: 75.4 });
    // o pool do fit é o conjunto de cargos da população, não da empresa inteira
    expect(vi.mocked(aggregateAdequacao).mock.calls[0][3]).toEqual({ poolCargos: ['Vendedor', 'SDR'] });
  });

  it('cargo-alvo com Top 5 VAZIO continua medindo pela matriz do programa', async () => {
    // Estado real de 18/09 nos dois tenants com o módulo: Top 5 do cargo-alvo vazio.
    // Até então o painel lia `alvo.top5` e diria "não há o que medir".
    cenario.cargoAlvo = { nome: 'Gerente', gabarito: { tela4: {} }, top5_workshop: [] };
    const r = await agregarProntidaoLideranca(mock().client, 'emp', cfg);
    expect(r.competencias).toEqual(LID);
    expect(r.linhas.map((l) => l.nome)).toEqual(['Ana', 'Bia']);
    expect(r.avisos.join(' ')).not.toMatch(/Top 5/);
  });

  it('marca auditoria pendente na linha; gaps saem ancorados', async () => {
    const r = await agregarProntidaoLideranca(mock().client, 'emp', cfg);
    const ana = r.linhas.find((l) => l.nome === 'Ana')!;
    const bia = r.linhas.find((l) => l.nome === 'Bia')!;
    expect(ana.auditoriaPendente).toBe(false);
    expect(bia.auditoriaPendente).toBe(true);
    expect(bia.frasesGap).toEqual(['Priorização: média 2,10 (corte 3,00)', 'Delegação: média 2,40 (corte 3,00)']);
  });

  it('posição completa sem perfil no fit → semEstilo (nunca some); gabarito ausente → aviso e todos sem estilo', async () => {
    cenario.adequacao = adequacaoDe([pessoaAdeq('ana', 88)]);
    let r = await agregarProntidaoLideranca(mock().client, 'emp', cfg);
    expect(r.linhas.map((l) => l.nome)).toEqual(['Ana']);
    expect(r.semEstilo).toEqual([{ colaboradorId: 'bia', nome: 'Bia', cargo: 'Vendedor', motivo: 'sem perfil comportamental' }]);

    cenario.cargoAlvo = { nome: 'Gerente', gabarito: null, top5_workshop: LID };
    vi.mocked(aggregateAdequacao).mockClear();
    r = await agregarProntidaoLideranca(mock().client, 'emp', cfg);
    expect(r.linhas).toEqual([]);
    expect(r.semEstilo.map((s) => s.nome)).toEqual(['Ana', 'Bia']);
    expect(r.avisos.join(' ')).toMatch(/gabarito/);
    expect(vi.mocked(aggregateAdequacao)).not.toHaveBeenCalled();
  });

  it('competência coberta com poucos descritores é marcada como PARCIAL, não escondida', async () => {
    // Ana: Priorização com 2 descritores (parcial), Delegação com 2 (parcial) — abaixo de 3
    const r = await agregarProntidaoLideranca(mock().client, 'emp', cfg);
    const ana = r.linhas.find((l) => l.nome === 'Ana')!;
    expect(ana.posicao.competencias.map((c) => [c.descritores, c.parcial])).toEqual([[2, true], [2, true]]);
    expect(ana.posicao.parciais).toEqual(LID);
  });

  it('gabarito existe mas ninguém na população tem cargo: aviso, e todos sem estilo', async () => {
    cenario.colabs = cenario.colabs.map((c) => (c.role === 'rh' ? c : { ...c, cargo: null }));
    const r = await agregarProntidaoLideranca(mock().client, 'emp', cfg);
    expect(r.avisos.join(' ')).toMatch(/Ninguém na população tem cargo/);
    expect(r.linhas).toEqual([]);
    expect(vi.mocked(aggregateAdequacao)).not.toHaveBeenCalled();
  });

  it('apenasIds restringe a população — o parecer de uma pessoa não recalcula a empresa', async () => {
    const r = await agregarProntidaoLideranca(mock().client, 'emp', cfg, { apenasIds: ['bia'] });
    expect(r.populacao).toBe(1);
    expect(r.linhas.map((l) => l.nome)).toEqual(['Bia']);
    // o pool do fit é só o cargo da pessoa
    expect(vi.mocked(aggregateAdequacao).mock.calls[0][3]).toEqual({ poolCargos: ['Vendedor'] });
  });

  it('falha de leitura das notas LANÇA — não vira "ninguém mapeado"', async () => {
    const sb = mock();
    sb.falharEm({ tabela: 'descriptor_assessments', op: 'select', mensagem: 'timeout' });
    await expect(agregarProntidaoLideranca(sb.client, 'emp', cfg)).rejects.toThrow(/notas por descritor/);
  });

  it('carregarParecer traz a linha da matriz e as evidências das competências do programa', async () => {
    cenario.respostas.push({
      colaborador_id: 'ana', competencia_id: 'c-pri', competencia_nome: 'Priorização', status_ia4: 'aprovado',
      avaliacao_ia: { avaliacao_por_descritor: [{ numero: 1, nome: 'D0', nota_decimal: 3.5, evidencias: [{ resposta: 'R1', trecho: 'listei as três contas antes da reunião', forca_evidencia: 'forte' }] }] },
    });
    const p = await carregarParecer(mock().client, 'emp', 'ana', cfg);
    expect('indisponivel' in p).toBe(false);
    if ('indisponivel' in p) return;
    expect(p.linha.quadrante).toBe('pronta');
    expect(p.evidencias.map((e) => e.competencia)).toEqual(LID);
    expect(p.evidencias[0].descritores[0].evidencias[0].trecho).toBe('listei as três contas antes da reunião');
    expect(p.evidencias[1].descritores).toEqual([]);

    const inc = await carregarParecer(mock().client, 'emp', 'caio', cfg);
    expect(inc).toEqual({ indisponivel: 'Mapeamento incompleto: faltam Delegação.' });
  });
});
