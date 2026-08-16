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
 * 🔑 UM TOQUE PARA O NAVEGADOR (revisto duas vezes no mesmo dia)
 * ─────────────────────────────────────────────────────────────
 * Houve uma versão que promovia "••• → Abrir no Safari" a caminho principal, com
 * três passos numerados: correta e **burocrática**. E houve outra que deixou
 * "Entrar agora" como botão único: um toque, mas dentro do WhatsApp.
 *
 * O que o dono quer é o navegador, em um toque. No Android isso já acontece
 * antes desta tela (o `/entrar` manda um `intent://`). No iOS não existe caminho
 * suportado — então o `SairDoWebView` TENTA os esquemes `x-safari-https://` e
 * `googlechromes://`, que funcionam se o app repassar a URL ao sistema, e revela
 * o caminho manual só quando a tentativa não leva a lugar nenhum.
 *
 * O destino da tentativa já leva `ir=1`: se o Safari abrir, a pessoa entra
 * direto, sem uma segunda tela. Se não abrir, nada foi consumido.
 *
 * "Entrar aqui mesmo" continua existindo como link secundário — funciona, e o
 * navegador do WhatsApp guarda a sessão, então o link da semana seguinte abre
 * nesta mesma janela já logado. O que ele não resolve é o app instalado.
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

  if (embutido) {
    return (
      <main className="flex min-h-dvh flex-col justify-center bg-[#061526] px-6 py-10 text-white">
        <div className="mx-auto w-full max-w-md">
          <h1 className="text-[22px] font-semibold leading-tight">Entrar na Vertho</h1>
          <p className="mt-3 text-[14px] leading-relaxed text-slate-300">
            Abra no navegador para que o acesso valha também no app instalado.
          </p>

          <div className="mt-6">
            <SairDoWebView urlEntrar={`https://${host}${entrar}`} link={link} />
          </div>

          {/* Secundário, e com a consequência na etiqueta: entrar aqui funciona
              e a sessão fica guardada nesta janela — o link da semana seguinte
              abre aqui já logado. Só não serve para o app instalado. */}
          <a
            href={entrar}
            className="mt-7 block text-center text-[13px] text-slate-400 underline decoration-slate-600 underline-offset-4"
          >
            Entrar aqui mesmo, dentro do WhatsApp
          </a>
        </div>
      </main>
    );
  }

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

        <details className="mt-6 rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <summary className="cursor-pointer list-none text-[13px] text-slate-300">
            <span className="underline decoration-slate-600 underline-offset-4">
              Abrir em outro aparelho
            </span>
          </summary>
          <p className="mt-3 break-all font-mono text-[12px] text-slate-400">{link}</p>
          <CopiarLink link={link} />
        </details>
      </div>
    </main>
  );
}
