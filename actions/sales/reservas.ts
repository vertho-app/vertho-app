'use server';

// Portal do Representante — lista de reserva da vertho.ai (contrato do RC v6,
// cláusula 7.3): clientes, leads próprios e negociações diretas. O registro de
// RC que esbarra num CNPJ básico ou INEP daqui não é aceito na hora; vai para a
// fila de validação do /admin/comercial. Só o admin comercial lê e edita: o RC
// nunca vê a lista, só o aviso de que o cliente está reservado.
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireCommercialAdminAction } from '@/lib/sales/permissions';
import { cnpjRaiz, codigoInepValido } from '@/lib/sales/registro';
import { logAdminAction } from '@/lib/audit';

export type ReservaRow = {
  id: string;
  nome: string;
  cnpj_raiz: string | null;
  codigo_inep: string | null;
  motivo: string | null;
  criado_por: string | null;
  criado_em: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function listarReservas() {
  await requireCommercialAdminAction(false);
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('sales_reservas')
    .select('id, nome, cnpj_raiz, codigo_inep, motivo, criado_por, criado_em')
    .order('nome');
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: (data || []) as ReservaRow[] };
}

/**
 * CNPJ completo vira o CNPJ básico (reserva a matriz e as filiais); 8 posições
 * já são o básico. INEP só com dígitos. Precisa de pelo menos um dos dois.
 */
export async function adicionarReserva(input: { nome: string; cnpj?: string; codigoInep?: string; motivo?: string }) {
  const admin = await requireCommercialAdminAction(true);
  const nome = String(input?.nome || '').trim();
  if (!nome) return { success: false as const, error: 'Informe o nome do cliente' };
  const cnpjBruto = String(input?.cnpj || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const raiz = cnpjBruto.length === 8 && /^[0-9A-Z]{8}$/.test(cnpjBruto) ? cnpjBruto : cnpjRaiz(cnpjBruto);
  if (cnpjBruto && !raiz) return { success: false as const, error: 'CNPJ inválido: informe o CNPJ completo ou as 8 primeiras posições' };
  const inepBruto = String(input?.codigoInep || '').trim();
  const inep = codigoInepValido(inepBruto);
  if (inepBruto && !inep) return { success: false as const, error: 'Código INEP inválido: são 8 dígitos' };
  if (!raiz && !inep) return { success: false as const, error: 'Informe o CNPJ ou o código INEP: é por eles que o portal confere o registro' };

  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('sales_reservas').insert({
    nome, cnpj_raiz: raiz, codigo_inep: inep, motivo: String(input?.motivo || '').trim() || null, criado_por: admin.email,
  }).select('id').single();
  if (error) return { success: false as const, error: error.message };
  await logAdminAction({
    adminEmail: admin.email, acao: 'sales_reserva.adicionar', alvo: `${nome} (${data.id})`,
    detalhes: { cnpj_raiz: raiz, codigo_inep: inep },
  });
  return { success: true as const, id: data.id as string };
}

export async function removerReserva(id: string) {
  const admin = await requireCommercialAdminAction(true);
  if (!UUID_RE.test(String(id || ''))) return { success: false as const, error: 'Reserva inválida' };
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('sales_reservas').delete().eq('id', id).select('nome, cnpj_raiz, codigo_inep');
  if (error) return { success: false as const, error: error.message };
  const removida = (data || [])[0] as { nome: string; cnpj_raiz: string | null; codigo_inep: string | null } | undefined;
  if (!removida) return { success: false as const, error: 'Esta reserva já não existe' };
  await logAdminAction({
    adminEmail: admin.email, acao: 'sales_reserva.remover', alvo: `${removida.nome} (${id})`,
    detalhes: { cnpj_raiz: removida.cnpj_raiz, codigo_inep: removida.codigo_inep },
  });
  return { success: true as const };
}
