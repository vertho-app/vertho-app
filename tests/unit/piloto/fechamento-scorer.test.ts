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

// `d1` padrão (1.5) fica ABAIXO do baseline (2.0): no piloto a trava muda a
// nota depois do texto, e a redação final entra. Com `d1` acima do baseline,
// nada muda depois do scorer e a redação não roda.
const scoreOk = (msg = 'Na degustação de 2 semanas, você demonstrou o método.', d1 = 1.5) => JSON.stringify({
  avaliacao_por_descritor: [
    { descritor: 'D1', nota_pre: 2.0, nota_pos: d1, justificativa: 'j1' },
    { descritor: 'D2', nota_pre: 2.5, nota_pos: 2.8, justificativa: 'j2' },
  ],
  nota_media_pre: 2.25,
  nota_media_pos: 2.15,
  resumo_avaliacao: { mensagem_geral: `Alias, ${msg}` },
});

const redacaoOk = (msg = 'Alias, na degustação de 2 semanas você sustentou o combinado.') => JSON.stringify({
  resumo_avaliacao: {
    mensagem_geral: msg,
    evidencias_citadas: ['trecho'],
    principal_avanco: 'combinado',
    principal_ponto_de_atencao: 'registro',
    mensagem_final: 'Você leva um jeito próprio de fechar combinados.',
    proximos_passos: ['Registre o combinado da próxima reunião'],
  },
});

const checkOk = JSON.stringify({ nota_auditoria: 91, status: 'aprovado', resumo_auditoria: 'coerente e corrigido' });

/** Responde por `taskKey`, não pela ordem: a redação entra entre o scorer e o check. */
type Filas = Partial<Record<'sem14_scorer' | 'sem14_redacao' | 'sem14_check', string[]>>;
function responder(filas: Filas) {
  mockAI.mockImplementation((async (_s: string, _u: string, _c: unknown, _m: unknown, opts: any) => {
    const fila = filas[opts?.taskKey as keyof Filas];
    if (!fila || fila.length === 0) throw new Error(`sem resposta preparada para ${opts?.taskKey}`);
    return fila.shift()!;
  }) as any);
}
const chamadas = (task: string) => mockAI.mock.calls.filter((c) => (c[4] as any)?.taskKey === task);

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

// Corpo em bloco: `mockReset()` devolve o próprio mock, e o Vitest chama o que
// o beforeEach devolve como limpeza, ou seja, chamaria a "IA" sem argumentos.
beforeEach(() => { mockAI.mockReset(); });

describe('fechamento-scorer — núcleo compartilhado', () => {
  it('piloto: aplica trava + spec e devolve meta operacional', async () => {
    responder({ sem14_scorer: [scoreOk()], sem14_redacao: [redacaoOk()], sem14_check: [checkOk] });
    const r = await pontuarFechamento(argsBase as any);
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    const d1 = r.parsed.avaliacao_por_descritor.find((d: any) => d.descritor === 'D1');
    expect(d1.nota_pos).toBe(2.0);           // travado no baseline
    expect(d1.nota_pos_bruto).toBe(1.5);     // bruto preservado
    expect(r.parsed.spec_version).toBe('piloto-v1');
    expect(r.meta).toMatchObject({ tentativas: 1, narrativaPilotoOk: true, specVersion: 'piloto-v1' });
    expect(r.auditoria.nota_auditoria).toBe(91);
    // O piso mudou a nota depois do texto: a devolutiva foi reescrita.
    expect(r.meta.redacao).toBe('reescrita');
  });

  it('piloto: narrativa incorrigível na 1ª → retry; meta.tentativas=2 + warning', async () => {
    responder({
      sem14_scorer: [scoreOk('11 das 13 semanas não geraram registros.'), scoreOk()], // incorrigível, depois boa
      sem14_redacao: [redacaoOk()],
      sem14_check: [checkOk],
    });
    const r = await pontuarFechamento(argsBase as any);
    expect(r.ok).toBe(true);
    expect(r.meta.tentativas).toBe(2);
    expect(r.meta.warnings.some(w => w.includes('narrativa piloto'))).toBe(true);
  });

  it('piloto: frase corrigível é sanitizada e marcada no meta', async () => {
    // D1 acima do baseline: sem piso, sem redação. O que se prova é a sanitização do rascunho.
    responder({ sem14_scorer: [scoreOk('ao final de 14 semanas, o resultado ficou claro.', 2.2)], sem14_check: [checkOk] });
    const r = await pontuarFechamento(argsBase as any);
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect(r.parsed.resumo_avaliacao.mensagem_geral).toContain('ao final de 2 semanas');
    expect(r.meta.sanitizacaoAplicada).toBe(true);
    expect(r.meta.tentativas).toBe(1);
    expect(r.meta.redacao).toBe('desnecessaria');
  });

  it('parse inválido 2x → ok:false com meta (nunca publica vazio)', async () => {
    mockAI.mockResolvedValue('não é json');
    const r = await pontuarFechamento(argsBase as any);
    expect(r.ok).toBe(false);
    expect(r.meta.tentativas).toBe(2);
    expect(r.meta.warnings.filter(w => w.includes('parse do scorer')).length).toBe(2);
  });

  it('check da 2ª IA falhando NÃO derruba o fechamento — vira warning', async () => {
    responder({ sem14_scorer: [scoreOk(undefined, 2.2)], sem14_check: ['quebrado'] });
    const r = await pontuarFechamento(argsBase as any);
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect(r.auditoria).toBeNull();
    expect(r.meta.warnings.some(w => w.includes('check da 2ª IA'))).toBe(true);
  });

  it('regeneração: appendixes entram nos prompts de scorer E check', async () => {
    responder({ sem14_scorer: [scoreOk()], sem14_redacao: [redacaoOk()], sem14_check: [checkOk] });
    const r = await pontuarFechamento({
      ...argsBase,
      regeracao: { feedbackAuditoria: 'Nota da auditoria: 70/100' },
    } as any);
    expect(r.ok).toBe(true);
    const systemScorer = String(chamadas('sem14_scorer')[0][0]);
    const systemCheck = String(chamadas('sem14_check')[0][0]);
    expect(systemScorer).toContain('REGERAÇÃO COM FEEDBACK');
    expect(systemScorer).toContain('Nota da auditoria: 70/100');
    expect(systemCheck).toContain('AUDITORIA DE SEGUNDA RODADA');
  });

  it('regular: SEM trava/spec e régua temporal 14/13', () => {
    const t = reguaTemporalDoPrograma(PROGRAMA_REGULAR_DUO);
    expect(t).toMatchObject({ isPiloto: false, semanaFinal: 14, semanasEvidencia: 13, notaPrograma: '' });
  });

  it('regular: nota abaixo do baseline passa SEM piso', async () => {
    responder({ sem14_scorer: [scoreOk('após 14 semanas de jornada.')], sem14_check: [checkOk] });
    const r = await pontuarFechamento({ ...argsBase, config: PROGRAMA_REGULAR_DUO } as any);
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    const d1 = r.parsed.avaliacao_por_descritor.find((d: any) => d.descritor === 'D1');
    expect(d1.nota_pos).toBe(1.5);                    // sem trava
    expect(d1.nota_pos_bruto).toBeUndefined();
    expect(r.parsed.spec_version).toBeUndefined();    // sem carimbo
    expect(r.meta.sanitizacaoAplicada).toBe(false);   // sanitização é piloto-only
    expect(r.meta.redacao).toBe('desnecessaria');     // nenhuma nota mudou depois do texto
    expect(chamadas('sem14_redacao')).toHaveLength(0);
  });

  const extracaoArg = (evs: any[]) => ({
    resumo: { leitura_geral: '', sustentacao_mais_forte: '', fragilidade_mais_relevante: '' },
    evidencias_por_descritor: evs,
  });

  it('arguição (regular): modula a nota do cenário antes de finalizar', async () => {
    responder({ sem14_scorer: [scoreOk('após 14 semanas.')], sem14_redacao: [redacaoOk('Alias, após 14 semanas você sustentou.')], sem14_check: [checkOk] });
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
    responder({ sem14_scorer: [scoreOk()], sem14_redacao: [redacaoOk()], sem14_check: [checkOk] });
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
