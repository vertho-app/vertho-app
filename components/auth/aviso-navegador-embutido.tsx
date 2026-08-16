'use client';

import { useEffect, useState } from 'react';
import { esquemaSafari, esquemaChrome } from '@/lib/auth/navegador-embutido';

/**
 * "Você está no navegador do WhatsApp" — o atalho que aparece EXATAMENTE quando
 * o problema acontece.
 *
 * 🔴 O PROBLEMA (medido em 15/08/2026)
 * ────────────────────────────────────
 * A sessão do Supabase mora no cookie jar de UM navegador. Quem entrou pelo
 * Safari tem sessão lá — e o link semanal, tocado dentro do WhatsApp, abre no
 * WebView, que é outro jar. Resultado: tela de login, mesmo com a pessoa logada
 * "no app".
 *
 * ⚠️ Isto é um ATALHO, não a única saída: quem cair aqui também pode
 * simplesmente entrar pelo formulário abaixo. O PWA instalado saiu do escopo em
 * 16/08 (decisão do dono), então nada aqui deve empurrar ninguém para outro
 * navegador — só oferecer, para quem reconhece a situação.
 *
 * 🔑 POR QUE ELE VIVE NO LOGIN, e não no link
 * ───────────────────────────────────────────
 * A tentação é mandar todo link do WhatsApp para o navegador. Mas **não dá para
 * saber onde mora a sessão de cada pessoa**: quem entrou dentro do WhatsApp tem
 * a sessão no WebView, e arrancá-la para o Safari a jogaria numa tela de login —
 * o mesmo estrago, do outro lado.
 *
 * O login é o único ponto onde a resposta é conhecida: se esta tela apareceu, é
 * porque **neste navegador não há sessão**. Aí, e só aí, oferecer o outro
 * navegador é certo. Quem está logado aqui dentro nunca vê isto.
 *
 * ⚠️ Os esquemas não são API suportada (ver `lib/auth/navegador-embutido.ts`).
 * Por isso o componente nunca promete: tenta, e revela o caminho manual quando a
 * tentativa não leva a lugar nenhum.
 */
export default function AvisoNavegadorEmbutido({ ios }: { ios: boolean }) {
  const [url, setUrl] = useState('');
  const [tentou, setTentou] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const navegador = ios ? 'Safari' : 'Chrome';

  useEffect(() => {
    // A URL COMPLETA, com o `?redirect=` — é o que faz a pessoa cair na semana
    // que ela tocou, e não numa home genérica depois de entrar.
    if (typeof window !== 'undefined') setUrl(window.location.href);
  }, []);

  function tentar(esquema: (u: string) => string) {
    if (!url) return;
    setTentou(true);
    window.location.href = esquema(url);
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-white/15 bg-white/[0.06] p-4 text-left">
      <p className="text-[13px] font-semibold text-white">
        Você está no navegador do WhatsApp
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-white/70">
        Se você já entrou pelo {navegador}, sua sessão está lá — não aqui. Abra
        este mesmo endereço no {navegador} e você entra direto, sem novo login.
        Ou entre por aqui mesmo, abaixo.
      </p>

      <button
        type="button"
        onClick={() => tentar(ios ? esquemaSafari : esquemaChrome)}
        disabled={!url}
        className="mt-3 block w-full rounded-lg bg-cyan-300 px-4 py-3 text-center text-[14px] font-semibold text-slate-950 disabled:opacity-40"
      >
        Abrir no {navegador}
      </button>

      {tentou ? (
        <div className="mt-4 rounded-lg border border-amber-300/25 bg-amber-300/[0.07] p-3">
          <p className="text-[12px] font-semibold text-amber-200">Não abriu?</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-white/70">
            Toque em <b>•••</b> no canto superior desta tela e escolha{' '}
            <b>Abrir no {navegador}</b>.
          </p>
          <button
            type="button"
            onClick={copiar}
            className="mt-2.5 w-full rounded-lg border border-white/20 px-3 py-2 text-[12px] font-medium text-white/80"
          >
            {copiado ? 'Endereço copiado ✓' : 'Copiar endereço'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
