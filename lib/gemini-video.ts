/**
 * Extração de conteúdo-base de um VÍDEO via Gemini multimodal.
 *
 * Camadas (automáticas):
 *  1. YouTube/Vimeo → Gemini ingere a URL nativamente (sem baixar).
 *  2. URL direta de mídia (.mp4 etc.) → baixa os bytes → Gemini inline.
 *  (Fase 3: upload/arquivo grande via Files API + worker.)
 *
 * Devolve um TEXTO-BASE estruturado (não a transcrição crua) pronto para
 * alimentar os geradores de micro-conteúdo, + sugestão de competência/descritor.
 *
 * Spec: docs/EXTRACAO-VIDEO-CONTEUDO.md
 */

const VIDEO_MODEL = process.env.GEMINI_VIDEO_MODEL || 'gemini-3.5-flash';
const MAX_INLINE_BYTES = 20 * 1024 * 1024; // 20MB: acima disso precisa de Files API (Fase 3)

export interface VideoBaseExtraido {
  titulo: string;
  resumo: string;
  texto_base: string;            // markdown, matéria-prima dos complementos
  pontos_chave: string[];
  competencia_sugerida: string | null;
  descritor_sugerido: string | null;
  duracao_min: number | null;
}

function isYouTube(url: string): boolean {
  return /(?:youtube\.com|youtu\.be)/i.test(url);
}
function isVimeo(url: string): boolean {
  return /vimeo\.com/i.test(url);
}

function guessMime(url: string, contentType?: string | null): string {
  if (contentType && contentType.startsWith('video/')) return contentType;
  if (/\.mp4(\?|$)/i.test(url)) return 'video/mp4';
  if (/\.webm(\?|$)/i.test(url)) return 'video/webm';
  if (/\.mov(\?|$)/i.test(url)) return 'video/quicktime';
  if (/\.m4a(\?|$)/i.test(url)) return 'audio/mp4';
  if (/\.mp3(\?|$)/i.test(url)) return 'audio/mpeg';
  return 'video/mp4';
}

/** Monta a "part" de mídia do Gemini conforme a fonte. Lança em fonte não suportada. */
async function buildMediaPart(url: string): Promise<any> {
  // YouTube: o Gemini aceita a URL diretamente como fileData (nativo).
  if (isYouTube(url)) {
    return { fileData: { fileUri: url } };
  }
  // Páginas de plataformas (TED, Vimeo, LMS...) são HTML, não arquivo de vídeo.
  const pareceArquivoDireto = /\.(mp4|webm|mov|m4a|mp3)(\?|$)/i.test(url);
  // URL direta de mídia: baixa os bytes e manda inline (cap de tamanho).
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Não foi possível acessar a URL (${res.status}).`);
  const ct = res.headers.get('content-type') || '';
  const ehMidia = /^(video|audio)\//i.test(ct) || pareceArquivoDireto;
  if (!ehMidia) {
    throw new Error(
      isVimeo(url)
        ? 'Links do Vimeo (página) não são suportados diretamente. Use o link do YouTube do vídeo ou a URL direta do arquivo (.mp4).'
        : 'Essa URL é uma página web, não um arquivo de vídeo. Use um link do YouTube ou a URL direta de um arquivo de vídeo (.mp4).'
    );
  }
  const len = Number(res.headers.get('content-length') || 0);
  if (len && len > MAX_INLINE_BYTES) {
    throw new Error('Vídeo muito grande para processar agora. Use um link do YouTube ou um arquivo menor.');
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_INLINE_BYTES) {
    throw new Error('Vídeo muito grande para processar agora. Use um link do YouTube ou um arquivo menor.');
  }
  return { inlineData: { mimeType: guessMime(url, ct), data: buf.toString('base64') } };
}

const IDIOMA: Record<string, string> = {
  'pt-BR': 'português do Brasil',
  'pt-PT': 'português de Portugal',
  'es-ES': 'espanhol',
  'en-US': 'inglês',
};

function buildSystem(idioma: string): string {
  return `Você é um analista de conteúdo instrucional da Vertho. Recebe um VÍDEO e EXTRAI dele um TEXTO-BASE DENSO E COMPLETO — a matéria-prima de micro-conteúdos (texto, podcast, vídeo) e de Módulos-Base. RIQUEZA e FIDELIDADE são a prioridade: este texto-base NÃO pode perder o conteúdo do vídeo.

REGRA CENTRAL — NÃO RESUMA, EXTRAIA. Capture TODO o conteúdo com valor pedagógico, na ORDEM em que aparece no vídeo. Preserve: definições, distinções, argumentos e seu encadeamento, exemplos concretos e casos, dados/números, passos de processos, nuances, ressalvas e contra-exemplos ditos. É MELHOR um texto-base longo e fiel do que um curto e enxuto — não economize. Corte apenas ruído (saudações, vinhetas, repetições vazias, "deixa o like").

DENSIDADE proporcional à duração — deixe o vídeo determinar o tamanho, SEM teto artificial:
- vídeo de ~5 min → ~600–1.000 palavras
- ~15 min → ~1.500–2.500 palavras
- ~25 min → ~2.500–4.000 palavras
- ~45 min+ → o máximo que couber, fiel e denso

ESTRUTURA do texto_base (markdown), seguindo a progressão do vídeo:
- ## Ideia central — a tese/proposta do vídeo (1 parágrafo denso).
- ## Desenvolvimento — uma subseção (### subtítulo) para CADA tópico/bloco do vídeo, na ordem. Em cada uma: o conceito + a explicação detalhada + os exemplos/casos/dados ditos ali. Quantas subseções o vídeo tiver.
- ## Exemplos e aplicações — todos os exemplos concretos e aplicações práticas mencionados.
- ## Pontos de atenção — ressalvas, erros comuns e contrapontos ditos no vídeo.
- ## Para refletir — 4–6 perguntas.

IDIOMA DA SAÍDA: escreva TODO o conteúdo (título, resumo, texto_base, pontos-chave) em ${idioma}, independentemente do idioma falado no vídeo (traduza/adapte quando necessário).

Responda APENAS com JSON válido (sem markdown em volta, sem comentários) neste formato:
{
  "titulo": "título curto do tema do vídeo",
  "resumo": "3-4 frases do que o vídeo aborda",
  "texto_base": "markdown DENSO conforme a estrutura acima — fiel, completo, proporcional à duração (NÃO resumido)",
  "pontos_chave": ["5-10 pontos-chave"],
  "competencia_sugerida": "competência comportamental/profissional que o vídeo mais desenvolve, ou null",
  "descritor_sugerido": "descritor/sub-tema específico, ou null",
  "duracao_min": número aproximado de minutos do vídeo ou null
}`;
}

/** Extrai o texto-base de um vídeo a partir da URL. */
export async function extrairConteudoDeVideo(
  url: string,
  opts: { competencias?: { competencia: string; descritores: string[] }[]; locale?: string } = {},
): Promise<VideoBaseExtraido> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada');
  if (!url?.trim()) throw new Error('URL do vídeo é obrigatória');

  const mediaPart = await buildMediaPart(url.trim());
  const idioma = IDIOMA[opts.locale || ''] || IDIOMA['pt-BR'];
  const cats = opts.competencias || [];
  const hint = cats.length
    ? `\n\nESCOLHA "competencia_sugerida" E "descritor_sugerido" EXATAMENTE de uma das opções abaixo (copie o texto idêntico ao listado; não invente). Escolha o par competência › descritor que melhor representa o vídeo:\n`
      + cats.map((c) => `• ${c.competencia}: ${c.descritores.length ? c.descritores.join(' | ') : '(sem descritores)'}`).join('\n')
    : '';

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${VIDEO_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    systemInstruction: { parts: [{ text: buildSystem(idioma) }] },
    contents: [{ role: 'user', parts: [mediaPart, { text: `Extraia o texto-base deste vídeo.${hint}` }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      // responseSchema (structured output nativo): o Gemini gera os campos como
      // objeto e serializa em JSON SEMPRE válido, escapando aspas/quebras do
      // texto_base markdown denso. Sem isto, conteúdo cheio de aspas (metáforas
      // entre aspas, citações) quebrava o JSON.parse de forma intermitente.
      responseSchema: {
        type: 'object',
        properties: {
          titulo: { type: 'string' },
          resumo: { type: 'string' },
          texto_base: { type: 'string' },
          pontos_chave: { type: 'array', items: { type: 'string' } },
          competencia_sugerida: { type: 'string' },
          descritor_sugerido: { type: 'string' },
          duracao_min: { type: 'integer' },
        },
        required: ['titulo', 'resumo', 'texto_base', 'pontos_chave'],
      },
      maxOutputTokens: 65536, // folga p/ texto-base DENSO + thinking (vídeo de 25-45min → milhares de palavras) sem truncar o JSON
      temperature: 0.4,
      thinkingConfig: { thinkingBudget: -1 }, // dynamic: deixa o modelo planejar a extração completa (a folga de tokens acima evita truncar)
    },
  };

  // Retry (até 3x): o texto_base é markdown DENSO dentro de JSON, e o Gemini às
  // vezes deixa aspas/quebras não escapadas → JSON.parse falha de forma
  // intermitente (a extração que "volta sem fazer nada"). Cada tentativa é uma
  // nova geração; ~1-2 bastam na prática. Erros HTTP 4xx (não-transitórios)
  // abortam na hora; 5xx e parse inválido re-tentam.
  let parsed: any = null;
  let ultimoMotivo = 'sem resposta';
  for (let tentativa = 1; tentativa <= 3 && !parsed; tentativa++) {
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(290_000),
      });
    } catch (e: any) {
      ultimoMotivo = `rede: ${String(e?.message || e).slice(0, 120)}`;
      continue;
    }
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      if (res.status < 500) throw new Error(`Gemini vídeo ${res.status}: ${detail}`);
      ultimoMotivo = `HTTP ${res.status}`;
      continue;
    }
    const data = await res.json();
    const cand = data?.candidates?.[0];
    const txt = cand?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('') || '';
    if (!txt) { ultimoMotivo = 'conteúdo vazio (vídeo privado/indisponível?)'; continue; }

    const clean = txt.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    try {
      parsed = JSON.parse(clean);
    } catch {
      // Tolerante: extrai o maior objeto {...} caso venha texto em volta.
      const m = clean.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* segue */ } }
    }
    if (!parsed) ultimoMotivo = cand?.finishReason === 'MAX_TOKENS' ? 'resposta truncada (MAX_TOKENS)' : 'JSON inválido';
  }
  if (!parsed) {
    throw new Error(`A extração não retornou um resultado válido após 3 tentativas (${ultimoMotivo}). Tente novamente.`);
  }
  return {
    titulo: String(parsed.titulo || 'Conteúdo de vídeo').trim(),
    resumo: String(parsed.resumo || '').trim(),
    texto_base: String(parsed.texto_base || '').trim(),
    pontos_chave: Array.isArray(parsed.pontos_chave) ? parsed.pontos_chave.map((x: any) => String(x)).filter(Boolean) : [],
    competencia_sugerida: parsed.competencia_sugerida ? String(parsed.competencia_sugerida).trim() : null,
    descritor_sugerido: parsed.descritor_sugerido ? String(parsed.descritor_sugerido).trim() : null,
    duracao_min: Number.isFinite(Number(parsed.duracao_min)) ? Number(parsed.duracao_min) : null,
  };
}
