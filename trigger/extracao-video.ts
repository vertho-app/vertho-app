import { task } from '@trigger.dev/sdk';
import youtubedl from 'youtube-dl-exec';
import { readFile, rm } from 'node:fs/promises';

// Acesso ao Supabase via REST (PostgREST) com service-role — evita o
// @supabase/supabase-js, cujo cliente Realtime (WebSocket) quebra no runtime
// Node do trigger.dev. Service role ignora RLS.
const SUPA = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const REST_HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

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
 * Task de extração de conteúdo-base de vídeo (substitui o worker Cloud Run).
 *
 * yt-dlp (via youtube-dl-exec) resolve o vídeo de ~1800 plataformas (Vimeo, TED,
 * LMS, YouTube), ffmpeg extrai um áudio leve, o Gemini transcreve + estrutura o
 * texto-base, e gravamos no micro_conteudos (status done/error).
 *
 * Env (no projeto trigger.dev): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * GEMINI_API_KEY, GEMINI_VIDEO_MODEL (opcional).
 */

const MODEL = process.env.GEMINI_VIDEO_MODEL || 'gemini-3.5-flash';
const IDIOMA: Record<string, string> = {
  'pt-BR': 'português do Brasil', 'pt-PT': 'português de Portugal',
  'es-ES': 'espanhol', 'en-US': 'inglês',
};

function systemPrompt(idioma: string): string {
  return `Você é um designer instrucional da Vertho. Recebe o ÁUDIO de um vídeo e extrai um TEXTO-BASE (matéria-prima de micro-conteúdos), NÃO a transcrição literal. Seja fiel — não invente.

IDIOMA DA SAÍDA: escreva tudo em ${idioma}, independentemente do idioma do áudio (traduza/adapte).

Responda APENAS JSON válido:
{
  "titulo": "título curto do tema",
  "resumo": "2-3 frases",
  "texto_base": "markdown: ## Ideia central; ## Conceitos-chave; ## Exemplos e aplicações; ## Para refletir (2-3 perguntas). 400-900 palavras.",
  "duracao_min": número de minutos aproximado ou null
}`;
}

export const extrairVideoTask = task({
  id: 'extrair-video',
  maxDuration: 900,
  retry: { maxAttempts: 2 },
  run: async (payload: { microConteudoId: string }) => {
    const id = payload.microConteudoId;
    if (!SUPA || !KEY) throw new Error('SUPABASE_URL/SERVICE_ROLE_KEY ausentes no ambiente da task');

    const fail = async (msg: string): Promise<never> => {
      await rPatch('micro_conteudos', `id=eq.${id}`, {
        extracao_status: 'error', extracao_error: String(msg).slice(0, 500), extracao_em: new Date().toISOString(),
      }).catch(() => {});
      throw new Error(msg);
    };

    const mc = await rGetOne('micro_conteudos', `id=eq.${id}&select=id,empresa_id,url`);
    if (!mc?.url) return fail('micro_conteudo ou URL não encontrado');

    let locale = 'pt-BR';
    if (mc.empresa_id) {
      const emp = await rGetOne('empresas', `id=eq.${mc.empresa_id}&select=default_locale`);
      if (emp?.default_locale) locale = emp.default_locale;
    }
    const idioma = IDIOMA[locale] || IDIOMA['pt-BR'];

    // 1) yt-dlp → áudio leve (mono 16kHz 48kbps).
    const out = `/tmp/audio-${id}.mp3`;
    try {
      await youtubedl(mc.url, {
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

    // 3) Salva e marca done.
    await rPatch('micro_conteudos', `id=eq.${id}`, {
      titulo: String(parsed.titulo || 'Vídeo da empresa').slice(0, 200),
      descricao: parsed.resumo ? String(parsed.resumo).slice(0, 500) : null,
      conteudo_inline: String(parsed.texto_base),
      duracao_min: Number.isFinite(Number(parsed.duracao_min)) ? Number(parsed.duracao_min) : null,
      extracao_status: 'done', extracao_error: null, extracao_em: new Date().toISOString(),
      ativo: true,
    });

    await rm(out, { force: true }).catch(() => {});
    return { ok: true, id };
  },
});
