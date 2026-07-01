import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, FilePlus2 } from 'lucide-react';
import { PageContainer } from '@/components/page-shell';
import { getRHEmpresaId } from '@/lib/auth/rh-context';
import CargoExtracaoPanel from '@/app/admin/_components/cargo-extracao-panel';

/**
 * Nova vaga (extração de descrição) — VERSÃO DO GESTOR. Reusa o CargoExtracaoPanel; o
 * empresaId vem do contexto (getRHEmpresaId), as actions confinam o RH à própria empresa.
 */
export default async function GestorNovaVagaPage() {
  const empresaId = await getRHEmpresaId();
  if (!empresaId) redirect('/dashboard');

  return (
    <PageContainer>
      <Link href="/dashboard/gestor/selecao" className="inline-flex items-center gap-1.5 text-[12px] text-brand-300 hover:text-brand-200 mb-4">
        <ArrowLeft size={14} /> Voltar às vagas
      </Link>
      <div className="mb-5">
        <h1 className="text-white text-2xl font-bold flex items-center gap-2">
          <FilePlus2 size={22} className="text-brand-400" /> Nova vaga
        </h1>
        <p className="text-[11px] text-white/50 mt-1 max-w-[560px]">Cole a descrição da vaga ou envie um PDF. A IA extrai os campos; você revisa e cria a vaga — que depois recebe o perfil ideal e a avaliação de candidatos.</p>
      </div>
      <CargoExtracaoPanel empresaId={empresaId} />
    </PageContainer>
  );
}
