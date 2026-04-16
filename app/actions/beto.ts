'use server';

import Anthropic from '@anthropic-ai/sdk';
import { createSupabaseAdmin } from '@/lib/supabase';

const client = new Anthropic();

const SYSTEM_PROMPT_BASE = `Você é o BETO (Business Evolution & Talent Optimizer), um mentor de desenvolvimento profissional acolhedor e empático da plataforma Vertho Mentor IA.

Regras:
- Responda em 3-5 frases no máximo
- Seja acolhedor, motivacional e prático
- Foque em desenvolvimento comportamental e profissional
- Dê dicas acionáveis quando possível
- Use linguagem simples e direta
- Nunca invente dados sobre o colaborador`;

/**
 * Chat com BETO — mentor IA contextual.
 * Se o colaborador está na Fase 4, injeta contexto da pílula da semana.
 *
 * @param {string} userMessage - Mensagem do usuário
 * @param {Array} history - Últimas 10 mensagens
 * @param {string} email - Email do colaborador (opcional, para contexto)
 */
export async function chatWithBeto(userMessage: string, history: Array<{ role: string; content: string }> = [], email: string | null = null) {
  let systemPrompt = SYSTEM_PROMPT_BASE;

  // Se tiver email, buscar contexto da Fase 4 (pílula atual)
  if (email) {
    try {
      const ctx = await getBetoContext(email);
      if (ctx) {
        systemPrompt += `\n\nCONTEXTO DO COLABORADOR:
Nome: ${ctx.nome}
Cargo: ${ctx.cargo || 'não informado'}
${ctx.pilulaAtual ? `\nPÍLULA DA SEMANA (Semana ${ctx.semana}):
Título: ${ctx.pilulaAtual.titulo}
${ctx.pilulaAtual.resumo ? `Resumo: ${ctx.pilulaAtual.resumo}` : ''}
${ctx.pilulaAtual.url ? `Link: ${ctx.pilulaAtual.url}` : ''}

Use este conteúdo como referência ao responder perguntas do colaborador sobre o tema da semana. Não repita o conteúdo inteiro, mas faça conexões práticas.` : ''}
${ctx.competenciaFoco ? `\nCOMPETÊNCIA EM FOCO: ${ctx.competenciaFoco}` : ''}`;
      }
    } catch {
      // Silenciar — BETO funciona sem contexto
    }
  }

  const messages = [
    ...history.slice(-10).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: systemPrompt,
    messages: messages as any,
  });

  const first = response.content[0] as any;
  return first.text as string;
}

/**
 * Carrega contexto da Fase 4 para o BETO.
 * Retorna pílula atual + competência em foco.
 */
async function getBetoContext(email: string): Promise<any> {
  const sb = createSupabaseAdmin();

  const { data: colab } = await sb.from('colaboradores')
    .select('id, nome_completo, cargo, empresa_id')
    .eq('email', email.toLowerCase())
    .single();

  if (!colab) return null;

  // Buscar fase4 ativa
  const { data: envio } = await sb.from('fase4_envios')
    .select('semana_atual, sequencia, competencia_id')
    .eq('colaborador_id', colab.id)
    .eq('status', 'ativo')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!envio) return { nome: colab.nome_completo, cargo: colab.cargo };

  let pilulaAtual = null;
  try {
    const sequencia = typeof envio.sequencia === 'string' ? JSON.parse(envio.sequencia) : envio.sequencia || [];
    const semana = envio.semana_atual || 1;
    if (semana <= sequencia.length) {
      pilulaAtual = sequencia[semana - 1];
    }
  } catch {}

  // Nome da competência em foco
  let competenciaFoco = null;
  if (envio.competencia_id) {
    const { data: comp } = await sb.from('competencias')
      .select('nome').eq('id', envio.competencia_id).single();
    competenciaFoco = comp?.nome;
  }

  return {
    nome: colab.nome_completo,
    cargo: colab.cargo,
    semana: envio.semana_atual,
    pilulaAtual,
    competenciaFoco,
  };
}
