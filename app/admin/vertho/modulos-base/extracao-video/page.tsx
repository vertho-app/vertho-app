'use client';

import { useEffect, useState } from 'react';
import { Film } from 'lucide-react';
import BackButton from '@/components/back-button';
import ExtracaoVideoPanel from '@/app/admin/_components/extracao-video-panel';
import { listarEmpresasParaEscopo } from '@/actions/extracao-video';

export default function ExtracaoVideoVerthoPage() {
  const [empresas, setEmpresas] = useState<{ id: string; nome: string }[]>([]);

  useEffect(() => {
    listarEmpresasParaEscopo().then((r) => setEmpresas(r.data || []));
  }, []);

  return (
    <div className="max-w-[900px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      <BackButton href="/admin/vertho/modulos-base" />
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2"><Film size={20} className="text-purple-400" /> Extrair Módulo-Base de vídeo</h1>
        <p className="text-xs text-gray-500">Transforme um vídeo (YouTube, Vimeo, TED, LMS) em matéria-prima canônica: a IA estrutura um <strong className="text-gray-300">Módulo-Base rascunho</strong>. Padrão <strong className="text-gray-300">global</strong> (todos os tenants); opcionalmente exclusivo de uma empresa.</p>
      </div>

      <ExtracaoVideoPanel origemEmpresaId={null} modoVertho empresas={empresas} />
    </div>
  );
}
