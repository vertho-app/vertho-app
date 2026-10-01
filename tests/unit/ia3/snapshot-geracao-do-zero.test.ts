import { describe, it, expect, vi } from 'vitest';

vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));
vi.mock('@/actions/utils', () => ({ extractJSON: vi.fn() }));

import { persistirCenarioIA3, persistirCheckIA3 } from '@/lib/ia3-cenarios';

/**
 * Terceiro caminho que sobrescreve um cenário: a geração DO ZERO (`gerarCenarioIA3Core` →
 * `persistirCenarioIA3`), que apaga o cenário anterior (só os SEM respostas) e insere um novo.
 * Sem snapshot, o texto apagado era irrecuperável (01/10/2026). Agora ele vive no cenário NOVO.
 */
type Linha = { id: string; titulo: string; descricao: string; alternativas?: any; nota_check?: number | null; status_check?: string | null; alertas_check?: any; checked_at?: string | null; created_at?: string | null };

function fakeTdb(opts: { linhas: Linha[]; respondidos?: string[]; erroInsert?: string; erroDelete?: string }) {
  const chamadas: Array<[string, any]> = [];
  const consulta: any = {
    eq: () => consulta, is: () => consulta,
    then: (res: any) => res({ data: opts.linhas, error: null }),
  };
  const tdb = {
    from: (tabela: string) => {
      if (tabela === 'respostas') {
        return { select: () => ({ in: async () => ({ data: (opts.respondidos || []).map((cenario_id) => ({ cenario_id })), error: null }) }) };
      }
      return {
        select: () => consulta,
        insert: (payload: any) => { chamadas.push(['insert', payload]); return { select: () => ({ maybeSingle: async () => ({ data: opts.erroInsert ? null : { id: 'novo' }, error: opts.erroInsert ? { message: opts.erroInsert } : null }) }) }; },
        delete: () => ({ in: async (_col: string, ids: string[]) => { chamadas.push(['delete', ids]); return { error: opts.erroDelete ? { message: opts.erroDelete } : null }; } }),
      };
    },
  };
  return { tdb, chamadas };
}

const args = { compId: 'c1', cargoNome: 'CAIXA', pppEscolaId: null as string | null, titulo: 'NOVO', contexto: 'ctx novo', alternativas: { perguntas: [] } };
const linha = (id: string, n: number, extra: Partial<Linha> = {}): Linha => ({
  id, titulo: `T${n}`, descricao: `D${n}`, alternativas: { perguntas: [{ texto: `P${n}` }] },
  nota_check: n, status_check: 'revisar', checked_at: `2026-10-0${n}T10:00:00Z`, alertas_check: { auditor: 'gpt-5.6-terra', gerador: 'claude-sonnet-5' }, ...extra,
});

describe('persistirCenarioIA3 — snapshot do cenário que será apagado', () => {
  it('o texto apagado vai para alertas_check.versoes_anteriores do cenário NOVO', async () => {
    const { tdb, chamadas } = fakeTdb({ linhas: [linha('a', 3)] });
    const r = await persistirCenarioIA3(tdb, args);
    expect(r).toMatchObject({ ok: true, cenarioId: 'novo' });
    const ins = chamadas.find((c) => c[0] === 'insert')![1];
    expect(ins.titulo).toBe('NOVO');
    expect(ins.alertas_check.versoes_anteriores).toHaveLength(1);
    expect(ins.alertas_check.versoes_anteriores[0]).toMatchObject({ titulo: 'T3', descricao: 'D3', nota_check: 3, status_check: 'revisar', auditor: 'gpt-5.6-terra', gerador: 'claude-sonnet-5' });
    expect(ins.alertas_check.versoes_anteriores[0].alternativas.perguntas[0].texto).toBe('P3');
  });

  it('INSERE antes de APAGAR (se o insert falhar, nada se perde)', async () => {
    const { tdb, chamadas } = fakeTdb({ linhas: [linha('a', 3)] });
    await persistirCenarioIA3(tdb, args);
    expect(chamadas.map((c) => c[0])).toEqual(['insert', 'delete']);
  });

  it('insert que falha: NADA é apagado e o erro volta', async () => {
    const { tdb, chamadas } = fakeTdb({ linhas: [linha('a', 3)], erroInsert: 'boom' });
    const r = await persistirCenarioIA3(tdb, args);
    expect(r).toMatchObject({ ok: false });
    expect(chamadas.some((c) => c[0] === 'delete')).toBe(false);
  });

  it('só apaga os SEM resposta, e só esses entram no snapshot (o protegido continua existindo)', async () => {
    const { tdb, chamadas } = fakeTdb({ linhas: [linha('a', 1), linha('b', 2)], respondidos: ['b'] });
    await persistirCenarioIA3(tdb, args);
    expect(chamadas.find((c) => c[0] === 'delete')![1]).toEqual(['a']);
    const ins = chamadas.find((c) => c[0] === 'insert')![1];
    expect(ins.alertas_check.versoes_anteriores.map((v: any) => v.titulo)).toEqual(['T1']);
  });

  it('vários apagáveis: o mais recente fica na frente e o teto de 3 vale', async () => {
    const { tdb, chamadas } = fakeTdb({ linhas: [linha('a', 5), linha('b', 2), linha('c', 4), linha('d', 1)] });
    await persistirCenarioIA3(tdb, args);
    const ins = chamadas.find((c) => c[0] === 'insert')![1];
    expect(ins.alertas_check.versoes_anteriores.map((v: any) => v.titulo)).toEqual(['T5', 'T4', 'T2']);
  });

  it('o histórico que o cenário apagado já carregava segue junto (não se perde na troca)', async () => {
    const anterior = { titulo: 'T0', descricao: 'D0', nota_check: 0 };
    const { tdb, chamadas } = fakeTdb({ linhas: [linha('a', 3, { alertas_check: { auditor: 'x', versoes_anteriores: [anterior] } })] });
    await persistirCenarioIA3(tdb, args);
    const ins = chamadas.find((c) => c[0] === 'insert')![1];
    expect(ins.alertas_check.versoes_anteriores.map((v: any) => v.titulo)).toEqual(['T3', 'T0']);
  });

  it('sem cenário anterior: insere limpo, sem alertas_check', async () => {
    const { tdb, chamadas } = fakeTdb({ linhas: [] });
    await persistirCenarioIA3(tdb, args);
    const ins = chamadas.find((c) => c[0] === 'insert')![1];
    expect(ins).not.toHaveProperty('alertas_check');
    expect(chamadas.some((c) => c[0] === 'delete')).toBe(false);
  });

  it('falha ao apagar o antigo NÃO perde nada: o novo e o snapshot já existem, e volta um aviso', async () => {
    const { tdb } = fakeTdb({ linhas: [linha('a', 3)], erroDelete: 'fk' });
    const r: any = await persistirCenarioIA3(tdb, args);
    expect(r.ok).toBe(true);
    expect(r.cenarioId).toBe('novo');
    expect(r.aviso).toMatch(/não foi removido/);
  });
});

describe('persistirCheckIA3 — o check não pode apagar o histórico de versões', () => {
  const sbCom = (alertas: any) => {
    let payload: any = null;
    const sb = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { empresa_id: 'e1', alertas_check: alertas } }) }) }),
        update: (p: any) => { payload = p; return { eq: () => ({ eq: () => ({ select: async () => ({ data: [{ id: 'x', nota_check: p.nota_check }], error: null }) }) }) }; },
      }),
    };
    return { sb, payload: () => payload };
  };
  const resultado = { nota: 88, justificativa: 'j', sugestao: 's', alertas: [], ponto_mais_forte: 'f', ponto_mais_fraco: 'w', descritores_sem_cobertura: [], perguntas_com_risco: [] };

  it('preserva versoes_anteriores ao reescrever alertas_check com o resultado do check', async () => {
    const hist = [{ titulo: 'T3', nota_check: 3 }];
    const { sb, payload } = sbCom({ auditor: 'x', versoes_anteriores: hist });
    const r = await persistirCheckIA3(sb, { id: 'x' }, resultado, 'aprovado_com_ressalvas');
    expect(r).toEqual({ ok: true });
    expect(payload().alertas_check.versoes_anteriores).toEqual(hist);
    expect(payload().alertas_check.ponto_mais_fraco).toBe('w');
  });

  it('sem histórico: não inventa a chave', async () => {
    const { sb, payload } = sbCom({ auditor: 'x' });
    await persistirCheckIA3(sb, { id: 'x' }, resultado, 'aprovado');
    expect(payload().alertas_check).not.toHaveProperty('versoes_anteriores');
  });
});
