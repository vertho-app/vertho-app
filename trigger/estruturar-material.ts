import { task } from '@trigger.dev/sdk';

/**
 * Estruturação ASSÍNCRONA de um MATERIAL grande (PDF/DOCX/TXT) em Módulos-Base.
 *
 * O texto já foi extraído pela action (submeterMaterialAsync) e gravado em
 * extracoes_video.transcricao — esta task só dispara a rota interna que segmenta
 * em temas e estrutura N módulos (a mesma do fluxo de vídeo longo). Materiais
 * grandes (livros de 50k+ palavras) levam minutos e estourariam a rota síncrona
 * de 300s; aqui a rota interna roda com 800s e a task aguarda de forma durável.
 *
 * Acesso ao Supabase via REST (service-role) — o cliente @supabase/supabase-js
 * (Realtime/WebSocket) quebra no runtime Node do trigger.dev.
 */
const SUPA = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const REST_HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
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

export const estruturarMaterialTask = task({
  id: 'estruturar-material',
  maxDuration: 1800, // 30 min — cobre livros (map-reduce de várias janelas)
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

    const ext = await rGetOne('extracoes_video', `id=eq.${id}&select=id,escopo_empresa_id,transcricao,titulo`);
    if (!ext?.transcricao || String(ext.transcricao).trim().length < 40) return fail('extração ou transcrição não encontrada');

    let locale = 'pt-BR';
    if (ext.escopo_empresa_id) {
      const emp = await rGetOne('empresas', `id=eq.${ext.escopo_empresa_id}&select=default_locale`);
      if (emp?.default_locale) locale = emp.default_locale;
    }

    // Callback do app: segmenta em temas e estrutura N módulos-base rascunho.
    // try/catch: se a rota for cortada (timeout/queda), o fetch REJEITA antes de
    // retornar — sem isto, o registro ficaria travado em 'processing' (o fail()
    // abaixo nunca rodaria). Aqui marcamos error e deixamos o trigger re-tentar.
    let cb: Response;
    try {
      cb = await fetch(`${APP_URL}/api/internal/modulo-from-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': KEY },
        body: JSON.stringify({ extracaoId: id, transcricao: ext.transcricao, titulo: ext.titulo || null, locale }),
      });
    } catch (e: any) {
      return fail(`callback de estruturação falhou (conexão): ${String(e?.message || e).slice(0, 200)}`);
    }
    if (!cb.ok) {
      const msg = await cb.text().catch(() => '');
      return fail(`callback módulo ${cb.status}: ${msg.slice(0, 300)}`);
    }
    const res: any = await cb.json().catch(() => ({}));
    return { ok: true, extracaoId: id, moduloIds: res?.moduloIds, n: res?.n };
  },
});
