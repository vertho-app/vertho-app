import { describe, expect, it } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { VOTACAO_PENDENTE_V3 } from '../helpers/template-submetido-votacao-pendente-v3';
import {
  diaEmBrasilia,
  listarTemplatesDisparaveis,
  prepararLoteTemplate,
} from '@/lib/notifications/envio-template-lote';
import * as nucleoDoLote from '@/lib/notifications/envio-template-lote';
import { TEMPLATES } from '@/lib/whatsapp/templates';
import { contratoDoTemplate } from '@/lib/notifications/pilula-template';

/**
 * Lembrete da votação (25/09/2026), criado na primeira votação da 4Life. A v1
 * (`votacao_competencias`) foi aprovada como MARKETING e saiu da tela; a v2
 * (`votacao_pendente`) prometia "às 23h59 de amanhã", mas a votação só fecha
 * quando o admin a desliga (R-117), e saiu em 05/10/2026. Quem dispara é a v3,
 * `votacao_pendente_v3`: 3 variáveis, sem prazo. O dia de Brasília continua
 * valendo para o slot de um lembrete por pessoa por dia, e o servidor roda em UTC.
 */
const TEMPLATE = 'votacao_pendente_v3';

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

describe('o dia do slot é o de Brasília, não o do servidor (UTC)', () => {
  it('sexta à tarde é sexta', () => {
    expect(diaEmBrasilia(SEXTA_15H)).toBe('2026-09-25');
  });

  it('sexta 22h30 em Brasília ainda é sexta, embora já seja sábado em UTC', () => {
    const sexta2230 = new Date('2026-09-26T01:30:00Z');
    expect(diaEmBrasilia(sexta2230)).toBe('2026-09-25');
  });

  it('meia-noite e meia de sábado em Brasília já é sábado', () => {
    expect(diaEmBrasilia(new Date('2026-09-26T03:30:00Z'))).toBe('2026-09-26');
  });

  it('vira o mês', () => {
    expect(diaEmBrasilia(new Date('2026-10-01T15:00:00Z'))).toBe('2026-10-01');
  });
});

describe('o lembrete de votação deixou de calcular e de mandar prazo (R-117)', () => {
  it('o núcleo do lote não exporta mais `prazoDaVotacao`', () => {
    expect('prazoDaVotacao' in nucleoDoLote).toBe(false);
  });

  it('o contrato da v3 tem 3 parâmetros, mesmo quando o chamador ainda passa um prazo', () => {
    const montar = contratoDoTemplate(TEMPLATE)!;
    const { params, botaoParam } = montar({
      telefone: '5511999999999', nome: 'Ana', semana: 1, tema: '',
      slug: '4life-educacao', baseUrl: 'https://4life-educacao.vertho.ai',
      instituicao: '4Life Educação',
      // Um campo de prazo, como o do contrato antigo, é ignorado aqui.
      ...({ prazoVotacao: 'sábado, 26/09' } as any),
    });
    expect(params).toEqual(['Ana', '4Life Educação', 'https://4life-educacao.vertho.ai/dashboard/votacao']);
    expect(botaoParam).toBeNull();
  });
});

describe('lembrete de votação na tela de Envios', () => {
  it('a v3 aparece no grupo Entrada, com o corpo literal submetido e 3 variáveis', () => {
    const t = listarTemplatesDisparaveis().find((x) => x.template === TEMPLATE)!;
    expect(t).toBeDefined();
    expect(t.etapa).toBe('Entrada');
    expect(t.corpo).toBe(TEMPLATES.votacao_pendente_v3.body);
    expect(t.corpo).toBe(VOTACAO_PENDENTE_V3.body);
    expect(t.variaveis).toEqual(['primeiro nome', 'nome da instituição', 'link da votação']);
  });

  it('a v2 (`votacao_pendente`) e a v1, aprovadas, NÃO aparecem, não têm contrato e não podem ser disparadas', async () => {
    const nomes = listarTemplatesDisparaveis().map((x) => x.template);
    expect(nomes).not.toContain('votacao_pendente');
    expect(nomes).not.toContain('votacao_competencias');
    expect(TEMPLATES.votacao_competencias.category).toBe('MARKETING');
    // Sem contrato, o webhook de envio (`whatsapp-cis`) também recusa os dois.
    expect(contratoDoTemplate('votacao_competencias')).toBeNull();
    expect(contratoDoTemplate('votacao_pendente')).toBeNull();
    for (const antigo of ['votacao_competencias', 'votacao_pendente']) {
      await expect(prepararLoteTemplate(mock().client, {
        empresaId: 'emp-4life', template: antigo, colabs: [pessoa()], agora: SEXTA_15H,
      })).rejects.toThrow(/não é disparável/);
    }
  });

  it('a v3 diz o que falta fazer e quanto custa, sem prazo, e foi submetida como UTILITY', () => {
    const def = TEMPLATES.votacao_pendente_v3;
    expect(def.body.trim()).not.toMatch(/^\{\{\d+\}\}/);
    expect(def.body.trim()).not.toMatch(/\{\{\d+\}\}\.?$/);
    expect(def.body).toContain('Você pode votar em:\n{{3}}');
    expect(def.body).not.toMatch(/prazo|23h59|\{\{4\}\}/);
    expect(def.example).toHaveLength(3);
    expect(def.category).toBe('UTILITY');
  });
});

describe('prepararLoteTemplate(votacao_pendente_v3)', () => {
  it('monta nome, instituição e link direto da votação, nessa ordem, e NENHUM prazo', async () => {
    const lote = await preparar(mock(), [pessoa()]);
    expect(lote.alvos).toHaveLength(1);
    expect(lote.alvos[0].params).toEqual([
      'Ana',
      '4Life Educação',
      'https://4life-educacao.vertho.ai/dashboard/votacao',
    ]);
    expect(lote.alvos[0].params).toHaveLength(3);
    expect(lote.alvos[0].botaoParam).toBeNull();
    expect(lote.alvos[0].dedupeKey).toBe('votacao_pendente_v3:c1:dia:2026-09-25');
  });

  it('a prévia mostra o corpo da v3 com as 3 variáveis preenchidas, sem sobrar {{n}} nem prazo', async () => {
    const lote = await preparar(mock(), [pessoa()]);
    expect(lote.corpo).toBe(VOTACAO_PENDENTE_V3.body);
    const texto = lote.corpo.replace(/\{\{(\d+)\}\}/g, (_, n) => lote.alvos[0].params[Number(n) - 1] ?? '<<FALTOU>>');
    expect(texto).not.toContain('<<FALTOU>>');
    expect(texto).toContain('no programa da 4Life Educação,');
    expect(texto).toContain('Você pode votar em:\nhttps://4life-educacao.vertho.ai/dashboard/votacao');
    expect(texto).not.toMatch(/prazo|23h59/);
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
    const jaReceberam = [{ colaborador_id: 'c1', dedupe_key: 'votacao_pendente_v3:c1:dia:2026-09-25' }];
    const hoje = await preparar(mock({ jaReceberam }), [pessoa()]);
    expect(hoje.alvos).toHaveLength(0);
    expect(hoje.jaReceberam).toBe(1);

    const sabado = await preparar(mock({ jaReceberam }), [pessoa()], new Date('2026-09-26T15:00:00Z'));
    expect(sabado.alvos).toHaveLength(1);
    expect(sabado.alvos[0].dedupeKey).toBe('votacao_pendente_v3:c1:dia:2026-09-26');
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
