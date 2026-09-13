import { describe, expect, it } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';
import { resolverTrilhoLideranca, respondeuHojeNoTrilho, diaEmSaoPaulo, trilhoDe } from '@/lib/prontidao-lideranca/trilho';

const LID5 = ['Priorização', 'Gestão por dados', 'Desenvolvimento de pessoas', 'Conversa difícil', 'Delegação'];
const colab = { id: 'c1', empresa_id: 'emp', cargo: 'Vendedor' };
const contratado = { modulos: { prontidao_lideranca: true } };
const cfg = { ...contratado, prontidao_lideranca: { cargo_alvo: 'Gerente Comercial' } };

function mock(opts: { top5?: string[] | null; turmaDaPessoa?: string | null } = {}) {
  return criarSupabaseMock({
    resolver: (tabela) => {
      if (tabela === 'cargos_empresa') return opts.top5 === null ? null : { nome: 'Gerente Comercial', top5_workshop: opts.top5 ?? LID5 };
      if (tabela === 'turma_membros') return opts.turmaDaPessoa ? { id: 'm1', turma_id: opts.turmaDaPessoa, config_override: {} } : null;
      if (tabela === 'turmas') return opts.turmaDaPessoa ? { id: opts.turmaDaPessoa, nome: 'T', sys_config: {}, data_inicio: null, status: 'em_jornada' } : null;
      return null;
    },
  });
}

describe('resolverTrilhoLideranca — quem responde o segundo mapeamento', () => {
  it('recusa sem módulo contratado, antes de qualquer leitura', async () => {
    const r = await resolverTrilhoLideranca(mock().client, colab, { prontidao_lideranca: { cargo_alvo: 'X' } });
    expect(r).toMatchObject({ ok: false, code: 'MODULO_NAO_CONTRATADO' });
  });

  it('recusa módulo contratado sem programa configurado', async () => {
    const r = await resolverTrilhoLideranca(mock().client, colab, contratado);
    expect(r).toMatchObject({ ok: false, code: 'PROGRAMA_NAO_CONFIGURADO' });
  });

  it('quem ocupa o cargo-alvo responde pelo trilho do cargo', async () => {
    const r = await resolverTrilhoLideranca(mock().client, { ...colab, cargo: 'gerente comercial' }, cfg);
    expect(r).toMatchObject({ ok: false, code: 'OCUPA_CARGO_ALVO' });
  });

  it('escopo por turma: fora da turma do programa é fora da população', async () => {
    const porTurma = { ...contratado, prontidao_lideranca: { cargo_alvo: 'Gerente Comercial', escopo: { tipo: 'turma', turmaId: 't-prog' } } };
    expect(await resolverTrilhoLideranca(mock({ turmaDaPessoa: 't-outra' }).client, colab, porTurma)).toMatchObject({ ok: false, code: 'FORA_DA_POPULACAO' });
    expect(await resolverTrilhoLideranca(mock({ turmaDaPessoa: null }).client, colab, porTurma)).toMatchObject({ ok: false, code: 'FORA_DA_POPULACAO' });
    expect(await resolverTrilhoLideranca(mock({ turmaDaPessoa: 't-prog' }).client, colab, porTurma)).toMatchObject({ ok: true, cargoAlvo: 'Gerente Comercial' });
  });

  it('cargo-alvo sem Top 5 (ou inexistente) recusa com código próprio', async () => {
    expect(await resolverTrilhoLideranca(mock({ top5: [] }).client, colab, cfg)).toMatchObject({ ok: false, code: 'CARGO_ALVO_SEM_TOP5' });
    expect(await resolverTrilhoLideranca(mock({ top5: null }).client, colab, cfg)).toMatchObject({ ok: false, code: 'CARGO_ALVO_SEM_TOP5' });
  });

  it('caminho feliz: as competências são o Top 5 do cargo-alvo', async () => {
    const r = await resolverTrilhoLideranca(mock().client, colab, cfg);
    expect(r).toMatchObject({ ok: true, cargoAlvo: 'Gerente Comercial', competencias: LID5 });
    expect((r as any).cfg.um_por_dia).toBe(true);
  });

  it('erro de leitura do cargo-alvo LANÇA — não vira "sem competências"', async () => {
    const sb = mock();
    sb.falharEm({ tabela: 'cargos_empresa', op: 'select', mensagem: 'timeout' });
    await expect(resolverTrilhoLideranca(sb.client, colab, cfg)).rejects.toThrow(/cargo-alvo/);
  });
});

describe('um por dia — o dia é o de Brasília', () => {
  const agora = new Date('2026-09-13T13:00:00Z'); // 10:00 em São Paulo
  const trilho = [{ id: 'l1', nome: 'Priorização' }, { id: 'l2', nome: 'Delegação' }];

  it('diaEmSaoPaulo vira o dia às 03:00Z (00:00 BRT), não à meia-noite UTC', () => {
    expect(diaEmSaoPaulo(new Date('2026-09-13T02:59:59Z'))).toBe('2026-09-12');
    expect(diaEmSaoPaulo(new Date('2026-09-13T03:00:00Z'))).toBe('2026-09-13');
  });

  it('resposta de hoje numa competência do trilho bloqueia; de ontem 23:30 BRT não', () => {
    expect(respondeuHojeNoTrilho([{ competencia_id: 'l1', timestamp_resposta: '2026-09-13T12:00:00Z' }], trilho, agora)).toBe(true);
    expect(respondeuHojeNoTrilho([{ competencia_id: 'l1', timestamp_resposta: '2026-09-13T02:30:00Z' }], trilho, agora)).toBe(false);
  });

  it('resposta de hoje numa competência de OUTRO trilho não conta', () => {
    expect(respondeuHojeNoTrilho([{ competencia_id: 'cargo-x', competencia_nome: 'Negociação', timestamp_resposta: '2026-09-13T12:00:00Z' }], trilho, agora)).toBe(false);
  });

  it('casa por nome quando o id mudou (catálogo recomposto) e ignora timestamp inválido', () => {
    expect(respondeuHojeNoTrilho([{ competencia_id: 'antigo', competencia_nome: 'priorizacao', timestamp_resposta: '2026-09-13T12:00:00Z' }], trilho, agora)).toBe(true);
    expect(respondeuHojeNoTrilho([{ competencia_id: 'l1', timestamp_resposta: 'não é data' }], trilho, agora)).toBe(false);
    expect(respondeuHojeNoTrilho([{ competencia_id: 'l1', timestamp_resposta: null }], trilho, agora)).toBe(false);
  });

  it('trilhoDe só aceita o literal "lideranca"', () => {
    expect(trilhoDe('lideranca')).toBe('lideranca');
    expect(trilhoDe('LIDERANCA')).toBe('cargo');
    expect(trilhoDe(undefined)).toBe('cargo');
  });
});
