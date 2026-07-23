import { task } from '@trigger.dev/sdk';
import youtubedl from 'youtube-dl-exec';
import { readFile, rm, mkdir, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

// O binário do yt-dlp é instalado na imagem pelo build (trigger.config.ts);
// apontamos o youtube-dl-exec pra ele em vez do binário do npm (que não é
// baixado no build → ENOENT). Em dev local cai no binário do pacote.
const ytdlp = process.env.YT_DLP_PATH
  ? youtubedl.create(process.env.YT_DLP_PATH)
  : youtubedl;
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

// Acesso ao Supabase via REST (PostgREST) com service-role — evita o
// @supabase/supabase-js, cujo cliente Realtime (WebSocket) quebra no runtime
// Node do trigger.dev. Service role ignora RLS.
const SUPA = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const REST_HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const CHUNK_SECONDS = 900; // blocos de 15 min
const MAX_CHUNKS = 20;     // teto ~5h por vídeo

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

const MODEL = process.env.GEMINI_VIDEO_MODEL || 'gemini-3.5-flash';
const IDIOMA: Record<string, string> = {
  'pt-BR': 'português do Brasil', 'pt-PT': 'português de Portugal',
  'es-ES': 'espanhol', 'en-US': 'inglês',
};

/** Transcreve UM bloco de áudio (≤15 min) fielmente, no idioma de saída. */
async function transcreverBloco(buf: Buffer, idioma: string, n: number): Promise<string> {
  const system = `Você transcreve o ÁUDIO de um trecho de vídeo em texto fiel e legível (corrija só hesitações/ruído; NÃO invente, NÃO resuma). IDIOMA DA SAÍDA: ${idioma} (traduza se o áudio estiver em outra língua). Responda só o texto transcrito, sem comentários.`;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [
      { inlineData: { mimeType: 'audio/mp3', data: buf.toString('base64') } },
      { text: `Transcreva fielmente este trecho (${n}).` },
    ] }],
    generationConfig: { maxOutputTokens: 8192, temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
  };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('Gemini ' + r.status + ': ' + (await r.text()).slice(0, 200));
  const d: any = await r.json();
  return d?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join('') || '';
}

export const extrairVideoTask = task({
  id: 'extrair-video',
  maxDuration: 3600, // 1h — transcrição em blocos + segmentação/estruturação in-task
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
        socketTimeout: 60,   // hosts lentos (archive.org/LMS) estouravam o default de 20s
        retries: 5,          // retries internos do yt-dlp p/ blips de rede
        postprocessorArgs: 'ffmpeg:-ar 16000 -ac 1 -b:a 48k',
      } as any);
    } catch (e: any) {
      const detail = [e?.shortMessage, e?.stderr, e?.stdout, e?.message, e?.exitCode != null ? `exit ${e.exitCode}` : '', e?.code].filter(Boolean).join(' | ');
      return fail('yt-dlp: ' + (String(detail || e).slice(0, 450) || 'erro sem detalhe'));
    }

    // 2) ffmpeg: fatia em blocos de 15 min (vídeo curto = 1 bloco). Remove o teto
    //    de duração (cada bloco ~5MB cabe inline no Gemini).
    const dir = `/tmp/seg-${id}`;
    await mkdir(dir, { recursive: true }).catch(() => {});
    let blocos: string[] = [];
    try {
      await exec(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', out,
        '-f', 'segment', '-segment_time', String(CHUNK_SECONDS), '-c', 'copy', `${dir}/chunk-%03d.mp3`]);
      blocos = (await readdir(dir)).filter((f) => f.endsWith('.mp3')).sort().map((f) => `${dir}/${f}`);
    } catch { /* fallback abaixo */ }
    if (!blocos.length) blocos = [out]; // sem segmentação → trata o áudio inteiro
    const truncado = blocos.length > MAX_CHUNKS;
    blocos = blocos.slice(0, MAX_CHUNKS);

    // 3) Transcreve cada bloco (sequencial) e concatena.
    const partes: string[] = [];
    for (let i = 0; i < blocos.length; i++) {
      let b: Buffer;
      try { b = await readFile(blocos[i]); } catch { continue; }
      if (b.length > 19 * 1024 * 1024) { partes.push(`\n\n### Trecho ${i + 1}\n\n[bloco grande demais — pulado]`); continue; }
      try {
        const t = await transcreverBloco(b, idioma, i + 1);
        if (t.trim()) partes.push(`### Trecho ${i + 1}\n\n${t.trim()}`);
      } catch (e: any) {
        return fail('transcrição bloco ' + (i + 1) + ': ' + String(e?.message || e).slice(0, 300));
      }
    }
    await rm(out, { force: true }).catch(() => {});
    await rm(dir, { recursive: true, force: true }).catch(() => {});

    const transcricao = partes.join('\n\n').trim() + (truncado ? '\n\n[transcrição truncada no limite de duração]' : '');
    if (!transcricao || transcricao.length < 40) return fail('transcrição vazia');

    // 4) Segmenta em temas e estrutura N módulos-base rascunho — IN-TASK (sem a rota
    //    de 800s da Vercel; a transcrição já está em mãos).
    const { segmentarEEstruturarExtracao } = await import('@/lib/modulos-base/pipeline');
    const res = await segmentarEEstruturarExtracao(id, { transcricao, locale });
    if (res.error && !res.idempotente) return fail(res.error);
    return { ok: true, extracaoId: id, moduloIds: res.moduloIds, n: res.n, blocos: blocos.length };
  },
});
