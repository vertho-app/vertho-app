import { connection } from 'next/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTenantSlug, resolveTenantFromHeaders } from '@/lib/tenant-resolver';
import { resolveTheme } from '@/lib/ui-resolver';
import { getRepresentativeContext } from '@/lib/sales/permissions';
import { isPlatformAdmin } from '@/lib/authz';
import DashboardShell from './dashboard-shell';
import { pushHabilitado } from '@/lib/notifications/flag';
import { AtivarPush } from '@/components/notifications/ativar-push';
import IpiAccess from '@/components/ipi/ipi-access';
import { getDemoPresentationRoleFromHostname } from '@/lib/demo/presentation';
import {
  linksDaOrientacao,
  orientacaoDaDegustacao,
  personasDaOrientacao,
} from '@/lib/demo/degustacao-orientacao';
import { resolverPersonasDaOrientacao } from '@/lib/demo/degustacao-orientacao-servidor';
import OrientacaoDaDegustacao from './orientacao-degustacao';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await connection();

  // Representantes comerciais (RCs) não são colaboradores de tenant — o /dashboard
  // (área do colaborador) não tem contexto para eles. Se um RC ativo cair aqui
  // (login, bookmark ou link direto), leva ao portal comercial dele. Exceção:
  // quem é RC E platform admin (ex.: o dono testando) segue no dashboard/admin e
  // acessa /representante por URL quando quiser.
  const rep = await getRepresentativeContext();
  if (rep?.rep.status === 'active' && !(await isPlatformAdmin(rep.email))) {
    redirect('/representante');
  }

  // Resolve o tema do tenant (white-label) server-side. Sem branding → fallbacks
  // são o tema Vertho atual, então não há mudança visual para quem não customiza.
  const h = await headers();
  // Os aliases de usuário/gestor/RH chegam com o slug canônico da apresentação.
  const ocultarIpi = ['acme-demo', 'escolas-acme'].includes(getTenantSlug(h) || '');
  const tenant = await resolveTenantFromHeaders(h);
  const theme = resolveTheme(tenant?.ui_config);

  // Convite de push só existe onde a flag está ligada. Quem não tem a flag não
  // recebe nem o componente no HTML — não é `display:none`, é ausência.
  const mostrarPush = await pushHabilitado(tenant?.id);

  // Orientação da degustação: só existe nos hosts de sala (gestor-demo, rh-demo,
  // usuario-demo e os equivalentes dos outros ambientes), então tenant de
  // cliente não paga consulta nenhuma por ela. Quem decide MOSTRAR é o cliente,
  // que sabe se a pessoa chegou pelo convite; o servidor só resolve os links,
  // porque o id da persona muda a cada reset.
  const papelDaSala = getDemoPresentationRoleFromHostname((h.get('host') || '').split(':')[0]);
  const orientacao = papelDaSala
    ? orientacaoDaDegustacao(papelDaSala.tenantSlug, papelDaSala.key)
    : null;
  const linksDaDica = orientacao && tenant?.id
    ? linksDaOrientacao(
      orientacao,
      await resolverPersonasDaOrientacao(tenant.id, personasDaOrientacao(orientacao)),
    )
    : [];

  return (
    <DashboardShell theme={theme}>
      {mostrarPush ? (
        <div className="mb-4">
          <AtivarPush />
        </div>
      ) : null}
      {orientacao && linksDaDica.length > 0 && papelDaSala ? (
        <OrientacaoDaDegustacao
          papel={papelDaSala.key}
          casa={orientacao.casa}
          texto={orientacao.texto}
          links={linksDaDica}
        />
      ) : null}
      {children}
      {!ocultarIpi && <IpiAccess />}
    </DashboardShell>
  );
}
