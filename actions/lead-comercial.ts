'use server';

import crypto from 'crypto';
import { headers } from 'next/headers';
import { createSupabaseAdmin } from '@/lib/supabase';
import { registrarEvento } from '@/lib/radar/eventos';

/**
 * Captura de lead comercial do Radar Bett SEM escopo de escola/município
 * obrigatório.
 *
 * Diferente de `capturarLead` (em app/radar/actions.ts), que valida que
 * scope_id corresponde a INEP/IBGE real do banco, este aceita o lead
 * mesmo sem busca prévia (ex: usuário clicou em "Agendar conversa" no
 * header, sem ter selecionado escola).
 *
 * Salva em diag_leads com scope_type='comercial' e scope_id='radarbett'
 * pra distinguir dos leads orgânicos do Radar.
 *
 * NÃO dispara worker de PDF — sem escopo concreto, não há proposta
 * individual a gerar. A equipe Vertho recebe via dashboard funnel-bett.
 */

export type CapturarLeadComercialInput = {
  // Dados pessoais
  nome: string;
  email: string;
  whatsapp?: string;
  cargo: string;
  // Contexto institucional
  instituicao: string;
  municipio?: string;
  tipo?: 'publica' | 'privada';
  qtd_alunos?: string;
  qtd_escolas?: string;
  // Origem
  origem?: 'home' | 'header' | 'persona' | 'cta_final' | 'sticky' | 'comparar' | 'public_cta' | string;
  // Se tinha algum scope mas era inválido, registra como referência
  scope_label_original?: string;
  // LGPD
  consentimento_lgpd: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

async function checkRateLimit(ipHash: string | null): Promise<{ ok: boolean; reason?: string }> {
  if (!ipHash) return { ok: true };
  const sb = createSupabaseAdmin();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await sb
    .from('diag_leads')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('criado_em', oneHourAgo);
  if ((count || 0) >= 10) return { ok: false, reason: 'Muitos pedidos por IP em 1h. Tente em algumas horas.' };
  return { ok: true };
}

export async function capturarLeadComercial(
  input: CapturarLeadComercialInput,
): Promise<{ success: boolean; leadId?: string; error?: string }> {
  // Validações básicas
  if (!input?.nome?.trim() || input.nome.trim().length < 2) {
    return { success: false, error: 'Nome obrigatório.' };
  }
  if (!EMAIL_RE.test(input?.email || '') || (input.email || '').length > 200) {
    return { success: false, error: 'E-mail inválido.' };
  }
  if (!input?.cargo?.trim()) {
    return { success: false, error: 'Cargo obrigatório.' };
  }
  if (!input?.instituicao?.trim()) {
    return { success: false, error: 'Instituição obrigatória.' };
  }
  if (!input.consentimento_lgpd) {
    return { success: false, error: 'Consentimento LGPD obrigatório.' };
  }

  const sb = createSupabaseAdmin();
  const { ipHash, userAgent, referer } = await getRequestFingerprint();

  // Rate limit por IP (10 leads/h)
  const rl = await checkRateLimit(ipHash);
  if (!rl.ok) return { success: false, error: rl.reason || 'Limite de pedidos atingido.' };

  // Dedup idempotente: mesmo (email × scope=comercial) na última hora
  // retorna o lead existente em vez de criar duplicata
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const emailNorm = input.email.trim().toLowerCase();
  const { data: existente } = await sb
    .from('diag_leads')
    .select('id')
    .eq('email', emailNorm)
    .eq('scope_type', 'comercial')
    .eq('scope_id', 'radarbett')
    .gte('criado_em', oneHourAgo)
    .limit(1)
    .maybeSingle();
  if (existente?.id) {
    return { success: true, leadId: existente.id };
  }

  // Consolida dados extras em organizacao
  const orgComplemento = [
    input.municipio && `Município: ${input.municipio}`,
    input.tipo && `Tipo: ${input.tipo === 'publica' ? 'pública' : 'privada'}`,
    input.qtd_alunos && `Alunos: ${input.qtd_alunos}`,
    input.qtd_escolas && `Escolas: ${input.qtd_escolas}`,
    input.whatsapp && `WhatsApp: ${input.whatsapp}`,
    input.origem && `Origem: ${input.origem}`,
    input.scope_label_original && `Busca anterior: ${input.scope_label_original}`,
  ].filter(Boolean).join(' · ');
  const organizacao = [input.instituicao.trim(), orgComplemento].filter(Boolean).join(' — ');

  const { data: lead, error } = await sb
    .from('diag_leads')
    .insert({
      email: emailNorm,
      nome: input.nome.trim().slice(0, 200),
      cargo: input.cargo.trim().slice(0, 200),
      organizacao: organizacao.slice(0, 1000),
      scope_type: 'comercial',
      scope_id: 'radarbett',
      scope_label: input.instituicao.trim().slice(0, 200),
      consentimento_lgpd: true,
      consentimento_em: new Date().toISOString(),
      pdf_status: 'nao_aplicavel',
      user_agent: userAgent,
      referer,
      ip_hash: ipHash,
    })
    .select('id')
    .single();

  if (error || !lead) {
    return { success: false, error: error?.message || 'Falha ao salvar lead.' };
  }

  // Tracking — best effort
  registrarEvento('lead_submit', {
    scopeType: 'municipio', // tipo mais "neutro" no enum existente
    scopeId: 'radarbett',
    extra: { leadId: lead.id, comercial: true, origem: input.origem },
  }).catch(() => {});

  return { success: true, leadId: lead.id };
}
