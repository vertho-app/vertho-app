import { task } from '@trigger.dev/sdk';
import youtubedl from 'youtube-dl-exec';
import { readFile, rm } from 'node:fs/promises';

// O binário do yt-dlp é instalado na imagem pelo build (trigger.config.ts);
// apontamos o youtube-dl-exec pra ele em vez do binário do npm (que não é
// baixado no build → ENOENT). Em dev local cai no binário do pacote.
const ytdlp = process.env.YT_DLP_PATH
  ? youtubedl.create(process.env.YT_DLP_PATH)
  : youtubedl;

// Acesso ao Supabase via REST (PostgREST) com service-role — evita o
// @supabase/supabase-js, cujo cliente Realtime (WebSocket) quebra no runtime
// Node do trigger.dev. Service role ignora RLS.
const SUPA = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const REST_HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

// URL do app para o callback que estrutura o módulo-base (IA-autora + catálogo
// só existem no runtime do app). Default app.vertho.ai; override por env.
const APP_URL = process.env.APP_CALLBACK_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://app.vertho.ai';

async function rGetOne(table: string, query: string): Promise<any | null> {
  const r = await fetch(`${SUPA}/rest/v1/${table}?${query}`, { headers: REST_HEADERS });
  if (!r.ok) throw new Error(`Supabase GET ${table} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  return Array.isArray(d) ? d[0] || null : null;
}
async function rPatch(table: string, query: string, body: any): Promise<void> {
  const r = await fetch(`${SUPA}/rest/v1/${table}?${query}`, {
    method: 'PATCH', headers: { ...REST_HEADERS, Prefer: 'return=minimal' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase PATCH ${table} ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

/**
 * Worker de extração de conteúdo-base de vídeo (substitui o Cloud Run).
 *
 * yt-dlp resolve o vídeo de ~1800 plataformas (Vimeo, TED, LMS, YouTube), ffmpeg
 * extrai um áudio leve, o Gemini destila o TEXTO-BASE, e o callback /api/internal/
 * modulo-from-video estrutura o Módulo-Base rascunho (matéria-prima canônica).
 * O rastreamento fica em extracoes_video (status processing/done/error).
 *
 * Env (no projeto trigger.dev): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * GEMINI_API_KEY, GEMINI_VIDEO_MODEL (opcional), APP_CALLBACK_URL (opcional).
 */

const MODEL = process.env.GEMINI_VIDEO_MODEL || 'gemini-3.5-flash';
const IDIOMA: Record<string, string> = {
  'pt-BR': 'português do Brasil', 'pt-PT': 'português de Portugal',
  'es-ES': 'espanhol', 'en-US': 'inglês',
};

function systemPrompt(idioma: string): string {
  return `Você é um designer instrucional da Vertho. Recebe o ÁUDIO de um vídeo e extrai um TEXTO-BASE (matéria-prima pedagógica), NÃO a transcrição literal. Seja fiel — não invente.

IDIOMA DA SAÍDA: escreva tudo em ${idioma}, independentemente do idioma do áudio (traduza/adapte).

Responda APENAS JSON válido:
{
  "titulo": "título curto do tema",
  "texto_base": "markdown rico: ## Ideia central; ## Conceitos-chave; ## Princípios; ## Exemplos e aplicações; ## Erros comuns; ## Boas práticas; ## Para refletir. 600-1200 palavras, fiel ao áudio."
}`;
}

export const extrairVideoTask = task({
  id: 'extrair-video',
  maxDuration: 900,
  retry: { maxAttempts: 2 },
  run: async (payload: { extracaoId: string }) => {
    const id = payload.extracaoId;
    if (!SUPA || !KEY) throw new Error('SUPABASE_URL/SERVICE_ROLE_KEY ausentes no ambiente da task');

    const fail = async (msg: string): Promise<never> => {
      await rPatch('extracoes_video', `id=eq.${id}`, {
        status: 'error', error: String(msg).slice(0, 500), updated_at: new Date().toISOString(),
      }).catch(() => {});
      throw new Error(msg);
    };

    const ext = await rGetOne('extracoes_video', `id=eq.${id}&select=id,origem_empresa_id,url`);
    if (!ext?.url) return fail('extração ou URL não encontrada');

    let locale = 'pt-BR';
    if (ext.origem_empresa_id) {
      const emp = await rGetOne('empresas', `id=eq.${ext.origem_empresa_id}&select=default_locale`);
      if (emp?.default_locale) locale = emp.default_locale;
    }
    const idioma = IDIOMA[locale] || IDIOMA['pt-BR'];

    // 1) yt-dlp → áudio leve (mono 16kHz 48kbps).
    const out = `/tmp/audio-${id}.mp3`;
    try {
      await ytdlp(ext.url, {
        extractAudio: true, audioFormat: 'mp3',
        output: `/tmp/audio-${id}.%(ext)s`,
        noPlaylist: true, noWarnings: true,
        postprocessorArgs: 'ffmpeg:-ar 16000 -ac 1 -b:a 48k',
      } as any);
    } catch (e: any) {
      const detail = [
        e?.shortMessage, e?.stderr, e?.stdout, e?.message,
        e?.exitCode != null ? `exit ${e.exitCode}` : '', e?.code,
      ].filter(Boolean).join(' | ');
      return fail('yt-dlp: ' + (String(detail || e).slice(0, 450) || 'erro sem detalhe'));
    }

    let buf: Buffer;
    try { buf = await readFile(out); } catch { return fail('áudio não gerado'); }
    if (buf.length > 19 * 1024 * 1024) return fail('Áudio > 19MB (vídeo longo demais para esta versão).');

    // 2) Gemini → texto-base.
    const body = {
      systemInstruction: { parts: [{ text: systemPrompt(idioma) }] },
      contents: [{ role: 'user', parts: [
        { inlineData: { mimeType: 'audio/mp3', data: buf.toString('base64') } },
        { text: 'Extraia o texto-base deste áudio.' },
      ] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8192, temperature: 0.4, thinkingConfig: { thinkingBudget: 0 } },
    };
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!r.ok) return fail('Gemini ' + r.status + ': ' + (await r.text()).slice(0, 300));
    const d: any = await r.json();
    const txt = d?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join('') || '';
    let parsed: any;
    try { parsed = JSON.parse(txt.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()); }
    catch { const m = txt.match(/\{[\s\S]*\}/); if (m) { try { parsed = JSON.parse(m[0]); } catch { /* */ } } }
    if (!parsed?.texto_base) return fail('Gemini não retornou JSON com texto_base');

    await rm(out, { force: true }).catch(() => {});

    // 3) Callback do app: estrutura o Módulo-Base rascunho (IA-autora + catálogo).
    const cb = await fetch(`${APP_URL}/api/internal/modulo-from-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': KEY },
      body: JSON.stringify({
        extracaoId: id,
        textoBase: String(parsed.texto_base),
        titulo: parsed.titulo ? String(parsed.titulo).slice(0, 200) : null,
        locale,
      }),
    });
    if (!cb.ok) {
      const msg = await cb.text().catch(() => '');
      return fail(`callback módulo ${cb.status}: ${msg.slice(0, 300)}`);
    }
    const res: any = await cb.json().catch(() => ({}));
    return { ok: true, extracaoId: id, moduloId: res?.moduloId };
  },
});
