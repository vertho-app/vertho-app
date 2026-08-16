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
 * 🔑 UM TOQUE, E POR QUÊ (revisto no mesmo dia)
 * ────────────────────────────────────────────
 * Houve uma versão intermediária que, dentro do WhatsApp, promovia
 * "•••  → Abrir no Safari" a caminho principal, com três passos numerados. Ela
 * era tecnicamente correta e **burocrática** — e estava errada no DEFAULT: o
 * problema que ela resolve é de quem usa o **PWA instalado**, uma minoria.
 *
 * Para todo o resto, entrar dentro do WhatsApp não é um consolo, é o caminho
 * coerente: o navegador embutido guarda a sessão, então o link da semana
 * seguinte abre na mesma janela já logado. Cobrar de 400 pessoas um menu de três
 * passos para atender a poucas é transformar a exceção em regra.
 *
 * Então: "Entrar agora" é o botão, para todo mundo. A saída para o navegador
 * fica num `<details>` fechado, com a consequência escrita — visível para quem
 * precisa, invisível para quem não precisa.
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
          // Discreto de propósito. Entrar aqui mesmo funciona e continua
          // funcionando: o navegador do WhatsApp guarda a sessão, então o link da
          // semana seguinte abre nesta mesma janela já logado. Quem precisa do
          // navegador de verdade é a MINORIA que usa o app instalado — e para
          // essa minoria a saída fica visível, sem virar pedágio de todo mundo.
          <details className="mt-6 rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <summary className="cursor-pointer list-none text-[13px] text-slate-300">
              <span className="underline decoration-slate-600 underline-offset-4">
                Vai usar o app instalado na tela de início?
              </span>
            </summary>
            <p className="mt-3 text-[13px] leading-relaxed text-slate-400">
              Entrando por aqui, a sessão vale só dentro do WhatsApp. Para o app
              instalado reconhecer você, abra este endereço no {navegador}{' '}
              <b>antes</b> de tocar em Entrar — pelo menu <b>•••</b> no canto
              superior, ou copiando o endereço abaixo.
            </p>
            <p className="mt-3 break-all font-mono text-[12px] text-slate-400">{link}</p>
            <CopiarLink link={link} />
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
