import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/request-context';
import { can } from '@/lib/permissions';
import { csrfCheck } from '@/lib/csrf';
import { readLimiter } from '@/lib/rate-limit';
import { tenantDb } from '@/lib/tenant-db';
import { VERTHO_TREINO_EMPRESA_ID } from '@/lib/simulador-vendas/vertho';
import { falha, json } from '@/lib/simulador-vendas/http';
import { SimuladorError } from '@/lib/simulador-vendas/core';
import { logAdminAction } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const entrada = z
  .object({ email: z.email().trim().toLowerCase(), ativo: z.boolean() })
  .strict();
async function gestor(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  if (!(await can(auth, 'sales_channel.manage')))
    return json(
      { error: 'Seu perfil não permite gerenciar participantes.' },
      403,
    );
  const limited = await readLimiter.check(
    req,
    `sim-vertho-gestao:${auth.email}`,
  );
  return limited ?? auth;
}
export async function GET(req: Request) {
  try {
    const auth = await gestor(req);
    if (auth instanceof Response) return auth;
    const { data, error } = await tenantDb(VERTHO_TREINO_EMPRESA_ID)
      .from('sim_vendas_vertho_participantes')
      .select('user_id,nome,tipo,ativo,updated_at')
      .order('nome')
      .limit(1000);
    if (error)
      throw new SimuladorError(
        503,
        'Não foi possível carregar os participantes.',
      );
    return json({ participantes: data });
  } catch (e) {
    return falha(e);
  }
}
export async function POST(req: Request) {
  try {
    const csrf = csrfCheck(req);
    if (csrf) return csrf;
    const auth = await gestor(req);
    if (auth instanceof Response) return auth;
    const raw = await req.text();
    if (raw.length > 2000) return json({ error: 'Cadastro muito longo.' }, 413);
    const dados = entrada.parse(JSON.parse(raw));
    const { error } = await tenantDb(VERTHO_TREINO_EMPRESA_ID).rpc(
      'sim_vendas_vertho_inscrever_interno',
      {
        p_email: dados.email,
        p_ativo: dados.ativo,
        p_actor: auth.email,
      },
    );
    if (error?.message.includes('SIM_CONTA'))
      throw new SimuladorError(
        400,
        'Este e-mail precisa ter uma conta Vertho confirmada antes da liberação.',
      );
    if (error)
      throw new SimuladorError(503, 'Não foi possível salvar a liberação.');
    await logAdminAction({
      adminEmail: auth.email,
      acao: 'sim_vertho.participante_acesso',
      empresaId: VERTHO_TREINO_EMPRESA_ID,
      alvo: dados.email,
      detalhes: { ativo: dados.ativo },
    });
    return json({ success: true });
  } catch (e) {
    return falha(e);
  }
}
