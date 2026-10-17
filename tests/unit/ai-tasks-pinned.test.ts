import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COPILOTO_RESEARCH_FALLBACK_MODEL,
  DEFAULT_COPILOTO_RESEARCH_MODEL,
  DEFAULT_TASK_MODELS,
  PINNED_TASKS,
  resolveTaskModel,
} from '@/lib/ai-tasks';

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

  it('blueprint e trilha do fluxo completo: incumbente 4.6 EXPLÍCITO, imune ao modelo_padrao, com override por task valendo', () => {
    const barato = { ai: { modelo_padrao: 'gemini-3.1-flash-lite' } };
    for (const task of ['blueprint_gerar', 'temporada_desafio']) {
      expect(resolveTaskModel(barato, task), task).toBe('claude-sonnet-4-6');
      expect(resolveTaskModel({ ai: { modelos: { [task]: 'claude-sonnet-5-5' } } }, task), task).toBe('claude-sonnet-5-5');
    }
  });

  it('task NÃO-pinned continua herdando o modelo_padrao do tenant', () => {
    const sysConfig = { ai: { modelo_padrao: 'gemini-3.1-flash-lite' } };
    expect(resolveTaskModel(sysConfig, 'tarefa_qualquer_nao_pinned')).toBe('gemini-3.1-flash-lite');
  });

  it('sem config nenhuma cai no default da task ou no fallback global', () => {
    expect(resolveTaskModel(null, 'modulo_base_auditor')).toBe(DEFAULT_TASK_MODELS['modulo_base_auditor']);
    expect(resolveTaskModel({}, 'tarefa_desconhecida')).toBe('claude-sonnet-4-6');
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

  it('todas as pesquisas do Copiloto usam Terra, com Sol como fallback central', () => {
    const pesquisas = [
      'copiloto_pesquisa_empresa',
      'copiloto_pesquisa_social_oficial',
      'copiloto_pesquisa_noticias_externas',
      'copiloto_pesquisa_pessoas',
      'copiloto_pesquisa_pessoa',
    ];

    expect(DEFAULT_COPILOTO_RESEARCH_MODEL).toBe('gpt-5.6-terra');
    expect(DEFAULT_COPILOTO_RESEARCH_FALLBACK_MODEL).toBe('gpt-5.6-sol');
    for (const task of pesquisas) {
      expect(DEFAULT_TASK_MODELS[task], task).toBe(DEFAULT_COPILOTO_RESEARCH_MODEL);
    }
  });

  it('sim_aluno usa Gemini 3.8 mesmo sob o modelo_padrao Claude, com rollback explícito', () => {
    const sysConfigReal = { ai: { modelo_padrao: 'claude-sonnet-4-6' } };
    expect(DEFAULT_TASK_MODELS.sim_aluno).toBe('gemini-3.8-flash');
    expect(PINNED_TASKS.has('sim_aluno')).toBe(true);
    expect(resolveTaskModel(sysConfigReal, 'sim_aluno')).toBe('gemini-3.8-flash');

    const rollback = {
      ai: {
        modelo_padrao: 'claude-sonnet-4-6',
        modelos: { sim_aluno: 'claude-haiku-4-5-20251001' },
      },
    };
    expect(resolveTaskModel(rollback, 'sim_aluno')).toBe('claude-haiku-4-5-20251001');
  });

  /**
   * Decisão 12/08/2026 — Sonnet 5 nas tarefas de SAÍDA LONGA.
   *
   * O pin aqui não é zelo: é o que faz a decisão existir. Medido no mesmo dia,
   * as 10 empresas têm `modelo_padrao: 'claude-sonnet-4-6'` e NENHUMA tem override
   * de `ia4_avaliacao` — então, sem o pin, o genérico do tenant vence o default
   * por-task e a troca não muda uma chamada sequer, enquanto o código e o painel
   * dizem que mudou. É a mesma classe do override de ia3/ia4_check que o runner
   * ignorava (22/07). O primeiro teste abaixo reproduz esse sys_config REAL.
   */
  const SAIDA_LONGA = ['ia4_avaliacao', 'pdi_individual', 'relatorio_gestor', 'relatorio_rh'];

  it('saída longa resolve para Sonnet 5 com o sys_config REAL das empresas', () => {
    const sysConfigReal = { ai: { modelo_padrao: 'claude-sonnet-4-6' } };
    for (const task of SAIDA_LONGA) {
      expect(resolveTaskModel(sysConfigReal, task), task).toBe('claude-sonnet-5');
    }
  });

  it('saída CURTA segue no 4.6 — o sinal do Sonnet 5 inverte abaixo de ~1.5k tokens', () => {
    const sysConfigReal = { ai: { modelo_padrao: 'claude-sonnet-4-6' } };
    // Medido: missao_feedback +14%, evidencias_socratic +0,5%, extração socrática +41%.
    for (const task of ['missao_feedback', 'evidencias_socratic', 'sem13_qualitativa', 'beto']) {
      expect(resolveTaskModel(sysConfigReal, task), task).toBe('claude-sonnet-4-6');
      expect(PINNED_TASKS.has(task), `${task} não deve ser pinned`).toBe(false);
    }
  });

  // 15/10/2026: 9 de 9 chamadas de `video_avatar_grupo` saíram no Sonnet 4.6, porque a task
  // recebe a empresa e o `modelo_padrao` dela vencia o default. O roteiro resolve sem empresa.
  it('abertura e fecho do avatar resolvem no MESMO modelo do roteiro com o sys_config REAL das empresas', () => {
    const sysConfigReal = { ai: { modelo_padrao: 'claude-sonnet-4-6' } };
    expect(PINNED_TASKS.has('video_avatar_grupo')).toBe(true);
    expect(resolveTaskModel(sysConfigReal, 'video_avatar_grupo')).toBe(DEFAULT_TASK_MODELS.conteudo_video);
    expect(resolveTaskModel(null, 'conteudo_video')).toBe(DEFAULT_TASK_MODELS.conteudo_video);
    const rollback = { ai: { modelo_padrao: 'claude-sonnet-4-6', modelos: { video_avatar_grupo: 'claude-sonnet-5-5' } } };
    expect(resolveTaskModel(rollback, 'video_avatar_grupo')).toBe('claude-sonnet-5-5');
  });

  // 17/10/2026: o plano visual v7 foi validado no Opus 5.5 `low`; a task recebe a empresa, e o `modelo_padrao`
  // dela (Sonnet 4.6 nas empresas reais) trocaria o modelo por um que ninguém testou na biblioteca.
  it('o plano visual v7 resolve no Opus 5.5 com o sys_config REAL das empresas, e o override por task segue valendo', () => {
    const sysConfigReal = { ai: { modelo_padrao: 'claude-sonnet-4-6' } };
    expect(PINNED_TASKS.has('video_plano_visual')).toBe(true);
    expect(resolveTaskModel(sysConfigReal, 'video_plano_visual')).toBe('claude-opus-5-5');
    const rollback = { ai: { modelo_padrao: 'claude-sonnet-4-6', modelos: { video_plano_visual: 'claude-opus-5' } } };
    expect(resolveTaskModel(rollback, 'video_plano_visual')).toBe('claude-opus-5');
  });

  it('modulo_base_autor NÃO foi junto (é onde o Sonnet 5 trunca JSON)', () => {
    expect(DEFAULT_TASK_MODELS['modulo_base_autor']).toBe('claude-sonnet-4-6');
  });
});
