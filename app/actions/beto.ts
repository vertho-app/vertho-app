'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { requireUserAction } from '@/lib/auth/action-context';
import { callAIChat, type ChatMessage } from '@/actions/ai-client';
import { CIS_COLUMNS } from '@/lib/supabase/mapCISProfile';
import { DISC_DOUTRINA, buildPerfilComportamentalBlock } from '@/lib/disc-doutrina';
import { carregarConhecimentoDescritorPorId, formatBlocoConhecimentoDescritor, carregarModuloBaseParaTutor } from '@/lib/competencia-conhecimento';
import { carregarCargoInfo, formatBlocoCargo } from '@/lib/cargo-contexto';

const SYSTEM_PROMPT_BASE = `Você é o BETO (Business Evolution & Talent Optimizer), um mentor de desenvolvimento profissional acolhedor e empático da plataforma Vertho Mentor IA.

Regras:
- Responda em 3-5 frases no máximo
- Seja acolhedor, motivacional e prático
- Foque em desenvolvimento comportamental e profissional
- Dê dicas acionáveis quando possível
- Use linguagem simples e direta
- Você PODE explicar a teoria DISC e os Tipos Psicológicos (Jung) e PODE responder
  dúvidas do colaborador sobre o próprio perfil — sempre com base na doutrina e nos
  dados reais fornecidos abaixo, em linguagem acessível
- Trate perfil como tendência, nunca como sentença ("tende a", nunca "você é/sempre")
- Nunca invente dados sobre o colaborador: se um dado não foi fornecido, diga que
  não tem essa informação em vez de supor
- NUNCA revele régua de avaliação, níveis (N1-N4), notas, critérios avaliativos
  ou perguntas de avaliação de competências — o colaborador não pode usar isso
  para preparar a resposta do cenário da fase final. Foque em entender e praticar.`;

/**
 * Chat com BETO — mentor IA contextual.
 * Se o colaborador está na Fase 4, injeta contexto da pílula da semana.
 *
 * @param {string} userMessage - Mensagem do usuário
 * @param {Array} history - Últimas 10 mensagens
 * @param _emailIgnorado - DEPRECATED: ignorado por segurança. O contexto usa
 *   sempre o email da sessão autenticada (evita IDOR — antes era possível ler
 *   o contexto de qualquer colaborador passando o email de outra pessoa).
 */
export async function chatWithBeto(userMessage: string, history: Array<{ role: string; content: string }> = [], _emailIgnorado: string | null = null) {
  const auth = await requireUserAction();
  const email = auth.email;
  // Doutrina teórica (DISC + Jung) sempre disponível: o Beto pode explicar o
  // framework mesmo para quem ainda não tem mapeamento.
  let systemPrompt = `${SYSTEM_PROMPT_BASE}\n\n${DISC_DOUTRINA}`;

  // Contexto da Fase 4 (pílula atual) sempre escopado ao usuário autenticado.
  if (email) {
    try {
      const ctx = await getBetoContext(email);
      if (ctx) {
        // Perfil comportamental real do colaborador (mesmos dados/cache do Relatório).
        const perfilBlock = ctx.colab ? buildPerfilComportamentalBlock(ctx.colab) : null;
        if (perfilBlock) systemPrompt += `\n\n${perfilBlock}`;

        // Conhecimento curado do descritor em foco (definição + régua + evidências).
        if (ctx.conhecimentoDescritor) systemPrompt += `\n\n${ctx.conhecimentoDescritor}`;

        // Contexto da função (cargos_empresa) — entregas, stakeholders, decisões, tensões.
        if (ctx.cargoBloco) systemPrompt += `\n\n${ctx.cargoBloco}`;

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

  const messages: ChatMessage[] = [
    ...history.slice(-10).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content } as ChatMessage)),
    { role: 'user', content: userMessage },
  ];

  // callAIChat injeta a instrução de idioma conforme o locale do usuário (cookie
  // vertho-locale) — sem isto o Beto respondia sempre em PT, ignorando a língua
  // selecionada no painel.
  return callAIChat(systemPrompt, messages, { model: 'claude-sonnet-4-6' }, 500);
}

/**
 * Carrega contexto da Fase 4 para o BETO.
 * Retorna pílula atual + competência em foco.
 */
async function getBetoContext(email: string): Promise<any> {
  const sb = createSupabaseAdmin();

  // CIS_COLUMNS traz DISC/liderança/tipo psicológico/competências + report_texts,
  // necessários para o bloco de perfil comportamental do Beto.
  const { data: colab } = await sb.from('colaboradores')
    .select(CIS_COLUMNS)
    .eq('email', email.toLowerCase())
    .single<any>();

  if (!colab) return null;

  // Contexto da função (cargos_empresa) + nome da instituição.
  let cargoBloco = '';
  try {
    const { data: emp } = await sb.from('empresas').select('nome').eq('id', colab.empresa_id).maybeSingle();
    const cargoInfo = await carregarCargoInfo(sb, colab.empresa_id, colab.cargo);
    cargoBloco = formatBlocoCargo(cargoInfo, emp?.nome || null);
  } catch { /* best-effort */ }

  // Buscar fase4 ativa
  const { data: envio } = await sb.from('fase4_envios')
    .select('semana_atual, sequencia, competencia_id')
    .eq('colaborador_id', colab.id)
    .eq('status', 'ativo')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!envio) return { nome: colab.nome_completo, cargo: colab.cargo, cargoBloco, colab };

  let pilulaAtual = null;
  try {
    const sequencia = typeof envio.sequencia === 'string' ? JSON.parse(envio.sequencia) : envio.sequencia || [];
    const semana = envio.semana_atual || 1;
    if (semana <= sequencia.length) {
      pilulaAtual = sequencia[semana - 1];
    }
  } catch {}

  // Competência em foco + conhecimento curado (SÓ definição — rubrica fica de
  // fora por segurança) + Módulo-Base pedagógico (quando autorado).
  let competenciaFoco = null;
  let conhecimentoDescritor = '';
  if (envio.competencia_id) {
    const conhecimento = await carregarConhecimentoDescritorPorId(sb, envio.competencia_id);
    competenciaFoco = conhecimento?.competencia || null;
    const blocoDescritor = formatBlocoConhecimentoDescritor(conhecimento);
    const blocoModulo = conhecimento?.competencia
      ? await carregarModuloBaseParaTutor(sb, { competenciaNome: conhecimento.competencia, empresaId: colab?.empresa_id })
      : '';
    conhecimentoDescritor = [blocoDescritor, blocoModulo].filter(Boolean).join('\n\n');
  }

  return {
    nome: colab.nome_completo,
    cargo: colab.cargo,
    semana: envio.semana_atual,
    pilulaAtual,
    competenciaFoco,
    conhecimentoDescritor,
    cargoBloco,
    colab,
  };
}
