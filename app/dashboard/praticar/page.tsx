'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PraticarRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard/temporada'); }, [router]);
  return null;
}
