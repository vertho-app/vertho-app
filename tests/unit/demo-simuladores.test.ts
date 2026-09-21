import { describe, it, expect } from 'vitest';
import { catalogoInicial } from '@/lib/recepcao/catalogo';
import { visaoPorCompetencia } from '@/lib/recepcao/painel';
import { agregarPainel } from '@/lib/simulador-vendas/painel';
import { cenarioSchema, relatorioSchema } from '@/lib/simulador-vendas/schema';
import { sinteseDaJornada, diagnosticarAvaliacao, linhasDoEncontro } from '@/lib/simulador-lideranca/avaliacao';
import { elencoSimuladoresDemo } from '@/lib/demo/seed-simuladores';
import { dataDemo, idDemoSimulador, jornadaLiderancaDemo, treinoAtendimentoDemo, treinoVendasDemo } from '@/lib/demo/simuladores-fixture';

const agora = new Date('2026-09-21T12:00:00Z');
const pessoas = ['Bruna', 'Ana', 'Paulo', 'Diego'].map((nome, i) => ({ id: String(i), nome, cargo: 'Representante Comercial' }));

describe('históricos demonstrativos dos simuladores', () => {
  it('recusa empresas reais e convidados e mantém IDs estáveis por tenant/pessoa', () => {
    expect(elencoSimuladoresDemo('acme-demo', false).size).toBe(0);
    expect(elencoSimuladoresDemo('cliente-real', true).size).toBe(0);
    const elenco = elencoSimuladoresDemo('acme-demo', true);
    expect(elenco.has('bruna.demo@vertho.ai')).toBe(true);
    expect(elenco.has('prospect.demo@vertho.ai')).toBe(false);
    expect(idDemoSimulador('acme:bruna')).toBe(idDemoSimulador('acme:bruna'));
    expect(idDemoSimulador('acme:bruna')).not.toBe(idDemoSimulador('escolas:bruna'));
  });
  it('atendimento aparece nos níveis da equipe com avanço e com pessoas sem treino', () => {
    const c = catalogoInicial.find((c) => c.desfechos.includes('encaminhado'))!;
    const rows = pessoas.slice(0, 3).flatMap((p, i) => [0, 1].map((tentativa) => ({ colaborador_id: p.id, created_at: dataDemo(agora, tentativa ? 2 : 12), estado: treinoAtendimentoDemo(c, idDemoSimulador(`${p.id}:${tentativa}`), i, tentativa) })));
    const codigos = rows[0].estado.relatorio!.competencias!.map((c) => c.codigo);
    const painel = visaoPorCompetencia(rows, pessoas, codigos);
    expect(painel.naoTreinaram).toHaveLength(1);
    expect(painel.competencias).toHaveLength(5);
    for (const c of painel.competencias) expect(c.niveis.reduce((a, b) => a + b, 0)).toBe(3);
    for (const row of rows) {
      expect(row.estado.relatorio!.escalaNota).toBe('1-4');
      expect(row.estado.relatorio!.coberturaPercentual).toBe(100);
      expect(row.estado.relatorio!.dimensoes).toHaveLength(30);
      expect(row.estado.relatorio!.descartados || []).toHaveLength(0);
    }
  });
  it('vendas tem relatório legível, pesquisa, evolução e pós-venda sem nota indevida', () => {
    const sessoes = pessoas.slice(0, 3).flatMap((p, i) => [0, 1].map((tentativa) => ({ pessoa: p, estado: treinoVendasDemo(idDemoSimulador(`vendas:${i}:${tentativa}`), p.nome, i, tentativa, dataDemo(agora, tentativa ? 2 : 12)) })));
    const painel = agregarPainel(pessoas, sessoes.map(({ pessoa, estado: s }) => ({ colaboradorId: pessoa.id, criadoEm: s.criadoEm, status: s.status, competencias: s.relatorio!, feedback: s.feedback })));
    expect(painel.resumo.concluiram).toBe(3);
    expect(painel.resumo.naoComecaram).toBe(1);
    expect(painel.pesquisa.respostas).toBe(6);
    for (const { estado: s } of sessoes) {
      expect(relatorioSchema.safeParse(s.relatorio).success).toBe(true);
      expect(cenarioSchema.safeParse(s.cenario).success).toBe(true);
      expect(s.relatorio!.Matriz!.descritores.filter((d) => ['E5', 'E6'].includes(d.codigo)).every((d) => d.nivel === null)).toBe(true);
    }
  });
  it.each(['lider', 'futuro'] as const)('liderança %s mantém fontes válidas e síntese nas cinco competências', (variante) => {
    const modelos = { abertura: 'demo', personagem: 'demo', consequencia: 'demo', avaliador: 'demo' };
    const s = jornadaLiderancaDemo(`tenant:${variante}`, variante, 1, 5, agora, modelos, modelos);
    for (const e of s.concluidos) expect(diagnosticarAvaliacao(e.avaliacao!, e, linhasDoEncontro(s.matriz, e.indice)).invalidos).toEqual([]);
    const sintese = sinteseDaJornada(s.concluidos, s.matriz, 5);
    expect(sintese.concluida).toBe(true);
    expect(sintese.competencias).toHaveLength(5);
    expect(sintese.competencias.every((c) => c.nivelAlcancado !== null)).toBe(true);
    expect(sintese.competencias.some((c) => c.subiu)).toBe(true);
  });
});
