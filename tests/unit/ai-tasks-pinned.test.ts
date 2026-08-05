import { describe, expect, it } from 'vitest';
import { resolveTaskModel, PINNED_TASKS, DEFAULT_TASK_MODELS } from '@/lib/ai-tasks';

/**
 * PINNED_TASKS (Sprint 1): auditorias críticas são imunes ao `modelo_padrao`
 * genérico do tenant. Sem o pin, uma empresa que setasse um modelo barato
 * global rebaixaria silenciosamente a 2ª IA — o bug de precedência real do
 * resolveTaskModel que este teste trava.
 */
describe('resolveTaskModel — tasks pinned', () => {
  it('task pinned IGNORA o modelo_padrao do tenant (cai no default da task)', () => {
    const sysConfig = { ai: { modelo_padrao: 'gemini-3.1-flash-lite' } };
    for (const task of PINNED_TASKS) {
      expect(resolveTaskModel(sysConfig, task)).toBe(DEFAULT_TASK_MODELS[task]);
    }
  });

  it('override EXPLÍCITO por task vence mesmo em task pinned (reversibilidade da Onda 0)', () => {
    const sysConfig = {
      ai: {
        modelo_padrao: 'gemini-3.1-flash-lite',
        modelos: { modulo_base_auditor: 'gpt-5.4' },
      },
    };
    expect(resolveTaskModel(sysConfig, 'modulo_base_auditor')).toBe('gpt-5.4');
  });

  it('task NÃO-pinned continua herdando o modelo_padrao do tenant', () => {
    const sysConfig = { ai: { modelo_padrao: 'gemini-3.1-flash-lite' } };
    expect(resolveTaskModel(sysConfig, 'tarefa_qualquer_nao_pinned')).toBe('gemini-3.1-flash-lite');
  });

  it('sem config nenhuma cai no default da task ou no fallback global', () => {
    expect(resolveTaskModel(null, 'modulo_base_auditor')).toBe(DEFAULT_TASK_MODELS['modulo_base_auditor']);
    expect(resolveTaskModel({}, 'tarefa_desconhecida')).toBe('claude-sonnet-5');
  });

  it('toda task pinned tem default próprio (pin sem default cairia no fallback genérico)', () => {
    for (const task of PINNED_TASKS) {
      expect(DEFAULT_TASK_MODELS[task], `PINNED task sem default: ${task}`).toBeTruthy();
    }
  });

  // Decisão 22/07: TODAS as dupla-checagens (2ª IA auditando a 1ª) no GPT 5.6
  // Terra, e todas pinned — nenhuma auditoria pode ser rebaixada pelo genérico
  // do tenant nem divergir de modelo por drift de default.
  const CHECKS_DUAIS = [
    'ia3_check', 'ia4_check', 'cenarios_b_check',
    'acumulada_check', 'sem14_check', 'pulse_audit', 'modulo_base_auditor',
  ];

  it('todas as dupla-checagens têm default GPT 5.6 Terra', () => {
    for (const task of CHECKS_DUAIS) {
      expect(DEFAULT_TASK_MODELS[task], task).toBe('gpt-5.6-terra');
    }
  });

  it('todas as dupla-checagens são pinned', () => {
    for (const task of CHECKS_DUAIS) {
      expect(PINNED_TASKS.has(task), task).toBe(true);
    }
  });
});
