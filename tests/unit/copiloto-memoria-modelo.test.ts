import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));

import { callAI } from '@/actions/ai-client';
import { DEFAULT_COPILOTO_MEMORY_MODEL, DEFAULT_TASK_MODELS } from '@/lib/ai-tasks';
import { analyzeCopilotConversation, hojeParaPrompt } from '@/lib/copiloto/conversation-analysis';

/**
 * Memória da conversa comercial do Copiloto (08/10/2026): Sonnet 5.5 no lugar do GPT 5.6 Terra, e o prompt passa a dizer que dia
 * é hoje. `Medido:` sem a data, o Sonnet devolveu 2025-10-15 para "quinta, 15 de outubro" em 8 de 8 chamadas, o normalizador
 * descarta data passada e o CRM ficava sem prazo; o Terra acertou o ano em 3 de 4 por conhecimento próprio, não por instrução.
 */
const entrada = {
  accountName: 'Colégio Horizonte',
  crmContext: '',
  previousContext: '',
  transcript: 'Vendedor: posso mandar a proposta até quinta, dia 15 de outubro?\nMárcia: pode.',
};
const resposta = (data: string) =>
  JSON.stringify({
    resumo: 'Combinado o envio da proposta.',
    memory: { nextStep: 'Enviar a proposta' },
    crm: { estagio: '', estagio_motivo: '', proxima_acao: 'Vendedor envia a proposta', proxima_acao_data: data },
    follow_up: { whatsapp: '', email: { assunto: '', corpo: '' } },
  });
const prompt = () => vi.mocked(callAI).mock.calls[0][1] as string;

describe('memória da conversa do Copiloto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callAI).mockResolvedValue(resposta('2026-10-15'));
    delete process.env.COPILOTO_MEMORY_MODEL;
  });

  describe('modelo', () => {
    it('o padrão é o Sonnet 5.5, em esforço low, pela mesma decisão da tabela de modelos por tarefa', async () => {
      await analyzeCopilotConversation({ ...entrada, hoje: new Date('2026-10-08T15:00:00Z') });
      const [, , cfg, , opts] = vi.mocked(callAI).mock.calls[0];
      expect(cfg).toEqual({ model: 'claude-sonnet-5-5' });
      expect(DEFAULT_COPILOTO_MEMORY_MODEL).toBe('claude-sonnet-5-5');
      expect(DEFAULT_TASK_MODELS.copiloto_memoria_conversa, 'rota e tabela partem de uma decisão só').toBe(DEFAULT_COPILOTO_MEMORY_MODEL);
      expect(opts).toMatchObject({ taskKey: 'copiloto_memoria_conversa', reasoningEffort: 'low' });
    });

    it('COPILOTO_MEMORY_MODEL vence (porta de volta ao Terra sem deploy de código)', async () => {
      process.env.COPILOTO_MEMORY_MODEL = 'gpt-5.6-terra';
      await analyzeCopilotConversation({ ...entrada, hoje: new Date('2026-10-08T15:00:00Z') });
      expect(vi.mocked(callAI).mock.calls[0][2]).toEqual({ model: 'gpt-5.6-terra' });
    });
  });

  describe('a data de hoje vai no prompt, em Brasília', () => {
    it('dia e dia da semana', async () => {
      await analyzeCopilotConversation({ ...entrada, hoje: new Date('2026-10-08T15:00:00Z') });
      expect(prompt()).toContain('<hoje>2026-10-08 (quinta-feira)</hoje>');
    });

    it('🔴 22h30 de Brasília ainda é o mesmo dia (já é o dia seguinte em UTC), e 00h de Brasília vira o dia', () => {
      expect(hojeParaPrompt(new Date('2026-10-09T01:30:00Z'))).toBe('2026-10-08 (quinta-feira)');
      expect(hojeParaPrompt(new Date('2026-10-09T03:00:00Z'))).toBe('2026-10-09 (sexta-feira)');
      expect(hojeParaPrompt(new Date('2026-10-11T12:00:00Z'))).toBe('2026-10-11 (domingo)');
    });

    it('o system manda resolver data sem ano pela próxima ocorrência e nunca devolver data passada', async () => {
      await analyzeCopilotConversation({ ...entrada, hoje: new Date('2026-10-08T15:00:00Z') });
      const system = vi.mocked(callAI).mock.calls[0][0] as string;
      expect(system).toContain('<hoje>');
      expect(system).toMatch(/PRÓXIMA ocorrência/);
      expect(system).toMatch(/nunca devolva\s+data anterior a hoje/);
    });
  });

  describe('o mesmo "hoje" valida a data que o modelo devolve', () => {
    it('data futura em relação ao hoje informado é mantida', async () => {
      const r = await analyzeCopilotConversation({ ...entrada, hoje: new Date('2026-10-08T15:00:00Z') });
      expect(r.closing.crm.nextActionDate).toBe('2026-10-15');
    });

    it('🔴 a mesma data, vista de um hoje posterior, é descartada: o normalizador usa o hoje injetado, não o relógio do host', async () => {
      const r = await analyzeCopilotConversation({ ...entrada, hoje: new Date('2026-10-20T15:00:00Z') });
      expect(r.closing.crm.nextActionDate).toBeNull();
      expect(r.closing.crm.nextAction).toBe('Vendedor envia a proposta');
    });
  });
});
