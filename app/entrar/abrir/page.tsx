import { headers } from 'next/headers';
import Link from 'next/link';
import { lerParametroAcesso } from '@/lib/auth/magic-link-whatsapp';
import { ehNavegadorEmbutido, ehIos } from '@/lib/auth/navegador-embutido';
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
 * Enquanto ninguém toca em "Entrar", a URL continua redimível. Trocar de
 * navegador ANTES de entrar passa a funcionar.
 *
 * 🔴 POR QUE A HIERARQUIA MUDA DENTRO DO WHATSAPP (medido 30 min depois)
 * ─────────────────────────────────────────────────────────────────────
 * A primeira versão desta tela oferecia "Entrar agora" como botão principal para
 * todo mundo, com a instrução do navegador num aviso ao lado. O teste em
 * aparelho real seguiu exatamente o que o botão pedia: `/auth/callback` com
 * sucesso às 01:17:58 (dentro do WhatsApp), e as duas tentativas seguintes, já
 * no navegador, com `Email link is invalid or has expired`.
 *
 * A tela funcionava e **convidava ao erro**. Onde o toque errado é
 * irreversível, a hierarquia visual não é estética — é a trava. Dentro do app
 * embutido, sair para o navegador vira a ação principal e entrar ali mesmo vira
 * uma escolha secundária, dita com a consequência junto.
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
  const navegador = ehIos(ua) ? 'Safari' : 'Chrome';

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
          <h1 className="text-[22px] font-semibold leading-tight">
            Abra no {navegador} para entrar
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-slate-300">
            Esta tela está dentro do WhatsApp. O link só pode ser usado{' '}
            <b>uma vez</b> — se você entrar por aqui, a sessão vale só nesta
            janela e o app instalado continuará pedindo login.
          </p>

          <ol className="mt-6 space-y-3 text-[14px] text-slate-200">
            <li className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cyan-300 text-[12px] font-bold text-slate-950">1</span>
              <span>Toque em <b>•••</b> (canto superior direito desta tela)</span>
            </li>
            <li className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cyan-300 text-[12px] font-bold text-slate-950">2</span>
              <span>Escolha <b>Abrir no {navegador}</b></span>
            </li>
            <li className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cyan-300 text-[12px] font-bold text-slate-950">3</span>
              <span>Lá, toque em <b>Entrar agora</b> — o link ainda está intacto</span>
            </li>
          </ol>

          <div className="mt-7 rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[12px] uppercase tracking-wider text-slate-400">
              não achou o menu? copie o endereço
            </p>
            <p className="mt-2 break-all font-mono text-[12px] text-slate-300">{link}</p>
            <CopiarLink link={link} />
          </div>

          {/* Secundário de propósito: existe para quem só quer usar agora, e diz
              a consequência na própria etiqueta. */}
          <a
            href={entrar}
            className="mt-7 block text-center text-[13px] text-slate-400 underline decoration-slate-600 underline-offset-4"
          >
            Entrar aqui mesmo (a sessão fica só nesta janela)
          </a>

          <p className="mt-6 text-[13px] leading-relaxed text-slate-400">
            Prefere não abrir link? Peça um <b>código de acesso</b> na tela de
            login: ele chega por WhatsApp e funciona sem sair daqui.
          </p>
        </div>
      </main>
    );
  }

  // Navegador de verdade (ou app embutido que não conseguimos identificar): a
  // ação principal é entrar, sem ruído.
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

        <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-[12px] uppercase tracking-wider text-slate-400">
            abrindo em outro aparelho? copie o endereço
          </p>
          <p className="mt-2 break-all font-mono text-[12px] text-slate-300">{link}</p>
          <CopiarLink link={link} />
        </div>
      </div>
    </main>
  );
}
