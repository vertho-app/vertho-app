import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { seloDaEtapa } from '@/lib/pipeline-fluxo/selo-etapa';
import { montarPreviaFluxo, type EntradaPrevia } from '@/lib/pipeline-fluxo/previa';

/**
 * Pedido do dono (16/10/2026) depois da simulação da Amazon: (1) um selo de "passou" em cada linha do painel, porque
 * na simulação toda etapa termina "pulada" e a palavra não dizia se ela PASSARIA; (2) "x de Y pessoas com o fluxo
 * inteiro", porque a tela listava etapa por etapa e não dizia quem sairia com tudo.
 */
describe('seloDaEtapa', () => {
  const sim = { dryRun: true };
  it('rodada real: o estado decide', () => {
    expect(seloDaEtapa({ estado: 'ok' }, { dryRun: false })).toBe('passou');
    expect(seloDaEtapa({ estado: 'parcial' }, { dryRun: false })).toBe('atencao');
    expect(seloDaEtapa({ estado: 'erro' }, { dryRun: false })).toBe('falhou');
    expect(seloDaEtapa({ estado: 'rodando' }, { dryRun: false })).toBe('rodando');
    expect(seloDaEtapa({ estado: 'aguardando' }, { dryRun: false })).toBe('aguardando');
  });

  it('simulação: a etapa "pulada" PASSA se ninguém está bloqueado nela, e pede atenção se alguém está', () => {
    expect(seloDaEtapa({ estado: 'pulado', detalhe: 'simulação: 14 pessoa(s) na fila' }, { ...sim, bloqueados: 0 })).toBe('passou');
    expect(seloDaEtapa({ estado: 'pulado', detalhe: 'simulação: 12 pessoa(s) na fila' }, { ...sim, bloqueados: 2 })).toBe('atencao');
    expect(seloDaEtapa({ estado: 'pulado', detalhe: 'simulação: seria gerado ao final' }, sim)).toBe('passou');
  });

  it('nada a fazer porque já foi feito é passar; gente esperando IA4 ou check é atenção', () => {
    expect(seloDaEtapa({ estado: 'pulado', detalhe: 'nada pendente' }, sim)).toBe('passou');
    expect(seloDaEtapa({ estado: 'pulado', detalhe: 'nenhum kit faltando' }, sim)).toBe('passou');
    expect(seloDaEtapa({ estado: 'pulado', detalhe: 'nenhum blueprint novo para auditar' }, sim)).toBe('passou');
    expect(seloDaEtapa({ estado: 'pulado', detalhe: 'nada a definir agora · 2 aguardando a avaliação da IA4' }, { dryRun: false })).toBe('atencao');
    expect(seloDaEtapa({ estado: 'pulado', detalhe: 'simulação: 0 pessoa(s) teriam a competência definida · 1 aguardando a 2ª checagem' }, sim)).toBe('atencao');
  });

  it('pulada por escolha (regra desligada, fora da seleção, escopo de turma) é neutra, nem passou nem falhou', () => {
    expect(seloDaEtapa({ estado: 'pulado', detalhe: 'desligada nesta empresa: vale a competência foco do cargo' }, sim)).toBe('neutro');
    expect(seloDaEtapa({ estado: 'pulado', detalhe: 'fora da seleção desta rodada' }, { dryRun: false })).toBe('neutro');
    expect(seloDaEtapa({ estado: 'pulado', detalhe: 'não filtra por turma: gere manualmente se quiser' }, { dryRun: false })).toBe('neutro');
  });
});

/** Três pessoas no mesmo cargo: uma com tudo pronto, uma que terá tudo se o fluxo rodar, uma bloqueada. */
const entrada = (over: Partial<EntradaPrevia> = {}): EntradaPrevia => ({
  pessoas: [
    { id: 'pronta', nome: 'Ana', cargo: 'CAIXA', focoIndividual: ['Rotina'] },
    { id: 'vai', nome: 'Bia', cargo: 'CAIXA', focoIndividual: ['Simplicidade'] },
    { id: 'bloq', nome: 'Caio', cargo: 'CAIXA' },
  ],
  cargos: [{ nome: 'CAIXA', foco: [], top5: 2 }],
  regraFoco: 'menor_nota',
  respostas: [
    { colaborador_id: 'pronta', competencia_nome: 'Rotina', avaliada: true, checada: true },
    { colaborador_id: 'vai', competencia_nome: 'Simplicidade', avaliada: true, checada: true },
  ],
  filaIA4: [],
  assessments: [{ colaborador_id: 'pronta', competencia: 'Rotina' }, { colaborador_id: 'vai', competencia: 'Simplicidade' }],
  blueprints: [{ colaborador_id: 'pronta', auditado: true }],
  pdis: ['pronta'],
  trilhas: ['pronta'],
  ...over,
});

describe('prévia: x de Y pessoas com o fluxo inteiro', () => {
  it('conta quem já tem tudo, quem teria tudo rodando, e diz o que falta a cada um', () => {
    const { pessoas } = montarPreviaFluxo(entrada());
    expect(pessoas.total).toBe(3);
    expect(pessoas.completas).toBe(1);
    expect(pessoas.completasProjetadas).toBe(2);
    expect(pessoas.incompletasProjetadas.map((i) => i.nome)).toEqual(['Caio']);
    expect(pessoas.incompletasProjetadas[0].faltam.join(' ')).toMatch(/Ainda não respondeu nenhum cenário/);
    // "Agora" a Bia ainda não tem blueprint, PDI nem trilha: ela aparece, com o que falta, e sem motivo de bloqueio.
    const bia = pessoas.incompletas.find((i) => i.nome === 'Bia')!;
    expect(bia.faltam.some((f) => /Blueprint: pronto para gerar/.test(f))).toBe(true);
  });

  it('quem ainda espera a IA4 aparece com a competência na lista do que falta (e conta na projeção)', () => {
    const e = entrada();
    e.pessoas.push({ id: 'espera', nome: 'Davi', cargo: 'CAIXA' });
    e.respostas.push({ colaborador_id: 'espera', competencia_nome: 'Rotina', avaliada: false });
    e.filaIA4.push({ colaborador_id: 'espera' });
    const { pessoas } = montarPreviaFluxo(e);
    expect(pessoas.completasProjetadas).toBe(3);
    const davi = pessoas.incompletas.find((i) => i.nome === 'Davi')!;
    expect(davi.faltam[0]).toMatch(/^Competência de cada pessoa \(menor nota\): depois da etapa anterior/);
  });

  it('a etapa da competência só conta para quem ela se aplica (regra ligada e sem trilha em curso)', () => {
    const desligada = montarPreviaFluxo(entrada({ regraFoco: null, cargos: [{ nome: 'CAIXA', foco: ['Rotina'], top5: 2 }], pessoas: [{ id: 'pronta', nome: 'Ana', cargo: 'CAIXA' }] }));
    expect(desligada.pessoas).toMatchObject({ total: 1, completas: 1, completasProjetadas: 1 });
  });
});

describe('a tela desenha o selo e o x de Y', () => {
  const pagina = readFileSync(join(process.cwd(), 'app', 'admin', 'empresas', '[empresaId]', 'fluxo', 'page.tsx'), 'utf8');
  it('cada linha do painel passa pelo seloDaEtapa, e o resumo de pessoas aparece no painel e na prévia', () => {
    expect(pagina).toMatch(/seloDaEtapa\(e, \{ dryRun: fluxo\.dryRun/);
    expect(pagina).toContain('o fluxo inteiro');
    expect((pagina.match(/<ResumoPessoas/g) || []).length).toBe(2);
  });
});
