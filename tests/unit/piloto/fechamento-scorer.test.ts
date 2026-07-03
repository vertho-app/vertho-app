import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));

import { pontuarFechamento, reguaTemporalDoPrograma } from '@/lib/season-engine/fechamento-scorer';
import { PROGRAMA_PILOTO, PROGRAMA_REGULAR_DUO } from '@/lib/season-engine/programa-config';
import { callAI } from '@/actions/ai-client';

const mockAI = vi.mocked(callAI);

const DESCRITORES = [
  { descritor: 'D1', nota_atual: 2.0, n1_gap: 'x', n3_meta: 'y' },
  { descritor: 'D2', nota_atual: 2.5, n1_gap: 'x', n3_meta: 'y' },
];

const scoreOk = (msg = 'Na degustação de 2 semanas, você demonstrou o método.') => JSON.stringify({
  avaliacao_por_descritor: [
    { descritor: 'D1', nota_pre: 2.0, nota_pos: 1.5, justificativa: 'j1' }, // bruto < baseline
    { descritor: 'D2', nota_pre: 2.5, nota_pos: 2.8, justificativa: 'j2' },
  ],
  nota_media_pre: 2.25,
  nota_media_pos: 2.15,
  resumo_avaliacao: { mensagem_geral: `Alias, ${msg}` },
});

const checkOk = JSON.stringify({ nota_auditoria: 91, status: 'aprovado', resumo_auditoria: 'coerente e corrigido' });

const argsBase = {
  competencia: 'Comp X',
  descritores: DESCRITORES,
  cenario: '## Cenário',
  resposta: 'resposta do colab',
  nomeColab: 'Alias',
  evidenciasAcumuladas: 'evidências',
  acumuladoPrimaria: null,
  config: PROGRAMA_PILOTO,
};

beforeEach(() => mockAI.mockReset());

describe('fechamento-scorer — núcleo compartilhado', () => {
  it('piloto: aplica trava + spec e devolve meta operacional', async () => {
    mockAI.mockResolvedValueOnce(scoreOk()).mockResolvedValueOnce(checkOk);
    const r = await pontuarFechamento(argsBase as any);
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    const d1 = r.parsed.avaliacao_por_descritor.find((d: any) => d.descritor === 'D1');
    expect(d1.nota_pos).toBe(2.0);           // travado no baseline
    expect(d1.nota_pos_bruto).toBe(1.5);     // bruto preservado
    expect(r.parsed.spec_version).toBe('piloto-v1');
    expect(r.meta).toMatchObject({ tentativas: 1, narrativaPilotoOk: true, specVersion: 'piloto-v1' });
    expect(r.auditoria.nota_auditoria).toBe(91);
  });

  it('piloto: narrativa incorrigível na 1ª → retry; meta.tentativas=2 + warning', async () => {
    mockAI
      .mockResolvedValueOnce(scoreOk('11 das 13 semanas não geraram registros.')) // incorrigível
      .mockResolvedValueOnce(scoreOk())                                            // 2ª tentativa boa
      .mockResolvedValueOnce(checkOk);
    const r = await pontuarFechamento(argsBase as any);
    expect(r.ok).toBe(true);
    expect(r.meta.tentativas).toBe(2);
    expect(r.meta.warnings.some(w => w.includes('narrativa piloto'))).toBe(true);
  });

  it('piloto: frase corrigível é sanitizada e marcada no meta', async () => {
    mockAI
      .mockResolvedValueOnce(scoreOk('ao final de 14 semanas, o resultado ficou claro.'))
      .mockResolvedValueOnce(checkOk);
    const r = await pontuarFechamento(argsBase as any);
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect(r.parsed.resumo_avaliacao.mensagem_geral).toContain('ao final de 2 semanas');
    expect(r.meta.sanitizacaoAplicada).toBe(true);
    expect(r.meta.tentativas).toBe(1);
  });

  it('parse inválido 2x → ok:false com meta (nunca publica vazio)', async () => {
    mockAI.mockResolvedValue('não é json');
    const r = await pontuarFechamento(argsBase as any);
    expect(r.ok).toBe(false);
    expect(r.meta.tentativas).toBe(2);
    expect(r.meta.warnings.filter(w => w.includes('parse do scorer')).length).toBe(2);
  });

  it('check da 2ª IA falhando NÃO derruba o fechamento — vira warning', async () => {
    mockAI.mockResolvedValueOnce(scoreOk()).mockResolvedValueOnce('quebrado');
    const r = await pontuarFechamento(argsBase as any);
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect(r.auditoria).toBeNull();
    expect(r.meta.warnings.some(w => w.includes('check da 2ª IA'))).toBe(true);
  });

  it('regeneração: appendixes entram nos prompts de scorer E check', async () => {
    mockAI.mockResolvedValueOnce(scoreOk()).mockResolvedValueOnce(checkOk);
    const r = await pontuarFechamento({
      ...argsBase,
      regeracao: { feedbackAuditoria: 'Nota da auditoria: 70/100' },
    } as any);
    expect(r.ok).toBe(true);
    const systemScorer = String(mockAI.mock.calls[0][0]);
    const systemCheck = String(mockAI.mock.calls[1][0]);
    expect(systemScorer).toContain('REGERAÇÃO COM FEEDBACK');
    expect(systemScorer).toContain('Nota da auditoria: 70/100');
    expect(systemCheck).toContain('AUDITORIA DE SEGUNDA RODADA');
  });

  it('regular: SEM trava/spec e régua temporal 14/13', () => {
    const t = reguaTemporalDoPrograma(PROGRAMA_REGULAR_DUO);
    expect(t).toMatchObject({ isPiloto: false, semanaFinal: 14, semanasEvidencia: 13, notaPrograma: '' });
  });

  it('regular: nota abaixo do baseline passa SEM piso', async () => {
    mockAI.mockResolvedValueOnce(scoreOk('após 14 semanas de jornada.')).mockResolvedValueOnce(checkOk);
    const r = await pontuarFechamento({ ...argsBase, config: PROGRAMA_REGULAR_DUO } as any);
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    const d1 = r.parsed.avaliacao_por_descritor.find((d: any) => d.descritor === 'D1');
    expect(d1.nota_pos).toBe(1.5);                    // sem trava
    expect(d1.nota_pos_bruto).toBeUndefined();
    expect(r.parsed.spec_version).toBeUndefined();    // sem carimbo
    expect(r.meta.sanitizacaoAplicada).toBe(false);   // sanitização é piloto-only
  });

  const extracaoArg = (evs: any[]) => ({
    resumo: { leitura_geral: '', sustentacao_mais_forte: '', fragilidade_mais_relevante: '' },
    evidencias_por_descritor: evs,
  });

  it('arguição (regular): modula a nota do cenário antes de finalizar', async () => {
    mockAI.mockResolvedValueOnce(scoreOk('após 14 semanas.')).mockResolvedValueOnce(checkOk);
    const r = await pontuarFechamento({
      ...argsBase, config: PROGRAMA_REGULAR_DUO,
      evidenciasArguicao: extracaoArg([
        { descritor: 'D1', sustentou: 'aprofundou', forca: 'forte' },   // 1.5 → 2.0
        { descritor: 'D2', sustentou: 'fragilizou', forca: 'moderada' }, // 2.8 → 2.45→2.5
      ]),
    } as any);
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    const d1 = r.parsed.avaliacao_por_descritor.find((d: any) => d.descritor === 'D1');
    expect(d1.nota_base_cenario).toBe(1.5);
    expect(d1.ajuste_arguicao).toBe(0.5);
    expect(d1.nota_pos).toBe(2.0);            // modulada
    expect(r.meta.arguicaoAjustados).toBe(2);
  });

  it('arguição (piloto): fusão roda ANTES da trava — piso aplica sobre a nota fundida', async () => {
    mockAI.mockResolvedValueOnce(scoreOk()).mockResolvedValueOnce(checkOk);
    // D1 bruto 1.5, fragilizado −0.5 → 1.0; baseline (nota_atual) = 2.0 → trava para 2.0
    const r = await pontuarFechamento({
      ...argsBase,
      evidenciasArguicao: extracaoArg([{ descritor: 'D1', sustentou: 'fragilizou', forca: 'forte' }]),
    } as any);
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    const d1 = r.parsed.avaliacao_por_descritor.find((d: any) => d.descritor === 'D1');
    expect(d1.nota_base_cenario).toBe(1.5);
    expect(d1.nota_pos_bruto).toBe(1.0);     // fundido (1.5−0.5) preservado como bruto
    expect(d1.nota_pos).toBe(2.0);           // trava de piso sobre a nota fundida
  });
});
