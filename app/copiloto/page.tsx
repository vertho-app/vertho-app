import Link from 'next/link';
import Image from 'next/image';
import { getAuthenticatedEmailFromAction } from '@/lib/auth/action-context';
import { resolveCopilotAccess } from '@/lib/copiloto/auth';
import { listCopilotAccounts } from '@/lib/copiloto/accounts';
import { isSupernormalConfigured } from '@/lib/copiloto/supernormal';
import { createSupabaseAdmin } from '@/lib/supabase';
import type { CopilotOpportunity } from '@/lib/copiloto/types';
import CopilotClient from './copilot-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function opportunitiesFor(repId: string): Promise<CopilotOpportunity[]> {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('sales_opportunities')
    .select(`id, account_id, opportunity_name, identified_need, stage, product_interest, competitors, objections,
      account:sales_accounts (legal_name, trade_name, segment, city, state),
      primary_contact:sales_contacts!sales_opportunities_primary_contact_id_fkey (name, role)`)
    .eq('representante_id', repId)
    .eq('status', 'open')
    .order('updated_at', { ascending: false })
    .limit(60);

  return (data || []).map((row: any) => {
    const account = row.account || {};
    const contact = row.primary_contact || {};
    const accountName = account.trade_name || account.legal_name || 'Conta sem nome';
    const context = [
      `Oportunidade: ${row.opportunity_name}`,
      `Cliente: ${accountName}${account.segment ? ` | segmento: ${account.segment}` : ''}${account.city ? ` | ${account.city}/${account.state || ''}` : ''}`,
      contact.name ? `Contato: ${contact.name}${contact.role ? ` (${contact.role})` : ''}` : '',
      row.identified_need ? `Necessidade registrada: ${row.identified_need}` : '',
      row.product_interest ? `Interesse: ${row.product_interest}` : '',
      row.competitors ? `Concorrentes: ${row.competitors}` : '',
      row.objections ? `Objeções já sinalizadas: ${row.objections}` : '',
      `Estágio: ${row.stage}`,
    ].filter(Boolean).join('\n');
    return { id: row.id, accountId: row.account_id, name: row.opportunity_name, accountName, segment: account.segment || null, context };
  });
}

function AccessScreen({ loggedIn }: { loggedIn: boolean }) {
  return (
    <main className="min-h-dvh grid place-items-center bg-[#06172c] px-6 text-white">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[.035] p-8 text-center shadow-2xl">
        <Image src="/logo-vertho.png" alt="Vertho" width={124} height={28} className="mx-auto h-7 w-auto" priority />
        <p className="mt-6 text-[10px] font-bold uppercase tracking-[.24em] text-cyan-300">Copiloto PACE</p>
        <h1 className="mt-2 text-xl font-bold">{loggedIn ? 'Acesso comercial necessário' : 'Entre para planejar sua conversa'}</h1>
        <p className="mt-2 text-sm leading-6 text-white/55">
          {loggedIn ? 'Esta tela está disponível para representantes ativos e administradores da Vertho.' : 'O planejamento e as transcrições ficam protegidos pela sua sessão.'}
        </p>
        <Link href={loggedIn ? '/dashboard' : '/login?redirect=/copiloto'} className="mt-6 inline-flex rounded-lg bg-cyan-300 px-5 py-2.5 text-sm font-bold text-[#06172c]">
          {loggedIn ? 'Voltar ao app' : 'Entrar'}
        </Link>
      </section>
    </main>
  );
}

export default async function CopilotPage() {
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return <AccessScreen loggedIn={false} />;
  const access = await resolveCopilotAccess(email);
  if (!access) return <AccessScreen loggedIn />;

  const [opportunities, accounts] = await Promise.all([
    access.kind === 'representative' ? opportunitiesFor(access.rep.id) : Promise.resolve([]),
    listCopilotAccounts(access),
  ]);
  const userName = access.kind === 'representative' ? access.rep.name : email.split('@')[0];

  return (
    <CopilotClient
      userName={userName}
      opportunities={opportunities}
      accounts={accounts}
      canCreateLeads={access.kind === 'representative'}
      supernormalStatus={
        access.kind !== 'admin'
          ? 'admin-only'
          : isSupernormalConfigured() ? 'connected' : 'not-configured'
      }
    />
  );
}
