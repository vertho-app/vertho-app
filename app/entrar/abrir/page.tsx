import { headers } from 'next/headers';
import Link from 'next/link';
import { lerParametroAcesso } from '@/lib/auth/magic-link-whatsapp';
import { ehNavegadorEmbutido, ehRoboDePreview } from '@/lib/auth/navegador-embutido';
import AutoEntrar from './AutoEntrar';
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
 * 🔑 ZERO TOQUE — E O DEFAULT MUDOU QUATRO VEZES ANTES DE ASSENTAR
 * ───────────────────────────────────────────────────────────────
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
 *  5. **18/08: a tela entra sozinha** (`AutoEntrar`). Sem PWA, o toque em
 *     "Entrar agora" não comprava nada para quem o dava — comprava a chance de
 *     TROCAR de navegador, que quase ninguém usa. O fluxo inteiro passou a ser
 *     um toque só: o botão da mensagem no WhatsApp.
 *
 * O que segura o token continua de pé: **não é o toque, é o JavaScript**. O
 * servidor não redireciona sozinho, então o robô de preview da Meta baixa este
 * HTML e vai embora com o token intacto. Ver `AutoEntrar.tsx`.
 *
 * A lição das quatro viradas: **um mecanismo correto pode estar na hierarquia
 * errada**, e quem decide a hierarquia é para quem o produto é — não a elegância
 * da solução.
 *
 * ⚠️ Esta página NÃO autentica ninguém e não consome nada — o consumo acontece
 * no `/entrar?ir=1` para onde ela navega.
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
  // Robô de preview leva a tela parada (e não consome nada). Gente entra sozinha.
  const auto = !ehRoboDePreview(ua);

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
        {/* Antes de qualquer coisa na tela: quem tem navegador já está indo. */}
        {auto ? <AutoEntrar url={entrar} /> : null}

        <h1 className="text-[22px] font-semibold leading-tight">
          {auto ? 'Entrando na Vertho…' : 'Entrar na Vertho'}
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-slate-300">
          {auto ? (
            <>Isto leva um instante. Se a tela não mudar, toque no botão abaixo.</>
          ) : (
            <>
              Seu link de acesso está válido. Ele só pode ser usado <b>uma vez</b>.
            </>
          )}
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
