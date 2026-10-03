'use client';

/**
 * O painel da CENA da degustação versão C: o desafio que o lead escolheu, o que
 * olhar nesta tela e as duas saídas (falar com a Vertho, ou voltar e escolher
 * outro desafio).
 *
 * Aparece SÓ para quem chegou pelo convite C (a rota da sala carrega a chave do
 * desafio na URL; ela é guardada na sessão do navegador da sala), SÓ no caminho
 * daquela cena, e some quando a pessoa dispensa. Sem storage, não aparece e o
 * produto continua igual. Os pontos ficam ao lado da tela e não sobre elementos
 * dela: pino ancorado num elemento da tela quebra no primeiro ajuste de layout.
 *
 * ⚠️ Os dois lados precisam do código do convite e do ticket da sala, e ambos
 * vêm da URL na primeira tela e do storage depois. Quem os grava (a barra e o
 * seletor da sala) roda num efeito que vem DEPOIS dos efeitos dos filhos, então
 * o primeiro candidato bem formado vale (mesma regra de `OrientacaoDaDegustacao`).
 */
import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ArrowRight, ChevronDown, ChevronUp, MessageCircle, X } from 'lucide-react';
import DemoExplorationBeacon from '@/components/dashboard/demo-exploration-beacon';
import GravacaoDaDegustacao from '@/app/degustacao/gravacao-da-degustacao';
import {
  CODIGO_CURTO_PATTERN,
  DEMO_PRESENTATION_RETURN_PARAM,
  DEMO_PRESENTATION_RETURN_STORAGE_KEY,
  DEMO_PRESENTATION_TICKET_PARAM,
  DEMO_PRESENTATION_TICKET_STORAGE_KEY,
  linkDaPaginaDeBoasVindas,
} from '@/lib/demo/presentation';
import { naCasaDoPapel, primeiroCodigoDeConvidado } from '@/lib/demo/degustacao-orientacao';
import {
  CENA_PARAM,
  CENA_STORAGE_KEY,
  alvoDoDesafio,
  ehDesafio,
  type DesafioChave,
} from '@/lib/demo/degustacao-desafios';

const CHAVE_DISPENSA = 'vertho-degustacao-cena-dispensada';

export type CenaParaOPainel = {
  chave: DesafioChave;
  /** Caminho da tela sem query: é com ele que o `pathname` é comparado. */
  caminhoBase: string;
  /** Query que a tela exige (ex.: `document=organization-dna`). */
  consulta: Record<string, string>;
  titulo: string;
  pontos: readonly string[];
  emGeral: string;
  com: string;
};

function lerStorage(chave: string): string | null {
  try {
    return window.sessionStorage.getItem(chave);
  } catch {
    return null;
  }
}

export default function CenaDaDegustacao({ tenantSlug, minhaCasa, cenas }: {
  tenantSlug: string;
  /** "na minha empresa", "na minha rede": escrito por extenso de cada ambiente. */
  minhaCasa: string;
  cenas: CenaParaOPainel[];
}) {
  const pathname = usePathname();
  const parametros = useSearchParams();
  // Nasce escondida e só aparece depois do efeito: ler o storage durante a
  // renderização faria o servidor e o cliente discordarem no primeiro quadro.
  const [chave, setChave] = useState<DesafioChave | null>(null);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [ticket, setTicket] = useState<string | null>(null);
  const [dispensada, setDispensada] = useState(false);
  const [recolhida, setRecolhida] = useState<boolean | null>(null);

  useEffect(() => {
    const url = new URLSearchParams(window.location.search);
    const daUrl = url.get(CENA_PARAM);
    const candidata = [daUrl, lerStorage(CENA_STORAGE_KEY)].find(
      (valor): valor is DesafioChave => ehDesafio(valor) && cenas.some((cena) => cena.chave === valor),
    ) ?? null;
    if (candidata && candidata === daUrl) {
      try {
        window.sessionStorage.setItem(CENA_STORAGE_KEY, candidata);
      } catch {
        /* sem storage vale para esta tela */
      }
    }
    setChave(candidata);
    setCodigo(primeiroCodigoDeConvidado(
      [url.get(DEMO_PRESENTATION_RETURN_PARAM), lerStorage(DEMO_PRESENTATION_RETURN_STORAGE_KEY)],
      CODIGO_CURTO_PATTERN,
    ));
    setTicket(url.get(DEMO_PRESENTATION_TICKET_PARAM) || lerStorage(DEMO_PRESENTATION_TICKET_STORAGE_KEY));
    setDispensada(candidata ? lerStorage(`${CHAVE_DISPENSA}:${candidata}`) === '1' : false);
    // `pathname` entra de propósito: a pessoa volta para esta tela depois de
    // navegar, e o painel precisa ser reavaliado ali.
  }, [cenas, pathname]);

  useEffect(() => {
    // Em tela larga o painel abre aberto; no celular ele abre recolhido, para não
    // empurrar a tela que a pessoa veio ver para fora da primeira dobra.
    setRecolhida((atual) => (atual === null ? !window.matchMedia('(min-width: 1024px)').matches : atual));
  }, []);

  const cena = chave ? cenas.find((item) => item.chave === chave) ?? null : null;
  // A gravação acompanha a pessoa pela sala INTEIRA (não só na tela da cena) e só
  // existe para quem chegou por um desafio da versão C. Fica fora do painel
  // para não depender de a pessoa estar na tela dele.
  const gravacao = <GravacaoDaDegustacao codigo={chave ? codigo : null} onde="sala" />;
  const mostrarPainel = Boolean(cena && codigo) && !dispensada
    && naCasaDoPapel(pathname, cena!.caminhoBase)
    && Object.entries(cena!.consulta).every(([nome, valor]) => parametros.get(nome) === valor);
  // Fragmento nos DOIS ramos: a gravação é sempre o primeiro filho e não
  // desmonta ao entrar e sair da tela da cena (desmontar reiniciaria o efeito).
  if (!mostrarPainel || !cena || !codigo) return <>{gravacao}</>;

  const inicio = linkDaPaginaDeBoasVindas(tenantSlug, codigo);

  function dispensar() {
    setDispensada(true);
    try {
      window.sessionStorage.setItem(`${CHAVE_DISPENSA}:${cena!.chave}`, '1');
    } catch {
      /* dispensar sem storage vale para esta tela */
    }
  }

  return (
    <>
    {gravacao}
    <div data-degustacao="cena" data-desafio={cena.chave} className="mb-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5">
      <DemoExplorationBeacon alvo={alvoDoDesafio(cena.chave)} />
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/45">Seu desafio</p>
          <p className="mt-1 text-[15px] font-semibold leading-snug text-white">“{cena.titulo}”</p>
        </div>
        <button
          type="button"
          onClick={() => setRecolhida(!recolhida)}
          aria-expanded={!recolhida}
          className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-[12.5px] font-semibold text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          {recolhida ? <>O que observar <ChevronDown size={15} aria-hidden="true" /></> : <>Recolher <ChevronUp size={15} aria-hidden="true" /></>}
        </button>
        <button
          type="button"
          onClick={dispensar}
          aria-label="Dispensar este painel"
          title="Dispensar este painel"
          className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/70"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>

      {!recolhida && (
        <div className="mt-3 grid gap-4 lg:grid-cols-[1.3fr_1fr] lg:gap-6">
          <ol className="grid gap-2.5">
            {cena.pontos.map((ponto, indice) => (
              <li key={ponto} className="flex items-start gap-2.5 text-[13.5px] leading-relaxed text-white/80">
                <span
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold"
                  style={{ background: 'var(--brand-400, #34C5CC)', color: '#04212B' }}
                >
                  {indice + 1}
                </span>
                <span>{ponto}</span>
              </li>
            ))}
          </ol>
          <div className="grid gap-2 text-[13px] leading-snug">
            <p className="rounded-[10px] border border-white/10 px-3 py-2.5 text-white/65">
              <b className="mb-0.5 block text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/40">Em geral</b>
              {cena.emGeral}
            </p>
            <p className="rounded-[10px] border px-3 py-2.5 text-white" style={{ borderColor: 'rgba(52,197,204,0.4)', background: 'rgba(52,197,204,0.1)' }}>
              <b className="mb-0.5 block text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--brand-300, #67d6dc)' }}>Com a Vertho</b>
              {cena.com}
            </p>
          </div>
        </div>
      )}
      {!recolhida && (
        <p className="mt-3 text-[12px] text-white/40">Estes são dados de exemplo, de um ambiente de demonstração.</p>
      )}

      <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
        <form action="/auth/degustacao/contato-sala" method="post" target="_blank" rel="noopener">
          <input type="hidden" name="ticket" value={ticket ?? ''} />
          <input type="hidden" name="desafio" value={cena.chave} />
          <button
            type="submit"
            disabled={!ticket}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-[13.5px] font-bold transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'var(--brand-400, #34C5CC)', color: '#04212B' }}
          >
            <MessageCircle size={16} aria-hidden="true" />
            Quero ver isso {minhaCasa}
          </button>
        </form>
        {inicio ? (
          <a
            href={inicio}
            target="_top"
            data-degustacao="outro-desafio"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-[13.5px] font-semibold text-white/85 transition-colors hover:border-white/30 hover:bg-white/[0.06]"
          >
            Ver outro desafio
            <ArrowRight size={15} aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </div>
    </>
  );
}
