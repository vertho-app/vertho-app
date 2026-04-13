/**
 * Gera o desafio semanal — micro-ação prática, observável, executável em 1 semana.
 */
export function promptDesafio({ competencia, descritor, nivel, cargo, contexto, semana }) {
  const nivelLabel = nivel <= 1.5 ? 'iniciante (ação básica)' :
                     nivel <= 2.5 ? 'em desenvolvimento (refinar)' :
                     nivel <= 3.5 ? 'proficiente (aprofundar)' : 'avançado (referenciar outros)';

  const system = `Você é um designer instrucional especializado em micro-ações práticas para desenvolvimento de competências em adultos. Cria desafios curtos, observáveis e que cabem na rotina semanal de um profissional.`;

  const user = `Crie 1 desafio semanal para o colaborador.

CONTEXTO:
- Cargo: ${cargo}
- Setor/contexto: ${contexto}
- Competência: ${competencia}
- Descritor a desenvolver: ${descritor}
- Nível atual: ${nivel}/4 (${nivelLabel})
- Semana ${semana} da temporada

REGRAS:
1. UMA ação concreta e pequena, executável dentro da rotina normal da semana
2. Observável: o colaborador sabe se fez ou não fez (sem ambiguidade)
3. Adaptado ao nível: mais simples se nível baixo, mais sutil/refinado se nível alto
4. 2-3 frases no total, em português brasileiro
5. Tom: direto, encorajador, sem jargão de coaching
6. NÃO comece com "Esta semana..." ou similar — vá direto à ação

Retorne APENAS o texto do desafio, sem aspas, sem prefixo, sem explicação.`;

  return { system, user };
}
