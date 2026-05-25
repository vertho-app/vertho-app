'use server';

import { requireAdminAction } from '@/lib/auth/action-context';
import { createSupabaseAdmin } from '@/lib/supabase';

export type AuditRow = {
  id: string;
  admin_email: string;
  acao: string;
  empresa_id: string | null;
  empresa_slug: string | null;
  alvo: string | null;
  detalhes: Record<string, any>;
  resultado: string;
  ip: string | null;
  user_agent: string | null;
  criado_em: string;
};

export async function loadAuditLog(filtros: {
  acao?: string;
  empresaId?: string;
  adminEmail?: string;
  limit?: number;
} = {}): Promise<{ rows: AuditRow[]; acoes: string[]; empresas: { id: string; label: string }[]; error?: string }> {
  await requireAdminAction();
  const sb = createSupabaseAdmin();

  let q = sb.from('admin_audit_log').select('*').order('criado_em', { ascending: false }).limit(filtros.limit || 200);
  if (filtros.acao) q = q.eq('acao', filtros.acao);
  if (filtros.empresaId) q = q.eq('empresa_id', filtros.empresaId);
  if (filtros.adminEmail) q = q.ilike('admin_email', `%${filtros.adminEmail}%`);

  const { data, error } = await q;
  if (error) {
    // Tabela ainda não criada (migration 116 não aplicada) → mensagem amigável
    return { rows: [], acoes: [], empresas: [], error: error.message };
  }
  const rows = (data || []) as AuditRow[];

  // Facetas pros dropdowns (a partir de uma janela ampla, sem filtro)
  const { data: facetData } = await sb.from('admin_audit_log')
    .select('acao, empresa_id, empresa_slug').order('criado_em', { ascending: false }).limit(2000);
  const acoes = [...new Set((facetData || []).map((r: any) => r.acao))].sort();
  const empMap = new Map<string, string>();
  for (const r of facetData || []) {
    if (r.empresa_id) empMap.set(r.empresa_id, r.empresa_slug || r.empresa_id);
  }
  const empresas = [...empMap.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));

  return { rows, acoes, empresas };
}
