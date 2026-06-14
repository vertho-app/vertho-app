/**
 * Prompt + tipos do roteiro de vídeo (PURO — sem callAI/Next, testável em node).
 * Mapeia um Módulo-Base nas 5 cenas fixas do spike Remotion.
 */
export interface RoteiroScene {
  id: string;
  type: 'avatar_intro' | 'concept_reveal' | 'comparison_motion' | 'icon_story' | 'avatar_outro';
  title?: string;
  subtitle?: string;
  bullets?: string[];
  items?: string[];
  left?: { title: string; items: string[] };
  right?: { title: string; items: string[] };
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

export function buildRoteiroPrompt(m: ModuloParaRoteiro): { system: string; user: string } {
  const idioma = IDIOMA[m.locale || 'pt-BR'] || IDIOMA['pt-BR'];
  const cc = m.conteudo_central || {};
  const ca = m.conteudo_aplicavel || {};
  const ap = m.adaptacao_por_formato || {};

  const system = `Você é roteirista de micro-aprendizagem da Vertho. Transforma um Módulo-Base (matéria-prima pedagógica) num ROTEIRO DE VÍDEO de ~90 segundos com EXATAMENTE 5 cenas em ordem fixa, cada uma num template visual específico.

IDIOMA: escreva TUDO (títulos, bullets, narração) em ${idioma}.

PRINCÍPIOS:
- A NARRAÇÃO é falada — linguagem oral, frases curtas (≤20 palavras), natural, pra ouvir. Sem markdown, sem emoji, sem indicação de cena.
- Os ELEMENTOS VISUAIS (title, bullets, items) são CURTOS (2-5 palavras) — aparecem na tela, não são frases.
- Fiel ao módulo; não invente leis/dados. Sem jargão. Densidade prática.
- O narrador é a "Mentora Vertho" (feminino, acolhedor, seguro).

DURAÇÃO POR CENA (narração, ~2,5 palavras/seg):
- avatar_intro: ~18-22s (gancho + o que vamos ver). NÃO cite o descritor no gancho.
- concept_reveal: ~20-24s (o conceito; "não é X, é Y"). bullets = 3 aspectos-chave.
- comparison_motion: ~20-24s (um contraste de 2 colunas). left = abordagem fraca/reativa; right = abordagem forte/desejada. 3 itens cada.
- icon_story: ~12-16s (3 sinais/passos/itens práticos). items = 3.
- avatar_outro: ~12-16s (pergunta prática / convite à aplicação).

Responda APENAS JSON válido:
{
  "title": "título do vídeo",
  "theme": "tema curto",
  "scenes": [
    {"id":"scene-1","type":"avatar_intro","title":"título 2-4 palavras","subtitle":"subtítulo curto","narration":"..."},
    {"id":"scene-2","type":"concept_reveal","title":"...","bullets":["...","...","..."],"narration":"..."},
    {"id":"scene-3","type":"comparison_motion","title":"A x B","left":{"title":"...","items":["...","...","..."]},"right":{"title":"...","items":["...","...","..."]},"narration":"..."},
    {"id":"scene-4","type":"icon_story","title":"...","items":["...","...","..."],"narration":"..."},
    {"id":"scene-5","type":"avatar_outro","title":"...","subtitle":"pergunta prática","narration":"..."}
  ]
}`;

  const user = `MÓDULO-BASE
- Competência: ${m.competenciaNome || '—'}${m.descritor ? ` › ${m.descritor}` : ''}
- Transição de nível: ${m.nivel_entrada || 'N1'} → ${m.nivel_destino || 'N2'}
- Título do módulo: ${m.titulo || '—'}

IDEIA PRINCIPAL:
${cc.ideia_principal || '—'}

PRINCÍPIOS:
${(Array.isArray(cc.principios) ? cc.principios : []).map((p: any) => `- ${p.nome}: ${p.explicacao}`).join('\n') || '—'}

EXEMPLOS / APLICAÇÃO:
${ca.exemplos_universais ? `- adequada: ${ca.exemplos_universais.aplicacao_adequada || '—'}\n- inadequada: ${ca.exemplos_universais.aplicacao_inadequada || '—'}` : '—'}

ERROS COMUNS:
${(Array.isArray(ca.erros_comuns) ? ca.erros_comuns : []).slice(0, 4).map((e: any) => `- ${e.erro}`).join('\n') || '—'}

BOAS PRÁTICAS:
${(Array.isArray(ca.boas_praticas) ? ca.boas_praticas : []).slice(0, 4).map((b: any) => `- ${b.o_que_fazer}`).join('\n') || '—'}

SITUAÇÕES TÍPICAS:
${(Array.isArray(ca.situacoes_tipicas) ? ca.situacoes_tipicas : []).slice(0, 4).map((s: any) => `- ${s.contexto}: ${s.desafio}`).join('\n') || '—'}

ORIENTAÇÃO DE VÍDEO (do módulo):
${ap.video_roteiro || '—'}

Gere o roteiro das 5 cenas. Responda só o JSON.`;

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

/** Normaliza para as 5 cenas fixas, na ordem certa. */
export function normalizarRoteiro(roteiro: VideoRoteiro): VideoRoteiro {
  const ordem: RoteiroScene['type'][] = ['avatar_intro', 'concept_reveal', 'comparison_motion', 'icon_story', 'avatar_outro'];
  roteiro.scenes = ordem
    .map((t, i) => {
      const s = roteiro.scenes.find((x) => x.type === t);
      return s ? { ...s, id: `scene-${i + 1}` } : null;
    })
    .filter(Boolean) as RoteiroScene[];
  return roteiro;
}
