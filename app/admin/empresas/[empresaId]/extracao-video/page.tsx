'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { Film } from 'lucide-react';
import BackButton from '@/components/back-button';
import ExtracaoVideoPanel from '@/app/admin/_components/extracao-video-panel';

export default function ExtracaoVideoPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = use(params);
  const router = useRouter();

  return (
    <div className="max-w-[900px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      <BackButton onClick={() => router.back()} />
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2"><Film size={20} className="text-purple-400" /> Extração de conteúdo de vídeo</h1>
        <p className="text-xs text-gray-500">Reaproveite vídeos como matéria-prima: extraímos um texto-base e a IA estrutura um <strong className="text-gray-300">Módulo-Base rascunho</strong> (revisado e publicado em Módulos-Base de Conteúdo).</p>
      </div>

      <ExtracaoVideoPanel origemEmpresaId={empresaId} modoVertho={false} />
    </div>
  );
}
