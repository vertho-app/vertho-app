/**
 * Prompt + tipos do roteiro de vídeo (PURO — sem callAI/Next, testável em node).
 * Estrutura FLEXÍVEL: avatar_intro + N cenas de conteúdo (miolo variável) +
 * avatar_outro. A IA calibra a quantidade pela densidade do módulo (alvo 3–5 min).
 *
 * DECK INVARIANTE vs TOM: o deck visual (template, ordem, texto de tela) é dirigido
 * SÓ por densidade do conteúdo + cargo/PPP/maturidade — NUNCA pelo DISC. O DISC
 * ajusta apenas o TOM da `narration`. O roteiro declara isso (`deck_invariant` +
 * `disc_sensitive_fields`), o que prepara "render-once + N-áudios".
 *
 * Compatibilidade do renderer: narração em `narration`; campos visuais flat;
 * `key_idea`/`source_anchor`/`estimated_words` e os campos-raiz de metadados são
 * ignorados pelo render.
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
  estimated_words?: number;
}

export interface VideoRoteiro {
  title: string;
  theme: string;
  deck_invariant?: boolean;
  disc_sensitive_fields?: string[];
  audience_context?: { cargo?: string | null; disc?: string | null; maturity_transition?: string | null; institution_context_used?: boolean };
  estimated_total_words?: number;
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

// DISC ajusta APENAS o TOM/estilo da narração (não o deck visual).
const DISC_GUIA: Record<string, { rotulo: string; tom: string }> = {
  D: { rotulo: 'Dominante (D)', tom: 'Direto, decisivo, focado em resultado, ação e impacto; frases curtas, foco no que muda na prática, sem rodeios.' },
  I: { rotulo: 'Influente (I)', tom: 'Caloroso, inspirador, humano e mobilizador; exemplos relacionais, conexão com pessoas e engajamento.' },
  S: { rotulo: 'Estável (S)', tom: 'Acolhedor, seguro, gradual, sem pressão; passo a passo, segurança psicológica e consistência.' },
  C: { rotulo: 'Conforme (C)', tom: 'Preciso, estruturado, lógico e criterioso; critérios, evidências, organização e clareza.' },
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
- CARGO: ancore os exemplos práticos no dia a dia real do cargo (contexto abaixo), sem repetir a mesma situação em todas as cenas. Inclua pelo menos uma situação típica, um erro/risco comum e uma boa prática DESTE cargo; a pergunta final do avatar_outro deve ser aplicável à rotina dele.` : ''}${m.pppBrief ? `
- INSTITUIÇÃO (PPP): a instituição tem identidade própria — REFLITA ATIVAMENTE seus valores, missão, metodologia e prioridades, tanto na NARRAÇÃO quanto no TEXTO DE TELA (títulos/bullets/items podem ecoar as prioridades da escola). PELO MENOS UMA cena deve conectar o conteúdo a um valor ou prioridade CONCRETO do PPP (marque-a com source_anchor "PPP"), e o vocabulário deve soar DAQUELA instituição, não de uma escola genérica. Priorize os traços DISTINTIVOS — o que torna a instituição única (público atendido, território, cultura local, comunidades, projetos próprios) — em vez de generalidades; mas só se encaixar com naturalidade no conteúdo (não force). SALVAGUARDAS: não cite o NOME da instituição, não faça propaganda nem exponha pessoas reais; as situações são sintéticas e plausíveis, mas reconhecivelmente alinhadas ao PPP.` : ''}${disc ? `
- TOM POR PERFIL ${disc.rotulo}: ${disc.tom} O perfil ajusta APENAS o tom da narração — NUNCA template, ordem ou texto de tela. Nunca diga "pessoas D são...", não rotule nem estereotipe o colaborador.` : ''}` : '';

  const system = `Você é roteirista de micro-aprendizagem, designer instrucional e diretor audiovisual da Vertho. Transforma um MÓDULO-BASE pedagógico num ROTEIRO TÉCNICO DE VÍDEO pronto para o pipeline: roteiro → TTS → HeyGen (cenas de avatar) → Remotion (cenas animadas) → legendas.

IDIOMA: escreva TUDO em ${idioma}.

FORMATO:
- Cena inicial com avatar (avatar_intro) + miolo de cenas animadas (voice-over) + cena final com avatar (avatar_outro). Avatar SÓ na abertura e no encerramento.
- NÃO proponha filmagem real, câmera, banco de imagens nem imagens geradas por IA. Use apenas o que os templates Remotion suportam: tipografia, ícones, cards, colunas, fluxos, formas abstratas e motion typography.

DURAÇÃO (calibre pela densidade do módulo; não encha com repetição):
- Total entre 180 e 300 segundos de narração.
- Miolo: 6–8 cenas (módulo enxuto) · 8–10 (médio) · 10–12 (denso). NUNCA mais de 12 cenas de miolo.
- SE o módulo render menos de 6 ideias-núcleo distintas, faça MENOS cenas. É melhor um vídeo curto e denso do que esticar a mesma ideia. Nunca repita uma ideia com outra formulação só para aumentar duração.
- Você NÃO controla o tempo do TTS; calibre por CONTAGEM DE PALAVRAS da narração:
  - avatar_intro: 50–60 palavras. · cada cena de miolo: 45–65 palavras. · avatar_outro: 38–50 palavras.
  Inclua em cada cena o campo "estimated_words" (contagem aproximada de palavras da narração).

ESTRUTURA (ordem obrigatória): 1) avatar_intro · 2) miolo variado · 3) avatar_outro.

TEMPLATES E SEUS CAMPOS VISUAIS:
- avatar_intro / avatar_outro: title + subtitle.
- concept_reveal: explica um conceito/distinção. title + bullets (EXATAMENTE 3, cada 2–5 palavras).
- comparison_motion: contrasta prática fraca×desejada. title ("A x B") + left{title,items[3]} + right{title,items[3]}.
- icon_story: 3 sinais/exemplos/comportamentos. title + items (EXATAMENTE 3, cada 2–5 palavras).
- steps_flow: processo/método sequencial. title + items (3–5 passos, cada 2–4 palavras).
- stat_highlight: um DADO numérico. stat + title + subtitle. Só use se houver número EXPLÍCITO no módulo; o valor de "stat" deve aparecer LITERALMENTE no conteúdo de entrada. NUNCA invente estatística.
- quote_spotlight: frase-âncora. quote (≤14 palavras) + subtitle (atribuição, ex.: "Mentora Vertho").
- scenario_card: abre uma situação típica. title (ex.: "Imagine") + subtitle (1–2 frases curtas).

REGRAS DE VARIEDADE:
- NUNCA o mesmo template em duas cenas seguidas.
- Intercale cenas densas (concept_reveal, comparison_motion, steps_flow) com respiros (quote_spotlight, scenario_card, icon_story).
- Use scenario_card ao menos uma vez quando houver contexto de cargo. Use comparison_motion ao menos uma vez quando houver erros×boas práticas. Use steps_flow quando houver processo/rotina/método. Use stat_highlight só se houver número real e explícito.
- Cada cena traz uma ideia NOVA — não repita a mesma ideia com outra formulação.

DECK INVARIANTE (o deck visual é reaproveitado por todos os perfis DISC):
- Template, ordem das cenas e TODOS os textos de tela (title, subtitle, bullets, items, quote, stat) são dirigidos APENAS por: densidade do conteúdo, cargo, PPP/instituição e transição de maturidade.
- O perfil DISC ajusta SOMENTE a narração. title/subtitle/bullets/items/quote/stat/template/ordem NÃO podem depender do DISC.
- Declare no JSON: "deck_invariant": true e "disc_sensitive_fields": ["narration"].

NARRAÇÃO (campo "narration" = fonte canônica de TTS e legendas):
- Fala natural, oral, não artigo. Frases curtas (≤20 palavras). Sem jargão, markdown, emoji nem indicação de cena/câmera/edição.
- Voz da "Mentora Vertho": feminina, clara, segura, acolhedora e objetiva.
- O MÓDULO-BASE pode vir em prosa acadêmica densa. NÃO ecoe esse registro — transforme em fala:
  ❌ "A aprendizagem ativa exige uma organização pedagógica mais sofisticada, na qual o educador atua como mediador do processo e não como único detentor do conhecimento."
  ✅ "Aprendizagem ativa não é bagunça. É você virando guia do processo — não o dono de todas as respostas."

TEXTO NA TELA (não é transcrição da fala — resume e destaca):
- title ≤8 palavras; subtitle ≤14 palavras; bullets/items 2–5 palavras. Sem parágrafos na tela. Legível em 16:9.

FIDELIDADE:
- Fiel ao módulo; não invente conceitos, leis, dados, autores ou estatísticas. Não cite o descritor no gancho. Não vire motivacional genérico. Não omita a ideia principal. Preserve a transição de maturidade. Se usar stat_highlight, o número deve existir literalmente no módulo.

COBERTURA MÍNIMA (quando disponível no módulo; priorize o mais relevante, NÃO cubra tudo superficialmente): a ideia principal; ≥2 princípios; ≥1 erro comum; ≥1 boa prática; ≥1 situação típica (quando houver contexto de cargo).

TRANSIÇÃO DE MATURIDADE — calibre a profundidade: ${maturidadeGuia(m.nivel_entrada, m.nivel_destino)}

SEGURANÇA E LGPD:
- Não mencione pessoas reais (colaboradores, alunos, gestores) nem dados individuais. Não exponha informação sensível. Não faça diagnóstico psicológico. Não estereotipe perfis comportamentais. Use situações sintéticas e plausíveis.${persoSystem}

SOURCE_ANCHOR (use exatamente um destes formatos): IDEIA_PRINCIPAL · EXPLICACAO_EXPANDIDA:<tópico> · PRINCIPIOS:<nome> · EXEMPLOS:adequada · EXEMPLOS:inadequada · ERROS_COMUNS · BOAS_PRATICAS · SITUACOES_TIPICAS · CARGO · PPP

METADADOS POR CENA: id · type · key_idea (frase curta com a ideia central) · source_anchor (de onde a ideia veio) · estimated_words (≈ palavras da narração) · narration · campos visuais do template.

EXEMPLO DE CENAS (referência de REGISTRO e ESTRUTURA — NÃO copie o conteúdo se não pertencer ao módulo):
{"id":"scene-3","type":"concept_reveal","key_idea":"Feedback é informação acionável, não veredito","source_anchor":"PRINCIPIOS:Feedback como instrução","estimated_words":35,"title":"Feedback não é nota","bullets":["onde está","aonde ir","como avançar"],"narration":"Feedback bom não é dizer se acertou. É mostrar onde a pessoa está, aonde precisa chegar e o que fazer agora. Nota fecha o assunto. Feedback abre o próximo passo."}
{"id":"scene-5","type":"comparison_motion","key_idea":"Corrigir resolve uma vez; desenvolver ensina a se corrigir","source_anchor":"ERROS_COMUNS / BOAS_PRATICAS","estimated_words":41,"title":"Corrigir x Desenvolver","left":{"title":"Corrigir","items":["aponta o erro","dá a resposta","fecha o assunto"]},"right":{"title":"Desenvolver","items":["mostra o processo","devolve a pergunta","acompanha o ajuste"]},"narration":"Dá para apontar o erro e seguir em frente. Ou dá para devolver a pergunta e acompanhar o ajuste. O primeiro corrige uma vez. O segundo ensina o aluno a se corrigir sempre."}

ANTES DE RESPONDER, valide em silêncio: JSON válido; sem markdown/comentários/placeholders; sem reticências como "... mais cenas"; 1ª cena avatar_intro e última avatar_outro; nenhum template repetido em sequência; toda cena tem id, type, narration, key_idea, source_anchor, estimated_words e os campos visuais do template; textos de tela curtos; nada inventado; se houver stat_highlight, o número existe literalmente no módulo; cada cena com ideia nova; cobertura mínima respeitada; cargo ancorado no dia a dia do cargo; se houver PPP, ao menos uma cena (source_anchor "PPP") reflete um valor/prioridade concreto da instituição SEM citar o nome; deck NÃO influenciado pelo perfil; narração no alvo de palavras; avatar_outro termina com pergunta de reflexão prática.

FORMATO DE SAÍDA: responda APENAS JSON válido — sem markdown, comentários ou texto fora do JSON. NÃO inclua placeholders nem linhas como "... mais cenas conforme o conteúdo ...". Gere apenas cenas reais (o miolo tem de 6 a 12 cenas conforme a densidade). Estrutura:
{
  "title": "título do vídeo",
  "theme": "tema curto",
  "deck_invariant": true,
  "disc_sensitive_fields": ["narration"],
  "audience_context": {"cargo": "cargo ou null", "disc": "D/I/S/C ou null", "maturity_transition": "transição ou null", "institution_context_used": true},
  "estimated_total_words": 520,
  "scenes": [
    {"id":"scene-1","type":"avatar_intro","key_idea":"...","source_anchor":"IDEIA_PRINCIPAL","estimated_words":55,"title":"2-4 palavras","subtitle":"subtítulo curto","narration":"..."},
    {"id":"scene-2","type":"scenario_card","key_idea":"...","source_anchor":"SITUACOES_TIPICAS","estimated_words":55,"title":"Imagine","subtitle":"situação curta e plausível","narration":"..."},
    {"id":"scene-3","type":"concept_reveal","key_idea":"...","source_anchor":"PRINCIPIOS:<nome>","estimated_words":55,"title":"título curto","bullets":["item curto","item curto","item curto"],"narration":"..."},
    {"id":"scene-4","type":"comparison_motion","key_idea":"...","source_anchor":"ERROS_COMUNS","estimated_words":58,"title":"A x B","left":{"title":"prática fraca","items":["item curto","item curto","item curto"]},"right":{"title":"prática desejada","items":["item curto","item curto","item curto"]},"narration":"..."},
    {"id":"scene-5","type":"steps_flow","key_idea":"...","source_anchor":"BOAS_PRATICAS","estimated_words":56,"title":"título curto","items":["passo 1","passo 2","passo 3"],"narration":"..."},
    {"id":"scene-6","type":"avatar_outro","key_idea":"...","source_anchor":"BOAS_PRATICAS","estimated_words":45,"title":"Pergunta prática","subtitle":"pergunta curta e acionável","narration":"... termina com uma pergunta de reflexão prática."}
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
 * ÚLTIMO, com o miolo reordenado para evitar templates iguais adjacentes
 * (greedy, preservando a ordem da IA ao máximo). Re-IDs scene-1..N.
 */
export function normalizarRoteiro(roteiro: VideoRoteiro): VideoRoteiro {
  const scenes = Array.isArray(roteiro.scenes) ? roteiro.scenes : [];
  const intro = scenes.find((s) => s.type === 'avatar_intro');
  const outro = [...scenes].reverse().find((s) => s.type === 'avatar_outro');
  const restante = scenes.filter((s) => MIOLO_TIPOS.includes(s.type));

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
