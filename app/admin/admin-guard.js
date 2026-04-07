'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, ShieldAlert } from 'lucide-react';

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'rodrigo@vertho.ai,rodrigodnaves@gmail.com')
  .split(',').map(e => e.trim().toLowerCase());

export default function AdminGuard({ children }) {
  const [status, setStatus] = useState('checking'); // checking | authorized | unauthorized | unauthenticated
  const router = useRouter();
  const supabase = getSupabase();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { setStatus('unauthenticated'); return; }
      const email = session.user.email?.toLowerCase();
      if (ADMIN_EMAILS.includes(email)) {
        setStatus('authorized');
      } else {
        setStatus('unauthorized');
      }
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
        <p className="text-sm text-gray-400">Você não tem permissão para acessar esta área.</p>
        <button onClick={() => router.push('/dashboard')}
          className="mt-2 px-4 py-2 rounded-lg text-sm font-semibold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 transition-colors">
          Voltar ao Dashboard
        </button>
      </div>
    );
  }

  return children;
}
