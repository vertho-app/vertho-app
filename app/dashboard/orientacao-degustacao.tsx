'use client';

/**
 * A linha de "por onde começar" das visões da degustação.
 *
 * Aparece SÓ para quem chegou pelo convite (a sala guarda o código de volta na
 * sessão do navegador), SÓ na tela inicial daquele papel, e some quando a
 * pessoa dispensa. Sem storage no navegador, ela simplesmente não aparece: o
 * produto continua igual.
 *
 * Por que não é um tour: quem chega por um link de demonstração está com pressa
 * e no celular, e uma sequência de balões cobre justamente o que veio ver.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, X } from 'lucide-react';
import {
  CODIGO_CURTO_PATTERN,
  DEMO_PRESENTATION_RETURN_PARAM,
  DEMO_PRESENTATION_RETURN_STORAGE_KEY,
} from '@/lib/demo/presentation';
import {
  naCasaDoPapel,
  primeiroCodigoDeConvidado,
  type LinkDaOrientacao,
} from '@/lib/demo/degustacao-orientacao';

const CHAVE_DISPENSA = 'vertho-degustacao-orientacao-dispensada';

export default function OrientacaoDaDegustacao({ papel, casa, texto, links }: {
  papel: string;
  casa: string;
  texto: string;
  links: LinkDaOrientacao[];
}) {
  const pathname = usePathname();
  // Nasce escondida e só aparece depois do efeito: ler o storage durante a
  // renderização faria o servidor e o cliente discordarem no primeiro quadro.
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    let daSessao: string | null = null;
    let dispensada = false;
    try {
      daSessao = window.sessionStorage.getItem(DEMO_PRESENTATION_RETURN_STORAGE_KEY);
      dispensada = window.sessionStorage.getItem(`${CHAVE_DISPENSA}:${papel}`) === '1';
    } catch {
      /* navegador sem sessionStorage: resta a URL da primeira tela */
    }
    const daUrl = new URLSearchParams(window.location.search).get(DEMO_PRESENTATION_RETURN_PARAM);
    const convidado = primeiroCodigoDeConvidado([daUrl, daSessao], CODIGO_CURTO_PATTERN);
    setVisivel(Boolean(convidado) && !dispensada);
    // `pathname` entra de propósito: a pessoa volta para a casa depois de
    // explorar, e a dica precisa ser reavaliada ali (inclusive porque na
    // primeira tela o código só existia na URL).
  }, [papel, pathname]);

  if (!visivel || links.length === 0 || !naCasaDoPapel(pathname, casa)) return null;

  function dispensar() {
    setVisivel(false);
    try {
      window.sessionStorage.setItem(`${CHAVE_DISPENSA}:${papel}`, '1');
    } catch {
      /* dispensar sem storage vale para esta tela; é melhor que não dispensar */
    }
  }

  return (
    <div
      data-degustacao="orientacao"
      className="mb-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"
    >
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-white/75">{texto}</p>
        <button
          type="button"
          onClick={dispensar}
          aria-label="Dispensar esta dica"
          title="Dispensar esta dica"
          className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/70"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-bold transition-colors hover:bg-white/[0.06]"
            style={{ borderColor: 'var(--brand-400, #22d3ee)', color: 'var(--brand-200, #a5f3fc)' }}
          >
            {link.rotulo}
            <ArrowRight size={13} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </div>
  );
}
