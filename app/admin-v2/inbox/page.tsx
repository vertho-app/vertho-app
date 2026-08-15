import CaixaGlobal from './CaixaGlobal';

export const metadata = { title: 'Caixa de entrada' };
export const dynamic = 'force-dynamic';

/**
 * Caixa de entrada da equipe Vertho — todas as empresas.
 *
 * O gate real de cada leitura está nas actions (`'use server'` = endpoint HTTP);
 * o layout do /admin-v2 protege a NAVEGAÇÃO, e só ela.
 */
export default function InboxPage() {
  return <CaixaGlobal />;
}
