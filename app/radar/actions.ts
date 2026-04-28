'use server';

import crypto from 'crypto';
import { headers } from 'next/headers';
import { createSupabaseAdmin } from '@/lib/supabase';
import { APP_URL } from '@/lib/domain';

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
      .select('codigo_inep, nome, municipio, uf, rede')
      .or(`codigo_inep.eq.${q},municipio_ibge.eq.${q}`)
      .limit(10);
    if (escola?.length) {
      return escola.map((e: any) => ({
        tipo: 'escola',
        id: e.codigo_inep,
        label: e.nome,
        sub: [e.rede, `${e.municipio}/${e.uf}`].filter(Boolean).join(' · '),
      }));
    }
  }

  // Busca por nome (escolas e municípios)
  const [escolas, municipios] = await Promise.all([
    sb.from('diag_escolas')
      .select('codigo_inep, nome, municipio, uf, rede')
      .ilike('nome', `%${q}%`)
      .limit(8),
    sb.from('diag_escolas')
      .select('municipio, municipio_ibge, uf')
      .ilike('municipio', `%${q}%`)
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

export async function capturarLead(input: CapturarLeadInput): Promise<{ success: boolean; error?: string; leadId?: string }> {
  const email = input.email?.trim().toLowerCase();
  if (!email || !email.includes('@')) return { success: false, error: 'E-mail inválido' };
  if (!input.consentimento_lgpd) return { success: false, error: 'Consentimento LGPD obrigatório' };
  if (!input.scopeId || !input.scopeType) return { success: false, error: 'Escopo inválido' };

  const sb = createSupabaseAdmin();
  const h = await headers();
  const userAgent = h.get('user-agent') || null;
  const referer = h.get('referer') || null;
  const ip = h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || '';

  const { data, error } = await sb
    .from('diag_leads')
    .insert({
      scope_type: input.scopeType,
      scope_id: input.scopeId,
      scope_label: input.scopeLabel,
      nome: input.nome?.trim() || null,
      email,
      cargo: input.cargo?.trim() || null,
      organizacao: input.organizacao?.trim() || null,
      consentimento_lgpd: true,
      consentimento_em: new Date().toISOString(),
      pdf_status: 'pendente',
      user_agent: userAgent,
      referer,
      ip_hash: ip ? hashIp(ip) : null,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[capturarLead] insert failed', error);
    return { success: false, error: error?.message || 'Erro ao salvar' };
  }

  // Dispara geração assíncrona via QStash (best-effort)
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

