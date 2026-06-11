/**
 * Worker (Cloud Run Job) — extração de conteúdo-base de vídeo.
 *
 * Lê MICRO_CONTEUDO_ID, busca a URL do vídeo, usa yt-dlp + ffmpeg para extrair
 * um áudio leve, manda ao Gemini (transcreve + estrutura) e grava o texto-base
 * de volta no micro_conteudos. Marca extracao_status = done | error.
 *
 * Env: MICRO_CONTEUDO_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *      GEMINI_API_KEY, GEMINI_VIDEO_MODEL (opcional).
 */
import { createClient } from '@supabase/supabase-js';
import { execFile } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const ID = process.env.MICRO_CONTEUDO_ID;
const MODEL = process.env.GEMINI_VIDEO_MODEL || 'gemini-3.5-flash';
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const AUDIO = '/tmp/audio.mp3';
const MAX_AUDIO = 19 * 1024 * 1024;

const IDIOMA = {
  'pt-BR': 'português do Brasil', 'pt-PT': 'português de Portugal',
  'es-ES': 'espanhol', 'en-US': 'inglês',
};

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function fail(msg) {
  console.error('[extracao] ERRO:', msg);
  if (ID) {
    await sb.from('micro_conteudos').update({
      extracao_status: 'error', extracao_error: String(msg).slice(0, 500), extracao_em: new Date().toISOString(),
    }).eq('id', ID).catch(() => {});
  }
  process.exit(1);
}

function systemPrompt(idioma) {
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

(async () => {
  if (!ID) return fail('MICRO_CONTEUDO_ID ausente');
  if (!GEMINI_KEY) return fail('GEMINI_API_KEY ausente');

  const { data: mc } = await sb.from('micro_conteudos')
    .select('id, empresa_id, url').eq('id', ID).maybeSingle();
  if (!mc?.url) return fail('micro_conteudo ou URL não encontrado');

  let locale = 'pt-BR';
  if (mc.empresa_id) {
    const { data: emp } = await sb.from('empresas').select('default_locale').eq('id', mc.empresa_id).maybeSingle();
    if (emp?.default_locale) locale = emp.default_locale;
  }
  const idioma = IDIOMA[locale] || IDIOMA['pt-BR'];

  // 1) yt-dlp → áudio leve (mono 16kHz 48kbps), sem playlist.
  try {
    await exec('yt-dlp', [
      '-x', '--audio-format', 'mp3',
      '--postprocessor-args', '-ar 16000 -ac 1 -b:a 48k',
      '--no-playlist', '--no-warnings',
      '-o', '/tmp/audio.%(ext)s', mc.url,
    ], { timeout: 600_000, maxBuffer: 1 << 26 });
  } catch (e) {
    return fail('yt-dlp: ' + String(e.stderr || e.message).slice(0, 300));
  }

  let buf;
  try { buf = await readFile(AUDIO); } catch { return fail('áudio não gerado'); }
  if (buf.length > MAX_AUDIO) return fail('Áudio > 19MB (vídeo longo demais para esta versão).');

  // 2) Gemini → texto-base.
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt(idioma) }] },
    contents: [{ role: 'user', parts: [
      { inlineData: { mimeType: 'audio/mp3', data: buf.toString('base64') } },
      { text: 'Extraia o texto-base deste áudio.' },
    ] }],
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8192, temperature: 0.4, thinkingConfig: { thinkingBudget: 0 } },
  };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) return fail('Gemini ' + r.status + ': ' + (await r.text()).slice(0, 300));
  const d = await r.json();
  const txt = d?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') || '';
  let parsed;
  try { parsed = JSON.parse(txt.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()); }
  catch { const m = txt.match(/\{[\s\S]*\}/); if (m) { try { parsed = JSON.parse(m[0]); } catch {} } }
  if (!parsed?.texto_base) return fail('Gemini não retornou JSON com texto_base');

  // 3) Salva e marca done.
  await sb.from('micro_conteudos').update({
    titulo: String(parsed.titulo || 'Vídeo da empresa').slice(0, 200),
    descricao: parsed.resumo ? String(parsed.resumo).slice(0, 500) : null,
    conteudo_inline: String(parsed.texto_base),
    duracao_min: Number.isFinite(Number(parsed.duracao_min)) ? Number(parsed.duracao_min) : null,
    extracao_status: 'done', extracao_error: null, extracao_em: new Date().toISOString(),
    ativo: true,
  }).eq('id', ID);

  await rm(AUDIO, { force: true }).catch(() => {});
  console.log('[extracao] OK', ID);
  process.exit(0);
})().catch((e) => fail(e?.message || String(e)));
