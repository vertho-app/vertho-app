import { headers } from 'next/headers';
import Link from 'next/link';
import { lerParametroAcesso } from '@/lib/auth/magic-link-whatsapp';
import { ehNavegadorEmbutido } from '@/lib/auth/navegador-embutido';
import CopiarLink from './CopiarLink';
import SairDoWebView from './SairDoWebView';

/**
 * Confirmação do link de acesso — a tela onde o token FICA PARADO.
 *
 * 🔴 POR QUE ELA EXISTE (medido em 15/08/2026)
 * ───────────────────────────────────────────
 * O link chega por WhatsApp e o app o abre no navegador embutido. Se o `/entrar`
 * redirecionasse sozinho, o `verifyOtp` consumiria o token de uso único ali
 * dentro e a sessão nasceria num cookie jar isolado. Aí a pessoa pede "abrir no
 * navegador" — e o WhatsApp transfere a **URL atual**, que a essa altura já é
 * `<tenant>/dashboard`, sem token. Resultado observado: tela de login no Safari,
 * com o link já queimado.
 *
 * Enquanto ninguém toca em "Entrar", a URL continua redimível. Trocar de
 * navegador ANTES de entrar passa a funcionar.
 *
 * 🔑 UM TOQUE — E O DEFAULT MUDOU TRÊS VEZES ANTES DE ASSENTAR
 * ────────────────────────────────────────────────────────────
 * Vale registrar a sequência, porque o mecanismo esteve certo antes de o default
 * estar:
 *
 *  1. `•••` → "Abrir no Safari" como caminho principal, três passos numerados.
 *     Correto e **burocrático**.
 *  2. "Entrar agora" único: um toque, mas dentro do WhatsApp.
 *  3. Saída para o navegador em um toque (`SairDoWebView`), promovida a
 *     principal — porque a sessão do WebView não servia ao **PWA instalado**.
 *  4. **O PWA saiu do escopo (16/08, decisão do dono: "pouquíssimas pessoas vão
 *     usar desta forma").** Com isso o motivo inteiro da saída evaporou: o
 *     navegador do WhatsApp guarda a sessão, e o link da semana seguinte abre
 *     nesta mesma janela já logado (medido).
 *
 * Então "Entrar agora" é o botão, para todo mundo. A saída para o navegador
 * continua disponível num `<details>` FECHADO — está construída e testada, e
 * serve a quem também usa a Vertho no computador —, mas não cobra pedágio de
 * ninguém.
 *
 * A lição: **um mecanismo correto pode estar na hierarquia errada**, e quem
 * decide a hierarquia é para quem o produto é — não a elegância da solução.
 *
 * ⚠️ Esta página NÃO autentica ninguém e não consome nada.
 */

export const dynamic = 'force-dynamic';

export default async function ConfirmarAcesso({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  // Mesma régua do `/entrar`: o que não tem forma de parâmetro de acesso não
  // vira link nem aparece na tela.
  const dados = lerParametroAcesso(t);
  const h = await headers();
  const host = h.get('host') || 'app.vertho.ai';
  const ua = h.get('user-agent');
  const embutido = ehNavegadorEmbutido(ua);

  if (!dados || !t) {
    return (
      <main className="flex min-h-dvh flex-col justify-center bg-[#061526] px-6 py-10 text-white">
        <div className="mx-auto w-full max-w-md">
          <h1 className="text-[22px] font-semibold">Link inválido ou expirado</h1>
          <p className="mt-3 text-[14px] leading-relaxed text-slate-300">
            Peça um novo link de acesso na tela de entrada.
          </p>
          <Link
            href="/login"
            className="mt-6 block rounded-lg bg-cyan-300 px-4 py-3 text-center text-[14px] font-semibold text-slate-950"
          >
            Ir para o login
          </Link>
        </div>
      </main>
    );
  }

  // `ir=1` é o único caminho que consome o token.
  const entrar = `/entrar?t=${encodeURIComponent(t)}&ir=1`;
  const link = `https://${host}/entrar/abrir?t=${encodeURIComponent(t)}`;

  return (
    <main className="flex min-h-dvh flex-col justify-center bg-[#061526] px-6 py-10 text-white">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-[22px] font-semibold leading-tight">Entrar na Vertho</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-slate-300">
          Seu link de acesso está válido. Ele só pode ser usado <b>uma vez</b>.
        </p>

        <a
          href={entrar}
          className="mt-6 block rounded-lg bg-cyan-300 px-4 py-3.5 text-center text-[15px] font-semibold text-slate-950"
        >
          Entrar agora
        </a>

        {embutido ? (
          // FECHADO de propósito. A saída para o navegador continua aqui porque
          // já está construída e testada — mas deixou de ser o caminho principal
          // no dia em que o PWA saiu do escopo (16/08). Entrar dentro do
          // WhatsApp é coerente: o WebView guarda a sessão, e o link da semana
          // seguinte abre nesta mesma janela já logado (medido).
          <details className="mt-6 rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <summary className="cursor-pointer list-none text-[13px] text-slate-300">
              <span className="underline decoration-slate-600 underline-offset-4">
                Prefere entrar pelo navegador?
              </span>
            </summary>
            <p className="mt-3 text-[13px] leading-relaxed text-slate-400">
              Útil se você também usa a Vertho no computador. O link continua
              intacto — nada foi usado ainda.
            </p>
            <div className="mt-3">
              <SairDoWebView urlEntrar={`https://${host}${entrar}`} link={link} />
            </div>
          </details>
        ) : (
          <details className="mt-6 rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <summary className="cursor-pointer list-none text-[13px] text-slate-300">
              <span className="underline decoration-slate-600 underline-offset-4">
                Abrir em outro aparelho
              </span>
            </summary>
            <p className="mt-3 break-all font-mono text-[12px] text-slate-400">{link}</p>
            <CopiarLink link={link} />
          </details>
        )}
      </div>
    </main>
  );
}
