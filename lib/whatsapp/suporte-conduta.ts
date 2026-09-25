/**
 * Guardas de conduta do Beto no WhatsApp: o que ele NÃO pode dizer e o que ele
 * não deve tentar resolver sozinho.
 *
 * Por que existe (22/09/2026): o piloto só conversava com a equipe da Vertho, e
 * o tom dependia apenas do prompt. Aberto para todos os colaboradores, uma
 * resposta ríspida custa mais que uma resposta ruim: o número da Cloud API é o
 * MESMO para todos os tenants, e bloqueio de quem recebeu derruba o
 * `quality_rating` de todos eles.
 *
 * Camadas, da mais barata para a mais cara, e nenhuma confia na outra:
 *  1. Sinal de sofrimento na ENTRADA, por regex: resposta fixa com o CVV, sem IA.
 *     Não depende do modelo classificar certo nem do filtro do Google deixar
 *     passar a mensagem.
 *  2. Confirmação pura ("ok", "obrigada") fora de uma conversa com o Beto: não
 *     há o que responder, e responder vira ruído.
 *  3. Regras de conduta no prompt + `tom_usuario` no JSON (ver suporte-auto.ts).
 *  4. `safetySettings` do Gemini.
 *  5. Verificação da SAÍDA antes do envio: palavrão, ofensa e link fora da
 *     lista. Reprovou, sai texto fixo; o rascunho do modelo nunca chega à pessoa.
 *
 * Tudo aqui é puro (sem banco, sem rede) para ser testável por inteiro.
 *
 * 🔴 Regex em português: `\b` do JavaScript não conhece letra acentuada
 * (`\bvocê\b` não casa "você"). Por isso todo texto passa por `normalizar()`
 * ANTES do teste, e as listas são escritas sem acento.
 */

/** Como a pessoa escreveu, na leitura do modelo. Enum do schema da IA. */
export const TONS_USUARIO = ['neutro', 'irritado', 'ofensivo', 'sofrimento', 'denuncia'] as const;
export type TomUsuario = (typeof TONS_USUARIO)[number];

/** Minúsculas, sem acento, emoji e pontuação viram espaço, espaços colapsados. */
export function normalizar(texto: string | null | undefined): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── 1. Sofrimento ───────────────────────────────────────────────────────────

/**
 * Frases de risco à própria vida. Precisas de propósito: "não aguento mais"
 * sozinho é desabafo comum sobre a plataforma ("não aguento mais esse site") e
 * NÃO entra. Falso positivo aqui custa uma mensagem com o CVV para quem
 * brincou; falso negativo custa muito mais. Por isso a lista erra para o lado
 * de disparar, mas só com frase que fala de VIDA, não de cansaço.
 */
const SOFRIMENTO: RegExp[] = [
  /\bquero morrer\b/,
  /\bqueria morrer\b/,
  /\bvontade de morrer\b/,
  /\bme matar\b/,
  /\bme mato\b/,
  /\bsuicid/,
  /\b(tirar|acabar com) (a )?minha (propria )?vida\b/,
  /\bnao (quero|aguento) mais viver\b/,
  /\bsem vontade de viver\b/,
  /\bnao vejo (mais )?sentido (em|na) (viver|vida)\b/,
  /\bme (machucar|cortar|mutilar)\b/,
  /\bautomutila/,
  /\bmelhor (se )?eu (morrer|morresse|sumir|sumisse|nao existir|nao existisse)\b/,
];

export function sinalDeSofrimento(texto: string | null | undefined): boolean {
  const t = normalizar(texto);
  return Boolean(t) && SOFRIMENTO.some((re) => re.test(t));
}

// ── 2. Confirmação pura ─────────────────────────────────────────────────────

/** Expressões que, sozinhas, só confirmam ou agradecem. Sem acento. */
const CONFIRMACOES = [
  'muito obrigada', 'muito obrigado', 'obrigada', 'obrigado', 'obg', 'brigada', 'brigado',
  'valeu', 'vlw', 'ok', 'okay', 'certo', 'beleza', 'blz', 'ta bom', 'ta bem', 'tudo bem',
  'tudo certo', 'entendi', 'combinado', 'perfeito', 'show', 'top', 'otimo', 'sim', 'amem',
  'ja fiz', 'ja respondi', 'respondido', 'respondida', 'feito', 'vou fazer',
  'farei', 'vou fazer hoje', 'pode deixar', 'deus abencoe', 'abracos', 'abraco',
];
/** Saudação sozinha NÃO é confirmação (quase sempre vem uma pergunta depois),
 * mas junto de "ok, obrigada" ela não muda o sentido. */
const SAUDACOES = ['bom dia', 'boa tarde', 'boa noite', 'ola', 'oi'];

function removerExpressoes(t: string, lista: string[]): { resto: string; achou: boolean } {
  let resto = ` ${t} `;
  let achou = false;
  // Mais longas primeiro: "muito obrigada" antes de "obrigada".
  for (const exp of [...lista].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`\\s${exp.replace(/ /g, '\\s')}(?=\\s)`, 'g');
    if (re.test(resto)) {
      achou = true;
      resto = resto.replace(re, ' ');
    }
  }
  return { resto: resto.replace(/\s+/g, ' ').trim(), achou };
}

/**
 * A mensagem inteira é só confirmação/agradecimento (com ou sem saudação e
 * emoji)? "Bom dia. Ok! Obrigada. 🤝🏻" sim; "Bom dia" não; "ok, mas o vídeo não
 * abre" não. Emoji sozinho (👍) conta como confirmação.
 */
export function ehSoConfirmacao(texto: string | null | undefined): boolean {
  const bruto = String(texto ?? '').trim();
  if (!bruto) return false;
  const t = normalizar(bruto);
  // Só emoji/pontuação: sobrou nada depois de normalizar.
  if (!t) return true;
  const semConfirmacao = removerExpressoes(t, CONFIRMACOES);
  if (!semConfirmacao.achou) return false;
  const semSaudacao = removerExpressoes(semConfirmacao.resto, SAUDACOES);
  return semSaudacao.resto === '';
}

// ── 5. Verificação da saída ─────────────────────────────────────────────────

/**
 * Palavrão, xingamento e ofensa, sem acento. Casamento por PALAVRA inteira no
 * texto normalizado: "computador" não casa `puta`, "disputa" também não.
 * "lixo" ficou de fora de propósito: "pasta de lixo eletrônico" é resposta
 * legítima de suporte a quem não achou o e-mail.
 */
const TERMOS_IMPROPRIOS = [
  'porra', 'caralho', 'caralhos', 'cacete', 'merda', 'merdas', 'bosta', 'foda', 'fodase',
  'foder', 'fode', 'fodendo', 'fodido', 'fodida', 'puta', 'putas', 'puto', 'putaria', 'pqp',
  'fdp', 'vsf', 'tnc', 'vtnc', 'arrombado', 'arrombada', 'cuzao', 'cu', 'buceta', 'piroca',
  'viado', 'bicha', 'sapatao', 'retardado', 'retardada', 'idiota', 'idiotas', 'imbecil',
  'estupido', 'estupida', 'otario', 'otaria', 'babaca', 'burro', 'burra', 'cretino',
  'cretina', 'desgracado', 'desgracada', 'vagabundo', 'vagabunda', 'piranha', 'vadia',
  'corno', 'macaco', 'macaca', 'fuck', 'shit', 'bitch',
];
// Só expressões que continuam ofensivas depois de a normalização apagar a
// pontuação. "problema seu" ficou de fora: "Entendi o problema. Seu acesso..."
// vira "entendi o problema seu acesso" e seria reprovado.
const EXPRESSOES_IMPROPRIAS = [
  'cala a boca', 'cale a boca', 'vai se ferrar', 'vai se foder', 'vai tomar no',
  'se lascar', 'se ferrar', 'lixo humano',
];
const RE_TERMO = new RegExp(`\\b(${TERMOS_IMPROPRIOS.join('|')})\\b`);
const RE_EXPRESSAO = new RegExp(`\\b(${EXPRESSOES_IMPROPRIAS.map((e) => e.replace(/ /g, '\\s')).join('|')})\\b`);

/** Devolve o termo encontrado (para o registro), ou `null`. */
export function linguagemImpropria(texto: string | null | undefined): string | null {
  const t = normalizar(texto);
  if (!t) return null;
  return t.match(RE_EXPRESSAO)?.[1] ?? t.match(RE_TERMO)?.[1] ?? null;
}

/**
 * O único link que o Beto pode escrever é a porta pública de acesso. O link
 * personalizado sai por template, fora da IA. Qualquer outro endereço na
 * resposta é sinal de alucinação ou de instrução injetada na mensagem.
 */
const RE_LINK = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|ai|br|app|me|info|link|ly)\b(?:\/\S*)?/gi;
const LINKS_PERMITIDOS = /^(?:https?:\/\/)?(?:app\.)?vertho\.ai(?:\/entrar)?\/?$/i;

export function linkNaoPermitido(texto: string | null | undefined): string | null {
  for (const bruto of String(texto ?? '').match(RE_LINK) ?? []) {
    const link = bruto.replace(/[.,;:!?)\]}>'"]+$/, '');
    if (!LINKS_PERMITIDOS.test(link)) return link;
  }
  return null;
}

export type ReprovacaoSaida = { motivo: 'linguagem-impropria' | 'link-nao-permitido'; trecho: string };

/** Última barreira antes do envio. `null` = pode sair. */
export function verificarResposta(texto: string): ReprovacaoSaida | null {
  const termo = linguagemImpropria(texto);
  if (termo) return { motivo: 'linguagem-impropria', trecho: termo };
  const link = linkNaoPermitido(texto);
  if (link) return { motivo: 'link-nao-permitido', trecho: link.slice(0, 80) };
  return null;
}

// ── 4. Filtro do Google ─────────────────────────────────────────────────────

/**
 * `safetySettings` do Gemini. Sem isto vale o padrão do provedor, que nos
 * modelos recentes é permissivo.
 *
 * `DANGEROUS_CONTENT` fica em `BLOCK_ONLY_HIGH` de propósito: o filtro também
 * avalia a MENSAGEM da pessoa, e um bloqueio ali troca a classificação
 * `sofrimento` (que responde com o CVV) por uma contenção genérica. Quem está
 * em crise precisa passar pelo modelo, não ser barrado antes dele.
 */
export const SAFETY_SETTINGS_SUPORTE = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
];

/** O erro do wrapper é de bloqueio do filtro do Google, e não de rede/formato? */
export function ehBloqueioDeSeguranca(mensagemErro: string | null | undefined): boolean {
  return /finishReason=(SAFETY|PROHIBITED_CONTENT|BLOCKLIST|SPII)|blockReason=/i.test(String(mensagemErro ?? ''));
}

// ── Textos fixos ────────────────────────────────────────────────────────────
//
// Fixos, e não escritos pelo modelo, porque são justamente os casos em que um
// erro de tom não tem conserto. Sem travessão, sem promessa de prazo.

export const TEXTO_SOFRIMENTO =
  'Obrigado por me contar. O que você está sentindo importa. Se estiver pensando em se machucar, '
  + 'ou sentindo que não aguenta mais, fale agora com o CVV: ligue 188 (gratuito, 24 horas) ou use '
  + 'o chat em cvv.org.br. Em risco imediato, ligue 192. A equipe da Vertho também vai ver esta conversa.';

export const TEXTO_DENUNCIA =
  'Obrigado por confiar isso a mim. Uma situação assim merece cuidado de verdade, e eu não sou o '
  + 'canal certo para tratar dela. Procure o RH, a ouvidoria ou o canal de denúncia da sua '
  + 'instituição. Se houver risco à sua segurança agora, ligue 190. A equipe da Vertho também vai ver esta conversa.';

export const TEXTO_OFENSA =
  'Entendo que a situação esteja frustrante, e quero te ajudar. Vou deixar esta conversa com a '
  + 'equipe da Vertho, que continua com você por aqui.';

const APRESENTACAO = 'Oi! Sou o Beto, assistente virtual da Vertho 👋';

/**
 * Por que o assunto foi para a equipe. Quem classifica é o modelo
 * (`motivo_humano`); o TEXTO continua fixo, escolhido aqui.
 *
 * 🔴 ATÉ 25/09/2026 ERA UM TEXTO SÓ, e ele pedia "print da tela ou a mensagem de
 * erro" a todo mundo. Encaixa num vídeo que trava; não encaixa em "não recebi
 * mais nenhum conteúdo" (professora sem trilha, caso real de 25/09) nem em "diz
 * que meu e-mail é inválido", que acabou de mandar o erro. Pedir de novo o que a
 * pessoa já disse soa como não ter lido.
 */
export const MOTIVOS_HUMANO = ['defeito', 'conta', 'etapa', 'outro'] as const;
export type MotivoHumano = (typeof MOTIVOS_HUMANO)[number];

const CORPO_ESCALADA: Record<MotivoHumano, string> = {
  // Byte-igual ao texto único de antes de 25/09: as escaladas já gravadas nas
  // últimas 12 h continuam reconhecidas por `passouParaEquipe`.
  defeito: 'Isso eu não consigo resolver por aqui, então deixei com a equipe da Vertho, que '
    + 'continua com você nesta conversa. Se tiver um print da tela ou a mensagem de erro, pode mandar aqui mesmo.',
  conta: 'Para isso alguém precisa conferir o seu cadastro, então deixei com a equipe da Vertho, que '
    + 'continua com você nesta conversa.',
  etapa: 'A liberação das próximas etapas do programa é com a equipe da Vertho. Deixei seu caso com '
    + 'eles, que continuam com você nesta conversa.',
  outro: 'Isso eu não consigo resolver por aqui, então deixei com a equipe da Vertho, que '
    + 'continua com você nesta conversa.',
};

/**
 * Pedido que o Beto não resolve. Sem motivo (bloqueio do filtro, saída fora do
 * contrato) vai o genérico, que não pede nada à pessoa.
 */
export function respostaEscalada(jaConversou: boolean, motivo: MotivoHumano = 'outro'): string {
  const corpo = CORPO_ESCALADA[motivo] ?? CORPO_ESCALADA.outro;
  return jaConversou ? corpo : `${APRESENTACAO} ${corpo}`;
}

/**
 * O texto enviado passou um assunto para a equipe? Depois dele, insistir NESSE
 * assunto não tem resposta automática (desmentiria o "deixei com a equipe");
 * assunto novo tem, e quem decide qual é o caso é o modelo
 * (`continua_escalada`, em suporte-auto.ts). Sofrimento e denúncia ficam de
 * fora de propósito: se a pessoa seguir em crise, o CVV precisa sair de novo.
 *
 * ⚠️ O reconhecimento é pelo texto EXATO, então cada variante de escalada tem de
 * estar aqui. Uma variante esquecida faria o Beto responder de novo a quem já
 * foi passado para a equipe, desmentindo o "deixei com a equipe".
 */
const TEXTOS_QUE_PASSAM = new Set<string>([
  TEXTO_OFENSA,
  ...MOTIVOS_HUMANO.flatMap((m) => [respostaEscalada(true, m), respostaEscalada(false, m)]),
]);

export function passouParaEquipe(texto: string | null | undefined): boolean {
  return TEXTOS_QUE_PASSAM.has(String(texto ?? '').trim());
}
