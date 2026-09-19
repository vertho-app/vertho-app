import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { callAI } from '@/actions/ai-client';
import { getModelForTask } from '@/lib/ai-tasks';
import { modeloPaceCompativel } from '@/lib/simulador-vendas/modelos';
import { linhasDaVariante, type LinhaMatriz } from '@/lib/simuladores/lideranca/matriz-global';
import { contexto, type Contexto } from './access';
import { PROMPTS } from './prompts';
import {
  LiderancaError,
  SAIDAS,
  schemaAvaliadorDoEncontro,
  VERSAO,
  type Estado,
  type Etapa,
  type Gerar,
  type Saidas,
} from './schema';

export const TAREFAS = {
  abertura: 'sim_lideranca_abertura',
  personagem: 'sim_lideranca_personagem',
  consequencia: 'sim_lideranca_consequencia',
  avaliador: 'sim_lideranca_avaliador',
} as const;
export const hash = (v: unknown) =>
  createHash('sha256').update(JSON.stringify(v)).digest('hex');
export async function novoEstado(c: Contexto): Promise<Estado> {
  const modelos = {} as Estado['modelos'];
  for (const etapa of Object.keys(TAREFAS) as Etapa[]) {
    modelos[etapa] = await getModelForTask(c.empresaId, TAREFAS[etapa]);
    if (!modeloPaceCompativel(modelos[etapa]))
      throw new LiderancaError(
        400,
        `Configure um modelo compatível com o formato estruturado para ${TAREFAS[etapa]}.`,
      );
  }
  return {
    versao: VERSAO,
    matriz: linhasDaVariante(c.variante),
    modelos,
    prompts: { ...PROMPTS },
    ativo: null,
    concluidos: [],
    recibos: [],
  };
}
export function gerador(
  c: Contexto,
  jornadaId: string,
  s: Estado,
  requestId: string,
  deadline: number,
): Gerar {
  return async <E extends Etapa>(
    etapa: E,
    dados: unknown,
    validar?: (valor: Saidas[E]) => void,
  ): Promise<Saidas[E]> => {
    const promptHash = hash({
      system: s.prompts[etapa],
      dados,
      modelo: s.modelos[etapa],
    });
    const anterior = await c.tdb
      .from('sim_lideranca_chamadas')
      .select('id,prompt_hash,resultado')
      .eq('jornada_id', jornadaId)
      .eq('request_id', requestId)
      .eq('etapa', etapa)
      .maybeSingle();
    if (anterior.error)
      throw new LiderancaError(503, 'Não foi possível recuperar este envio.');
    if (
      anterior.data?.prompt_hash !== undefined &&
      anterior.data.prompt_hash !== promptHash
    )
      throw new LiderancaError(
        409,
        'Este envio já foi usado para outro conteúdo. Atualize a página.',
      );
    const schema = etapa === 'avaliador'
      ? schemaAvaliadorDoEncontro((dados as { matriz: LinhaMatriz[] }).matriz.map((l) => l.cod_desc))
      : SAIDAS[etapa];
    const parse = (raw: unknown) => schema.parse(raw) as Saidas[E];
    if (anterior.data?.resultado) {
      const valor = parse(anterior.data.resultado);
      validar?.(valor);
      return valor;
    }
    // Revalida a liberação antes de cada chamada paga, inclusive a segunda do encerramento.
    await contexto(c.auth, c.empresaId);
    const id = anterior.data?.id || randomUUID();
    if (!anterior.data) {
      const registro = await c.tdb.from('sim_lideranca_chamadas').insert({
        id,
        jornada_id: jornadaId,
        request_id: requestId,
        etapa,
        prompt_hash: promptHash,
      });
      if (registro.error)
        throw new LiderancaError(503, 'Não foi possível registrar este envio.');
    }
    const jsonSchema = z.toJSONSchema(schema, { target: 'draft-7' });
    delete jsonSchema.$schema;
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const restante = deadline - Date.now() - 5000;
      if (restante < 15000)
        throw new LiderancaError(
          503,
          'A geração demorou mais que o previsto. Tente novamente para continuar deste ponto.',
        );
      try {
        const raw = await callAI(
          s.prompts[etapa],
          JSON.stringify(dados),
          { model: s.modelos[etapa] },
          etapa === 'avaliador' ? 16000 : 3500,
          {
            taskKey: TAREFAS[etapa],
            empresaId: c.empresaId,
            colaboradorId: c.colaboradorId,
            correlationId: id,
            source: c.auth.isPlatformAdmin ? 'piloto' : 'wrapper',
            locale: 'pt-BR',
            timeoutMs: Math.min(
              restante,
              etapa === 'avaliador' ? 115000 : 65000,
            ),
            maxRetries: 0,
            responses: {
              format: {
                name: `lideranca_${etapa}`,
                strict: true,
                schema: jsonSchema,
              },
            },
          },
        );
        const valor = parse(JSON.parse(raw));
        validar?.(valor);
        const salvo = await c.tdb
          .from('sim_lideranca_chamadas')
          .update({ resultado: valor })
          .eq('id', id)
          .eq('jornada_id', jornadaId);
        if (salvo.error)
          throw new LiderancaError(
            503,
            'A resposta foi gerada, mas o salvamento não foi confirmado. Tente novamente.',
          );
        return valor;
      } catch (e) {
        if (e instanceof LiderancaError) throw e;
        if (
          tentativa === 0 &&
          (e instanceof z.ZodError ||
            e instanceof SyntaxError ||
            (e instanceof Error &&
              /Cobertura|Código|Nota sem|Citação|Acordo sem/.test(e.message)))
        )
          continue;
        console.error('[sim-lideranca] geração rejeitada', {
          etapa,
          tipo: e instanceof Error ? e.name : 'erro',
        });
        throw new LiderancaError(
          502,
          'Não foi possível validar a resposta. Sua conversa foi preservada; tente novamente.',
        );
      }
    }
    throw new LiderancaError(502, 'Não foi possível concluir a geração.');
  };
}
