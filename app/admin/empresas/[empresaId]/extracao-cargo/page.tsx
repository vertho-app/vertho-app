'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase } from 'lucide-react';
import BackButton from '@/components/back-button';
import CargoExtracaoPanel from '@/app/admin/_components/cargo-extracao-panel';

export default function ExtracaoCargoPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = use(params);
  const router = useRouter();

  return (
    <div className="max-w-[900px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      <BackButton onClick={() => router.back()} />
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2"><Briefcase size={20} className="text-brand-400" /> Extração de descrição de cargo</h1>
        <p className="text-xs text-gray-500">Cole a descrição do cargo (ou envie um PDF) e a IA estrutura os campos que a <strong className="text-gray-300">parametrização comportamental</strong> usa — só o que o documento diz. Você revisa item a item; o que ficar incluído grava no cargo. NÃO gera competências nem gabarito (isso é o passo seguinte).</p>
      </div>

      <CargoExtracaoPanel empresaId={empresaId} />
    </div>
  );
}
