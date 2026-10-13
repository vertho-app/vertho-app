import { redirect } from 'next/navigation';

// `/admin` não tinha página e dava 404 (medido em produção, 13/10/2026), embora seja o endereço que
// se digita e o que o login chama de porta do painel. Aqui só se aponta a tela inicial: quem não
// entrou ou não provou o código é barrado pelo layout e pelas checagens de `/admin/dashboard`.
export default function AdminRaiz() {
  redirect('/admin/dashboard');
}
