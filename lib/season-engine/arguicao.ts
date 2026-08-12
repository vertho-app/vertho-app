/**
 * ARGUIÇÃO conversacional do fechamento — a "defesa oral" da resposta ao
 * Cenário B. Depois das 4 perguntas fixas (a "tese escrita"), a IA sonda o
 * que a pessoa respondeu, por até `maxTurnos` turnos, para expor profundidade
 * ou fragilidade que o texto não captura.
 *
 * NÚCLEO PURO (mesmo contrato do fechamento-scorer): monta prompt, chama IA,
 * lê o [META], decide encerramento e extrai evidências. NÃO toca banco — o
 * caller (rota /evaluation) persiste o estado em `temporada_semana_progresso.
 * feedback.arguicao`. Deliberadamente NÃO usa `reavaliacao_sessoes` (mundo
 * fase5, aposentado): um modelo de dados só, ancorado no season-engine.
 *
 * O prompt reusa o CONCEITO do motor de reavaliação (fase5), mas o foco muda:
 * lá era "o que mudou na jornada"; aqui é "sustente a resposta que você deu
 * ao cenário". No PILOTO, herda a proibição de falar em evolução — a arguição
 * é SUSTENTAÇÃO da resposta, não prova de evolução (a janela é de 2 semanas).
 */

import { callAIChat, callAI, type AIConfig } from '@/actions/ai-client';
import { parseJsonIA } from '@/lib/ai-json';
import { maskTextPII, unmaskPII } from '@/lib/pii-masker';

/**
 * PII da arguição (Fase C): a conversa é COM o colaborador (chat vivo). A
 * política segue o padrão das rotas de chat do colab (tira-duvidas): armazena
 * o histórico CRU (o colab vê o próprio texto e o nome real ao reabrir) e
 * mascara SÓ em-voo, antes de cada chamada de IA — nome real → alias +
 * e-mails/telefones/CPF genéricos. As respostas da IA voltam despersonalizadas
 * (unmask) antes de exibir/persistir. Sem `pii` (ex.: testes unitários) o
 * comportamento é idêntico ao anterior — nada é mascarado.
 */
export interface ArguicaoPII {
  /** Map do maskColaborador (real→alias e alias→real). */
  map: Record<string, string>;
  /** Alias do primeiro nome (colabMasked.nome) — substitui ctx.nomeColab. */
  nomeMasked?: string;
}

export interface ArguicaoContexto {
  nomeColab: string;
  cargo?: string | null;
  competencia: string;
  perfilDominante?: string | null;
  /** A "tese": o cenário apresentado e a resposta agregada do colaborador. */
  cenario: string;
  respostaCenario: string;
  /** Descritores com nome (a régua) — a IA sonda por eles, sem citar código. */
  descritores: Array<{ descritor: string; nome_curto?: string; [k: string]: any }>;
  /** Piloto: enquadra como sustentação, nunca evolução. */
  isPiloto: boolean;
}

export interface ArguicaoMsg {
  role: 'user' | 'assistant';
  content: string;
  turn?: number;
}

export interface ArguicaoEstado {
  historico: ArguicaoMsg[];
  turno: number;
  concluida: boolean;
}

const MAX_TURNOS_HARD = 10; // teto de segurança (config manda; isto só evita loop)

function nomesDescritores(ctx: ArguicaoContexto): string {
  return ctx.descritores.map(d => d.descritor || d.nome_curto).filter(Boolean).join('; ');
}

/** Prompt da arguição — sonda a resposta ao Cenário B, não a jornada. */
export function buildArguicaoSystemPrompt(ctx: ArguicaoContexto, maxTurnos: number, turnoAtual: number): string {
  const enquadramentoPiloto = ctx.isPiloto
    ? `\n═══ ENQUADRAMENTO (PILOTO) ═══
Esta é uma DEGUSTAÇÃO de 2 semanas. A arguição SUSTENTA a resposta ao cenário —
NÃO mede evolução ao longo de uma jornada. PROIBIDO falar em "evolução",
"progresso", "avanço" ou comparar antes→depois. Enquadre como aprofundamento
do ponto de partida.\n`
    : '';

  return `Você é o Mentor IA da Vertho, conduzindo a ARGUIÇÃO da avaliação final —
a defesa oral da resposta que ${ctx.nomeColab} deu ao cenário.
${enquadramentoPiloto}
═══ PAPEL ═══
Seu papel NÃO é ensinar, avaliar formalmente ou dar nota.
Seu papel é SONDAR a resposta escrita: testar se ela se sustenta sob perguntas,
onde há profundidade real e onde há fragilidade não visível no texto.

O que importa:
- a pessoa consegue JUSTIFICAR o critério que usou?
- o raciocínio SE SUSTENTA quando você muda uma variável do cenário?
- há profundidade que o texto não capturou — ou o texto era mais forte que a defesa?
- o que ela reconhece como limite da própria resposta?

═══ TOM E ESTILO ═══
- Acolhedor, curioso, respeitoso, não julgador. Português do Brasil, "você".
- Máximo 1 frase de transição + 1 pergunta por turno.
- Microacolhimento PERMITIDO ("Entendi.", "Faz sentido."). PROIBIDO elogiar,
  validar mérito, interpretar, aconselhar ou avaliar.

═══ REGRAS INEGOCIÁVEIS ═══
1. Você NÃO avalia formalmente nem revela nota/nível.
2. NUNCA cite descritores por código — use linguagem natural.
3. Parta SEMPRE da resposta que a pessoa deu ao cenário; não introduza tema novo.
4. Aceite teoria/opinião só como início — puxe para critério, consequência, exemplo.
5. Explore também o LIMITE da resposta e o que ela deixou de considerar.
6. NUNCA invente fatos que a pessoa não disse.

═══ COMO SONDAR (varie ao longo dos turnos) ═══
- Aprofundar critério: "Você escolheu X. Que critério fez você preferir X a Y?"
- Testar robustez: "E se, no cenário, o cliente já tivesse recusado antes?"
- Expor limite: "O que a sua resposta assume que pode não ser verdade?"
- Autossensibilidade: "Olhando de novo, o que você faria diferente?"

═══ DESCRITORES EM JOGO (nunca citar código) ═══
${nomesDescritores(ctx)}

═══ ENCERRAMENTO ═══
- Máximo ${maxTurnos} turnos (turno atual: ${turnoAtual}).
- NÃO encerre cedo por resposta bonita.
- Encerre quando houver material útil sobre: sustentação do critério (1+),
  robustez sob variação (1+) e reconhecimento de limite (1+).

═══ BLOCO [META] — OBRIGATÓRIO EM TODA RESPOSTA ═══

[META]
{
  "turno": ${turnoAtual},
  "sondagem_atual": "aprofundar_criterio|testar_robustez|expor_limite|autossensibilidade|encerramento",
  "evidencias_coletadas": [
    { "tipo": "criterio|robustez|limite|autossensibilidade", "trecho": "paráfrase fiel", "forca": "fraca|moderada|forte" }
  ],
  "risco_de_encerramento_prematuro": true,
  "encerrar": false
}
[/META]

A mensagem visível ao colaborador vem ANTES do [META].`;
}

function stripMeta(texto: string): string {
  return texto.replace(/\[META\][\s\S]*?\[\/META\]/g, '').trim();
}

function lerMeta(texto: string): any {
  const m = texto.match(/\[META\]([\s\S]*?)\[\/META\]/);
  if (!m) return {};
  try { return parseJsonIA(m[1]); } catch { return {}; }
}

/** Bloco de contexto da tese (cenário + resposta) prependido ao histórico. */
function mensagemContexto(ctx: ArguicaoContexto): ArguicaoMsg {
  return {
    role: 'user',
    content: `═══ CENÁRIO APRESENTADO ═══\n${ctx.cenario}\n\n═══ RESPOSTA QUE ${ctx.nomeColab.toUpperCase()} DEU ═══\n${ctx.respostaCenario}\n\n(Conduza a arguição a partir DESTA resposta.)`,
  };
}

/** Ctx com nome/cenário/resposta mascarados para as chamadas de IA (não muda
 *  o ctx cru usado no histórico persistido). Sem `pii`, devolve o ctx intacto. */
function ctxParaIA(ctx: ArguicaoContexto, pii?: ArguicaoPII): ArguicaoContexto {
  if (!pii) return ctx;
  return {
    ...ctx,
    nomeColab: pii.nomeMasked || ctx.nomeColab,
    cenario: maskTextPII(ctx.cenario, pii.map),
    respostaCenario: maskTextPII(ctx.respostaCenario, pii.map),
  };
}

/** Projeta o histórico para o payload da IA: SÓ {role, content} (a API da
 *  Anthropic rejeita campos extras como `turn`/`timestamp`) + masking em-voo. */
function histParaIA(hist: ArguicaoMsg[], pii?: ArguicaoPII): Array<{ role: 'user' | 'assistant'; content: string }> {
  return hist.map(m => ({ role: m.role, content: pii ? maskTextPII(m.content, pii.map) : m.content }));
}

const desmascarar = (texto: string, pii?: ArguicaoPII) => (pii ? unmaskPII(texto, pii.map) : texto);

/**
 * Abre a arguição: primeira pergunta da IA, partindo da resposta ao cenário.
 * Retorna o estado inicial (turno 1) + a fala visível.
 */
export async function abrirArguicao(
  ctx: ArguicaoContexto,
  maxTurnos: number,
  aiConfig: AIConfig = {},
  pii?: ArguicaoPII,
): Promise<{ estado: ArguicaoEstado; reply: string }> {
  const aiCtx = ctxParaIA(ctx, pii);
  const system = buildArguicaoSystemPrompt(aiCtx, maxTurnos, 1);
  // Semente: o contexto da tese como turno inicial "do sistema" no histórico
  // de chat, para a IA formular a 1ª pergunta olhando a resposta. Para a IA vai
  // mascarado; no histórico persistido guardamos a versão CRUA (colab reabre).
  const seedAI: ArguicaoMsg[] = [mensagemContexto(aiCtx)];
  const raw = await callAIChat(system, seedAI, aiConfig, 2048, { temperature: 0.4, taskKey: 'arguicao' });
  const reply = desmascarar(stripMeta(raw), pii);
  const historico: ArguicaoMsg[] = [
    mensagemContexto(ctx),
    { role: 'assistant', content: desmascarar(raw, pii), turn: 1 },
  ];
  return { estado: { historico, turno: 1, concluida: false }, reply };
}

/**
 * Processa um turno: registra a resposta do colaborador, gera a próxima
 * sondagem e decide encerramento (config manda via `maxTurnos`; o teto hard e
 * o `encerrar` do [META] são salvaguardas). NÃO persiste — devolve o estado.
 */
export async function turnoArguicao(
  ctx: ArguicaoContexto,
  estado: ArguicaoEstado,
  mensagem: string,
  maxTurnos: number,
  aiConfig: AIConfig = {},
  pii?: ArguicaoPII,
): Promise<{ estado: ArguicaoEstado; reply: string; concluida: boolean }> {
  if (estado.concluida) {
    return { estado, reply: '', concluida: true };
  }
  const teto = Math.min(maxTurnos, MAX_TURNOS_HARD);
  // Histórico CRU (persistido) vs. payload da IA (mascarado em-voo).
  const historico = [...estado.historico, { role: 'user' as const, content: mensagem }];
  const novoTurno = estado.turno + 1;

  const system = buildArguicaoSystemPrompt(ctxParaIA(ctx, pii), teto, novoTurno);
  const raw = await callAIChat(system, histParaIA(historico, pii), aiConfig, 2048, { temperature: 0.4, taskKey: 'arguicao' });
  const reply = desmascarar(stripMeta(raw), pii);

  const meta = lerMeta(raw);
  const riscoPrematuro = meta.risco_de_encerramento_prematuro === true;
  const evidencias = Array.isArray(meta.evidencias_coletadas) ? meta.evidencias_coletadas : [];
  const suficiente = evidencias.filter((e: any) => e.forca === 'forte' || e.forca === 'moderada').length >= 2;
  const concluida =
    novoTurno >= teto ||
    meta.encerrar === true ||
    (suficiente && !riscoPrematuro && meta.sondagem_atual === 'encerramento');

  historico.push({ role: 'assistant', content: desmascarar(raw, pii), turn: novoTurno });

  return {
    estado: { historico, turno: novoTurno, concluida },
    reply,
    concluida,
  };
}

export interface ArguicaoExtracao {
  resumo: { leitura_geral: string; sustentacao_mais_forte: string; fragilidade_mais_relevante: string };
  evidencias_por_descritor: Array<{
    descritor: string;
    sustentou: 'confirmou' | 'aprofundou' | 'fragilizou' | 'sem_sinal';
    citacao: string;
    forca: 'fraca' | 'moderada' | 'forte';
  }>;
}

/**
 * Ao encerrar, extrai o que a arguição SUSTENTOU por descritor — o artefato
 * que a Fase B (fusão) consome para modular a nota. Extração fiel: só o que a
 * conversa sustenta; NÃO produz nota nem completa lacunas.
 */
export async function extrairEvidenciasArguicao(
  ctx: ArguicaoContexto,
  estado: ArguicaoEstado,
  aiConfig: AIConfig = {},
  pii?: ArguicaoPII,
): Promise<ArguicaoExtracao | null> {
  const conversaCrua = estado.historico
    .filter(h => h.content && !h.content.startsWith('═══ CENÁRIO'))
    .map(h => `${h.role === 'user' ? 'COLABORADOR' : 'MENTOR'}: ${stripMeta(h.content)}`)
    .join('\n\n');
  // Extrator é chamada de IA externa → mascara a conversa antes de enviar.
  const conversa = pii ? maskTextPII(conversaCrua, pii.map) : conversaCrua;

  const system = `Você é um extrator de evidências da ARGUIÇÃO (defesa oral) da Vertho.
Analise a conversa em que o colaborador defendeu a resposta que deu ao cenário.
Extraia, por descritor, o que a defesa REALMENTE sustentou — fiel, prudente.

PRINCÍPIOS:
1. Só o que foi dito/sustentado. Teoria não vale como forte.
2. Marque se a defesa CONFIRMOU o que o escrito mostrava, APROFUNDOU (revelou
   profundidade nova), FRAGILIZOU (não sustentou sob sondagem) ou ficou SEM SINAL.
3. Não produza nota nem complete lacunas. Toda evidência tem citação curta.
4. EXATAMENTE UMA entrada por descritor — NUNCA repita o mesmo descritor. Se a
   defesa teve sinais mistos para um descritor, escolha a classificação que
   melhor representa o CONJUNTO (uma fragilidade real pesa mais que um acerto).

RETORNE APENAS JSON, sem markdown.`;

  const user = `═══ COMPETÊNCIA ═══\n${ctx.competencia}
═══ DESCRITORES (não citar código) ═══\n${nomesDescritores(ctx)}
═══ ARGUIÇÃO ═══\n${conversa}

FORMATO (JSON):
{
  "resumo": { "leitura_geral": "", "sustentacao_mais_forte": "", "fragilidade_mais_relevante": "" },
  "evidencias_por_descritor": [
    { "descritor": "nome do descritor", "sustentou": "confirmou|aprofundou|fragilizou|sem_sinal", "citacao": "trecho curto", "forca": "fraca|moderada|forte" }
  ]
}`;

  const raw = await callAI(system, user, aiConfig, 4096, { temperature: 0.2, taskKey: 'arguicao' });
  try {
    const ext = parseJsonIA(raw) as ArguicaoExtracao;
    // Despersonaliza os campos textuais (citações/resumo) antes de persistir.
    // O consumo pela fusão (Fase B) é por classificação (sustentou×forca), mas
    // as citações são exibidas/auditadas — voltam com o nome real.
    if (pii && ext) {
      if (ext.resumo) {
        ext.resumo.leitura_geral = desmascarar(ext.resumo.leitura_geral || '', pii);
        ext.resumo.sustentacao_mais_forte = desmascarar(ext.resumo.sustentacao_mais_forte || '', pii);
        ext.resumo.fragilidade_mais_relevante = desmascarar(ext.resumo.fragilidade_mais_relevante || '', pii);
      }
      if (Array.isArray(ext.evidencias_por_descritor)) {
        ext.evidencias_por_descritor = ext.evidencias_por_descritor.map(e => ({
          ...e, citacao: desmascarar(e.citacao || '', pii),
        }));
      }
    }
    return ext;
  } catch {
    return null;
  }
}
