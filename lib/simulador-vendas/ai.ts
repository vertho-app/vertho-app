import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { callAI } from '@/actions/ai-client';
import { getModelForTask } from '@/lib/ai-tasks';
import { VENDAS_TENTATIVA } from '@/lib/status';
import { PROMPTS, PROMPT_VERSION, hashPrompt, renderPrompt } from './prompts';
import { ETAPAS, SAIDAS, type Estado, type Etapa, type Saidas, type PromptSnapshot } from './schema';
import { SimuladorError, type Gerar } from './core';
import type { Contexto } from './access';

const TAREFAS = { criador: 'sim_vendas_criador', cliente: 'sim_vendas_cliente', moderador: 'sim_vendas_moderador', intencao: 'sim_vendas_intencao', gerente: 'sim_vendas_gerente' } as const;

export async function snapshotPrompts(empresaId: string): Promise<PromptSnapshot> {
  const entries = await Promise.all(ETAPAS.map(async etapa => {
    const modelo = await getModelForTask(empresaId, TAREFAS[etapa]);
    if (!/^(gpt-|o[134])/.test(modelo)) throw new SimuladorError(400, `Configure um modelo OpenAI para o agente ${etapa} antes de iniciar.`);
    return [etapa, { texto: PROMPTS[etapa], hash: hashPrompt(PROMPTS[etapa]), versao: PROMPT_VERSION, modelo }];
  }));
  return Object.fromEntries(entries) as PromptSnapshot;
}

export function gerador(c: Contexto, s: Estado, requestId: string, deadline = Date.now() + 270000): Gerar {
  return async <K extends Etapa>(etapa: K, valores: Record<string, unknown>, validar?: (v: Saidas[K]) => void): Promise<Saidas[K]> => {
    const spec = s.prompts[etapa];
    const prompt = renderPrompt(spec.texto, valores), promptHash = hashPrompt(prompt);
    const busca = () => c.tdb.from('sim_vendas_tentativas').select('*').eq('sessao_id', s.id).eq('request_id', requestId).eq('etapa', etapa).order('tentativa', { ascending: false });
    const { data: anteriores, error } = await busca();
    if (error) throw new SimuladorError(503, 'Não foi possível recuperar a resposta anterior. Tente novamente.');
    if (anteriores.some((r: any) => r.prompt_hash !== promptHash || r.modelo !== spec.modelo)) throw new SimuladorError(409, 'Este envio pertence a outro conteúdo. Atualize o treino.');
    const aceita = anteriores.find((r: any) => r.status === VENDAS_TENTATIVA.ACEITA);
    if (aceita) {
      const result = SAIDAS[etapa].parse(aceita.resultado) as Saidas[K];
      validar?.(result); return result;
    }
    for (let retry = 0; retry < 2; retry++) {
      const remaining = deadline - Date.now() - 5000;
      if (remaining < 15000) throw new SimuladorError(503, 'A resposta demorou mais que o previsto. Tente novamente para continuar deste ponto.');
      const id = randomUUID(), tentativa = (anteriores[0]?.tentativa || 0) + retry + 1;
      const { error: insertError } = await c.tdb.from('sim_vendas_tentativas').insert({ id, sessao_id: s.id, request_id: requestId, etapa, tentativa, modelo: spec.modelo, prompt_hash: promptHash });
      if (insertError) throw new SimuladorError(503, 'Não foi possível registrar o envio. Tente novamente.');
      try {
        const jsonSchema = z.toJSONSchema(SAIDAS[etapa], { target: 'draft-7' });
        delete jsonSchema.$schema;
        const raw = await callAI('', prompt, { model: spec.modelo }, etapa === 'criador' || etapa === 'gerente' ? 8000 : 2500, {
          taskKey: TAREFAS[etapa], empresaId: c.empresaId, colaboradorId: c.colaboradorId,
          correlationId: id, source: c.auth.isPlatformAdmin ? 'piloto' : 'wrapper', locale: 'pt-BR',
          timeoutMs: Math.min(remaining, etapa === 'criador' || etapa === 'gerente' ? 110000 : 60000), maxRetries: 0,
          responses: { format: { name: `pace_${etapa}`, strict: true, schema: jsonSchema } },
        });
        const result = SAIDAS[etapa].parse(JSON.parse(raw)) as Saidas[K];
        validar?.(result);
        const saved = await c.tdb.from('sim_vendas_tentativas').update({ status: VENDAS_TENTATIVA.ACEITA, resultado: result, finished_at: new Date().toISOString() }).eq('id', id).eq('sessao_id', s.id);
        if (saved.error) throw new SimuladorError(503, 'A resposta foi gerada, mas não foi possível confirmar o salvamento. Atualize antes de reenviar.');
        return result;
      } catch (e) {
        const finish = await c.tdb.from('sim_vendas_tentativas').update({ status: VENDAS_TENTATIVA.REJEITADA, erro_codigo: e instanceof z.ZodError ? 'schema' : e instanceof SyntaxError ? 'json' : 'geracao_ou_validacao', finished_at: new Date().toISOString() }).eq('id', id).eq('sessao_id', s.id).eq('status', VENDAS_TENTATIVA.PENDENTE);
        if (finish.error) console.error('[sim-vendas] tentativa não finalizada', { id, etapa });
        if (e instanceof SimuladorError) throw e;
        // Uma regeneração de formato/regra. Erros de rede não repetem automaticamente.
        if (retry === 0 && (e instanceof z.ZodError || e instanceof SyntaxError || (e instanceof Error && !/OpenAI|prov[eê]dor|fetch|timeout|abort/i.test(e.message)))) continue;
        console.error('[sim-vendas] geração rejeitada', { id, etapa, tipo: e instanceof Error ? e.name : 'erro' });
        throw new SimuladorError(502, etapa === 'gerente' ? 'Não foi possível validar o relatório. A conversa foi preservada; tente novamente.' : 'Não foi possível concluir esta resposta. Tente novamente para continuar o treino.');
      }
    }
    throw new SimuladorError(502, 'Não foi possível concluir a geração.');
  };
}
