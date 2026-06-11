import { task } from '@trigger.dev/sdk';
import { createClient } from '@supabase/supabase-js';
import youtubedl from 'youtube-dl-exec';
import { readFile, rm } from 'node:fs/promises';

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
    // Aceita SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_URL (nome sincronizado da Vercel).
    const supaUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const sb = createClient(supaUrl!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

    const fail = async (msg: string): Promise<never> => {
      await sb.from('micro_conteudos').update({
        extracao_status: 'error', extracao_error: String(msg).slice(0, 500), extracao_em: new Date().toISOString(),
      }).eq('id', id);
      throw new Error(msg);
    };

    const { data: mc } = await sb.from('micro_conteudos').select('id, empresa_id, url').eq('id', id).maybeSingle();
    if (!mc?.url) return fail('micro_conteudo ou URL não encontrado');

    let locale = 'pt-BR';
    if (mc.empresa_id) {
      const { data: emp } = await sb.from('empresas').select('default_locale').eq('id', mc.empresa_id).maybeSingle();
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
      return fail('yt-dlp: ' + String(e?.stderr || e?.message || e).slice(0, 300));
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
    await sb.from('micro_conteudos').update({
      titulo: String(parsed.titulo || 'Vídeo da empresa').slice(0, 200),
      descricao: parsed.resumo ? String(parsed.resumo).slice(0, 500) : null,
      conteudo_inline: String(parsed.texto_base),
      duracao_min: Number.isFinite(Number(parsed.duracao_min)) ? Number(parsed.duracao_min) : null,
      extracao_status: 'done', extracao_error: null, extracao_em: new Date().toISOString(),
      ativo: true,
    }).eq('id', id);

    await rm(out, { force: true }).catch(() => {});
    return { ok: true, id };
  },
});
