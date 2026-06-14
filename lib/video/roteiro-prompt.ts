/**
 * Prompt + tipos do roteiro de vídeo (PURO — sem callAI/Next, testável em node).
 * Estrutura FLEXÍVEL: avatar_intro + N cenas de conteúdo (miolo variável) +
 * avatar_outro. A IA calibra a quantidade de cenas pela densidade do módulo
 * (alvo 3–5 min). Avatar só nas pontas (economia HeyGen); o miolo é animado e
 * reutiliza 7 templates visuais — variar evita a monotonia em vídeos longos.
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
  stat?: string;   // stat_highlight: número/percentual em destaque (ex.: "73%")
  quote?: string;  // quote_spotlight: a frase-âncora
  narration: string;
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
}

const IDIOMA: Record<string, string> = {
  'pt-BR': 'português do Brasil', 'pt-PT': 'português de Portugal', 'es-ES': 'espanhol', 'en-US': 'inglês',
};

// Tipos de cena do MIOLO (animadas, sem avatar). Repetíveis, mas não adjacentes.
const MIOLO_TIPOS: RoteiroScene['type'][] = [
  'concept_reveal', 'comparison_motion', 'icon_story', 'stat_highlight', 'quote_spotlight', 'steps_flow', 'scenario_card',
];

export function buildRoteiroPrompt(m: ModuloParaRoteiro): { system: string; user: string } {
  const idioma = IDIOMA[m.locale || 'pt-BR'] || IDIOMA['pt-BR'];
  const cc = m.conteudo_central || {};
  const ca = m.conteudo_aplicavel || {};
  const ap = m.adaptacao_por_formato || {};

  const system = `Você é roteirista de micro-aprendizagem da Vertho. Transforma um Módulo-Base (matéria-prima pedagógica) num ROTEIRO DE VÍDEO de 3 a 5 MINUTOS: uma cena de abertura por avatar, um MIOLO de N cenas animadas variadas, e uma cena de encerramento por avatar.

IDIOMA: escreva TUDO (títulos, bullets, narração) em ${idioma}.

ESTRUTURA (ordem obrigatória):
1. UMA cena "avatar_intro" — gancho + o que o vídeo vai cobrir.
2. MIOLO: de 8 a 14 cenas de conteúdo, escolhendo entre 7 templates (ver abaixo).
3. UMA cena "avatar_outro" — pergunta prática / convite à aplicação.

TEMPLATES DO MIOLO (use o que melhor encaixa cada ideia; VARIE):
- "concept_reveal": explica UM conceito/princípio. campos: title + bullets (3 aspectos-chave, 2-5 palavras).
- "comparison_motion": contraste de 2 colunas. campos: title ("A x B") + left{title,items[3]} (fraco/reativo) + right{title,items[3]} (forte/desejado).
- "icon_story": 3 itens/sinais/exemplos práticos. campos: title + items[3] (2-5 palavras).
- "steps_flow": um PROCESSO sequencial (passos conectados 1→2→3→4). campos: title + items[3 a 5] (cada passo 2-4 palavras). Use quando houver uma ordem/fluxo.
- "stat_highlight": um DADO em destaque. campos: stat (ex.: "73%", "3x", "10 min") + title (rótulo curto) + subtitle (1 frase de contexto). Use quando houver um número marcante. NÃO invente dados — só se vierem do módulo.
- "quote_spotlight": uma FRASE-âncora memorável (≤14 palavras). campos: quote + subtitle (atribuição curta, ex.: "Mentora Vertho"). Use pra fixar um princípio.
- "scenario_card": abre uma SITUAÇÃO típica ("Imagine que..."). campos: title (rótulo curto, ex.: "Imagine") + subtitle (1-2 frases curtas do cenário). Use pra contextualizar um problema antes da solução.

REGRAS DE VARIEDADE (evitar monotonia em vídeo longo):
- NUNCA use o mesmo template em duas cenas seguidas.
- Intercale cenas DENSAS (concept_reveal, comparison_motion, steps_flow) com RESPIROS (stat_highlight, quote_spotlight, scenario_card).
- Use cada template novo (stat, quote, scenario, steps) ao menos uma vez se o conteúdo permitir; não force.

CALIBRE A DURAÇÃO PELO CONTEÚDO (não encha com repetição):
- Módulo ENXUTO → ~8 cenas de miolo (perto de 3 min). Módulo DENSO → até 14 cenas (perto de 5 min).
- Cada cena de miolo = ~18–26s de narração. Intro ~18–22s. Outro ~14–18s.
- Cada cena traz uma ideia NOVA do módulo. Cubra princípios, exemplos, erros×boas práticas, situações típicas.

PRINCÍPIOS DE ESCRITA:
- A NARRAÇÃO é falada — linguagem oral, frases curtas (≤20 palavras), natural. Sem markdown, sem emoji, sem indicação de cena.
- Os ELEMENTOS VISUAIS (title, bullets, items, quote, stat) são CURTOS — aparecem na tela. Exceção: subtitle de scenario_card pode ter 1-2 frases curtas.
- Fiel ao módulo; não invente leis/dados. Sem jargão. O narrador é a "Mentora Vertho" (feminino, acolhedor). NÃO cite o descritor no gancho.

Responda APENAS JSON válido (o miolo tem QUANTAS cenas o conteúdo pedir):
{
  "title": "título do vídeo",
  "theme": "tema curto",
  "scenes": [
    {"id":"scene-1","type":"avatar_intro","title":"2-4 palavras","subtitle":"subtítulo curto","narration":"..."},
    {"id":"scene-2","type":"scenario_card","title":"Imagine","subtitle":"uma situação curta...","narration":"..."},
    {"id":"scene-3","type":"concept_reveal","title":"...","bullets":["...","...","..."],"narration":"..."},
    {"id":"scene-4","type":"stat_highlight","stat":"73%","title":"rótulo","subtitle":"contexto","narration":"..."},
    {"id":"scene-5","type":"comparison_motion","title":"A x B","left":{"title":"...","items":["...","...","..."]},"right":{"title":"...","items":["...","...","..."]},"narration":"..."},
    {"id":"scene-6","type":"steps_flow","title":"...","items":["...","...","...","..."],"narration":"..."},
    {"id":"scene-7","type":"quote_spotlight","quote":"frase memorável","subtitle":"Mentora Vertho","narration":"..."},
    {"id":"scene-8","type":"icon_story","title":"...","items":["...","...","..."],"narration":"..."},
    "... mais cenas conforme o conteúdo ...",
    {"id":"scene-N","type":"avatar_outro","title":"...","subtitle":"pergunta prática","narration":"..."}
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

ORIENTAÇÃO DE VÍDEO (do módulo):
${ap.video_roteiro || '—'}

Gere o roteiro completo (avatar_intro + miolo VARIADO dimensionado pelo conteúdo + avatar_outro), com 3 a 5 min de narração. Responda só o JSON.`;

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
 * Normaliza a estrutura flexível: garante avatar_intro como PRIMEIRA cena e
 * avatar_outro como ÚLTIMA, com o miolo (cenas de conteúdo) preservado na ordem
 * da IA. Avatares extras no meio são descartados (avatar só nas pontas). Quebra
 * repetições adjacentes do mesmo template (reordena levemente). Re-IDs scene-1..N.
 */
export function normalizarRoteiro(roteiro: VideoRoteiro): VideoRoteiro {
  const scenes = Array.isArray(roteiro.scenes) ? roteiro.scenes : [];
  const intro = scenes.find((s) => s.type === 'avatar_intro');
  const outro = [...scenes].reverse().find((s) => s.type === 'avatar_outro');
  const miolo = scenes.filter((s) => MIOLO_TIPOS.includes(s.type));

  // Desfaz repetições adjacentes do MESMO template: empurra um vizinho diferente.
  for (let i = 1; i < miolo.length; i++) {
    if (miolo[i].type === miolo[i - 1].type) {
      const j = miolo.findIndex((s, k) => k > i && s.type !== miolo[i - 1].type);
      if (j > i) { const [mv] = miolo.splice(j, 1); miolo.splice(i, 0, mv); }
    }
  }

  const ordenadas: RoteiroScene[] = [
    ...(intro ? [intro] : []),
    ...miolo,
    ...(outro ? [outro] : []),
  ];

  roteiro.scenes = (ordenadas.length ? ordenadas : scenes).map((s, i) => ({ ...s, id: `scene-${i + 1}` }));
  return roteiro;
}
