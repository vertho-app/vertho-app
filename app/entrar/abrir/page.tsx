import { headers } from 'next/headers';
import CopiarLink from './CopiarLink';

/**
 * "Abra no navegador para entrar" — a tela que salva o link de acesso no iPhone.
 *
 * 🔴 POR QUE ELA EXISTE (medido em 15/08/2026)
 * ───────────────────────────────────────────
 * O link chega por WhatsApp e o app o abre no navegador EMBUTIDO. Seguir dali
 * consome o token de uso único e cria a sessão num cookie jar isolado: a pessoa
 * fecha o WhatsApp, abre o app instalado e não está logada — com o link já
 * queimado, porque `verifyOtp` gastou o token.
 *
 * No ANDROID esta tela quase nunca aparece: o `/entrar` manda um `intent://` e o
 * Chrome assume (ela é o fallback de quem não tem Chrome resolvível). No iOS
 * **não existe** caminho programático para sair do WKWebView — nem link, nem
 * esquema, nem script. A saída é o menu do próprio WhatsApp, e o que dá para
 * fazer é reduzir isso a um toque e não gastar o token no caminho.
 *
 * ⚠️ Esta página NÃO autentica ninguém e não consome nada: ela só devolve o
 * mesmo endereço para ser aberto no lugar certo. É Server Component de propósito
 * — `useSearchParams` num client component de página exigiria Suspense e não
 * traria nada.
 */

export const dynamic = 'force-dynamic';

export default async function AbrirNoNavegador({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const host = (await headers()).get('host') || 'app.vertho.ai';
  // Mesmo host que a pessoa já está usando — o `/entrar` só existe no domínio
  // fixo do botão do template.
  const link = t ? `https://${host}/entrar?t=${encodeURIComponent(t)}` : '';

  return (
    <main className="flex min-h-dvh flex-col justify-center bg-[#061526] px-6 py-10 text-white">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-[22px] font-semibold leading-tight">
          Abra no navegador para entrar
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-slate-300">
          Você está dentro do WhatsApp. Se entrar por aqui, o acesso vale só nesta
          janela — e o link não funciona uma segunda vez.
        </p>

        <ol className="mt-6 space-y-3 text-[14px] text-slate-200">
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cyan-300 text-[12px] font-bold text-slate-950">1</span>
            <span>Toque em <b>•••</b> (canto superior direito desta tela)</span>
          </li>
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cyan-300 text-[12px] font-bold text-slate-950">2</span>
            <span>Escolha <b>Abrir no Safari</b> (ou no seu navegador)</span>
          </li>
        </ol>

        {link ? (
          <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[12px] uppercase tracking-wider text-slate-400">
              ou copie o endereço
            </p>
            <p className="mt-2 break-all font-mono text-[12px] text-slate-300">{link}</p>
            <CopiarLink link={link} />
          </div>
        ) : null}

        <p className="mt-6 text-[13px] leading-relaxed text-slate-400">
          Prefere não abrir link? Peça um <b>código de acesso</b> na tela de login:
          ele chega por WhatsApp e funciona sem sair do lugar onde você já está.
        </p>
      </div>
    </main>
  );
}
