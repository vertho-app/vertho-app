import { headers } from 'next/headers';
import Link from 'next/link';
import { lerParametroAcesso } from '@/lib/auth/magic-link-whatsapp';
import CopiarLink from './CopiarLink';

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
 * Enquanto ninguém toca em "Entrar", a URL da barra de endereços continua sendo
 * a redimível. Trocar de navegador ANTES de entrar passa a funcionar — e é isso
 * que esta tela existe para tornar possível, não apenas para explicar.
 *
 * POR QUE ELA APARECE PARA TODO MUNDO, e não só para quem parece estar no
 * WhatsApp: a detecção por User-Agent ERRA (um iPhone real passou batido em
 * 15/08), e o custo de errar é assimétrico — um toque a mais para quem já estava
 * no navegador certo, contra um acesso queimado para quem não estava. No Android
 * a tela é rara: o `intent://` já entregou a navegação ao Chrome antes.
 *
 * ⚠️ Esta página NÃO autentica ninguém e não consome nada. É Server Component de
 * propósito — `useSearchParams` num client component de página exigiria Suspense
 * e não traria nada.
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
  const host = (await headers()).get('host') || 'app.vertho.ai';

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

        <div className="mt-8 rounded-xl border border-amber-300/25 bg-amber-300/[0.07] p-4">
          <p className="text-[13px] font-semibold text-amber-200">
            Vai usar o app instalado no celular?
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-300">
            Se você abriu esta tela dentro do WhatsApp, entre por aqui e a sessão
            vale <b>só nesta janela</b>. Para que o app instalado reconheça você,
            abra este endereço no navegador <b>antes</b> de tocar em Entrar:
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-slate-300">
            Toque em <b>•••</b> (canto superior) → <b>Abrir no Safari</b> (ou no
            seu navegador). O link continua valendo — nada foi usado ainda.
          </p>
        </div>

        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-[12px] uppercase tracking-wider text-slate-400">
            ou copie o endereço
          </p>
          <p className="mt-2 break-all font-mono text-[12px] text-slate-300">{link}</p>
          <CopiarLink link={link} />
        </div>

        <p className="mt-6 text-[13px] leading-relaxed text-slate-400">
          Prefere não abrir link? Peça um <b>código de acesso</b> na tela de login:
          ele chega por WhatsApp e funciona sem sair do lugar onde você já está.
        </p>
      </div>
    </main>
  );
}
