/** Adapta apenas o schema enviado ao provedor; o caller mantém a validação Zod completa. */
export type StructuredOutput = {
  name: string;
  schema: Record<string, unknown>;
};

// Anthropic e Bedrock não aceitam limites numéricos/string nem limites de array além de minItems 0/1.
// As restrições removidas continuam na descrição e são verificadas após a resposta.
export function schemaEstruturadoClaude(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== 'object') return value;
    const node = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    const constraints: string[] = [];
    for (const [key, item] of Object.entries(node)) {
      if (
        [
          'minimum',
          'maximum',
          'exclusiveMinimum',
          'exclusiveMaximum',
          'multipleOf',
          'minLength',
          'maxLength',
          'maxItems',
        ].includes(key) ||
        (key === 'minItems' && Number(item) > 1)
      ) {
        constraints.push(`${key}: ${JSON.stringify(item)}`);
      } else if (
        ['properties', '$defs', 'definitions'].includes(key) &&
        item &&
        typeof item === 'object'
      ) {
        result[key] = Object.fromEntries(
          Object.entries(item).map(([name, child]) => [name, visit(child)]),
        );
      } else if (
        ['items', 'anyOf', 'oneOf', 'allOf', 'additionalProperties'].includes(
          key,
        )
      )
        result[key] = visit(item);
      else result[key] = item;
    }
    if (constraints.length)
      result.description = [
        node.description,
        `Restrições: ${constraints.join('; ')}.`,
      ]
        .filter(Boolean)
        .join(' ');
    return result;
  };
  return visit(schema) as Record<string, unknown>;
}

// O subconjunto nativo do Bedrock tem as mesmas restrições de limites.
export const schemaEstruturadoBedrock = schemaEstruturadoClaude;
