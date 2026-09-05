import 'server-only';
import { callAIChat } from '@/actions/ai-client';
import { getModelForTask } from '@/lib/ai-tasks';
import { parseJsonIA } from '@/lib/ai-json';
import { maskTextPII } from '@/lib/pii-masker';
import { pacienteSchema, avaliacaoSchema } from './schema';
import { createHash } from 'node:crypto';

export function geradorRecepcao(empresaId: string, colaboradorId: string | null, admin = false) {
  const chamadas: Array<{ etapa: string; model: string; promptHash: string; promptVersion: string }> = [];
  return {
    chamadas,
    gerar: async ({ etapa, system, messages }: { etapa: string; system: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> }) => {
      const taskKey = etapa === 'paciente' ? 'recepcao_paciente' : 'recepcao_avaliacao';
      const model = await getModelForTask(empresaId, taskKey);
      // Versão autocontida na sessão: não depende da tabela legada prompt_versions.
      chamadas.push({ etapa, model, promptHash: createHash('sha256').update(system).digest('hex'), promptVersion: 'recepcao-1.0' });
      const raw = await callAIChat(system, messages, { model }, etapa === 'paciente' ? 4000 : 8000, {
        taskKey, empresaId, colaboradorId, source: admin ? 'piloto' : 'wrapper', locale: 'pt-BR',
        temperature: etapa === 'paciente' ? 0.6 : 0, timeoutMs: 45000, maxRetries: 0,
      });
      const parsed = parseJsonIA(raw);
      const result = (etapa === 'paciente' ? pacienteSchema : avaliacaoSchema).parse(parsed);
      return JSON.stringify(result);
    },
  };
}

// Apenas redução de identificadores comuns. Não é um detector completo de dados de saúde.
export function textoParaTreino(texto: string) { return maskTextPII(texto).trim(); }
