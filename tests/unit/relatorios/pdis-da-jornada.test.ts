import { describe, expect, it } from 'vitest';
import { carregarPdisDaJornada, escolherPdisDaJornada, type VersaoPdi } from '@/lib/relatorios/pdis-da-jornada';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * PDI atual × PDIs anteriores, por jornada (18/10/2026). Pedido do dono na 2ª jornada de Ibipeba: a pessoa vê os PDIs
 * anteriores. Até então a tela mostrava a linha viva de `relatorios` como "o PDI", e na Temporada 2, antes do PDI
 * novo, isso era o da Temporada 1 apresentado como o plano de agora.
 */
const MARCO = '2026-10-07T12:22:33Z';
const T1 = { id: 'p1', turma_id: 't1', colaborador_id: 'c1', status: 'concluido', created_at: '2026-07-13T00:00:00Z', marco_jornada: null };
const T2 = { id: 'p2', turma_id: 't2', colaborador_id: 'c1', status: 'ativo', created_at: MARCO, marco_jornada: MARCO };
const nomes: Record<string, string> = { t1: 'Turma 1', t2: 'Ibipeba - Temporada 2' };
const turmaNome = (id: string) => nomes[id] ?? null;

const pdi = (ref: string, gerado_em: string, extra: Partial<VersaoPdi> = {}): VersaoPdi => ({ ref, gerado_em, conteudo: { acolhimento: ref }, ...extra });
const REPROVADO = { auditoria: { status: 'fail' } };

describe('escolherPdisDaJornada', () => {
  it('sem turma (a conta de sempre): a linha viva é o PDI atual e não há anterior', () => {
    const r = escolherPdisDaJornada({ participacoes: [], versoes: [pdi('vivo:r1', '2026-07-20T19:55:12Z'), pdi('hist:h1', '2026-07-01T00:00:00Z')] });
    expect(r.atual?.ref).toBe('vivo:r1');
    expect(r.anteriores).toEqual([]);
  });

  it('turma SEM marco (Macaé): nada muda, mesmo com histórico', () => {
    const semMarco = { ...T2, marco_jornada: null };
    const r = escolherPdisDaJornada({ participacoes: [T1, semMarco], turmaNome, versoes: [pdi('vivo:r1', '2026-10-20T00:00:00Z'), pdi('hist:h1', '2026-07-20T00:00:00Z')] });
    expect(r.atual?.ref).toBe('vivo:r1');
    expect(r.anteriores).toEqual([]);
  });

  it('🔴 Temporada 2 antes do PDI novo: o da Temporada 1 NÃO é o atual, é o anterior da Turma 1', () => {
    const r = escolherPdisDaJornada({ participacoes: [T1, T2], turmaNome, versoes: [pdi('vivo:r1', '2026-07-20T19:55:12Z')] });
    expect(r.atual).toBeNull();
    expect(r.anteriores).toEqual([{ ref: 'vivo:r1', geradoEm: '2026-07-20T19:55:12Z', turma: 'Turma 1' }]);
  });

  it('depois do PDI novo: a linha viva é o atual e o arquivado da Temporada 1 é o anterior', () => {
    const r = escolherPdisDaJornada({
      participacoes: [T1, T2], turmaNome,
      versoes: [pdi('vivo:r1', '2026-10-20T10:00:00Z'), pdi('hist:h1', '2026-07-20T19:55:12Z')],
    });
    expect(r.atual?.ref).toBe('vivo:r1');
    expect(r.anteriores.map((a) => a.ref)).toEqual(['hist:h1']);
  });

  it('várias versões numa jornada: só a ÚLTIMA aparece (rascunhos da mesma jornada não)', () => {
    const r = escolherPdisDaJornada({
      participacoes: [T1, T2], turmaNome,
      versoes: [
        pdi('vivo:r1', '2026-10-21T00:00:00Z'),
        pdi('hist:rascunho-t2', '2026-10-20T00:00:00Z'), // regerado DENTRO da Temporada 2: não é anterior
        pdi('hist:t1-v1', '2026-07-18T00:00:00Z'),
        pdi('hist:t1-v2', '2026-07-20T00:00:00Z'),
      ],
    });
    expect(r.anteriores.map((a) => a.ref)).toEqual(['hist:t1-v2']);
  });

  it('versão retida pela auditoria (R-60) não é servida: vale a última NÃO retida da jornada', () => {
    const r = escolherPdisDaJornada({
      participacoes: [T1, T2], turmaNome,
      versoes: [
        pdi('hist:t1-boa', '2026-10-04T00:00:00Z'),
        pdi('hist:t1-reprovada', '2026-10-05T00:00:00Z', { conteudo: REPROVADO }),
      ],
    });
    expect(r.anteriores.map((a) => a.ref)).toEqual(['hist:t1-boa']);
  });

  it('três jornadas: um anterior por jornada, do mais recente ao mais antigo', () => {
    const M2 = '2026-04-01T00:00:00Z';
    const parts = [
      { id: 'a', turma_id: 'ta', colaborador_id: 'c1', status: 'concluido', created_at: '2026-01-01T00:00:00Z', marco_jornada: null },
      { id: 'b', turma_id: 'tb', colaborador_id: 'c1', status: 'concluido', created_at: M2, marco_jornada: M2 },
      T2,
    ];
    const r = escolherPdisDaJornada({
      participacoes: parts, turmaNome: (id) => ({ ta: 'A', tb: 'B' } as any)[id] ?? null,
      versoes: [pdi('hist:a', '2026-02-01T00:00:00Z'), pdi('hist:b', '2026-05-01T00:00:00Z'), pdi('vivo:r', '2026-10-20T00:00:00Z')],
    });
    expect(r.anteriores).toEqual([
      { ref: 'hist:b', geradoEm: '2026-05-01T00:00:00Z', turma: 'B' },
      { ref: 'hist:a', geradoEm: '2026-02-01T00:00:00Z', turma: 'A' },
    ]);
  });

  it('participação REMOVIDA não vira jornada anterior', () => {
    const removida = { ...T1, status: 'removido' };
    const r = escolherPdisDaJornada({ participacoes: [removida, T2], turmaNome, versoes: [pdi('vivo:r1', '2026-07-20T00:00:00Z')] });
    expect(r.atual).toBeNull();
    expect(r.anteriores).toEqual([]);
  });
});

describe('carregarPdisDaJornada', () => {
  it('lê participações, turmas, a linha viva e o histórico da pessoa, e aplica a regra', async () => {
    const sb = criarSupabaseMock({
      lista: (tabela: string) => ({
        turma_membros: [T1, T2],
        turmas: [{ id: 't1', nome: 'Turma 1' }, { id: 't2', nome: 'Ibipeba - Temporada 2' }],
        relatorios: [{ id: 'r1', conteudo: { a: 1 }, gerado_em: '2026-10-20T10:00:00Z', pdf_path: 'e/novo.pdf' }],
        artefatos_jornada_historico: [{ id: 'h1', conteudo: { a: 0 }, gerado_em: '2026-07-20T19:55:12Z', pdf_path: 'e/velho.pdf' }],
      } as Record<string, any[]>)[tabela] || [],
    });
    const r = await carregarPdisDaJornada(sb.client, 'e1', 'c1');
    expect(r.atual?.ref).toBe('vivo:r1');
    expect(r.anteriores).toEqual([{ ref: 'hist:h1', geradoEm: '2026-07-20T19:55:12Z', turma: 'Turma 1' }]);
    expect(r.versoes.find((v) => v.ref === 'hist:h1')?.pdf_path).toBe('e/velho.pdf');
  });

  it.each(['turma_membros', 'relatorios', 'artefatos_jornada_historico', 'turmas'])('falha ao ler %s LANÇA (não vira "sem PDI anterior")', async (tabela) => {
    const sb = criarSupabaseMock({
      lista: (t: string) => (t === 'turma_membros' ? [T1, T2] : []),
    });
    sb.falharEm({ tabela, op: 'select', mensagem: 'timeout' });
    await expect(carregarPdisDaJornada(sb.client, 'e1', 'c1')).rejects.toThrow(/timeout/);
  });
});
