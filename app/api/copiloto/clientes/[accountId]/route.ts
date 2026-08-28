import { NextResponse } from 'next/server';
import { requireRepresentativeOrAdminRequest } from '@/lib/copiloto/auth';
import { getCopilotAccountDetail } from '@/lib/copiloto/accounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  req: Request,
  context: { params: Promise<{ accountId: string }> },
) {
  const access = await requireRepresentativeOrAdminRequest(req);
  if (access instanceof Response) return access;
  const { accountId } = await context.params;
  if (!UUID.test(accountId)) return NextResponse.json({ error: 'Cliente inválido' }, { status: 400 });

  const detail = await getCopilotAccountDetail(access, accountId);
  if (!detail) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
  return NextResponse.json({ detail });
}
