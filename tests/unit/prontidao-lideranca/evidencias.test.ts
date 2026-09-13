import { describe, expect, it } from 'vitest';
import { extrairEvidencias, auditoriaPendente, normalizarAuditoria } from '@/lib/prontidao-lideranca/evidencias';

const avaliacao = {
  competencia: { codigo: 'GC04', nome: 'Conversa difícil' },
  avaliacao_por_descritor: [
    {
      numero: 1, nome: 'GC04_D1 — Nomeia o fato', nota_decimal: 3.2, nivel_sugerido: 3, confianca: 0.8, sustentacao: 'forte',
      evidencias: [{ resposta: 'R1', trecho: 'abri dizendo que o forecast dele estava zerado há três semanas', forca_evidencia: 'forte' }, { resposta: 'R2', trecho: '  ', forca_evidencia: 'fraca' }],
      limites_da_evidencia: [], racional: 'Cita o fato com data.',
    },
    { numero: 2, nome: 'Combinado e prazo', nota_decimal: 'x', evidencias: [], limites_da_evidencia: ['não fecha prazo'], racional: null },
  ],
  feedback: { resumo_geral: 'Boa abertura, sem fechamento.' },
};

describe('extrairEvidencias', () => {
  it('lê o JSON da IA4 (objeto ou string), tira o código do descritor e descarta trecho vazio', () => {
    for (const raw of [avaliacao, JSON.stringify(avaliacao)]) {
      const ev = extrairEvidencias({ id: 'r1', competencia_id: 'c1', competencia_nome: 'Conversa difícil', avaliacao_ia: raw, status_ia4: 'aprovado_com_ajustes', avaliado_em: '2026-09-13T10:00:00Z' });
      expect(ev).toMatchObject({ respostaId: 'r1', competenciaId: 'c1', competencia: 'Conversa difícil', auditoria: 'aprovado_com_ajustes', feedback: 'Boa abertura, sem fechamento.' });
      expect(ev.descritores).toHaveLength(2);
      expect(ev.descritores[0]).toMatchObject({ descritor: 'Nomeia o fato', nota: 3.2, nivelSugerido: 3, confianca: 0.8, sustentacao: 'forte', racional: 'Cita o fato com data.' });
      expect(ev.descritores[0].evidencias).toEqual([{ resposta: 'R1', trecho: 'abri dizendo que o forecast dele estava zerado há três semanas', forca: 'forte' }]);
      expect(ev.descritores[1]).toMatchObject({ descritor: 'Combinado e prazo', nota: null, limites: ['não fecha prazo'], evidencias: [] });
    }
  });

  it('sem avaliação → descritores vazios, nome da competência do próprio registro, auditoria null', () => {
    const ev = extrairEvidencias({ competencia_nome: 'Delegação', avaliacao_ia: null, status_ia4: null });
    expect(ev).toMatchObject({ competencia: 'Delegação', auditoria: null, descritores: [], feedback: null });
    expect(extrairEvidencias({ avaliacao_ia: '{json quebrado' }).descritores).toEqual([]);
  });

  it('prefere feedback_ia4 gravado ao resumo do JSON', () => {
    expect(extrairEvidencias({ avaliacao_ia: avaliacao, feedback_ia4: 'Texto gravado' }).feedback).toBe('Texto gravado');
  });
});

describe('auditoria da 2ª IA', () => {
  it('só os três status conhecidos contam; qualquer outro é null', () => {
    expect(normalizarAuditoria('aprovado')).toBe('aprovado');
    expect(normalizarAuditoria('revisar')).toBe('revisar');
    expect(normalizarAuditoria('erro')).toBeNull();
    expect(normalizarAuditoria(undefined)).toBeNull();
  });
  it('pendente quando alguma resposta está em revisar', () => {
    expect(auditoriaPendente([{ status_ia4: 'aprovado' }, { status_ia4: 'revisar' }])).toBe(true);
    expect(auditoriaPendente([{ status_ia4: 'aprovado' }, { status_ia4: null }])).toBe(false);
  });
});
