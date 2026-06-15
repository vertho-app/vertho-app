/**
 * Prompt + tipos do roteiro de vídeo (PURO — sem callAI/Next, testável em node).
 * Estrutura FLEXÍVEL: avatar_intro + N cenas de conteúdo (miolo variável) +
 * avatar_outro. A IA calibra a quantidade pela densidade do módulo (alvo 3–5 min).
 *
 * DECK vs TOM: o deck visual (escolha/ordem de template, texto de tela) é dirigido
 * SÓ pela densidade do conteúdo + cargo/PPP — NÃO pelo perfil DISC. O DISC ajusta
 * apenas o TOM da narração. Isso mantém o visual idêntico entre perfis (e prepara o
 * caminho para "render-once + N-áudios" no futuro).
 *
 * Compatibilidade do renderer: narração em `narration` (fonte canônica de TTS e
 * legendas); campos visuais flat (não aninhados); `key_idea`/`source_anchor` são
 * metadados ignorados pelo render.
 */
export interface RoteiroScene {
  id: string;
  type:
    | 'avatar_intro' | 'avatar_outro'
    | 'concept_reveal' | 'comparison_motion' | 'icon_story'
    | 'stat_highlight' | 'quote_spotlight' | 'steps_flow' | 'scenario_card';
  title?: string;
  subtitle?: string;
  bullets?: string[];
  items?: string[];
  left?: { title: string; items: string[] };
  right?: { title: string; items: string[] };
  stat?: string;
  quote?: string;
  narration: string;
  key_idea?: string;
  source_anchor?: string;
}

export interface VideoRoteiro {
  title: string;
  theme: string;
  scenes: RoteiroScene[];
}

export interface ModuloParaRoteiro {
  titulo?: string | null;
  descritor?: string | null;
  competenciaNome?: string | null;
  nivel_entrada?: string | null;
  nivel_destino?: string | null;
  conteudo_central?: any;
  conteudo_aplicavel?: any;
  adaptacao_por_formato?: any;
  locale?: string | null;
  cargoBloco?: string | null;
  pppBrief?: string | null;
  discDominante?: 'D' | 'I' | 'S' | 'C' | null;
}

const IDIOMA: Record<string, string> = {
  'pt-BR': 'português do Brasil', 'pt-PT': 'português de Portugal', 'es-ES': 'espanhol', 'en-US': 'inglês',
};

// DISC ajusta APENAS o TOM da narração (não o deck visual).
const DISC_GUIA: Record<string, { rotulo: string; tom: string }> = {
  D: { rotulo: 'Dominante (D)', tom: 'Direto e decisivo; comece pelo "o que muda na prática"; foco em resultado, ação e impacto; sem rodeios.' },
  I: { rotulo: 'Influente (I)', tom: 'Caloroso e inspirador; traga pessoas e relação; linguagem que engaja e conecta.' },
  S: { rotulo: 'Estável (S)', tom: 'Acolhedor, seguro e gradual; "começar pequeno", passo a passo, baixa pressão.' },
  C: { rotulo: 'Conforme (C)', tom: 'Preciso, estruturado e lógico; critérios, evidências e clareza; pouca emoção, muito rigor.' },
};

function maturidadeGuia(ne?: string | null, nd?: string | null): string {
  const t = `${(ne || 'N1').toUpperCase()}→${(nd || 'N2').toUpperCase()}`;
  const map: Record<string, string> = {
    'N1→N2': 'compreensão prática, autonomia supervisionada e aplicação inicial.',
    'N2→N3': 'consistência, critério, adaptação e tomada de decisão.',
    'N3→N4': 'influência, multiplicação, visão sistêmica e melhoria contínua.',
  };
  return `${t}: ${map[t] || map['N1→N2']} Não fique avançado demais para transições iniciais, nem superficial demais para avançadas.`;
}

const MIOLO_TIPOS: RoteiroScene['type'][] = [
  'concept_reveal', 'comparison_motion', 'icon_story', 'stat_highlight', 'quote_spotlight', 'steps_flow', 'scenario_card',
];

export function buildRoteiroPrompt(m: ModuloParaRoteiro): { system: string; user: string } {
  const idioma = IDIOMA[m.locale || 'pt-BR'] || IDIOMA['pt-BR'];
  const cc = m.conteudo_central || {};
  const ca = m.conteudo_aplicavel || {};
  const disc = m.discDominante ? DISC_GUIA[m.discDominante] : null;
  // NOTA: `adaptacao_por_formato.video_roteiro` NÃO é injetado (formato legado).

  const persoSystem = (disc || m.cargoBloco || m.pppBrief) ? `

PERSONALIZAÇÃO (adapte exemplos e tom SEM mudar o conteúdo pedagógico nem a fidelidade):${m.cargoBloco ? `
- CARGO: ancore TODOS os exemplos no dia a dia real do cargo (contexto abaixo). Inclua pelo menos uma situação típica, um erro/risco comum e uma boa prática DESTE cargo; a pergunta final do avatar_outro deve ser aplicável à rotina dele. Nada genérico.` : ''}${m.pppBrief ? `
- INSTITUIÇÃO (PPP): use os valores/missão/metodologia para tornar exemplos e vocabulário plausíveis. NÃO cite o nome da instituição na narração; não faça propaganda institucional; use situações sintéticas (não casos reais identificáveis).` : ''}${disc ? `
- TOM POR PERFIL ${disc.rotulo}: ${disc.tom} O perfil ajusta APENAS o tom da narração — NUNCA a escolha de template, a ordem das cenas ou o texto de tela (esses seguem só a densidade do conteúdo). Não rotule nem descreva o perfil ("pessoas D são assim").` : ''}` : '';

  const system = `Você é roteirista de micro-aprendizagem, designer instrucional e diretor audiovisual da Vertho. Transforma um MÓDULO-BASE pedagógico num ROTEIRO TÉCNICO DE VÍDEO pronto para o pipeline: roteiro → TTS → HeyGen (cenas de avatar) → Remotion (cenas animadas) → legendas.

IDIOMA: escreva TUDO em ${idioma}.

FORMATO:
- Cena inicial com avatar (avatar_intro) + miolo de cenas animadas (voice-over) + cena final com avatar (avatar_outro). Avatar SÓ na abertura e no encerramento.
- NÃO proponha filmagem real, câmera, banco de imagens nem imagens geradas por IA. Use apenas o que os templates Remotion suportam: tipografia em destaque, ícones, cards, colunas, fluxos e formas abstratas.

DURAÇÃO (calibre pela densidade do módulo; não encha com repetição):
- Total entre 180 e 300 segundos de narração.
- Miolo: 6–8 cenas (módulo enxuto) · 8–10 (médio) · 10–12 (denso). NUNCA mais de 12 cenas de miolo.
- SE o módulo render menos de 6 ideias-núcleo distintas, faça MENOS cenas. É melhor um vídeo curto e denso do que esticar a mesma ideia para bater a contagem mínima. Nunca repita uma ideia com outra formulação só para ter mais cenas.
- Você NÃO controla o tempo do TTS diretamente, então mire a CONTAGEM DE PALAVRAS da narração:
  - avatar_intro: ~50–60 palavras (≈18–24s)
  - cada cena de miolo: ~45–65 palavras (≈18–26s)
  - avatar_outro: ~38–50 palavras (≈14–22s)
  Escreva para esse alvo falado, não para um número de segundos.

ESTRUTURA (ordem obrigatória): 1) avatar_intro · 2) miolo variado · 3) avatar_outro.

TEMPLATES E SEUS CAMPOS VISUAIS:
- avatar_intro / avatar_outro: title + subtitle.
- concept_reveal: explica um conceito/distinção. title + bullets (EXATAMENTE 3, cada 2–5 palavras).
- comparison_motion: contrasta prática fraca×desejada. title ("A x B") + left{title,items[3]} + right{title,items[3]}.
- icon_story: 3 sinais/exemplos/comportamentos. title + items (EXATAMENTE 3, cada 2–5 palavras).
- steps_flow: processo/método sequencial. title + items (3–5 passos, cada 2–4 palavras).
- stat_highlight: um DADO numérico. stat (ex.: "73%", "3x") + title + subtitle. Só use se o número existir no módulo. NUNCA invente estatística.
- quote_spotlight: frase-âncora. quote (≤14 palavras) + subtitle (atribuição, ex.: "Mentora Vertho").
- scenario_card: abre uma situação típica. title (ex.: "Imagine") + subtitle (1–2 frases curtas).

REGRAS DE VARIEDADE:
- NUNCA o mesmo template em duas cenas seguidas.
- Intercale cenas densas (concept_reveal, comparison_motion, steps_flow) com respiros (quote_spotlight, scenario_card, icon_story).
- Use scenario_card ao menos uma vez quando houver contexto de cargo.
- Use comparison_motion ao menos uma vez quando houver erros comuns × boas práticas.
- Use steps_flow quando houver processo/rotina/método. Use stat_highlight só se houver número real.
- Cada cena traz uma ideia NOVA — não repita a mesma ideia com outra formulação.
- A escolha e a ordem dos templates seguem a DENSIDADE DO CONTEÚDO, nunca um perfil comportamental.

NARRAÇÃO (campo "narration" = fonte canônica de TTS e legendas):
- Fala natural, oral, não artigo. Frases curtas (≤20 palavras). Sem jargão, markdown, emoji nem indicação de cena/câmera/edição.
- Voz da "Mentora Vertho": feminina, clara, segura, acolhedora e objetiva.
- O MÓDULO-BASE é escrito em prosa acadêmica densa. NÃO ecoe esse registro — transforme em fala:
  ❌ "A aprendizagem ativa exige uma organização pedagógica mais sofisticada, na qual o educador atua como mediador do processo e não como único detentor do conhecimento."
  ✅ "Aprendizagem ativa não é bagunça. É você virando guia do processo — não o dono de todas as respostas."

TEXTO NA TELA (não é transcrição da fala — resume e destaca):
- title ≤8 palavras; subtitle ≤14 palavras; bullets/items 2–5 palavras. Sem parágrafos na tela. Legível em 16:9.

FIDELIDADE:
- Fiel ao módulo; não invente conceitos, leis, dados, autores ou estatísticas. Não cite o descritor no gancho. Não vire motivacional genérico. Não omita a ideia principal. Preserve a transição de maturidade.
- TRANSIÇÃO DE MATURIDADE — calibre a profundidade: ${maturidadeGuia(m.nivel_entrada, m.nivel_destino)}

SEGURANÇA E LGPD:
- Não mencione pessoas reais (colaboradores, alunos, gestores) nem dados individuais. Não exponha informação sensível. Não faça diagnóstico psicológico. Não estereotipe perfis comportamentais. Use situações sintéticas e plausíveis.${persoSystem}

METADADOS POR CENA (ajudam o planejamento; mantenha curtos):
- key_idea: a ideia central da cena em uma frase.
- source_anchor: de qual parte do módulo a ideia veio (ex.: "PRINCÍPIOS", "ERROS COMUNS", "SITUAÇÕES TÍPICAS").

EXEMPLO DE CENAS (gabarito de REGISTRO e ESTRUTURA — copie o JEITO da narração, não o conteúdo):
{"id":"scene-3","type":"concept_reveal","key_idea":"Feedback é informação acionável, não veredito","source_anchor":"PRINCÍPIOS","title":"Feedback não é nota","bullets":["onde está","aonde ir","como avançar"],"narration":"Feedback bom não é dizer se acertou. É mostrar onde a pessoa está, aonde precisa chegar e o que fazer agora. Nota fecha o assunto. Feedback abre o próximo passo."}
{"id":"scene-5","type":"comparison_motion","key_idea":"Corrigir resolve uma vez; desenvolver ensina a se corrigir","source_anchor":"ERROS COMUNS / BOAS PRÁTICAS","title":"Corrigir x Desenvolver","left":{"title":"Corrigir","items":["aponta o erro","dá a resposta","fecha o assunto"]},"right":{"title":"Desenvolver","items":["mostra o processo","devolve a pergunta","acompanha o ajuste"]},"narration":"Dá pra apontar o erro e seguir em frente. Ou dá pra devolver a pergunta e acompanhar o ajuste. O primeiro corrige uma vez. O segundo ensina o aluno a se corrigir sempre."}

ANTES DE RESPONDER, valide em silêncio: JSON válido; 1ª cena avatar_intro e última avatar_outro; nenhum template repetido em sequência; toda cena tem id, type, narration, key_idea, source_anchor e os campos visuais do seu template; textos de tela curtos; nada inventado; narração no alvo de palavras; cada cena com ideia nova; cargo/PPP usados sem citar a instituição; NENHUMA escolha de template, ordem ou texto de tela influenciada por perfil comportamental; o avatar_outro termina com uma pergunta de reflexão.

Responda APENAS JSON válido (sem markdown nem texto fora do JSON; o miolo tem QUANTAS cenas o conteúdo pedir):
{
  "title": "título do vídeo",
  "theme": "tema curto",
  "scenes": [
    {"id":"scene-1","type":"avatar_intro","key_idea":"...","source_anchor":"IDEIA PRINCIPAL","title":"2-4 palavras","subtitle":"subtítulo curto","narration":"..."},
    {"id":"scene-2","type":"scenario_card","key_idea":"...","source_anchor":"SITUAÇÕES TÍPICAS","title":"Imagine","subtitle":"situação curta e plausível","narration":"..."},
    {"id":"scene-3","type":"concept_reveal","key_idea":"...","source_anchor":"PRINCÍPIOS","title":"...","bullets":["...","...","..."],"narration":"..."},
    {"id":"scene-4","type":"stat_highlight","key_idea":"...","source_anchor":"...","stat":"73%","title":"rótulo","subtitle":"contexto","narration":"..."},
    {"id":"scene-5","type":"comparison_motion","key_idea":"...","source_anchor":"ERROS COMUNS / BOAS PRÁTICAS","title":"A x B","left":{"title":"...","items":["...","...","..."]},"right":{"title":"...","items":["...","...","..."]},"narration":"..."},
    {"id":"scene-6","type":"steps_flow","key_idea":"...","source_anchor":"BOAS PRÁTICAS","title":"...","items":["...","...","...","..."],"narration":"..."},
    {"id":"scene-7","type":"quote_spotlight","key_idea":"...","source_anchor":"PRINCÍPIOS","quote":"frase memorável","subtitle":"Mentora Vertho","narration":"..."},
    {"id":"scene-8","type":"icon_story","key_idea":"...","source_anchor":"...","title":"...","items":["...","...","..."],"narration":"..."},
    "... mais cenas conforme o conteúdo ...",
    {"id":"scene-N","type":"avatar_outro","key_idea":"...","source_anchor":"BOAS PRÁTICAS / APLICAÇÃO","title":"...","subtitle":"pergunta prática de reflexão (OBRIGATÓRIA, aplicável à rotina do cargo)","narration":"... encerra com a pergunta de reflexão ..."}
  ]
}`;

  const user = `MÓDULO-BASE
- Competência: ${m.competenciaNome || '—'}${m.descritor ? ` › ${m.descritor}` : ''}
- Transição de nível: ${m.nivel_entrada || 'N1'} → ${m.nivel_destino || 'N2'}
- Título do módulo: ${m.titulo || '—'}

IDEIA PRINCIPAL:
${cc.ideia_principal || '—'}

EXPLICAÇÃO EXPANDIDA:
${cc.explicacao_expandida || '—'}

PRINCÍPIOS:
${(Array.isArray(cc.principios) ? cc.principios : []).map((p: any) => `- ${p.nome}: ${p.explicacao}`).join('\n') || '—'}

EXEMPLOS / APLICAÇÃO:
${ca.exemplos_universais ? `- adequada: ${ca.exemplos_universais.aplicacao_adequada || '—'}\n- inadequada: ${ca.exemplos_universais.aplicacao_inadequada || '—'}` : '—'}

ERROS COMUNS:
${(Array.isArray(ca.erros_comuns) ? ca.erros_comuns : []).slice(0, 8).map((e: any) => `- ${e.erro}`).join('\n') || '—'}

BOAS PRÁTICAS:
${(Array.isArray(ca.boas_praticas) ? ca.boas_praticas : []).slice(0, 8).map((b: any) => `- ${b.o_que_fazer}`).join('\n') || '—'}

SITUAÇÕES TÍPICAS:
${(Array.isArray(ca.situacoes_tipicas) ? ca.situacoes_tipicas : []).slice(0, 8).map((s: any) => `- ${s.contexto}: ${s.desafio}`).join('\n') || '—'}
${m.cargoBloco ? `\n${m.cargoBloco}\n` : ''}${m.pppBrief ? `\n═══ CONTEXTO DA INSTITUIÇÃO (PPP) ═══\n${m.pppBrief}\n` : ''}
Gere o roteiro técnico completo (avatar_intro + miolo VARIADO dimensionado pelo conteúdo + avatar_outro), 180–300s de narração${disc ? `, com a narração no TOM do perfil ${disc.rotulo}` : ''}. Responda só o JSON.`;

  return { system, user };
}

export function parseRoteiro(raw: string): VideoRoteiro | null {
  const cleaned = String(raw || '').replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  for (const c of [cleaned, cleaned.match(/\{[\s\S]*\}/)?.[0] || '']) {
    if (!c) continue;
    try {
      const p = JSON.parse(c);
      if (p?.scenes && Array.isArray(p.scenes) && p.scenes.length) return p as VideoRoteiro;
    } catch { /* próximo */ }
  }
  return null;
}

/**
 * Normaliza a estrutura flexível: garante avatar_intro PRIMEIRO e avatar_outro
 * ÚLTIMO, com o miolo preservado na ordem da IA. Avatares extras no meio são
 * descartados. Quebra repetições adjacentes do mesmo template. Re-IDs scene-1..N.
 */
export function normalizarRoteiro(roteiro: VideoRoteiro): VideoRoteiro {
  const scenes = Array.isArray(roteiro.scenes) ? roteiro.scenes : [];
  const intro = scenes.find((s) => s.type === 'avatar_intro');
  const outro = [...scenes].reverse().find((s) => s.type === 'avatar_outro');
  const restante = scenes.filter((s) => MIOLO_TIPOS.includes(s.type));

  // Reordena o miolo evitando templates iguais adjacentes, preservando ao máximo
  // a ordem da IA: a cada passo pega a 1ª cena do pool cujo tipo difere da última
  // já colocada (se todas restantes forem iguais à última, aceita — é inevitável).
  const miolo: RoteiroScene[] = [];
  while (restante.length) {
    let idx = miolo.length ? restante.findIndex((s) => s.type !== miolo[miolo.length - 1].type) : 0;
    if (idx === -1) idx = 0;
    miolo.push(restante.splice(idx, 1)[0]);
  }

  const ordenadas: RoteiroScene[] = [
    ...(intro ? [intro] : []),
    ...miolo,
    ...(outro ? [outro] : []),
  ];

  roteiro.scenes = (ordenadas.length ? ordenadas : scenes).map((s, i) => ({ ...s, id: `scene-${i + 1}` }));
  return roteiro;
}
