// Equipe do representante (contrato do RC v6, cláusula 21.4; decisão do dono de
// 23/10/2026): o representante PJ pode ter vários logins, cada integrante com o
// próprio e-mail, operando o MESMO portal. A comissão, a carteira e a proteção
// são do representante; o integrante assina o que faz (`created_by_email`).
//
// Ponto ÚNICO de "este e-mail opera qual representante?": o portal
// (`lib/sales/permissions.ts`), o Copiloto (`lib/copiloto/auth.ts`) e a porta do
// magic link (`app/api/auth/magic-link`) leem daqui. Três cópias dessa regra
// divergiriam, e uma porta liberaria quem a outra barra.
import type { createSupabaseAdmin } from '@/lib/supabase';
import type { SalesRepresentative } from './types';

type Sb = ReturnType<typeof createSupabaseAdmin>;

export type IntegranteDaEquipe = { id: string; name: string; email: string };

export type RepresentantePorEmail = { rep: SalesRepresentative; integrante: IntegranteDaEquipe | null };

export const normalizarEmail = (email: string | null | undefined) => String(email ?? '').trim().toLowerCase();

/**
 * O representante que o e-mail opera: o próprio RC (e-mail do cadastro) ou o RC
 * de quem ele é integrante ATIVO da equipe. Não olha o status do RC: quem chama
 * decide (o portal exige ativo). Erro de leitura LANÇA: um gate de acesso não
 * pode tratar "não consegui ler" como "não é representante".
 */
export async function representantePorEmail(sb: Sb, email: string | null | undefined): Promise<RepresentantePorEmail | null> {
  const normalizado = normalizarEmail(email);
  if (!normalizado) return null;

  const { data: rep, error } = await sb.from('sales_representatives').select('*').eq('email', normalizado).maybeSingle();
  if (error) throw new Error(`falha ao resolver o representante: ${error.message}`);
  if (rep) return { rep: rep as SalesRepresentative, integrante: null };

  const { data: membro, error: erroMembro } = await sb.from('sales_representative_users')
    .select('id, name, email, representante_id').eq('email', normalizado).eq('status', 'active').maybeSingle();
  if (erroMembro) throw new Error(`falha ao resolver a equipe do representante: ${erroMembro.message}`);
  if (!membro) return null;

  const { data: dono, error: erroDono } = await sb.from('sales_representatives').select('*').eq('id', membro.representante_id).maybeSingle();
  if (erroDono) throw new Error(`falha ao resolver o representante da equipe: ${erroDono.message}`);
  if (!dono) return null;
  return { rep: dono as SalesRepresentative, integrante: { id: membro.id, name: membro.name, email: membro.email } };
}
