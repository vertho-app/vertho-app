/**
 * Gera cenários situacionais para semanas de aplicação (4, 8, 12).
 * Formato: 1 tensão central + 1 fator complicador (intermediário/completo) + max 2 stakeholders.
 * Resposta genérica ("conversaria com todos") deve ser INSUFICIENTE — força escolha.
 */
export function promptCenario({ competencia, descritores, cargo, contexto, complexidade }) {
  const regrasComplexidade = {
    simples: '1 tensão central + 1 stakeholder nomeado. Sem complicador.',
    intermediario: '1 tensão central + 1 fator complicador + 2 stakeholders nomeados com posições conflitantes.',
    completo: '1 tensão central + 1 fator complicador + 1 dilema ético embutido + 2 stakeholders nomeados com posições conflitantes.',
  };

  const system = `Você é um designer de casos para desenvolvimento de competências executivas. Cria cenários situacionais realistas que forçam o profissional a fazer escolhas difíceis (não apenas "conversar com todos").`;

  const user = `Crie 1 cenário situacional para avaliar competências na prática.

CONTEXTO:
- Cargo: ${cargo}
- Setor: ${contexto}
- Competência: ${competencia}
- Descritores avaliados (integrar todos no cenário): ${descritores.join(', ')}
- Complexidade: ${complexidade} → ${regrasComplexidade[complexidade]}

REGRAS:
1. Teste do cenário ruim: se uma resposta tipo "eu conversaria com todos e tentaria achar uma solução boa pra todo mundo" funciona, o cenário está fraco. Force escolhas reais.
2. Stakeholders têm NOMES (Marina, Roberto...) e posições conflitantes
3. Cenário ancorado no contexto real do cargo/setor
4. Não dê resposta — só apresente a situação

FORMATO DE RESPOSTA (markdown):
## [Título curto e impactante]

**Contexto:** [3-4 linhas descrevendo a situação]

**Tensão central:** [1-2 linhas com o conflito principal]

${complexidade !== 'simples' ? '**Fator complicador:** [1-2 linhas]\n\n' : ''}**Stakeholders:**
- **[Nome]** ([papel]): [posição/interesse]
${complexidade !== 'simples' ? '- **[Nome]** ([papel]): [posição/interesse]\n' : ''}
**Como você conduziria esta situação?**

Retorne APENAS o markdown do cenário, sem comentários adicionais.`;

  return { system, user };
}
