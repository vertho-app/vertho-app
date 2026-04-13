import { redirect } from 'next/navigation';

// O conteúdo do relatório narrativo foi consolidado em
// /dashboard/perfil-comportamental (seção "Análise narrativa").
// Este path redireciona pra não quebrar links antigos.
export default function RelatorioRedirect() {
  redirect('/dashboard/perfil-comportamental');
}
