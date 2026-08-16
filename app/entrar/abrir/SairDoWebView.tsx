'use client';

import { useState } from 'react';

/**
 * Tenta abrir o link no navegador DE VERDADE a partir do WebView do iOS.
 *
 * 🔴 LEIA ANTES DE CONFIAR NISTO
 * ──────────────────────────────
 * A Apple não oferece nenhuma forma suportada de um WKWebView entregar a
 * navegação ao Safari. O que existe é um efeito colateral: quando a página tenta
 * navegar para um esquema DESCONHECIDO, um app bem-comportado repassa a URL ao
 * sistema (`UIApplication.open`) em vez de tratar como erro. `x-safari-https://`
 * é registrado pelo Safari e `googlechromes://` pelo Chrome — então, SE o
 * WhatsApp repassar, o navegador abre.
 *
 * Isso depende do app do outro lado e pode parar de funcionar sem aviso. Por
 * isso o botão nunca promete: ele tenta, e se nada acontecer em 1,2s revela o
 * caminho manual, que sempre funciona. Prometer "abre no navegador" e não abrir
 * é pior que pedir dois toques.
 *
 * ⚠️ O destino leva `ir=1` de propósito: se o Safari abrir, a pessoa já entra,
 * sem uma segunda tela. Se não abrir, nada foi consumido — o toque falhou aqui
 * dentro, não lá fora.
 */
export default function SairDoWebView({
  urlEntrar,
  link,
}: {
  /** URL absoluta com `ir=1` — o que o navegador deve abrir. */
  urlEntrar: string;
  /** URL absoluta desta própria tela, para copiar. */
  link: string;
}) {
  const [tentou, setTentou] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const semEsquema = urlEntrar.replace(/^https?:\/\//, '');

  function tentar(esquema: string) {
    setTentou(true);
    // Se o esquema não for repassado, o WKWebView simplesmente cancela a
    // navegação e a pessoa continua aqui — daí o fallback aparecer sozinho.
    window.location.href = esquema + semEsquema;
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => tentar('x-safari-https://')}
        className="block w-full rounded-lg bg-cyan-300 px-4 py-3.5 text-center text-[15px] font-semibold text-slate-950"
      >
        Abrir no Safari e entrar
      </button>

      <button
        type="button"
        onClick={() => tentar('googlechromes://')}
        className="mt-3 block w-full rounded-lg border border-white/15 bg-white/[0.04] px-4 py-3 text-center text-[14px] font-medium text-slate-200"
      >
        Abrir no Chrome
      </button>

      {tentou ? (
        <div className="mt-5 rounded-xl border border-amber-300/25 bg-amber-300/[0.07] p-4">
          <p className="text-[13px] font-semibold text-amber-200">Não abriu?</p>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-300">
            Toque em <b>•••</b> no canto superior desta tela e escolha{' '}
            <b>Abrir no Safari</b>. O link continua intacto — nada foi usado
            ainda.
          </p>
          <p className="mt-3 break-all font-mono text-[12px] text-slate-400">{link}</p>
          <button
            type="button"
            onClick={copiar}
            className="mt-3 w-full rounded-lg border border-white/15 px-4 py-2.5 text-[13px] font-medium text-slate-200"
          >
            {copiado ? 'Copiado ✓' : 'Copiar endereço'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
