'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Redireciona humanos deslogados para o login (preservando o destino).
 * Bots/crawlers (WhatsApp, etc.) não executam JS → ficam na página e
 * recebem as OG tags públicas (preview do link). Só humanos são levados ao login.
 */
export default function LoginRedirect({ target }: { target: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(target);
  }, [target, router]);
  return null;
}
