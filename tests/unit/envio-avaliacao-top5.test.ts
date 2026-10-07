import { describe, expect, it } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { prepararLoteTemplate } from '@/lib/notifications/envio-template-lote';

/**
 * O convite e a "avaliação parcial" medem a avaliação pela régua da TELA do assessment (07/10/2026).
 *
 * Ibipeba, 2ª jornada: o Top 5 dos cargos passou a ser só `Comunicação`, e 41 das 53 pessoas tinham
 * resposta da jornada 1 (outras competências). O lote contava QUALQUER competência respondida na empresa,
 * então excluía essas 41 do convite ("avaliação já iniciada") e mandaria a "avaliação parcial" com um
 * total que não existe na tela ("x de 7"). Aqui a conta é só sobre as competências do Top 5 do cargo
 * que têm cenário servível.
 */

const EMPRESA = { id: 'emp-1', nome: 'Secretaria de Ibipeba', slug: 'ibipeba', is_demo: false, sys_config: {} };

const COMP = (id: string, nome: string, cargo = 'Gestão Escolar') => ({ id, nome, cargo });
// Competências do cargo: duas da jornada 1 (fora do Top 5 agora) e Comunicação (a nova).
const COMPETENCIAS = [
  COMP('c-aut', 'Autocuidado e resiliência emocional'),
  COMP('c-plan', 'Planejamento e Organização'),
  COMP('c-com', 'Comunicação'),
  // A mesma competência tem uma linha por descritor: o cenário aponta para UMA delas.
  COMP('c-com-d1', 'Comunicação'),
];
const CENARIOS = [
  { cargo: 'Gestão Escolar', competencia_id: 'c-aut', tipo_cenario: null, nota_check: 70 },
  { cargo: 'Gestão Escolar', competencia_id: 'c-plan', tipo_cenario: null, nota_check: 70 },
  { cargo: 'Gestão Escolar', competencia_id: 'c-com', tipo_cenario: null, nota_check: 88 },
];

function banco(over: { cargos?: any[]; competencias?: any[]; cenarios?: any[]; respostas?: any[]; empresa?: any } = {}) {
  return criarSupabaseMock({
    resolver: (tabela) => (tabela === 'empresas' ? (over.empresa ?? EMPRESA) : null),
    lista: (tabela) => {
      if (tabela === 'cargos_empresa') return over.cargos ?? [{ nome: 'Gestão Escolar', top5_workshop: ['Comunicação'] }];
      if (tabela === 'competencias') return over.competencias ?? COMPETENCIAS;
      if (tabela === 'banco_cenarios') return over.cenarios ?? CENARIOS;
      if (tabela === 'respostas') return over.respostas ?? [];
      return [];
    },
  });
}

const pessoa = (id: string, over: any = {}) => ({
  id, nome_completo: `PESSOA ${id.toUpperCase()}`, cargo: 'Gestão Escolar', telefone: '5574999999999', perfil_dominante: 'D', ...over,
});

const preparar = (sb: any, template: string, colabs: any[]) =>
  prepararLoteTemplate(sb.client, { empresaId: 'emp-1', template, colabs });
const ids = (lote: any) => lote.alvos.map((a: any) => a.colaboradorId).sort();
const motivo = (lote: any, m: string) => lote.excluidos.find((e: any) => e.motivo === m)?.quantidade ?? 0;

describe('convite de competências: só conta o que é do Top 5 de hoje', () => {
  // A jornada 1 da Ana: respondeu duas competências que saíram do Top 5.
  const respostasAntigas = [
    { colaborador_id: 'ana', competencia_id: 'c-aut', competencia_nome: 'Autocuidado e resiliência emocional' },
    { colaborador_id: 'ana', competencia_id: 'c-plan', competencia_nome: 'Planejamento e Organização' },
  ];

  it('quem respondeu a jornada ANTERIOR e nada de Comunicação RECEBE o convite (era excluído)', async () => {
    const lote = await preparar(banco({ respostas: respostasAntigas }), 'avaliacao_competencias', [pessoa('ana'), pessoa('bia')]);
    expect(ids(lote)).toEqual(['ana', 'bia']);
    expect(lote.alvos[0].params[1]).toBe('Comunicação');
    expect(lote.excluidos).toEqual([]);
  });

  it('quem JÁ respondeu Comunicação não recebe: "avaliação já iniciada"', async () => {
    const sb = banco({ respostas: [...respostasAntigas, { colaborador_id: 'ana', competencia_id: 'c-com', competencia_nome: 'Comunicação' }] });
    const lote = await preparar(sb, 'avaliacao_competencias', [pessoa('ana'), pessoa('bia')]);
    expect(ids(lote)).toEqual(['bia']);
    expect(motivo(lote, 'avaliação já iniciada')).toBe(1);
  });

  it('a resposta casa por id de QUALQUER linha da competência, ou pelo nome gravado nela', async () => {
    const porId = banco({ respostas: [{ colaborador_id: 'ana', competencia_id: 'c-com-d1', competencia_nome: null }] });
    expect(ids(await preparar(porId, 'avaliacao_competencias', [pessoa('ana')]))).toEqual([]);
    const porNome = banco({ respostas: [{ colaborador_id: 'ana', competencia_id: null, competencia_nome: 'COMUNICAÇÃO' }] });
    expect(ids(await preparar(porNome, 'avaliacao_competencias', [pessoa('ana')]))).toEqual([]);
  });
});

describe('avaliação parcial: o denominador é o da tela', () => {
  it('quem só tem resposta da jornada anterior NÃO entra (era "x de 7")', async () => {
    const sb = banco({ respostas: [{ colaborador_id: 'ana', competencia_id: 'c-aut', competencia_nome: 'Autocuidado e resiliência emocional' }] });
    const lote = await preparar(sb, 'avaliacao_parcial', [pessoa('ana')]);
    expect(lote.alvos).toHaveLength(0);
    expect(motivo(lote, 'avaliação ainda não iniciada')).toBe(1);
  });

  it('Top 5 de duas competências, uma respondida: "1 de 2", sem contar as antigas nem a de outro cargo', async () => {
    const sb = banco({
      cargos: [{ nome: 'Gestão Escolar', top5_workshop: ['Comunicação', 'Planejamento e Organização'] }],
      respostas: [
        { colaborador_id: 'ana', competencia_id: 'c-aut', competencia_nome: 'Autocuidado e resiliência emocional' },  // fora do Top 5
        { colaborador_id: 'ana', competencia_id: 'c-com', competencia_nome: 'Comunicação' },                          // do Top 5
      ],
    });
    const lote = await preparar(sb, 'avaliacao_parcial', [pessoa('ana')]);
    expect(lote.alvos[0].params.slice(1, 3)).toEqual(['1', '2']);
  });

  it('quem respondeu TODO o Top 5 está concluído, mesmo com resposta antiga sobrando', async () => {
    const sb = banco({
      respostas: [
        { colaborador_id: 'ana', competencia_id: 'c-aut', competencia_nome: 'Autocuidado e resiliência emocional' },
        { colaborador_id: 'ana', competencia_id: 'c-com', competencia_nome: 'Comunicação' },
      ],
    });
    const lote = await preparar(sb, 'avaliacao_parcial', [pessoa('ana')]);
    expect(lote.alvos).toHaveLength(0);
    expect(motivo(lote, 'avaliação já concluída')).toBe(1);
  });
});

describe('que competência conta como "servida" pela tela', () => {
  it('competência do Top 5 SEM cenário não entra no total, e o convite nomeia a primeira que tem', async () => {
    const sb = banco({ cargos: [{ nome: 'Gestão Escolar', top5_workshop: ['Liderança sem cenário', 'Comunicação'] }] });
    const lote = await preparar(sb, 'avaliacao_competencias', [pessoa('ana')]);
    expect(lote.alvos[0].params[1]).toBe('Comunicação');
  });

  it('cenário B (do fechamento) não torna a competência servível', async () => {
    const sb = banco({ cenarios: [{ cargo: 'Gestão Escolar', competencia_id: 'c-com', tipo_cenario: 'cenario_b', nota_check: 90 }] });
    const lote = await preparar(sb, 'avaliacao_competencias', [pessoa('ana')]);
    expect(lote.alvos).toHaveLength(0);
    expect(motivo(lote, 'cargo sem cenários de avaliação')).toBe(1);
  });

  it('com nota mínima ligada na empresa, cenário abaixo do corte (ou sem nota) não conta', async () => {
    const empresa = { ...EMPRESA, sys_config: { cenario_nota_minima: 80 } };
    const abaixo = banco({ empresa, cenarios: [{ cargo: 'Gestão Escolar', competencia_id: 'c-com', tipo_cenario: null, nota_check: 79 }] });
    expect((await preparar(abaixo, 'avaliacao_competencias', [pessoa('ana')])).alvos).toHaveLength(0);
    const semNota = banco({ empresa, cenarios: [{ cargo: 'Gestão Escolar', competencia_id: 'c-com', tipo_cenario: null, nota_check: null }] });
    expect((await preparar(semNota, 'avaliacao_competencias', [pessoa('ana')])).alvos).toHaveLength(0);
    const noCorte = banco({ empresa, cenarios: [{ cargo: 'Gestão Escolar', competencia_id: 'c-com', tipo_cenario: null, nota_check: 80 }] });
    expect(ids(await preparar(noCorte, 'avaliacao_competencias', [pessoa('ana')]))).toEqual(['ana']);
  });

  it('sem a chave de nota mínima, nada é filtrado por nota (como a tela)', async () => {
    const sb = banco({ cenarios: [{ cargo: 'Gestão Escolar', competencia_id: 'c-com', tipo_cenario: null, nota_check: 12 }] });
    expect(ids(await preparar(sb, 'avaliacao_competencias', [pessoa('ana')]))).toEqual(['ana']);
  });

  it('o cenário de OUTRO cargo com o mesmo nome de competência não serve ao cargo da pessoa', async () => {
    const sb = banco({
      competencias: [...COMPETENCIAS, COMP('c-com-coord', 'Comunicação', 'Coordenação Pedagógica')],
      cenarios: [{ cargo: 'Coordenação Pedagógica', competencia_id: 'c-com-coord', tipo_cenario: null, nota_check: 90 }],
    });
    const lote = await preparar(sb, 'avaliacao_competencias', [pessoa('ana')]);
    expect(lote.alvos).toHaveLength(0);
    expect(motivo(lote, 'cargo sem cenários de avaliação')).toBe(1);
  });

  it('cenário gravado em OUTRO cargo mas apontando para a competência deste não serve (a tela filtra os dois lados)', async () => {
    // Dado inconsistente de verdade existe: a tela busca `banco_cenarios` por `cargo` E por ids de competência do cargo.
    const sb = banco({ cenarios: [{ cargo: 'Coordenação Pedagógica', competencia_id: 'c-com', tipo_cenario: null, nota_check: 90 }] });
    const lote = await preparar(sb, 'avaliacao_competencias', [pessoa('ana')]);
    expect(lote.alvos).toHaveLength(0);
    expect(motivo(lote, 'cargo sem cenários de avaliação')).toBe(1);
  });

  it('o casamento do Top 5 é por nome em minúsculas, como a tela', async () => {
    const sb = banco({ cargos: [{ nome: 'GESTÃO ESCOLAR', top5_workshop: ['COMUNICAÇÃO'] }] });
    const lote = await preparar(sb, 'avaliacao_competencias', [pessoa('ana')]);
    expect(lote.alvos[0].params[1]).toBe('COMUNICAÇÃO');
  });
});

describe('motivos de exclusão', () => {
  it('cargo sem Top 5 continua com o motivo próprio, mesmo havendo cenários', async () => {
    const sb = banco({ cargos: [{ nome: 'Gestão Escolar', top5_workshop: [] }] });
    const lote = await preparar(sb, 'avaliacao_competencias', [pessoa('ana')]);
    expect(motivo(lote, 'cargo sem competência em top5_workshop')).toBe(1);
  });

  it('Top 5 sem nenhum cenário é "cargo sem cenários de avaliação"', async () => {
    const lote = await preparar(banco({ cenarios: [] }), 'avaliacao_competencias', [pessoa('ana')]);
    expect(motivo(lote, 'cargo sem cenários de avaliação')).toBe(1);
  });
});

describe('leitura que falha LANÇA (nunca vira "ninguém respondeu")', () => {
  it.each(['respostas', 'banco_cenarios', 'competencias'])('erro em %s derruba a montagem do lote', async (tabela) => {
    const sb = banco();
    sb.falharEm({ tabela, op: 'select', mensagem: 'timeout no pool' });
    await expect(preparar(sb, 'avaliacao_competencias', [pessoa('ana')])).rejects.toThrow(tabela);
  });

  it('a mesma falha não afeta os convites que não leem a avaliação', async () => {
    const sb = banco();
    sb.falharEm({ tabela: 'competencias', op: 'select', mensagem: 'timeout no pool' });
    const lote = await preparar(sb, 'avaliacao_pendente', [pessoa('ana', { perfil_dominante: null })]);
    expect(ids(lote)).toEqual(['ana']);
  });
});
