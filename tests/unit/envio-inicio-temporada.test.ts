import { describe, expect, it } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { prepararLoteTemplate } from '@/lib/notifications/envio-template-lote';

/**
 * Quem recebe o `inicio_temporada` (08/10/2026): a MESMA regra do convite `avaliacao_competencias`
 * (tem o perfil e ainda não respondeu o Top 5 de hoje), com outro texto. A diferença é só o `{{2}}`:
 * o início nomeia TODAS as competências servíveis, o convite antigo nomeia a primeira.
 */

const EMPRESA = { id: 'emp-1', nome: 'Secretaria de Ibipeba', slug: 'ibipeba', is_demo: false, sys_config: {} };
const COMP = (id: string, nome: string, cargo = 'Gestão Escolar') => ({ id, nome, cargo });

const COMPETENCIAS = [
  COMP('c-aut', 'Autocuidado e resiliência emocional'),
  COMP('c-com', 'Comunicação'),
  COMP('c-lid', 'Liderança'),
  COMP('c-pla', 'Planejamento'),
];
const CENARIOS = ['c-aut', 'c-com', 'c-lid', 'c-pla'].map((id) => ({
  cargo: 'Gestão Escolar', competencia_id: id, tipo_cenario: null, nota_check: 90,
}));

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
  id, nome_completo: `ELDA ${id.toUpperCase()}`, cargo: 'Gestão Escolar', telefone: '5574999999999', perfil_dominante: 'D', ...over,
});
const preparar = (sb: any, template: string, colabs: any[]) =>
  prepararLoteTemplate(sb.client, { empresaId: 'emp-1', template, colabs });
const ids = (lote: any) => lote.alvos.map((a: any) => a.colaboradorId).sort();
const motivo = (lote: any, m: string) => lote.excluidos.find((e: any) => e.motivo === m)?.quantidade ?? 0;

const respostaAntiga = { colaborador_id: 'ana', competencia_id: 'c-aut', competencia_nome: 'Autocuidado e resiliência emocional' };

describe('inicio_temporada: os parâmetros', () => {
  it('nome, competência e o link do assessment do tenant, na ordem do contrato', async () => {
    const lote = await preparar(banco(), 'inicio_temporada', [pessoa('ana')]);
    expect(lote.alvos[0].params).toEqual(['Elda', 'Comunicação', 'https://ibipeba.vertho.ai/dashboard/assessment']);
  });

  it('com várias competências servíveis, nomeia TODAS: "A, B e C" (o convite antigo nomeia só a primeira)', async () => {
    const sb = banco({ cargos: [{ nome: 'Gestão Escolar', top5_workshop: ['Comunicação', 'Liderança', 'Planejamento'] }] });
    const novo = await preparar(sb, 'inicio_temporada', [pessoa('ana')]);
    expect(novo.alvos[0].params[1]).toBe('Comunicação, Liderança e Planejamento');
    const antigo = await preparar(sb, 'avaliacao_competencias', [pessoa('ana')]);
    expect(antigo.alvos[0].params[1]).toBe('Comunicação');
  });

  it('competência do Top 5 sem cenário NÃO é prometida na abertura', async () => {
    const sb = banco({ cargos: [{ nome: 'Gestão Escolar', top5_workshop: ['Sem cenário nenhum', 'Comunicação', 'Liderança'] }] });
    const lote = await preparar(sb, 'inicio_temporada', [pessoa('ana')]);
    expect(lote.alvos[0].params[1]).toBe('Comunicação e Liderança');
  });
});

describe('inicio_temporada: quem recebe', () => {
  it('quem só tem resposta da jornada ANTERIOR recebe (era o caso das 41 pessoas de Ibipeba)', async () => {
    const lote = await preparar(banco({ respostas: [respostaAntiga] }), 'inicio_temporada', [pessoa('ana'), pessoa('bia')]);
    expect(ids(lote)).toEqual(['ana', 'bia']);
  });

  it('quem JÁ respondeu uma competência do Top 5 de hoje não recebe a abertura', async () => {
    const sb = banco({ respostas: [respostaAntiga, { colaborador_id: 'ana', competencia_id: 'c-com', competencia_nome: 'Comunicação' }] });
    const lote = await preparar(sb, 'inicio_temporada', [pessoa('ana'), pessoa('bia')]);
    expect(ids(lote)).toEqual(['bia']);
    expect(motivo(lote, 'avaliação já iniciada')).toBe(1);
  });

  it('sem o perfil comportamental, não: o link levaria a uma tela que recusa', async () => {
    const lote = await preparar(banco(), 'inicio_temporada', [pessoa('ana', { perfil_dominante: null })]);
    expect(lote.alvos).toHaveLength(0);
    expect(motivo(lote, 'perfil comportamental ainda não concluído')).toBe(1);
  });

  it('com perfil EXTERNO a empresa não exige o DISC nativo (como o gate do Diagnóstico)', async () => {
    const empresa = { ...EMPRESA, sys_config: { perfil_externo_fonte: 'opq32' } };
    const lote = await preparar(banco({ empresa }), 'inicio_temporada', [pessoa('ana', { perfil_dominante: null })]);
    expect(ids(lote)).toEqual(['ana']);
  });

  it('cargo sem Top 5 e Top 5 sem cenário continuam com o motivo de cada um', async () => {
    const semTop5 = await preparar(banco({ cargos: [{ nome: 'Gestão Escolar', top5_workshop: [] }] }), 'inicio_temporada', [pessoa('ana')]);
    expect(motivo(semTop5, 'cargo sem competência em top5_workshop')).toBe(1);
    const semCenario = await preparar(banco({ cenarios: [] }), 'inicio_temporada', [pessoa('ana')]);
    expect(motivo(semCenario, 'cargo sem cenários de avaliação')).toBe(1);
  });

  it('sem WhatsApp cadastrado, não', async () => {
    const lote = await preparar(banco(), 'inicio_temporada', [pessoa('ana', { telefone: null })]);
    expect(lote.alvos).toHaveLength(0);
  });
});

describe('inicio_temporada: a regra é a mesma do convite antigo', () => {
  it('em qualquer combinação de resposta, perfil e cargo, os dois escolhem as MESMAS pessoas', async () => {
    const sb = banco({
      respostas: [
        respostaAntiga,
        { colaborador_id: 'caio', competencia_id: 'c-com', competencia_nome: 'Comunicação' },
      ],
    });
    const colabs = [
      pessoa('ana'), pessoa('bia'), pessoa('caio'),
      pessoa('dora', { perfil_dominante: null }),
      pessoa('edu', { cargo: 'Cargo sem Top 5' }),
    ];
    const novo = await preparar(sb, 'inicio_temporada', colabs);
    const antigo = await preparar(sb, 'avaliacao_competencias', colabs);
    expect(ids(novo)).toEqual(ids(antigo));
    expect(ids(novo)).toEqual(['ana', 'bia']);
    expect(novo.excluidos.map((e) => [e.motivo, e.quantidade]).sort())
      .toEqual(antigo.excluidos.map((e) => [e.motivo, e.quantidade]).sort());
  });

  it('o `avaliacao_competencias` continua nomeando só a primeira (nada mudou para ele)', async () => {
    const sb = banco({ cargos: [{ nome: 'Gestão Escolar', top5_workshop: ['Comunicação', 'Liderança'] }] });
    const lote = await preparar(sb, 'avaliacao_competencias', [pessoa('ana')]);
    expect(lote.alvos[0].params[1]).toBe('Comunicação');
  });
});

describe('inicio_temporada_v2 (a versão enxuta): os parâmetros e o público', () => {
  it('nome, competência, INSTITUIÇÃO e link do assessment, na ordem do contrato', async () => {
    const lote = await preparar(banco(), 'inicio_temporada_v2', [pessoa('ana')]);
    expect(lote.alvos[0].params).toEqual([
      'Elda', 'Comunicação', 'Secretaria de Ibipeba', 'https://ibipeba.vertho.ai/dashboard/assessment',
    ]);
  });

  it('com várias competências servíveis, nomeia TODAS, como o texto anterior', async () => {
    const sb = banco({ cargos: [{ nome: 'Gestão Escolar', top5_workshop: ['Comunicação', 'Liderança', 'Planejamento'] }] });
    const lote = await preparar(sb, 'inicio_temporada_v2', [pessoa('ana')]);
    expect(lote.alvos[0].params[1]).toBe('Comunicação, Liderança e Planejamento');
  });

  it('os TRÊS textos escolhem as MESMAS pessoas e dão os mesmos motivos de exclusão', async () => {
    const sb = banco({
      respostas: [respostaAntiga, { colaborador_id: 'caio', competencia_id: 'c-com', competencia_nome: 'Comunicação' }],
    });
    const colabs = [
      pessoa('ana'), pessoa('bia'), pessoa('caio'),
      pessoa('dora', { perfil_dominante: null }),
      pessoa('edu', { cargo: 'Cargo sem Top 5' }),
    ];
    const v2 = await preparar(sb, 'inicio_temporada_v2', colabs);
    const v1 = await preparar(sb, 'inicio_temporada', colabs);
    const convite = await preparar(sb, 'avaliacao_competencias', colabs);
    expect(ids(v2)).toEqual(['ana', 'bia']);
    expect(ids(v2)).toEqual(ids(v1));
    expect(ids(v2)).toEqual(ids(convite));
    const motivos = (l: any) => l.excluidos.map((e: any) => [e.motivo, e.quantidade]).sort();
    expect(motivos(v2)).toEqual(motivos(convite));
  });

  it('sem o nome da instituição NÃO sai: o corpo diria "no programa da , já está disponível"', async () => {
    const empresa = { ...EMPRESA, nome: '' };
    const v2 = await preparar(banco({ empresa }), 'inicio_temporada_v2', [pessoa('ana')]);
    expect(v2.alvos).toHaveLength(0);
    expect(motivo(v2, 'empresa sem nome cadastrado')).toBe(1);
    // O texto anterior não cita a instituição, então não depende dela.
    const v1 = await preparar(banco({ empresa }), 'inicio_temporada', [pessoa('ana')]);
    expect(ids(v1)).toEqual(['ana']);
  });
});

describe('inicio_temporada: leitura que falha lança', () => {
  it.each(['respostas', 'banco_cenarios', 'competencias'])('erro em %s derruba a montagem do lote', async (tabela) => {
    const sb = banco();
    sb.falharEm({ tabela, op: 'select', mensagem: 'timeout no pool' });
    await expect(preparar(sb, 'inicio_temporada', [pessoa('ana')])).rejects.toThrow(tabela);
  });
});
