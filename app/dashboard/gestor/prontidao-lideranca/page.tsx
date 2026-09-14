/** Prontidão para Liderança — RH self-service (escopo = empresa da sessão). Molde: ../ranking/page.tsx */
import { PageContainer } from '@/components/page-shell';
import ProntidaoLiderancaView from '@/components/prontidao-lideranca-view';
import { exigirAcessoPaginaSimulador } from '@/lib/simuladores/pagina';
import { getProntidaoLideranca, getParecerLideranca, exportarParecerPDF, exportarConsolidadoPDF } from '@/actions/prontidao-lideranca';

export const dynamic = 'force-dynamic';

export default async function ProntidaoLiderancaPage() {
  await exigirAcessoPaginaSimulador('lideranca');

  return (
    <PageContainer>
      <ProntidaoLiderancaView
        scopeKey="rh-session"
        carregar={getProntidaoLideranca}
        parecer={getParecerLideranca}
        exportarParecer={exportarParecerPDF}
        exportarConsolidado={exportarConsolidadoPDF}
      />
    </PageContainer>
  );
}
