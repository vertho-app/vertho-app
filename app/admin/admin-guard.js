'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, ShieldAlert } from 'lucide-react';
import { checkAdminAccess } from './admin-actions';

export default function AdminGuard({ children }) {
  const [status, setStatus] = useState('checking'); // checking | authorized | unauthorized | unauthenticated
  const router = useRouter();
  const supabase = getSupabase();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setStatus('unauthenticated'); return; }

      // Verificação server-side via server action
      const result = await checkAdminAccess(session.user.email);
      setStatus(result.authorized ? 'authorized' : 'unauthorized');
    });
  }, []);

  if (status === 'checking') {
    return (
      <div className="flex items-center justify-center h-dvh">
        <Loader2 size={32} className="animate-spin text-cyan-400" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    router.replace('/login?redirect=/admin/dashboard');
    return null;
  }

  if (status === 'unauthorized') {
    return (
      <div className="flex flex-col items-center justify-center h-dvh gap-4">
        <ShieldAlert size={48} className="text-red-400" />
        <p className="text-lg font-semibold text-white">Acesso restrito</p>
        <p className="text-sm text-gray-400">Voce nao tem permissao para acessar esta area.</p>
        <button onClick={() => router.push('/dashboard')}
          className="mt-2 px-4 py-2 rounded-lg text-sm font-semibold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 transition-colors">
          Voltar ao Dashboard
        </button>
      </div>
    );
  }

  return children;
}
