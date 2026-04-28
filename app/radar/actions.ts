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

export async function buscarEscolasMunicipios(termo: string): Promise<SearchResult[]> {
  const q = termo.trim();
  if (q.length < 2) return [];

  const sb = createSupabaseAdmin();
  const isInepLike = /^\d{6,8}$/.test(q);
  const isIbgeLike = /^\d{7}$/.test(q);

  // Busca exata por código primeiro (rápido)
  if (isInepLike || isIbgeLike) {
    const { data: escola } = await sb
      .from('diag_escolas')
      .select('codigo_inep, nome, municipio, uf, rede, municipio_ibge')
      .or(`codigo_inep.eq.${q},municipio_ibge.eq.${q}`)
      .limit(20);
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

  // Busca por nome (escolas e municípios). Com pg_trgm + GIN, ilike
  // %termo% usa o índice e fica O(log n) — sem precisar mudar a query.
  // Filtra municipio_ibge null pra evitar resultados sem IBGE válido.
  const [escolas, municipios] = await Promise.all([
    sb.from('diag_escolas')
      .select('codigo_inep, nome, municipio, uf, rede')
      .ilike('nome', `%${q}%`)
      .limit(8),
    sb.from('diag_escolas')
      .select('municipio, municipio_ibge, uf')
      .ilike('municipio', `%${q}%`)
      .not('municipio_ibge', 'is', null)
      .limit(20),
  ]);

  // Dedup municípios pelo IBGE
  const municipiosUnicos = new Map<string, { municipio: string; uf: string }>();
  for (const m of municipios.data || []) {
    if (!municipiosUnicos.has(m.municipio_ibge)) {
      municipiosUnicos.set(m.municipio_ibge, { municipio: m.municipio, uf: m.uf });
    }
  }

  const results: SearchResult[] = [];
  for (const [ibge, m] of municipiosUnicos) {
    if (results.length >= 5) break;
    results.push({
      tipo: 'municipio',
      id: ibge,
      label: m.municipio,
      sub: `${m.uf} · município`,
    });
  }
  for (const e of escolas.data || []) {
    if (results.length >= 12) break;
    results.push({
      tipo: 'escola',
      id: e.codigo_inep,
      label: e.nome,
      sub: [e.rede, `${e.municipio}/${e.uf}`].filter(Boolean).join(' · '),
    });
  }

  return results;
}

// ── Tracking de eventos via client ────────────────────────────────────

export async function registrarEventoClient(
  tipo: 'view_escola' | 'view_municipio' | 'view_estado' | 'view_comparar' | 'cta_lead_click' | 'citar_aberto',
  scope?: { tipo: 'escola' | 'municipio' | 'estado'; id: string },
) {
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

  // 5. Dispara geração assíncrona via QStash (best-effort)
  if (process.env.QSTASH_TOKEN) {
    try {
      const webhookUrl = `${APP_URL}/api/radar/lead-pdf`;
      await fetch('https://qstash.upstash.io/v2/publish/' + encodeURIComponent(webhookUrl), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.QSTASH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ leadId: data.id }),
      });
    } catch (err) {
      console.error('[capturarLead] qstash dispatch failed', err);
    }
  }

  return { success: true, leadId: data.id };
}

