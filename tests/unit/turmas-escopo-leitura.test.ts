import { describe, expect, it } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { listarTurmasParaFiltro, resolverEscopoDeLeitura } from '@/lib/turmas/escopo-leitura';

/**
 * Escopo de LEITURA de turma (07/10/2026). `resolverEscopoDeLote` é operacional e só
 * enxerga membro `ativo`; para VER uma turma, a que passou todo mundo adiante não pode
 * ficar com 0 pessoas. Aqui entram também as participações encerradas, cada uma com a
 * sua janela, e falha de leitura LANÇA (nunca vira "turma sem ninguém").
 */

const EMP = '10000000-0000-4000-8000-000000000001';
const MARCO = '2026-10-07T12:22:33.000Z';

const turmas = [
  { id: 'T1', nome: 'Turma 1', status: 'em_jornada' },
  { id: 'T2', nome: 'Ibipeba - Temporada 2', status: 'diagnostico' },
  { id: 'T3', nome: 'Vazia', status: 'planejada' },
  { id: 'T4', nome: 'Antiga', status: 'arquivada' },
];

const membros = [
  // Ibipeba em miniatura: as duas pessoas passaram da T1 para a T2 abrindo jornada nova.
  { id: 'a-ana', turma_id: 'T1', colaborador_id: 'ana', status: 'concluido', created_at: '2026-08-13T03:24:44Z', marco_jornada: null },
  { id: 'a-bia', turma_id: 'T1', colaborador_id: 'bia', status: 'concluido', created_at: '2026-08-13T03:24:44Z', marco_jornada: null },
  { id: 'n-ana', turma_id: 'T2', colaborador_id: 'ana', status: 'ativo', created_at: MARCO, marco_jornada: MARCO },
  { id: 'n-bia', turma_id: 'T2', colaborador_id: 'bia', status: 'ativo', created_at: MARCO, marco_jornada: MARCO },
  // Quem foi removido por engano não é participante nem histórico.
  { id: 'x-caio', turma_id: 'T1', colaborador_id: 'caio', status: 'removido', created_at: '2026-08-13T03:24:44Z', marco_jornada: null },
  // Turma arquivada com histórico.
  { id: 'v-dora', turma_id: 'T4', colaborador_id: 'dora', status: 'concluido', created_at: '2026-05-01T00:00:00Z', marco_jornada: null },
];

const banco = () => criarSupabaseMock({
  resolver: (tabela, _cols, cadeia) => {
    if (tabela !== 'turmas') return null;
    const id = cadeia.find((c) => c.metodo === 'eq' && c.args[0] === 'id')?.args[1];
    const emp = cadeia.find((c) => c.metodo === 'eq' && c.args[0] === 'empresa_id')?.args[1];
    // A turma tem que ser DESTA empresa: outra empresa não acha nada.
    return emp === EMP ? (turmas.find((t) => t.id === id) ?? null) : null;
  },
  lista: (tabela, _cols, cadeia) => {
    if (tabela === 'turmas') return turmas;
    if (tabela !== 'turma_membros') return [];
    const daTurma = cadeia.find((c) => c.metodo === 'eq' && c.args[0] === 'turma_id')?.args[1];
    return daTurma ? membros.filter((m) => m.turma_id === daTurma) : membros;
  },
});

describe('listarTurmasParaFiltro', () => {
  it('conta ativos e encerrados por turma, ignora removido e deixa de fora a turma sem ninguém', async () => {
    const lista = await listarTurmasParaFiltro(banco().client, EMP);
    expect(lista.map((t) => [t.nome, t.ativos, t.encerrados])).toEqual([
      ['Turma 1', 0, 2],
      ['Ibipeba - Temporada 2', 2, 0],
      ['Antiga', 0, 1],
    ]);
  });

  it('marca como encerrada a turma concluída ou arquivada (para o rótulo do seletor)', async () => {
    const lista = await listarTurmasParaFiltro(banco().client, EMP);
    expect(lista.find((t) => t.id === 'T4')!.encerrada).toBe(true);
    expect(lista.find((t) => t.id === 'T2')!.encerrada).toBe(false);
  });

  it('erro de leitura LANÇA: não vira "nenhuma turma"', async () => {
    const sb = banco();
    sb.falharEm({ tabela: 'turma_membros', op: 'select', mensagem: 'timeout no pool' });
    await expect(listarTurmasParaFiltro(sb.client, EMP)).rejects.toThrow('timeout no pool');
    const sb2 = banco();
    sb2.falharEm({ tabela: 'turmas', op: 'select', mensagem: 'timeout no pool' });
    await expect(listarTurmasParaFiltro(sb2.client, EMP)).rejects.toThrow('não foi possível ler as turmas');
  });
});

describe('resolverEscopoDeLeitura', () => {
  it('a turma ANTIGA mantém as pessoas encerradas, com a janela que termina no marco da nova', async () => {
    const e = await resolverEscopoDeLeitura(banco().client, EMP, 'T1');
    expect(e.colaboradorIds.sort()).toEqual(['ana', 'bia']);
    const ana = e.participacaoPorColab.get('ana')!;
    expect(ana).toMatchObject({ id: 'a-ana', ativa: false });
    expect(ana.janela).toEqual({ de: null, ate: Date.parse(MARCO) });
  });

  it('a turma NOVA começa no marco', async () => {
    const e = await resolverEscopoDeLeitura(banco().client, EMP, 'T2');
    const ana = e.participacaoPorColab.get('ana')!;
    expect(ana).toMatchObject({ id: 'n-ana', ativa: true });
    expect(ana.janela).toEqual({ de: Date.parse(MARCO), ate: null });
  });

  it('removido não entra', async () => {
    const e = await resolverEscopoDeLeitura(banco().client, EMP, 'T1');
    expect(e.colaboradorIds).not.toContain('caio');
  });

  it('turma de OUTRA empresa não resolve (o id vem do cliente)', async () => {
    await expect(resolverEscopoDeLeitura(banco().client, 'outra-empresa', 'T1')).rejects.toThrow('Turma não encontrada nesta empresa');
  });

  it('erro ao ler os membros LANÇA, em vez de virar turma sem ninguém', async () => {
    const sb = banco();
    sb.falharEm({ tabela: 'turma_membros', op: 'select', mensagem: 'timeout no pool' });
    await expect(resolverEscopoDeLeitura(sb.client, EMP, 'T1')).rejects.toThrow('timeout no pool');
  });

  it('turma sem participante devolve escopo vazio (e quem consome trata como ninguém)', async () => {
    const e = await resolverEscopoDeLeitura(banco().client, EMP, 'T3');
    expect(e.colaboradorIds).toEqual([]);
    expect(e.participacaoPorColab.size).toBe(0);
  });
});
