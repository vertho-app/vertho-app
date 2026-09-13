import { describe, expect, it } from 'vitest';
import { renderParecerPDF, renderConsolidadoPDF } from '@/lib/prontidao-lideranca/parecer-pdf';
import type { Parecer, ProntidaoLideranca } from '@/lib/prontidao-lideranca/agregar';
import type { LinhaMatriz } from '@/lib/prontidao-lideranca/matriz';

/**
 * Smoke do render: o PDF do parecer é VIEW pura do que a agregação calculou.
 * O que se prova aqui é que a composição renderiza com dados reais de forma
 * (quadrante, gaps ancorados, evidências, avisos) — a fonte externa pode não
 * carregar no CI e o react-pdf cai no default sem quebrar.
 */
const linha: LinhaMatriz = {
  colaboradorId: '11111111-2222-4333-8444-555555555555', nome: 'Ana Souza', cargo: 'Vendedora', quadrante: 'pronta_com_custo',
  posicao: {
    colaboradorId: 'x', total: 2, cobertas: 2, completo: true, faltantes: [], mediaGeral: 3.4, nivelGeral: 3, posicao: 'demonstra', gaps: ['Delegação'],
    competencias: [
      { competencia: 'Priorização', media: 3.8, nivel: 4, descritores: 6, posicao: 'demonstra', gap: false },
      { competencia: 'Delegação', media: 2.4, nivel: 2, descritores: 6, posicao: 'nao_demonstra', gap: true },
    ],
  },
  estilo: { colaboradorId: 'x', nome: 'Ana Souza', aderenciaPct: 61.2, estilo: 'distante', status: 'abaixo_do_corte', statusLabel: 'Abaixo do corte', bloqueadoNoAlvo: false, motivosBloqueio: [], lacunas: [{ traco: 'Comando', bloco: 'Competencia', fitPct: 40 }], borderline: false },
  frasesGap: ['Delegação — média 2,40 (corte 3,00)'],
  ehExemplar: true,
  auditoriaPendente: true,
};

const parecer: Parecer = {
  linha, calculadoEm: '2026-09-13T15:00:00Z', cargoAlvo: 'Gerente Comercial', corte: 3, banda: 0.33,
  evidencias: [
    { respostaId: 'r1', competenciaId: 'c1', competencia: 'Priorização', auditoria: 'aprovado', avaliadoEm: null, feedback: null, descritores: [
      { descritor: 'Foco no que move o número', nota: 3.8, nivelSugerido: 4, confianca: 0.9, sustentacao: 'forte', racional: null, limites: [], evidencias: [{ resposta: 'R1', trecho: 'listei as três contas que decidem o trimestre antes de abrir a agenda', forca: 'forte' }] },
    ] },
    { respostaId: null, competenciaId: null, competencia: 'Delegação', auditoria: 'revisar', avaliadoEm: null, feedback: null, descritores: [
      { descritor: 'Combinado e prazo', nota: 2.4, nivelSugerido: 2, confianca: 0.6, sustentacao: 'fraca', racional: null, limites: ['não fecha prazo'], evidencias: [] },
    ] },
  ],
};

const consolidado: ProntidaoLideranca = {
  cargoAlvo: 'Gerente Comercial', competencias: ['Priorização', 'Delegação'], calculadoEm: '2026-09-13T15:00:00Z', corte: 3, banda: 0.33,
  populacao: 4, linhas: [linha], porQuadrante: { pronta: 0, pronta_com_custo: 1, potencial: 0, nao_agora: 0, revisar: 0 },
  incompletos: [{ colaboradorId: 'b', nome: 'Bia', cargo: 'SDR', cobertas: 1, total: 2, faltantes: ['Delegação'] }],
  semEstilo: [{ colaboradorId: 'c', nome: 'Caio', cargo: null, motivo: 'sem perfil comportamental' }],
  naoIniciados: 1, exemplares: [linha.colaboradorId], faixas: { recomendadoMin: 86.5, ressalvasMin: 75.4 },
  avisos: ['2 medida(s) do gabarito do alvo não discriminam neste pool (ver Calibração do gabarito).'],
};

describe('PDF de prontidão para liderança', () => {
  it('renderiza o parecer individual', async () => {
    const buf = await renderParecerPDF({ empresaNome: 'ACME', parecer, competencias: ['Priorização', 'Delegação'] });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    expect(buf.length).toBeGreaterThan(4000);
  }, 30000);

  it('renderiza o consolidado da equipe', async () => {
    const buf = await renderConsolidadoPDF({ empresaNome: 'ACME', data: consolidado });
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    expect(buf.length).toBeGreaterThan(4000);
  }, 30000);
});
