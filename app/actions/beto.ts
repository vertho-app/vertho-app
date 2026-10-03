'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { requireUserAction } from '@/lib/auth/action-context';
import { callAIChat, type ChatMessage } from '@/actions/ai-client';
import { CIS_COLUMNS } from '@/lib/supabase/mapCISProfile';
import { DISC_DOUTRINA, buildPerfilComportamentalBlock } from '@/lib/disc-doutrina';
import { carregarConhecimentoDescritorPorId, formatBlocoConhecimentoDescritor, carregarModuloBaseParaTutor } from '@/lib/competencia-conhecimento';
import { carregarCargoInfo, formatBlocoCargo } from '@/lib/cargo-contexto';
import { carregarBlueprintResumo } from '@/lib/blueprint/resumo';
import { resolverContextoSemanal } from '@/lib/fase4/contexto-semanal';
import { buscarConteudosRelacionados, formatConteudosRelacionadosBloco } from '@/lib/conteudos-relacionados';
import { formatarPaginaAtualParaBeto } from '@/lib/beto/pagina-atual';
import { maskColaborador, maskTextPII, unmaskPII, type PIIMapas } from '@/lib/pii-masker';
import { cookies } from 'next/headers';
import { localeCookieName, normalizeAppLocale } from '@/lib/i18n';
import { defaultLocale, type AppLocale } from '@/i18n/routing';

const SYSTEM_PROMPT_BASE = `Você é o BETO (Business Evolution & Talent Optimizer), um mentor de desenvolvimento profissional acolhedor e empático da plataforma Vertho Mentor IA.

Regras:
- Responda em 3-5 frases no máximo
- Seja acolhedor, motivacional e prático
- Foque em desenvolvimento comportamental e profissional
- Dê dicas acionáveis quando possível
- Use linguagem simples e direta
- Você PODE explicar a teoria do Mapeamento Comportamental e os Tipos Psicológicos (Jung) e PODE responder
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
 * @param paginaAtual - pathname capturado no momento do envio. É normalizado
 *   por allowlist e usado apenas como pista; autorização continua na sessão.
 * @param localeDaTela - idioma em que a tela está (o `useLocale()` do chat).
 *   Só escolhe a língua da resposta para a própria pessoa, e passa pela lista
 *   fechada de idiomas: não decide acesso a nada.
 */
export async function chatWithBeto(
  userMessage: string,
  history: Array<{ role: string; content: string }> = [],
  paginaAtual: string | null = null,
  localeDaTela: string | null = null,
) {
  const auth = await requireUserAction();
  const email = auth.email;
  const locale = await idiomaDoBeto(localeDaTela, email);
  // Doutrina teórica (DISC + Jung) sempre disponível: o Beto pode explicar o
  // framework mesmo para quem ainda não tem mapeamento.
  let systemPrompt = `${SYSTEM_PROMPT_BASE}\n\n${DISC_DOUTRINA}`;
  const contextoPagina = formatarPaginaAtualParaBeto(paginaAtual);
  if (contextoPagina) systemPrompt += `\n\n${contextoPagina}`;

  // Quem paga esta conversa. Fica FORA do `try` de propósito: o contexto é
  // best-effort (o Beto responde sem ele), mas a atribuição do custo não pode
  // depender de o enriquecimento do prompt ter dado certo — era assim que 383
  // chamadas de 383 entravam no ledger sem dono (medido 07/09/2026).
  let empresaId: string | null = null;
  let colaboradorId: string | null = null;
  // Máscara da conversa (R-05/R-44, 03/10/2026): o Beto mandava o nome
  // completo à IA. Agora vai o identificador, e o perfil, o plano e as falas
  // passam pela mesma máscara das conversas da jornada; a resposta volta com o
  // primeiro nome. Sem contexto (pessoa não encontrada), só e-mail, telefone e
  // CPF saem das falas.
  let pii: PIIMapas | null = null;

  // Contexto da Fase 4 (pílula atual) sempre escopado ao usuário autenticado.
  if (email) {
    try {
      const ctx = await getBetoContext(email);
      if (ctx) {
        empresaId = ctx.colab?.empresa_id ?? null;
        colaboradorId = ctx.colab?.id ?? null;
        const mascara = maskColaborador(ctx.colab);
        pii = mascara.map;
        // Perfil comportamental real do colaborador (mesmos dados/cache do Relatório).
        // A síntese do relatório comportamental fala com a pessoa pelo nome.
        const perfilBlock = ctx.colab ? buildPerfilComportamentalBlock(ctx.colab) : null;
        if (perfilBlock) systemPrompt += `\n\n${maskTextPII(perfilBlock, pii)}`;

        // Conhecimento curado do descritor em foco (definição + régua + evidências).
        if (ctx.conhecimentoDescritor) systemPrompt += `\n\n${ctx.conhecimentoDescritor}`;

        // Contexto da função (cargos_empresa) — entregas, stakeholders, decisões, tensões.
        if (ctx.cargoBloco) systemPrompt += `\n\n${ctx.cargoBloco}`;

        // Plano de desenvolvimento (blueprint) — personaliza a orientação ao foco
        // e aos objetivos de 30 dias do colaborador.
        if (ctx.blueprintResumo) systemPrompt += `\n\n${maskTextPII(ctx.blueprintResumo, pii)}`;

        // Saiba mais — outros conteúdos catalogados sobre o tema em foco, para o
        // Beto sugerir quando o colaborador pedir (sem inventar).
        if (ctx.conteudosBloco) systemPrompt += `\n\n${ctx.conteudosBloco}`;

        systemPrompt += `\n\nCONTEXTO DO COLABORADOR:
Nome: ${mascara.masked?.nome} (identificador da pessoa: use-o exatamente assim onde citaria o nome)
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

  // As falas anteriores do Beto já foram exibidas com o nome: mascaram de novo.
  const messages: ChatMessage[] = [
    ...history.slice(-10).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: maskTextPII(m.content, pii) } as ChatMessage)),
    { role: 'user', content: maskTextPII(userMessage, pii) },
  ];

  // callAIChat injeta a instrução de idioma pelo `locale` passado aqui. Sem
  // ele, o wrapper lê só o cookie `vertho-locale`, e o login por senha não
  // grava o cookie: o Beto respondia em pt-BR enquanto a tela seguia o idioma
  // da empresa (R-68).
  const resposta = await callAIChat(systemPrompt, messages, { model: 'claude-sonnet-4-6' }, 1000, {
    taskKey: 'beto', empresaId, colaboradorId, locale,
  });
  return unmaskPII(resposta, pii);
}

/**
 * Em que idioma o Beto responde (R-68, 03/10/2026): o da TELA.
 *
 * A tela resolve o idioma por cookie, depois o idioma da empresa (pelo
 * subdomínio), depois o do navegador (`i18n/request.ts`). O Beto lia só o
 * cookie e caía em pt-BR, e o cookie só nasce no `/auth/callback` (login por
 * link) ou no seletor de idioma: quem entra com senha ficava com a tela num
 * idioma e o Beto noutro.
 *
 * Ordem: o idioma que a tela informa; sem ele (bundle antigo, sem o 4º
 * argumento), o cookie; sem cookie, o idioma da pessoa no cadastro e, na falta,
 * o da empresa dela (a mesma régua que o callback usa para gravar o cookie).
 */
async function idiomaDoBeto(localeDaTela: unknown, email: string | null | undefined): Promise<AppLocale> {
  const daTela = typeof localeDaTela === 'string' ? normalizeAppLocale(localeDaTela) : null;
  if (daTela) return daTela;
  try {
    const doCookie = normalizeAppLocale((await cookies()).get(localeCookieName)?.value);
    if (doCookie) return doCookie;
  } catch {
    // Fora de uma request (não acontece numa action); segue para o cadastro.
  }
  try {
    const { getLocaleForEmail } = await import('@/lib/i18n-server');
    return (await getLocaleForEmail(email)) ?? defaultLocale;
  } catch {
    return defaultLocale;
  }
}

/**
 * Carrega contexto da Fase 4 para o BETO.
 * Retorna pílula atual + competência em foco.
 */
async function getBetoContext(email: string): Promise<any> {
  const sb = createSupabaseAdmin();

  // CIS_COLUMNS traz DISC/liderança/tipo psicológico/competências + report_texts,
  // necessários para o bloco de perfil comportamental do Beto.
  // 🔴 `findColabByEmail`, nunca `.eq('email').single()`: o `.single()` ERRA quando
  // a pessoa está em mais de uma empresa — o PostgREST devolve erro por múltiplas
  // linhas e `colab` vem null. Medido 07/09/2026: **37 dos 473 colaboradores** têm
  // o e-mail em 2+ empresas, e para todos eles o Beto vinha respondendo SEM perfil
  // comportamental, SEM pílula da semana e SEM competência em foco — silenciosamente,
  // porque o `catch` de quem chama trata contexto ausente como caso normal. O custo
  // sem dono no ledger era o sintoma visível de um defeito de produto maior.
  const { findColabByEmail } = await import('@/lib/authz');
  const colab: any = await findColabByEmail(email, CIS_COLUMNS);

  if (!colab) return null;

  // Contexto da função (cargos_empresa) + nome da instituição.
  let cargoBloco = '';
  try {
    const { data: emp } = await sb.from('empresas').select('nome').eq('id', colab.empresa_id).maybeSingle();
    const cargoInfo = await carregarCargoInfo(sb, colab.empresa_id, colab.cargo);
    cargoBloco = formatBlocoCargo(cargoInfo, emp?.nome || null);
  } catch { /* best-effort */ }

  // Contexto da semana pela TRILHA — ver `lib/fase4/contexto-semanal.ts`.
  //
  // 🔴 Isto lia `fase4_envios.competencia_id`, coluna que NUNCA existiu. O
  // PostgREST recusa a query inteira (400) quando uma coluna do select não
  // existe, então `envio` vinha null e a função caía no `return` logo abaixo:
  // pílula, competência em foco e conhecimento do descritor nunca chegaram ao
  // prompt do BETO, em 100% das chamadas.
  const contexto = await resolverContextoSemanal(sb, {
    colaboradorId: colab.id,
    empresaId: colab.empresa_id,
    cargo: colab.cargo,
  });

  // Blueprint independe de Fase 4 — carrega já para valer nos dois caminhos.
  const blueprintResumo = await carregarBlueprintResumo(sb, colab.id);

  if (!contexto) return { nome: colab.nome_completo, cargo: colab.cargo, cargoBloco, blueprintResumo, colab };

  // A pílula vem do PLANO da trilha, não de `fase4_envios.sequencia`: medido em
  // 27/08, `sequencia` está vazia nos 75 envios ativos — ela nunca alimentaria
  // este bloco, mesmo com a query funcionando. O resolvedor já entrega
  // `titulo/resumo/url`, que é o que o prompt abaixo lê (o bloco cru do plano
  // usa `core_titulo`/`core_url`/`por_que_cabe_na_semana`).
  const pilulaAtual = contexto.pilula;

  // Competência em foco + conhecimento curado (SÓ definição — rubrica fica de
  // fora por segurança) + Módulo-Base pedagógico (quando autorado).
  let competenciaFoco = contexto.competencia;
  let descritorFoco: string | null = contexto.descritor;
  let conhecimentoDescritor = '';
  if (contexto.competenciaId) {
    const conhecimento = await carregarConhecimentoDescritorPorId(sb, contexto.competenciaId);
    competenciaFoco = conhecimento?.competencia || competenciaFoco;
    descritorFoco = conhecimento?.descritor || descritorFoco;
    const blocoDescritor = formatBlocoConhecimentoDescritor(conhecimento);
    const blocoModulo = conhecimento?.competencia
      ? await carregarModuloBaseParaTutor(sb, { competenciaNome: conhecimento.competencia, empresaId: colab?.empresa_id })
      : '';
    conhecimentoDescritor = [blocoDescritor, blocoModulo].filter(Boolean).join('\n\n');
  }

  // Saiba mais — conteúdos catalogados sobre a competência/descritor em foco.
  let conteudosBloco = '';
  if (competenciaFoco) {
    try {
      const rel = await buscarConteudosRelacionados(sb, {
        competencia: competenciaFoco, descritor: descritorFoco,
        cargo: colab.cargo, empresaId: colab.empresa_id,
      });
      conteudosBloco = formatConteudosRelacionadosBloco(rel);
    } catch { /* best-effort */ }
  }

  return {
    nome: colab.nome_completo,
    cargo: colab.cargo,
    semana: contexto.semana,
    pilulaAtual,
    competenciaFoco,
    conhecimentoDescritor,
    cargoBloco,
    blueprintResumo,
    conteudosBloco,
    colab,
  };
}
