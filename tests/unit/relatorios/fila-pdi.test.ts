import { describe, it, expect } from 'vitest';
import { bancoEmMemoria, type Tabelas } from '../../helpers/tabelas-em-memoria';
import { buscarFilaPdi } from '@/lib/relatorios/fila-pdi';

/**
 * Fila do PDI, extraída de `actions/relatorios.ts` para `lib/` (a prévia e a orquestração do fluxo completo usam
 * a MESMA regra). Travas que custaram caro: (1) quem JÁ TEM relatório fica de fora (o upsert sobrescreveria um
 * PDI entregue); (2) PDI COMPLETO: só entra quem avaliou TODO o top 5 do cargo; (3) R-87: resposta do trilho de
 * LIDERANÇA não completa o Top 5 do cargo; (4) R-59: avaliação sem o check da 2ª IA segura o PDI, contada.
 * Banco em memória: os filtros (`.not('avaliacao_ia')`, `.eq('tipo')`) são de verdade.
 */
const comp = (id: string, nome: string, cargo = 'CAIXA') => ({ id, empresa_id: 'e', nome, cargo });
const resp = (colaborador_id: string, competencia_id: string, extra: Record<string, any> = {}) => ({
  id: `${colaborador_id}-${competencia_id}`, empresa_id: 'e', colaborador_id, competencia_id,
  competencia_nome: null, avaliacao_ia: { ok: true }, status_ia4: 'aprovado', ...extra,
});

function banco(over: Partial<Tabelas> = {}) {
  return bancoEmMemoria({
    respostas: [],
    relatorios: [],
    colaboradores: [{ id: 'a', empresa_id: 'e', cargo: 'CAIXA' }, { id: 'b', empresa_id: 'e', cargo: 'CAIXA' }],
    cargos_empresa: [{ empresa_id: 'e', nome: 'CAIXA', top5_workshop: ['x', 'y', 'z'] }],
    competencias: [comp('cx', 'x'), comp('cy', 'y'), comp('cz', 'z'), comp('lid1', 'x', 'Futuro Líder'), comp('lid2', 'Desenvolver pessoas', 'Futuro Líder')],
    ...over,
  });
}

describe('buscarFilaPdi', () => {
  it('ninguém com avaliação: semAvaliacao (a action responde "Nenhuma avaliação encontrada")', async () => {
    const r: any = await buscarFilaPdi(banco().client);
    expect(r.semAvaliacao).toBe(true);
    expect(r.pendentes).toEqual([]);
  });

  it('resposta sem avaliação da IA não conta', async () => {
    const r: any = await buscarFilaPdi(banco({ respostas: [resp('a', 'cx', { avaliacao_ia: null })] }).client);
    expect(r.semAvaliacao).toBe(true);
  });

  it('PDI COMPLETO: top5 = 3, só quem tem as 3 avaliadas entra; o de 2 vira "incompleto"', async () => {
    const r: any = await buscarFilaPdi(banco({
      respostas: [resp('a', 'cx'), resp('a', 'cy'), resp('a', 'cz'), resp('b', 'cx'), resp('b', 'cy')],
    }).client);
    expect(r.pendentes).toEqual(['a']);
    expect(r.incompletos).toBe(1);
  });

  it('quem JÁ TEM relatório fica de fora (não sobrescreve PDI entregue) e não conta como incompleto', async () => {
    const r: any = await buscarFilaPdi(banco({
      cargos_empresa: [{ empresa_id: 'e', nome: 'CAIXA', top5_workshop: ['x'] }],
      respostas: [resp('a', 'cx'), resp('b', 'cx')],
      relatorios: [{ empresa_id: 'e', colaborador_id: 'a', tipo: 'individual' }],
    }).client);
    expect(r.pendentes).toEqual(['b']);
    expect(r.jaGerados).toEqual(['a']);
    expect(r.incompletos).toBe(0);
  });

  it('competência PRÓPRIA (mig 287, "todos entram"): entra com o que respondeu do Top 5 (2 de 3); sem ela, 2 de 3 segue incompleto', async () => {
    const r: any = await buscarFilaPdi(banco({
      colaboradores: [{ id: 'a', empresa_id: 'e', cargo: 'CAIXA', foco_individual: ['x'] }, { id: 'b', empresa_id: 'e', cargo: 'CAIXA', foco_individual: null }],
      respostas: [resp('a', 'cx'), resp('a', 'cy'), resp('b', 'cx'), resp('b', 'cy')],
    }).client);
    expect(r.pendentes).toEqual(['a']);
    expect(r.incompletos).toBe(1);
  });

  it('competência PRÓPRIA não dispensa o check da 2ª IA (R-59) nem a resposta do Top 5 DO CARGO (R-87)', async () => {
    const r: any = await buscarFilaPdi(banco({
      colaboradores: [{ id: 'a', empresa_id: 'e', cargo: 'CAIXA', foco_individual: ['x'] }, { id: 'b', empresa_id: 'e', cargo: 'CAIXA', foco_individual: ['x'] }],
      respostas: [resp('a', 'cx'), resp('a', 'cy', { status_ia4: null }), resp('b', 'lid2')],
    }).client);
    expect(r.pendentes).toEqual([]);
    expect(r.aguardandoCheck).toBe(1);
    expect(r.incompletos).toBe(1);
  });

  it('cargo SEM top5 configurado mantém a regra antiga: basta ter avaliação', async () => {
    const r: any = await buscarFilaPdi(banco({
      colaboradores: [{ id: 'a', empresa_id: 'e', cargo: 'SEM-TOP5' }],
      cargos_empresa: [{ empresa_id: 'e', nome: 'SEM-TOP5', top5_workshop: [] }],
      respostas: [resp('a', 'qualquer')],
    }).client);
    expect(r.pendentes).toEqual(['a']);
  });

  it('R-87: respostas do trilho de LIDERANÇA não completam o Top 5 do cargo, nem com nome igual', async () => {
    const r: any = await buscarFilaPdi(banco({
      // "x" respondida só no trilho de liderança (competência da variante, mesmo nome).
      respostas: [resp('a', 'lid1'), resp('a', 'lid2'), resp('a', 'cy'), resp('a', 'cz')],
    }).client);
    expect(r.pendentes).toEqual([]);
    expect(r.incompletos).toBe(1);
  });

  it('resposta antiga cujo id saiu do catálogo casa pelo nome (régua de completion.ts)', async () => {
    const r: any = await buscarFilaPdi(banco({
      respostas: [resp('a', 'id-antigo', { competencia_nome: 'X' }), resp('a', 'cy'), resp('a', 'cz')],
    }).client);
    expect(r.pendentes).toEqual(['a']);
  });

  it('R-59: avaliação completa sem o check da 2ª IA segura o PDI e é contada; com o check, entra', async () => {
    const semCheck: any = await buscarFilaPdi(banco({
      respostas: [resp('a', 'cx'), resp('a', 'cy', { status_ia4: null }), resp('a', 'cz')],
    }).client);
    expect(semCheck.pendentes).toEqual([]);
    expect(semCheck.aguardandoCheck).toBe(1);
    expect(semCheck.incompletos).toBe(0);

    const revisar: any = await buscarFilaPdi(banco({
      respostas: [resp('a', 'cx'), resp('a', 'cy', { status_ia4: 'revisar' }), resp('a', 'cz')],
    }).client);
    expect(revisar.pendentes).toEqual(['a']);
  });

  it('erro de leitura FALHA em cada tabela (antes uma falha virava "nenhuma avaliação encontrada")', async () => {
    for (const tabela of ['respostas', 'relatorios', 'colaboradores', 'cargos_empresa', 'competencias'] as const) {
      const sb = banco({ respostas: [resp('a', 'cx')] });
      sb.falharEm({ tabela, op: 'select', mensagem: 'boom' });
      const r: any = await buscarFilaPdi(sb.client);
      expect(r.error, tabela).toMatch(new RegExp(`${tabela}: boom`));
    }
  });
  /**
   * Jornada nova (17/10/2026, Ibipeba Temporada 2): o PDI e a resposta da jornada ANTERIOR não contam para quem está
   * numa participação com marco. Sem isto, 25 pessoas "já tinham PDI" (o da Temporada 1) e eram puladas.
   */
  it('participação com marco: PDI e resposta de antes do marco não contam; sem participação, nada muda', async () => {
    const MARCO = '2026-10-07T12:22:33Z';
    const r: any = await buscarFilaPdi(banco({
      cargos_empresa: [{ empresa_id: 'e', nome: 'CAIXA', top5_workshop: ['x'] }],
      colaboradores: [{ id: 'a', empresa_id: 'e', cargo: 'CAIXA' }, { id: 'b', empresa_id: 'e', cargo: 'CAIXA' }, { id: 'c', empresa_id: 'e', cargo: 'CAIXA' }],
      turma_membros: [
        { id: 'pa1', empresa_id: 'e', turma_id: 't1', colaborador_id: 'a', status: 'concluido', created_at: '2026-07-13T00:00:00Z', marco_jornada: null },
        { id: 'pa2', empresa_id: 'e', turma_id: 't2', colaborador_id: 'a', status: 'ativo', created_at: MARCO, marco_jornada: MARCO },
        { id: 'pc2', empresa_id: 'e', turma_id: 't2', colaborador_id: 'c', status: 'ativo', created_at: MARCO, marco_jornada: MARCO },
      ],
      respostas: [
        resp('a', 'cx', { created_at: '2026-10-08T13:30:55Z' }), // T2
        resp('b', 'cx', { created_at: '2026-07-20T00:00:00Z' }), // sem participação: conta
        resp('c', 'cx', { created_at: '2026-07-20T00:00:00Z' }), // só da T1: não completa a T2
      ],
      relatorios: [
        { empresa_id: 'e', colaborador_id: 'a', tipo: 'individual', gerado_em: '2026-07-20T19:55:12Z' }, // PDI da T1
        { empresa_id: 'e', colaborador_id: 'b', tipo: 'individual', gerado_em: '2026-07-20T19:55:12Z' },
      ],
    }).client);
    expect(r.pendentes).toEqual(['a']); // o PDI da T1 não o tira da fila
    expect(r.jaGerados).toEqual(['b']); // sem participação: a conta de sempre
  });
});
