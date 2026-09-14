import 'server-only';
import { randomUUID } from 'node:crypto';
import type { TenantDb } from '@/lib/tenant-db';
import type { Etapa, PromptSnapshot } from './schema';
import { hashPrompt } from './prompts';
import { SimuladorError } from './core';

// Catálogo GLOBAL contém apenas templates estáticos do produto, nunca briefing ou conversa.
export async function arquivarPrompt(
  tdb: TenantDb,
  etapa: Etapa,
  versao: string,
  texto: string,
): Promise<string> {
  const hash = hashPrompt(texto);
  const busca = () =>
    tdb.raw
      .from('sim_vendas_prompt_versions')
      .select('id,conteudo,hash')
      .eq('etapa', etapa)
      .eq('versao', versao)
      .eq('hash', hash)
      .maybeSingle();
  const anterior = await busca();
  if (anterior.error)
    throw new SimuladorError(
      503,
      'O catálogo de versões está indisponível. Nenhuma chamada de IA foi iniciada.',
    );
  if (anterior.data) {
    if (anterior.data.conteudo !== texto)
      throw new SimuladorError(503, 'A integridade da versão do treinamento não pôde ser confirmada.');
    return anterior.data.id;
  }
  const id = randomUUID();
  const gravado = await tdb.raw
    .from('sim_vendas_prompt_versions')
    .insert({ id, etapa, versao, hash, conteudo: texto });
  if (!gravado.error) return id;
  if (gravado.error.code === '23505') {
    const concorrente = await busca();
    if (!concorrente.error && concorrente.data?.conteudo === texto) return concorrente.data.id;
  }
  throw new SimuladorError(503, 'Não foi possível congelar a versão do treinamento. Tente novamente.');
}

export async function textoDoSnapshot(
  tdb: TenantDb,
  etapa: Etapa,
  spec: PromptSnapshot[Etapa],
): Promise<string> {
  // Compatibilidade explícita com sessões v1. Nunca substituir texto antigo pelo prompt atual.
  if (spec.texto !== undefined) {
    if (hashPrompt(spec.texto) !== spec.hash)
      throw new SimuladorError(503, 'A integridade do treinamento não pôde ser confirmada.');
    return spec.texto;
  }
  if (!spec.id) throw new SimuladorError(503, 'Versão do treinamento não encontrada.');
  const { data, error } = await tdb.raw
    .from('sim_vendas_prompt_versions')
    .select('conteudo,etapa,versao,hash')
    .eq('id', spec.id)
    .maybeSingle();
  if (
    error ||
    !data ||
    data.etapa !== etapa ||
    data.versao !== spec.versao ||
    data.hash !== spec.hash ||
    hashPrompt(data.conteudo) !== spec.hash
  ) {
    throw new SimuladorError(503, 'A versão original do treinamento está indisponível. Tente novamente.');
  }
  return data.conteudo;
}
