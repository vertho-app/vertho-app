import { redirect } from 'next/navigation';
import { Briefcase } from 'lucide-react';
import { PageContainer } from '@/components/page-shell';
import { getRHEmpresaId } from '@/lib/auth/rh-context';
import SelecaoPanel from '@/app/admin/_components/selecao-panel';

/**
 * Módulo de Seleção — VERSÃO DO GESTOR (RH da empresa, ex.: prefeitura em
 * projetomacae.vertho.ai). Reusa o mesmo SelecaoPanel do painel admin; o empresaId vem do
 * contexto autenticado (não da URL) e as actions (requireEmpresaSupabase) confinam o RH à
 * própria empresa. Só RH/platform_admin chega aqui — os demais são redirecionados.
 */
export default async function GestorSelecaoPage() {
  const empresaId = await getRHEmpresaId();
  if (!empresaId) redirect('/dashboard');

  return (
    <PageContainer>
      <div className="mb-5">
        <p className="text-[10px] tracking-[0.2em] uppercase font-mono text-brand-300/80 mb-1">Recrutamento</p>
        <h1 className="text-white text-2xl font-bold flex items-center gap-2">
          <Briefcase size={22} className="text-brand-400" /> Seleção — Vagas
        </h1>
        <p className="text-[11px] text-white/50 mt-1 max-w-[560px]">Vagas abertas para recrutamento. Gere o perfil ideal da vaga e avalie os candidatos (todos com mapeamento DISC) contra ela — o ranking mostra a aderência de cada um ao cargo.</p>
      </div>
      <SelecaoPanel empresaId={empresaId} novaVagaHref="/dashboard/gestor/selecao/nova" />
    </PageContainer>
  );
}
