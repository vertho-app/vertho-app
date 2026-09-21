'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, Home } from 'lucide-react';
import {
  CODIGO_CURTO_PATTERN,
  DEMO_PRESENTATION_RETURN_PARAM,
  DEMO_PRESENTATION_RETURN_STORAGE_KEY,
  getDemoPresentationRoleFromHostname,
  linkDaPaginaDeBoasVindas,
} from '@/lib/demo/presentation';

type Papel = NonNullable<ReturnType<typeof getDemoPresentationRoleFromHostname>>;
const subscribe = () => () => {};
const snapshot = () => getDemoPresentationRoleFromHostname(window.location.hostname);
const serverSnapshot = () => null;

export function PresentationNavigationLinks({ papel, pathname, codigo }: {
  papel: Papel;
  pathname: string;
  codigo: string | null;
}) {
  const noPainel = pathname.replace(/\/+$/, '') === papel.homePath;
  const inicio = codigo ? linkDaPaginaDeBoasVindas(papel.tenantSlug, codigo) : null;
  const painel = papel.tenantSlug === 'escolas-acme'
    ? { rh: 'Voltar ao painel da direção', gestor: 'Voltar ao painel da coordenação', usuario: 'Voltar ao início do professor' }[papel.key]
    : { rh: 'Voltar ao painel do RH', gestor: 'Voltar ao painel do gestor', usuario: 'Voltar ao início do colaborador' }[papel.key];

  if (noPainel && !inicio) return null;

  return (
    <nav
      aria-label="Navegação da degustação"
      data-degustacao="navegacao"
      className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1 border-b border-white/10 bg-[#091D35] px-4 py-2 md:px-6 lg:px-8"
    >
      {!noPainel && (
        <Link href={papel.homePath} data-degustacao="voltar-painel" className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-cyan-200 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300">
          <ArrowLeft size={18} className="shrink-0" aria-hidden="true" />
          {painel}
        </Link>
      )}
      {inicio && (
        <a href={inicio} target="_top" data-degustacao="voltar-convite" className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm text-white/75 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300">
          <Home size={17} className="shrink-0" aria-hidden="true" />
          Início da degustação
        </a>
      )}
    </nav>
  );
}

/** Independente da dica dispensável: o caminho de volta continua em todas as telas. */
export default function PresentationNavigation() {
  const papel = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const pathname = usePathname();
  const [codigo, setCodigo] = useState<string | null>(null);

  useEffect(() => {
    if (!papel) return;
    const daUrl = new URLSearchParams(window.location.search).get(DEMO_PRESENTATION_RETURN_PARAM);
    let daSessao: string | null = null;
    try {
      daSessao = window.sessionStorage.getItem(DEMO_PRESENTATION_RETURN_STORAGE_KEY);
    } catch { /* O link da URL ainda funciona quando o storage não está disponível. */ }
    const encontrado = [daUrl, daSessao].find((valor) => valor && CODIGO_CURTO_PATTERN.test(valor));
    // Preserva o código após o switcher limpar a URL, inclusive sem storage.
    setCodigo((anterior) => encontrado || anterior);
  }, [papel, pathname]);

  return papel ? <PresentationNavigationLinks papel={papel} pathname={pathname} codigo={codigo} /> : null;
}
