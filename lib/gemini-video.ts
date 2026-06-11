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
  return `Você é um designer instrucional da Vertho. Recebe um VÍDEO e extrai dele um TEXTO-BASE que servirá de matéria-prima para criar micro-conteúdos de desenvolvimento profissional (texto, podcast, reflexão).

NÃO devolva a transcrição literal: destile o conteúdo em material pedagógico claro e reutilizável. Seja fiel ao vídeo — não invente o que não foi dito.

IDIOMA DA SAÍDA: escreva TODO o conteúdo (título, resumo, texto_base, pontos-chave) em ${idioma}, independentemente do idioma falado no vídeo (traduza/adapte quando necessário).

Responda APENAS com JSON válido (sem markdown, sem comentários) neste formato:
{
  "titulo": "título curto do tema do vídeo",
  "resumo": "2-3 frases do que o vídeo aborda",
  "texto_base": "markdown com: ## Ideia central; ## Conceitos-chave (bullets); ## Exemplos e aplicações; ## Para refletir (2-3 perguntas). 400-900 palavras, fiel ao vídeo.",
  "pontos_chave": ["3-6 pontos-chave curtos"],
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
      maxOutputTokens: 8192,
      temperature: 0.4,
      thinkingConfig: { thinkingBudget: 0 }, // sem thinking: todo o orçamento vai p/ o JSON (evita truncar)
    },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(290_000),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini vídeo ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  const cand = data?.candidates?.[0];
  const txt = cand?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('') || '';
  if (!txt) throw new Error('Gemini não retornou conteúdo (vídeo pode estar privado/indisponível).');

  const clean = txt.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  let parsed: any;
  try {
    parsed = JSON.parse(clean);
  } catch {
    // Tolerante: extrai o maior objeto {...} caso venha texto em volta.
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch { /* segue */ } }
  }
  if (!parsed) {
    const truncado = cand?.finishReason === 'MAX_TOKENS';
    throw new Error(truncado
      ? 'O vídeo é muito longo e a resposta foi cortada. Tente um vídeo mais curto.'
      : 'Resposta do modelo não veio em JSON válido. Tente novamente.');
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
