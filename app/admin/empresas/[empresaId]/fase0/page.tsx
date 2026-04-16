'use client';

import { useEffect, use } from 'react';
import { useRouter } from 'next/navigation';

// Tela legada (catálogo Moodle + cobertura) — substituída.
// Catálogo agora em /admin/conteudos (unificado).
// Preferências em /admin/preferencias-aprendizagem.
export default function Fase0Redirect({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = use(params);
  const router = useRouter();

  useEffect(() => {
    const tab = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('tab')
      : null;
    if (tab === 'preferencias') {
      router.replace(`/admin/preferencias-aprendizagem?empresa=${empresaId}`);
    } else {
      router.replace('/admin/conteudos');
    }
  }, [empresaId, router]);

  return null;
}
