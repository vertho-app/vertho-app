import { describe, expect, it } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import {
  diaEmBrasilia,
  listarTemplatesDisparaveis,
  prazoDaVotacao,
  prepararLoteTemplate,
} from '@/lib/notifications/envio-template-lote';
import { TEMPLATES } from '@/lib/whatsapp/templates';
import { contratoDoTemplate } from '@/lib/notifications/pilula-template';

/**
 * Lembrete da votação (25/09/2026), criado na primeira votação da 4Life. A v1
 * (`votacao_competencias`) foi aprovada como MARKETING e saiu da tela; quem
 * dispara é a v2, `votacao_pendente`. O prazo prometido é "às 23h59 de amanhã",
 * e "amanhã" é em BRASÍLIA — o servidor roda em UTC.
 */
const TEMPLATE = 'votacao_pendente';

const EMPRESA = { id: 'emp-4life', nome: '4Life Educação', slug: '4life-educacao', is_demo: false };
const PROF = 'Professor(a) de Educação Infantil';

// Sexta-feira, 25/09/2026, 15h em Brasília (18h UTC).
const SEXTA_15H = new Date('2026-09-25T18:00:00Z');

const comp = (cod: string, nome: string) => ({ nome, cod_comp: cod, descricao: null, pilar: null });

function mock(opts: {
  aberta?: boolean;
  votos?: any[];
  top10?: any[];
  matriz?: any[];
  jaReceberam?: any[];
} = {}) {
  const matriz = opts.matriz ?? [];
  return criarSupabaseMock({
    resolver: (tabela) => (tabela === 'empresas'
      ? { ...EMPRESA, sys_config: { votacao_ativa: opts.aberta ?? true } }
      : null),
    lista: (tabela) => {
      if (tabela === 'cargos_empresa') return [{ nome: PROF, top5_workshop: [] }];
      if (tabela === 'notification_deliveries') return opts.jaReceberam ?? [];
      if (tabela === 'votacao_competencias') return opts.votos ?? [];
      if (tabela === 'top10_cargos') return opts.top10 ?? [{ cargo: PROF, competencia: comp('COO01', 'Ação Pedagógica') }];
      if (tabela === 'competencias') return matriz;
      return [];
    },
    contagem: (tabela) => (tabela === 'competencias' ? matriz.length : null),
  });
}

const pessoa = (over: any = {}) => ({
  id: 'c1', nome_completo: 'ANA SOUZA', cargo: PROF, telefone: '5511999999999', ...over,
});

const preparar = (sb: any, colabs: any[], agora = SEXTA_15H) =>
  prepararLoteTemplate(sb.client, { empresaId: 'emp-4life', template: TEMPLATE, colabs, agora });

describe('prazoDaVotacao — "amanhã" em Brasília', () => {
  it('sexta à tarde promete sábado', () => {
    expect(prazoDaVotacao(SEXTA_15H)).toBe('sábado, 26/09');
  });

  it('sexta 22h30 em Brasília ainda é sexta, embora já seja sábado em UTC', () => {
    const sexta2230 = new Date('2026-09-26T01:30:00Z');
    expect(diaEmBrasilia(sexta2230)).toBe('2026-09-25');
    expect(prazoDaVotacao(sexta2230)).toBe('sábado, 26/09');
  });

  it('meia-noite e meia de sábado em Brasília promete domingo', () => {
    expect(prazoDaVotacao(new Date('2026-09-26T03:30:00Z'))).toBe('domingo, 27/09');
  });

  it('vira o mês', () => {
    expect(prazoDaVotacao(new Date('2026-09-30T15:00:00Z'))).toBe('quinta-feira, 01/10');
  });
});

describe('lembrete de votação na tela de Envios', () => {
  it('a v2 aparece no grupo Entrada, com o corpo literal e 4 variáveis', () => {
    const t = listarTemplatesDisparaveis().find((x) => x.template === TEMPLATE)!;
    expect(t).toBeDefined();
    expect(t.etapa).toBe('Entrada');
    expect(t.corpo).toBe(TEMPLATES.votacao_pendente.body);
    expect(t.variaveis).toHaveLength(4);
  });

  it('a v1, aprovada como MARKETING, NÃO aparece, não tem contrato e não pode ser disparada', async () => {
    expect(listarTemplatesDisparaveis().map((x) => x.template)).not.toContain('votacao_competencias');
    expect(TEMPLATES.votacao_competencias.category).toBe('MARKETING');
    // Sem contrato, o webhook de envio (`whatsapp-cis`) também recusa a v1.
    expect(contratoDoTemplate('votacao_competencias')).toBeNull();
    await expect(prepararLoteTemplate(mock().client, {
      empresaId: 'emp-4life', template: 'votacao_competencias', colabs: [pessoa()], agora: SEXTA_15H,
    })).rejects.toThrow(/não é disparável/);
  });

  it('o prazo da v2 é data de vencimento no meio do corpo, e a v2 foi submetida como UTILITY', () => {
    const def = TEMPLATES.votacao_pendente;
    expect(def.body.trim()).not.toMatch(/^\{\{\d+\}\}/);
    expect(def.body.trim()).not.toMatch(/\{\{\d+\}\}\.?$/);
    expect(def.body).toContain('O prazo para registro do voto é {{4}}, às 23h59.');
    expect(def.body).toContain('Você pode votar em:\n{{3}}');
    expect(def.example).toHaveLength(4);
    expect(def.category).toBe('UTILITY');
  });
});

describe('prepararLoteTemplate(votacao_pendente)', () => {
  it('monta nome, instituição, link direto da votação e prazo de amanhã — nessa ordem', async () => {
    const lote = await preparar(mock(), [pessoa()]);
    expect(lote.alvos).toHaveLength(1);
    expect(lote.alvos[0].params).toEqual([
      'Ana',
      '4Life Educação',
      'https://4life-educacao.vertho.ai/dashboard/votacao',
      'sábado, 26/09',
    ]);
    expect(lote.alvos[0].dedupeKey).toBe('votacao_pendente:c1:dia:2026-09-25');
  });

  it('votação fechada: ninguém recebe, e o motivo aparece', async () => {
    const lote = await preparar(mock({ aberta: false }), [pessoa()]);
    expect(lote.alvos).toHaveLength(0);
    expect(lote.excluidos).toEqual([expect.objectContaining({ motivo: 'votação não está aberta', quantidade: 1 })]);
  });

  it('quem já votou não recebe o lembrete', async () => {
    const lote = await preparar(mock({ votos: [{ colaborador_id: 'c1' }] }), [pessoa(), pessoa({ id: 'c2', nome_completo: 'Bia Lima' })]);
    expect(lote.alvos.map((a) => a.colaboradorId)).toEqual(['c2']);
    expect(lote.excluidos).toEqual([expect.objectContaining({ motivo: 'já votou', quantidade: 1 })]);
  });

  it('cargo sem cédula não recebe (abriria uma lista vazia)', async () => {
    const lote = await preparar(mock(), [pessoa({ cargo: 'Diretor(a)' })]);
    expect(lote.alvos).toHaveLength(0);
    expect(lote.excluidos[0].motivo).toBe('cargo sem competências na cédula');
  });

  it('cargo sem Top 10 mas com matriz recebe: a cédula dele é a matriz inteira', async () => {
    const sb = mock({
      top10: [],
      matriz: [{ ...comp('PRO01', 'Entusiasmo e Energia'), cargo: 'Auxiliar de Desenvolvimento Infantil' }],
    });
    const lote = await preparar(sb, [pessoa({ cargo: 'auxiliar de desenvolvimento infantil' })]);
    expect(lote.alvos).toHaveLength(1);
  });

  it('um lembrete por pessoa POR DIA: hoje não repete, amanhã pode voltar', async () => {
    const jaReceberam = [{ colaborador_id: 'c1', dedupe_key: 'votacao_pendente:c1:dia:2026-09-25' }];
    const hoje = await preparar(mock({ jaReceberam }), [pessoa()]);
    expect(hoje.alvos).toHaveLength(0);
    expect(hoje.jaReceberam).toBe(1);

    const sabado = await preparar(mock({ jaReceberam }), [pessoa()], new Date('2026-09-26T15:00:00Z'));
    expect(sabado.alvos).toHaveLength(1);
    expect(sabado.alvos[0].params[3]).toBe('domingo, 27/09');
  });

  it('falha ao ler os votos LANÇA, nunca vira "ninguém votou"', async () => {
    const sb = mock({ votos: [{ colaborador_id: 'c1' }] });
    sb.falharEm({ tabela: 'votacao_competencias', op: 'select', mensagem: 'timeout no pool' });
    await expect(preparar(sb, [pessoa()])).rejects.toThrow(/votacao_competencias/);
  });

  it('matriz cortada pelo teto de linhas LANÇA, nunca vira "cargo sem cédula"', async () => {
    const matriz = [{ ...comp('PRO01', 'Entusiasmo e Energia'), cargo: PROF }];
    const sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'empresas' ? { ...EMPRESA, sys_config: { votacao_ativa: true } } : null),
      lista: (tabela) => (tabela === 'competencias' ? matriz : tabela === 'cargos_empresa' ? [] : []),
      contagem: (tabela) => (tabela === 'competencias' ? 1500 : null),
    });
    await expect(preparar(sb, [pessoa()])).rejects.toThrow(/cortada/);
  });

  it('as leituras da votação filtram pela empresa', async () => {
    const sb = mock();
    await preparar(sb, [pessoa()]);
    for (const tabela of ['votacao_competencias', 'top10_cargos', 'competencias']) {
      expect(sb.chamadas.some((c) => c.tabela === tabela && c.metodo === 'eq' && c.args[0] === 'empresa_id' && c.args[1] === 'emp-4life')).toBe(true);
    }
  });
});
