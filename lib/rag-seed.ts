/**
 * Seed da knowledge_base de uma empresa nova.
 *
 * Template de docs base que toda empresa deveria ter. Usado pelo painel
 * admin (botão "Popular base inicial") ou em automação ao criar empresa.
 *
 * Não substitui docs específicos da empresa — é fundação genérica que ajuda
 * a IA a contextualizar respostas (ex: o que esperar de um colab, o que é
 * uma temporada, como funciona o assessment). RH personaliza depois.
 */

import { ingestDoc, listDocs } from './rag';

export interface SeedDoc {
  titulo: string;
  conteudo: string;
  categoria: string;
}

/**
 * Template padrão. Edição = mudou pra todo mundo (apenas em seeds futuros).
 * Empresas existentes não são re-seedadas automaticamente.
 */
export const SEED_TEMPLATE: SeedDoc[] = [
  {
    titulo: 'Como funciona uma Temporada Vertho',
    categoria: 'onboarding',
    conteudo: `Uma temporada Vertho dura 14 semanas e foca em UMA competência por colaborador.
Estrutura geral:
- Semanas 1-3, 5-7, 9-11: conteúdo + reflexão (Evidências) sobre 1 descritor
- Semanas 4, 8, 12: missão prática (aplicar o aprendido no trabalho)
- Semana 13: conversa qualitativa (auto-percepção da evolução) + Avaliação Acumulada por IA
- Semana 14: cenário escrito (prova final) que cruza com a auto-percepção

Cada semana libera às segundas, 03:00 BRT. Não é possível pular semanas.
Tira-Dúvidas fica disponível durante a semana toda pra perguntas pontuais.`,
  },
  {
    titulo: 'O que é Evidências (chat socrático)',
    categoria: 'onboarding',
    conteudo: `Evidências é a conversa SOCRÁTICA conduzida pela IA durante semanas de conteúdo.
A IA NÃO dá respostas — faz perguntas pra o colaborador refletir.
Objetivo: extrair evidência de aplicação real do descritor da semana.
Duração: 6 turnos (3 perguntas + 3 respostas) em média.
Ao fim: IA classifica qualidade da reflexão (alta/média/baixa) e se o desafio foi realizado (sim/parcial/não).
Esses dados alimentam a Avaliação Acumulada da semana 13.`,
  },
  {
    titulo: 'O que é Tira-Dúvidas',
    categoria: 'onboarding',
    conteudo: `Tira-Dúvidas é o chat livre (não-socrático) do colaborador com a IA durante a semana.
Diferente de Evidências, aqui o colaborador PERGUNTA e a IA RESPONDE.
Foco exclusivo no descritor da semana.
Limite diário: 10 perguntas/dia/colaborador.
Não conta pra avaliação — é só apoio prático.
A IA usa a base de conhecimento da empresa quando relevante (grounding via knowledge_base).`,
  },
  {
    titulo: 'Régua de avaliação (níveis 1-4)',
    categoria: 'onboarding',
    conteudo: `Toda competência é avaliada em 4 níveis:
- N1 Emergente: postura passiva, ignora a competência
- N2 Em desenvolvimento: ações inconsistentes, tentativas
- N3 Proficiente (META): aplica de forma consistente, gera resultado
- N4 Referência: ensina, inova, eleva os outros

Nível 3 é a META. Qualquer nota abaixo de 3 = gap.
Avaliações decimais (ex: 2.33) são transições entre níveis.`,
  },
  {
    titulo: 'Modos de Missão Prática (semanas 4, 8, 12)',
    categoria: 'onboarding',
    conteudo: `Nas semanas de aplicação (4, 8, 12), o colaborador escolhe entre dois modos:

1) MISSÃO PRÁTICA (recomendado): aplica o aprendido em uma situação REAL no trabalho.
   - Combina compromisso de ação no início da semana
   - Relata como foi durante a semana, em chat conversacional (10 turnos)
   - IA dá feedback construtivo

2) CENÁRIO ESCRITO (alternativa): responde por escrito a um cenário fictício.
   - Mais rápido, sem necessidade de aplicação real
   - Útil quando a semana não permite aplicação concreta`,
  },
  {
    titulo: 'Política de Privacidade — Dados Pessoais',
    categoria: 'regulamento',
    conteudo: `Dados pessoais coletados:
- Nome, email, cargo, área (vindos da integração com RH)
- Respostas em chats e cenários
- Resultados de avaliação comportamental (DISC) e técnica

Uso interno apenas. Não compartilhamos com terceiros sem consentimento.
Antes de enviar pra IAs externas (Claude/GPT), nomes são substituídos por aliases opacos.
Saída da IA é despersonalizada antes de exibir ao colaborador.

LGPD: você tem direito a acessar, corrigir e solicitar exclusão dos seus dados.
Contato: dpo@vertho.ai`,
  },
];

/**
 * Popula knowledge_base de uma empresa com docs do template.
 * Idempotente: se já houver docs com mesmo título, pula (não duplica).
 *
 * @returns { criados: number, pulados: number }
 */
export async function seedKnowledgeBase(empresaId: string): Promise<{ criados: number; pulados: number }> {
  if (!empresaId) throw new Error('seedKnowledgeBase: empresaId obrigatório');

  const existentes = await listDocs(empresaId);
  const titulosExistentes = new Set(existentes.map(d => d.titulo));

  let criados = 0;
  let pulados = 0;

  for (const doc of SEED_TEMPLATE) {
    if (titulosExistentes.has(doc.titulo)) {
      pulados++;
      continue;
    }
    try {
      await ingestDoc({
        empresaId,
        titulo: doc.titulo,
        conteudo: doc.conteudo,
        categoria: doc.categoria,
      });
      criados++;
    } catch (err) {
      console.error('[seedKnowledgeBase]', doc.titulo, err);
    }
  }

  return { criados, pulados };
}
