'use server';

import crypto from 'crypto';
import { headers } from 'next/headers';
import { createSupabaseAdmin } from '@/lib/supabase';
import { APP_URL } from '@/lib/domain';
import { registrarEvento } from '@/lib/radar/eventos';

type SearchResult = {
  tipo: 'escola' | 'municipio';
  id: string;
  label: string;
  sub?: string;
};

export async function buscarEscolasMunicipios(
  termo: string,
  opts?: { uf?: string },
): Promise<SearchResult[]> {
  const q = termo.trim().replace(/[%_]/g, '').slice(0, 80);
  if (q.length < 2) return [];
  const allowed = await checkPublicActionRateLimit('search_radar', 60, 10 * 60 * 1000);
  if (!allowed) return [];

  // UF opcional: 2 letras válidas, normalizada para uppercase
  const ufRaw = (opts?.uf || '').trim().toUpperCase();
  const uf = /^[A-Z]{2}$/.test(ufRaw) ? ufRaw : null;

  const sb = createSupabaseAdmin();
  const isInepLike = /^\d{6,8}$/.test(q);
  const isIbgeLike = /^\d{7}$/.test(q);

  // Busca exata por código primeiro (rápido)
  if (isInepLike || isIbgeLike) {
    let codigoQ = sb
      .from('diag_escolas')
      .select('codigo_inep, nome, municipio, uf, rede, municipio_ibge')
      .or(`codigo_inep.eq.${q},municipio_ibge.eq.${q}`)
      .limit(30);
    if (uf) codigoQ = codigoQ.eq('uf', uf);
    const { data: escola } = await codigoQ;
    if (escola?.length) {
      const results: SearchResult[] = [];
      // Se o usuário buscou por código IBGE de 7 dígitos, oferece o município
      // como primeira opção (não só as escolas dele).
      if (isIbgeLike) {
        const matchMun = escola.find((e: any) => e.municipio_ibge === q);
        if (matchMun) {
          // Pega a versão "mais limpa" do nome (com acentos válidos) entre
          // escolas do mesmo IBGE — útil quando há mistura de encoding.
          const candidatos = escola
            .filter((e: any) => e.municipio_ibge === q)
            .map((e: any) => String(e.municipio || ''));
          const nomeLimpo = candidatos.find((n) => !n.includes('\uFFFD')) || candidatos[0] || matchMun.municipio;
          results.push({
            tipo: 'municipio',
            id: q,
            label: nomeLimpo,
            sub: `${matchMun.uf} · município`,
          });
        }
      }
      for (const e of escola) {
        results.push({
          tipo: 'escola',
          id: e.codigo_inep,
          label: e.nome,
          sub: [e.rede, `${e.municipio}/${e.uf}`].filter(Boolean).join(' · '),
        });
      }
      return results;
    }
  }

  // Busca tolerante a acento e ordem das palavras (mig 084).
  // RPCs diag_buscar_escolas / diag_buscar_municipios:
  //  - Normalizam termo e dados (lower + unaccent)
  //  - Quebram em tokens; cada palavra de 2+ chars deve aparecer no nome
  //    em qualquer ordem (AND)
  //  - Ordenam por similaridade trigram (score)
  //  - Aceitam UF opcional como filtro
  //  - Usam índices GIN trigram em forma normalizada
  const [escolasRes, municipiosRes] = await Promise.all([
    sb.rpc('diag_buscar_escolas', { p_termo: q, p_uf: uf, p_limit: 25 }),
    sb.rpc('diag_buscar_municipios', { p_termo: q, p_uf: uf, p_limit: 60 }),
  ]);

  const escolasData = (escolasRes.data || []) as Array<{
    codigo_inep: string;
    nome: string;
    municipio: string;
    uf: string;
    rede: string | null;
    score: number;
  }>;
  const municipiosData = (municipiosRes.data || []) as Array<{
    municipio_ibge: string;
    municipio: string;
    uf: string;
    score: number;
  }>;

  const results: SearchResult[] = [];
  for (const m of municipiosData) {
    if (results.length >= 8) break;
    results.push({
      tipo: 'municipio',
      id: m.municipio_ibge,
      label: m.municipio,
      sub: `${m.uf} · município`,
    });
  }
  for (const e of escolasData) {
    if (results.length >= 25) break;
    results.push({
      tipo: 'escola',
      id: e.codigo_inep,
      label: e.nome,
      sub: [e.rede, `${e.municipio}/${e.uf}`].filter(Boolean).join(' · '),
    });
  }

  return results;
}

// ── Lista de municípios por UF (alimenta autocomplete da busca avançada) ──

export type MunicipioListagem = {
  municipio_ibge: string;
  municipio: string;
};

export async function listarMunicipiosPorUf(uf: string): Promise<MunicipioListagem[]> {
  const ufNorm = uf?.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(ufNorm || '')) return [];
  const allowed = await checkPublicActionRateLimit('list_municipios', 60, 10 * 60 * 1000);
  if (!allowed) return [];

  const sb = createSupabaseAdmin();
  const { data } = await sb
    .from('diag_escolas')
    .select('municipio_ibge, municipio')
    .eq('uf', ufNorm)
    .not('municipio_ibge', 'is', null)
    .limit(20000);

  // Dedup por IBGE — diag_escolas tem 1 row por escola, então mesmo município repete
  const map = new Map<string, string>();
  for (const r of (data || []) as any[]) {
    if (!map.has(r.municipio_ibge)) map.set(r.municipio_ibge, r.municipio);
  }
  return Array.from(map.entries())
    .map(([municipio_ibge, municipio]) => ({ municipio_ibge, municipio }))
    .sort((a, b) => a.municipio.localeCompare(b.municipio, 'pt-BR'));
}

// ── Busca avançada (UF, Rede, Etapa, Município) ──────────────────────

export type BuscaAvancadaResult = {
  codigo_inep: string;
  nome: string;
  municipio: string;
  municipio_ibge: string;
  uf: string;
  rede: string | null;
  etapas: string[] | null;
  inse_grupo: number | null;
  score: number;
};

export async function buscarEscolasAvancado(opts: {
  termo?: string;
  uf?: string;
  municipio_ibge?: string;
  rede?: 'PRIVADA' | 'MUNICIPAL' | 'ESTADUAL' | 'FEDERAL';
  etapa?: '5_EF' | '9_EF' | '3_EM';
  limit?: number;
  offset?: number;
}): Promise<{ rows: BuscaAvancadaResult[]; total: number }> {
  const allowed = await checkPublicActionRateLimit('search_radar_avancado', 60, 10 * 60 * 1000);
  if (!allowed) return { rows: [], total: 0 };

  const sb = createSupabaseAdmin();
  const safeTermo = opts.termo ? opts.termo.trim().replace(/[%_]/g, '').slice(0, 80) : null;
  const ufNorm = opts.uf && /^[A-Z]{2}$/.test(opts.uf.trim().toUpperCase()) ? opts.uf.trim().toUpperCase() : null;
  const params = {
    p_termo: safeTermo,
    p_uf: ufNorm,
    p_municipio_ibge: opts.municipio_ibge || null,
    p_rede: opts.rede || null,
    p_etapa: opts.etapa || null,
    p_limit: Math.min(opts.limit ?? 50, 100),
    p_offset: Math.max(opts.offset ?? 0, 0),
  };
  const [listRes, countRes] = await Promise.all([
    sb.rpc('diag_buscar_escolas_avancado', params),
    sb.rpc('diag_buscar_escolas_avancado_count', {
      p_termo: params.p_termo,
      p_uf: params.p_uf,
      p_municipio_ibge: params.p_municipio_ibge,
      p_rede: params.p_rede,
      p_etapa: params.p_etapa,
    }),
  ]);
  return {
    rows: (listRes.data as BuscaAvancadaResult[]) || [],
    total: (countRes.data as number) || 0,
  };
}

// ── Tracking de eventos via client ────────────────────────────────────

export async function registrarEventoClient(
  tipo:
    | 'view_escola' | 'view_municipio' | 'view_estado' | 'view_comparar'
    | 'cta_lead_click' | 'citar_aberto'
    | 'fale_conosco_open' | 'wpp_click' | 'email_click'
    | 'bett_home_view' | 'bett_search_focus' | 'bett_search_submit'
    | 'bett_result_view' | 'bett_glimpse_view' | 'bett_unlock_click'
    | 'bett_example_click' | 'bett_persona_click'
    | 'bett_lead_open' | 'bett_lead_step1' | 'bett_lead_step2' | 'bett_lead_submit'
    | 'bett_public_cta' | 'bett_schedule_click' | 'bett_wpp_click'
    | 'bett_sticky_click',
  scope?: { tipo: 'escola' | 'municipio' | 'estado'; id: string },
) {
  const allowed = await checkPublicActionRateLimit('event_client_radar', 120, 10 * 60 * 1000);
  if (!allowed) return { ok: false };
  await registrarEvento(tipo, scope ? { scopeType: scope.tipo, scopeId: scope.id } : {});
  return { ok: true };
}

// ── Lead capture ──────────────────────────────────────────────────────
export type CapturarLeadInput = {
  scopeType: 'escola' | 'municipio';
  scopeId: string;
  scopeLabel: string;
  nome: string;
  email: string;
  cargo: string;
  organizacao: string;
  consentimento_lgpd: boolean;
};

function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

async function getRequestFingerprint() {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || '';
  return {
    ipHash: ip ? hashIp(ip) : null,
    userAgent: h.get('user-agent')?.slice(0, 500) || null,
    referer: h.get('referer')?.slice(0, 500) || null,
  };
}

async function checkPublicActionRateLimit(tipo: string, max: number, windowMs: number): Promise<boolean> {
  const { ipHash, userAgent, referer } = await getRequestFingerprint();
  if (!ipHash) return true;
  const sb = createSupabaseAdmin();
  const since = new Date(Date.now() - windowMs).toISOString();
  const { count, error } = await sb
    .from('diag_eventos')
    .select('id', { count: 'exact', head: true })
    .eq('tipo', tipo)
    .eq('ip_hash', ipHash)
    .gte('criado_em', since);
  if (error) return true;
  if ((count || 0) >= max) return false;

  await sb.from('diag_eventos').insert({
    tipo,
    ip_hash: ipHash,
    user_agent: userAgent,
    referer,
    is_bot: false,
    extra: { rate_limit_window_ms: windowMs },
  });
  return true;
}

/**
 * Valida que o scopeId aponta pra escola ou município que existe na base.
 * Sem isso, qualquer string passaria e geraria PDF/IA "fantasma".
 */
async function validarScope(scopeType: 'escola' | 'municipio', scopeId: string): Promise<boolean> {
  if (!/^\d+$/.test(scopeId)) return false;
  const sb = createSupabaseAdmin();
  if (scopeType === 'escola') {
    if (scopeId.length !== 8) return false;
    const { data } = await sb.from('diag_escolas').select('codigo_inep').eq('codigo_inep', scopeId).maybeSingle();
    return !!data;
  }
  if (scopeType === 'municipio') {
    if (scopeId.length !== 7) return false;
    const { data: byEscola } = await sb.from('diag_escolas').select('municipio_ibge').eq('municipio_ibge', scopeId).limit(1).maybeSingle();
    if (byEscola) return true;
    const { data: byIca } = await sb.from('diag_ica_snapshots').select('municipio_ibge').eq('municipio_ibge', scopeId).limit(1).maybeSingle();
    return !!byIca;
  }
  return false;
}

/**
 * Rate limit best-effort sem Redis: conta leads por ip_hash na última hora.
 * 10 leads/h por IP. Suficiente pra abuso casual; pra ataque coordenado,
 * usar Cloudflare/Vercel WAF na frente.
 */
async function checkRateLimit(ipHash: string | null): Promise<{ ok: boolean; reason?: string }> {
  if (!ipHash) return { ok: true };
  const sb = createSupabaseAdmin();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await sb
    .from('diag_leads')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('criado_em', oneHourAgo);
  if ((count || 0) >= 10) return { ok: false, reason: 'Limite de 10 solicitações por hora atingido' };
  return { ok: true };
}

export async function capturarLead(input: CapturarLeadInput): Promise<{ success: boolean; error?: string; leadId?: string }> {
  const email = input.email?.trim().toLowerCase();
  if (!email || !email.includes('@') || email.length > 200) return { success: false, error: 'E-mail inválido' };
  if (!input.consentimento_lgpd) return { success: false, error: 'Consentimento LGPD obrigatório' };
  if (!input.scopeId || !input.scopeType) return { success: false, error: 'Escopo inválido' };
  if (input.scopeType !== 'escola' && input.scopeType !== 'municipio') {
    return { success: false, error: 'scope_type inválido' };
  }

  // 1. Valida que o escopo existe na base
  const valido = await validarScope(input.scopeType, input.scopeId);
  if (!valido) return { success: false, error: 'Escola ou município não encontrado na base' };

  const sb = createSupabaseAdmin();
  const h = await headers();
  const userAgent = h.get('user-agent') || null;
  const referer = h.get('referer') || null;
  const ip = h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || '';
  const ipHash = ip ? hashIp(ip) : null;

  // 2. Rate limit por IP (10/hora)
  const rl = await checkRateLimit(ipHash);
  if (!rl.ok) return { success: false, error: rl.reason };

  // 3. Dedup idempotente: se mesmo email + scope nas últimas 24h e PDF ainda
  //    válido, retorna o lead existente sem reenfileirar. Custos × abuso × UX.
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: existente } = await sb
    .from('diag_leads')
    .select('id, pdf_status')
    .eq('email', email)
    .eq('scope_type', input.scopeType)
    .eq('scope_id', input.scopeId)
    .gte('criado_em', dayAgo)
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existente && existente.pdf_status !== 'erro') {
    return { success: true, leadId: existente.id };
  }

  const { data, error } = await sb
    .from('diag_leads')
    .insert({
      scope_type: input.scopeType,
      scope_id: input.scopeId,
      scope_label: input.scopeLabel,
      nome: input.nome?.trim()?.slice(0, 200) || null,
      email,
      cargo: input.cargo?.trim()?.slice(0, 200) || null,
      organizacao: input.organizacao?.trim()?.slice(0, 200) || null,
      consentimento_lgpd: true,
      consentimento_em: new Date().toISOString(),
      pdf_status: 'pendente',
      user_agent: userAgent,
      referer,
      ip_hash: ipHash,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[capturarLead] insert failed', error);
    return { success: false, error: error?.message || 'Erro ao salvar' };
  }

  // 4. Tracking de evento (best-effort)
  registrarEvento('lead_submit', { scopeType: input.scopeType, scopeId: input.scopeId, extra: { leadId: data.id } }).catch(() => {});

  // 5. Dispara geração — QStash se disponível, senão fallback direto
  await dispararPdfWorker(data.id);

  return { success: true, leadId: data.id };
}

/**
 * Dispara o worker /api/radar/lead-pdf:
 * - Preferência 1: QStash (assíncrono, com retry automático) — quando QSTASH_TOKEN configurado
 * - Preferência 2: fetch interno direto com INTERNAL_DISPATCH_SECRET — fallback se QStash indisponível
 *
 * Best-effort: erros são logados mas não interrompem a captura do lead.
 */
async function dispararPdfWorker(leadId: string): Promise<void> {
  const webhookUrl = `${APP_URL}/api/radar/lead-pdf`;

  // Tenta QStash primeiro
  if (process.env.QSTASH_TOKEN) {
    try {
      const r = await fetch('https://qstash.upstash.io/v2/publish/' + encodeURIComponent(webhookUrl), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.QSTASH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ leadId }),
      });
      if (r.ok) return;
      console.error('[capturarLead] qstash retornou', r.status);
    } catch (err) {
      console.error('[capturarLead] qstash dispatch failed', err);
    }
  }

  // Fallback: chama o worker direto com secret interno (fire-and-forget)
  if (!process.env.INTERNAL_DISPATCH_SECRET) {
    console.warn('[capturarLead] sem QStash e sem INTERNAL_DISPATCH_SECRET — lead ficará pendente');
    return;
  }
  // Não faz await — geração de PDF é lenta (~10s) e não queremos bloquear a server action.
  // O worker atualizará o lead via Supabase quando terminar.
  fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-dispatch': process.env.INTERNAL_DISPATCH_SECRET,
    },
    body: JSON.stringify({ leadId }),
  }).catch((err) => console.error('[capturarLead] internal dispatch failed', err));
}
