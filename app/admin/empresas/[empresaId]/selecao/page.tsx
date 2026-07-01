'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase } from 'lucide-react';
import BackButton from '@/components/back-button';
import SelecaoPanel from '@/app/admin/_components/selecao-panel';

export default function SelecaoPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = use(params);
  const router = useRouter();

  return (
    <div className="max-w-[900px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      <BackButton onClick={() => router.back()} />
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2"><Briefcase size={20} className="text-brand-400" /> Seleção — Vagas abertas</h1>
        <p className="text-xs text-gray-500">Recrutamento: vagas a preencher, avaliadas pelo mesmo motor de adequação, mas separadas dos cargos operacionais (que têm colaboradores). Crie vagas pela extração de descrição.</p>
      </div>

      <SelecaoPanel empresaId={empresaId} />
    </div>
  );
}
