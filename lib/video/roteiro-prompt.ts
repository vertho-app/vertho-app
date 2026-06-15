/**
 * Prompt + tipos do roteiro de vídeo (PURO — sem callAI/Next, testável em node).
 * Estrutura FLEXÍVEL: avatar_intro + N cenas de conteúdo (miolo variável) +
 * avatar_outro. A IA calibra a quantidade pela densidade do módulo (alvo 3–5 min)
 * e adapta tom/exemplos à célula (cargo × PPP × DISC dominante × transição de nível).
 *
 * Compatibilidade do renderer: a NARRAÇÃO fica em `narration` (fonte canônica de
 * TTS e legendas); os campos visuais ficam no nível da cena (flat, não aninhados);
 * `key_idea`/`source_anchor` são metadados de planejamento/rastreabilidade —
 * ignorados pelo render. Não há `motion_intent`/`audio_mode`/`target_duration_sec`:
 * a animação é fixa por componente, o modo de áudio decorre do `type`, e a duração
 * real vem do ffprobe do áudio TTS.
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
  narration: string;        // fonte canônica de TTS E legendas (fala oral)
  key_idea?: string;        // metadado: a ideia central da cena (1 frase) — força ideia nova/cena
  source_anchor?: string;   // metadado: de onde no módulo a ideia veio (rastreabilidade/fidelidade)
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
  // Personalização por célula (módulo × empresa × cargo × DISC dominante).
  cargoBloco?: string | null;                  // formatBlocoCargo() — contexto do cargo
  pppBrief?: string | null;                    // resumo do PPP da escola/empresa
  discDominante?: 'D' | 'I' | 'S' | 'C' | null; // perfil comportamental dominante
}

const IDIOMA: Record<string, string> = {
  'pt-BR': 'português do Brasil', 'pt-PT': 'português de Portugal', 'es-ES': 'espanhol', 'en-US': 'inglês',
};

// Como cada perfil DISC dominante molda TOM, ESTILO e ÊNFASE de layouts.
const DISC_GUIA: Record<string, { rotulo: string; tom: string; estilo: string; layouts: string }> = {
  D: { rotulo: 'Dominante (D)', tom: 'Direto e decisivo; foco em resultado, ação e impacto.', estilo: 'Frases curtas; comece pelo "o que muda na prática"; sem rodeios.', layouts: 'comparison_motion, steps_flow e stat_highlight (quando houver dado real).' },
  I: { rotulo: 'Influente (I)', tom: 'Caloroso, inspirador, humano e mobilizador.', estilo: 'Exemplos relacionais, situações com pessoas, entusiasmo e engajamento.', layouts: 'scenario_card, quote_spotlight e icon_story.' },
  S: { rotulo: 'Estável (S)', tom: 'Acolhedor, seguro, gradual, sem pressão.', estilo: 'Passo a passo; reforce segurança e que dá pra começar pequeno.', layouts: 'steps_flow, icon_story e concept_reveal.' },
  C: { rotulo: 'Conforme (C)', tom: 'Preciso, estruturado, lógico e criterioso.', estilo: 'Critérios, evidências, organização e clareza; explique o "porquê".', layouts: 'concept_reveal, steps_flow e stat_highlight (quando houver dado real).' },
};

// Foco da transição de maturidade indicada no módulo.
function maturidadeGuia(ne?: string | null, nd?: string | null): string {
  const t = `${(ne || 'N1').toUpperCase()}→${(nd || 'N2').toUpperCase()}`;
  const map: Record<string, string> = {
    'N1→N2': 'Foco em compreensão prática, autonomia supervisionada e aplicação inicial.',
    'N2→N3': 'Foco em consistência, critério, adaptação e tomada de decisão.',
    'N3→N4': 'Foco em influência, multiplicação, visão sistêmica e melhoria contínua.',
  };
  return `${t}: ${map[t] || map['N1→N2']} Não fique avançado demais para transições iniciais, nem superficial demais para avançadas.`;
}

// Tipos de cena do MIOLO (animadas, sem avatar). Repetíveis, mas não adjacentes.
const MIOLO_TIPOS: RoteiroScene['type'][] = [
  'concept_reveal', 'comparison_motion', 'icon_story', 'stat_highlight', 'quote_spotlight', 'steps_flow', 'scenario_card',
];

export function buildRoteiroPrompt(m: ModuloParaRoteiro): { system: string; user: string } {
  const idioma = IDIOMA[m.locale || 'pt-BR'] || IDIOMA['pt-BR'];
  const cc = m.conteudo_central || {};
  const ca = m.conteudo_aplicavel || {};
  const disc = m.discDominante ? DISC_GUIA[m.discDominante] : null;
  // NOTA: `adaptacao_por_formato.video_roteiro` NÃO é injetado (formato legado:
  // 8-12min com filmagem/câmeras). O system já define toda a orientação de vídeo.

  const persoSystem = (disc || m.cargoBloco || m.pppBrief) ? `

PERSONALIZAÇÃO POR CÉLULA (adapte exemplos, situações, tom e ênfase SEM mudar o conteúdo pedagógico do módulo nem a fidelidade):${disc ? `
- PERFIL DOMINANTE: ${disc.rotulo}.
  - TOM: ${disc.tom}
  - ESTILO: ${disc.estilo}
  - ÊNFASE de layouts: ${disc.layouts} (sem repetir template adjacente).` : ''}${m.cargoBloco ? `
- CARGO: ancore TODOS os exemplos no dia a dia real do cargo (contexto abaixo). Inclua pelo menos uma situação típica, um erro/risco comum e uma boa prática DESTE cargo; a pergunta final deve ser aplicável à rotina dele. Nada genérico.` : ''}${m.pppBrief ? `
- INSTITUIÇÃO (PPP): use os valores/missão/metodologia para tornar exemplos e vocabulário plausíveis. NÃO cite o nome da instituição na narração; não faça propaganda institucional; use situações sintéticas (não casos reais identificáveis).` : ''}` : '';

  const system = `Você é roteirista de micro-aprendizagem, designer instrucional e diretor audiovisual da Vertho. Transforma um MÓDULO-BASE pedagógico num ROTEIRO TÉCNICO DE VÍDEO pronto para o pipeline: roteiro → TTS → HeyGen (cenas de avatar) → Remotion (cenas animadas) → legendas.

IDIOMA: escreva TUDO em ${idioma}.

FORMATO:
- Cena inicial com avatar (avatar_intro) + miolo de cenas animadas (voice-over) + cena final com avatar (avatar_outro). Avatar SÓ na abertura e no encerramento.
- NÃO proponha filmagem real, câmera, banco de imagens nem imagens geradas por IA. Use apenas o que os templates Remotion suportam: tipografia em destaque, ícones, cards, colunas, fluxos e formas abstratas.

DURAÇÃO (calibre pela densidade do módulo; não encha com repetição):
- Total entre 180 e 300 segundos de narração.
- Miolo: 6–8 cenas (módulo enxuto) · 8–10 (médio) · 10–12 (denso). NUNCA mais de 12 cenas de miolo.
- avatar_intro: 18–24s. Cada cena de miolo: 18–26s. avatar_outro: 14–22s.

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

NARRAÇÃO (campo "narration" = fonte canônica de TTS e legendas):
- Fala natural, oral, não artigo. Frases curtas (≤20 palavras). Sem jargão, markdown, emoji nem indicação de cena/câmera/edição.
- Voz da "Mentora Vertho": feminina, clara, segura, acolhedora e objetiva.

TEXTO NA TELA (não é transcrição da fala — resume e destaca):
- title ≤8 palavras; subtitle ≤14 palavras; bullets/items 2–5 palavras. Sem parágrafos na tela. Legível em 16:9.

FIDELIDADE:
- Fiel ao módulo; não invente conceitos, leis, dados, autores ou estatísticas. Não cite o descritor no gancho. Não vire motivacional genérico. Não omita a ideia principal. Preserve a transição de maturidade.
- TRANSIÇÃO DE MATURIDADE — ${maturidadeGuia(m.nivel_entrada, m.nivel_destino)}

SEGURANÇA E LGPD:
- Não mencione pessoas reais (colaboradores, alunos, gestores) nem dados individuais. Não exponha informação sensível. Não faça diagnóstico psicológico. Não estereotipe perfis DISC ("é assim", "sempre age assim"). Use situações sintéticas e plausíveis.${persoSystem}

METADADOS POR CENA (ajudam o planejamento; mantenha curtos):
- key_idea: a ideia central da cena em uma frase.
- source_anchor: de qual parte do módulo a ideia veio (ex.: "PRINCÍPIOS", "ERROS COMUNS", "SITUAÇÕES TÍPICAS").

ANTES DE RESPONDER, valide em silêncio: JSON válido; 1ª cena avatar_intro e última avatar_outro; nenhum template repetido em sequência; toda cena tem id, type, narration, key_idea, source_anchor e os campos visuais do seu template; textos da tela curtos; nada inventado; total de narração entre 180–300s; cada cena com ideia nova; cargo/PPP/DISC usados sem estereótipo.

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
    {"id":"scene-N","type":"avatar_outro","key_idea":"...","source_anchor":"BOAS PRÁTICAS / APLICAÇÃO","title":"...","subtitle":"pergunta prática","narration":"..."}
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
Gere o roteiro técnico completo (avatar_intro + miolo VARIADO dimensionado pelo conteúdo + avatar_outro), 180–300s de narração${disc ? `, no TOM do perfil ${disc.rotulo}` : ''}. Responda só o JSON.`;

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
 * avatar_outro como ÚLTIMA, com o miolo preservado na ordem da IA. Avatares extras
 * no meio são descartados (avatar só nas pontas). Quebra repetições adjacentes do
 * mesmo template. Re-IDs scene-1..N.
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
