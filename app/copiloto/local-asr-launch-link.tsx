'use client';

import type { PropsWithChildren } from 'react';
import { LOCAL_ASR_LAUNCH_URI } from './local-asr';

type LocalAsrLaunchLinkProps = PropsWithChildren<{
  className?: string;
  onLaunch: () => void | Promise<void>;
}>;

export function LocalAsrLaunchLink({ children, className, onLaunch }: LocalAsrLaunchLinkProps) {
  function handleClick() {
    // Primeiro o navegador processa o href nativo sob o gesto do usuário. Só
    // depois trocamos o link pelo estado de carregamento e iniciamos o polling.
    window.setTimeout(() => void onLaunch(), 0);
  }

  return (
    <a className={className} href={LOCAL_ASR_LAUNCH_URI} onClick={handleClick}>
      {children}
    </a>
  );
}
