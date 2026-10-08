'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, ChartColumn, Check, Copy, Eye, MessageCircle, Route, Share2, TrendingUp, Users } from 'lucide-react';
import {
  OUTRO_DESAFIO_MAX,
  VISTOS_STORAGE_PREFIX,
  ehDesafio,
  resumoParaEncaminhar,
  type CopiaDaVersaoC,
  type DesafioChave,
  type IconeDoDesafio,
} from '@/lib/demo/degustacao-desafios';
import type { DesafioDoInicio } from '@/lib/demo/degustacao-hub';

/**
 * O início da versão C: a pessoa escolhe UM desafio, vê a resposta na sala e
 * volta aqui. Tudo que decide o texto depende do que ela já viu, e isso mora no
 * navegador do CONVITE: o clique nasce nesta página (a sala é outra origem, com
 * outro armazenamento), então é aqui que o "Visto" se grava.
 *
 * Sem JavaScript a página continua inteira: os cartões são links, o mapeamento e
 * o contato são formulários. O JavaScript só acrescenta o "Visto", a troca do
 * título e a mensagem do contato citando o que foi visto.
 */

const COR = {
  acento: '#34C5CC',
  texto: '#FFFFFF',
  texto2: 'rgba(255,255,255,0.74)',
  texto3: 'rgba(255,255,255,0.5)',
  card: 'rgba(255,255,255,0.045)',
  borda: 'rgba(255,255,255,0.10)',
  bordaAcento: 'rgba(52,197,204,0.35)',
} as const;

const SERIF = 'var(--vh-font-display)';

const ICONES: Record<IconeDoDesafio, typeof TrendingUp> = {
  resultado: TrendingUp,
  engajamento: Users,
  personalizacao: Route,
  gestao: Eye,
  diagnostico: ChartColumn,
};

function lerVistos(chave: string): DesafioChave[] {
  try {
    const bruto = window.localStorage.getItem(chave);
    const lista = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista.filter(ehDesafio) : [];
  } catch {
    return [];
  }
}

export default function DiagnosticoGuiado({ passe, codigo, primeiroNome, copia, desafios, contato, aviso, perfilFeito, children }: {
  passe: string;
  codigo: string;
  primeiroNome: string;
  copia: CopiaDaVersaoC;
  desafios: DesafioDoInicio[];
  contato: { titulo: string; botao: string };
  aviso: ReactNode;
  /** Fez o mapeamento: entra no resumo que o lead encaminha. */
  perfilFeito: boolean;
  /** O cartão do perfil comportamental (servidor), entre os desafios e o contato. */
  children: ReactNode;
}) {
  const chaveDoNavegador = `${VISTOS_STORAGE_PREFIX}:${codigo}`;
  // Nasce vazio e só lê depois do efeito: ler o storage na renderização faria o
  // servidor e o cliente discordarem no primeiro quadro.
  const [vistos, setVistos] = useState<DesafioChave[]>([]);
  const [outroAberto, setOutroAberto] = useState(false);
  const [outro, setOutro] = useState('');
  const [podeCompartilhar, setPodeCompartilhar] = useState(false);
  const [avisoResumo, setAvisoResumo] = useState('');

  useEffect(() => {
    setVistos(lerVistos(chaveDoNavegador));
  }, [chaveDoNavegador]);

  useEffect(() => {
    // Só o celular costuma ter o compartilhamento do sistema (WhatsApp, e-mail...).
    setPodeCompartilhar(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  function marcarVisto(chave: DesafioChave) {
    const atuais = lerVistos(chaveDoNavegador);
    const proximos = atuais.includes(chave) ? atuais : [...atuais, chave];
    setVistos(proximos);
    try {
      window.localStorage.setItem(chaveDoNavegador, JSON.stringify(proximos));
    } catch {
      /* sem storage o "Visto" some; a navegação segue igual */
    }
  }

  const jaViu = vistos.length > 0;
  // Na ordem em que a pessoa abriu. O texto leva só título e resposta de cada
  // desafio: nunca o código, o passe ou o nome (ver `resumoParaEncaminhar`).
  const itensVistos = vistos
    .map((chave) => desafios.find((desafio) => desafio.chave === chave))
    .filter((desafio): desafio is DesafioDoInicio => Boolean(desafio));
  const textoDoResumo = resumoParaEncaminhar(
    itensVistos.map((item) => ({ titulo: item.titulo, com: item.com })),
    { perfilFeito },
  );

  async function copiarResumo() {
    try {
      await navigator.clipboard.writeText(textoDoResumo);
      setAvisoResumo('Resumo copiado.');
      return;
    } catch {
      /* alguns navegadores embutidos recusam; tenta o caminho antigo */
    }
    try {
      const campo = document.createElement('textarea');
      campo.value = textoDoResumo;
      campo.setAttribute('readonly', '');
      campo.style.position = 'fixed';
      campo.style.opacity = '0';
      document.body.appendChild(campo);
      campo.select();
      const copiou = document.execCommand('copy');
      document.body.removeChild(campo);
      setAvisoResumo(copiou ? 'Resumo copiado.' : 'Não foi possível copiar aqui. Use Compartilhar, se estiver disponível.');
    } catch {
      setAvisoResumo('Não foi possível copiar aqui.');
    }
  }

  async function compartilharResumo() {
    try {
      await navigator.share({ title: 'Resumo da minha experiência com a Vertho', text: textoDoResumo });
    } catch {
      /* a pessoa cancelou o compartilhamento: não é erro */
    }
  }

  return (
    <>
      <p data-sentry-mask className="mt-9 text-[15px] lg:mt-14 lg:text-[17px]" style={{ color: COR.texto2 }}>
        {jaViu ? `Você já viu ${vistos.length} ${vistos.length === 1 ? 'desafio' : 'desafios'}` : `Olá, ${primeiroNome}`}
      </p>
      <h1
        className="mt-1 text-[38px] leading-[1.04] tracking-[-0.01em] lg:text-[58px]"
        style={{ fontFamily: SERIF, color: COR.texto }}
      >
        {jaViu ? (
          <>Quer ver <em style={{ color: COR.acento }}>outro desafio?</em></>
        ) : (
          <>{copia.tituloAntes}<em style={{ color: COR.acento }}>{copia.tituloDestaque}</em></>
        )}
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed lg:mt-4 lg:max-w-[640px] lg:text-[18px]" style={{ color: COR.texto2 }}>
        {jaViu
          ? 'Escolha outro desafio, ou fale com a gente quando quiser.'
          : 'Escolha o desafio que mais pesa e veja, com um exemplo funcionando, como a Vertho resolve. Depois você volta aqui e escolhe outro, se quiser.'}
      </p>

      {aviso}

      <section className="mt-8 lg:mt-12" aria-label="Desafios">
        <div data-layout="grade-desafios" className="grid gap-3 lg:grid-cols-6 lg:gap-4">
          {desafios.map((desafio, indice) => {
            const Icone = ICONES[desafio.icone];
            const visto = vistos.includes(desafio.chave);
            // Seis colunas: os três primeiros ocupam 2 e os dois últimos ocupam 3,
            // então a grade fecha sem cartão sozinho na linha. Classe por posição,
            // não variante arbitrária (`nth-child`), que o Tailwind pode não gerar.
            const largura = indice < 3 ? 'lg:col-span-2' : 'lg:col-span-3';
            return (
              <a
                key={desafio.chave}
                href={desafio.url}
                data-layout="cartao-desafio"
                data-desafio={desafio.chave}
                onClick={() => marcarVisto(desafio.chave)}
                className={`relative flex items-start gap-4 rounded-2xl border p-4 transition-colors hover:bg-white/[0.07] lg:flex-col lg:gap-5 lg:p-6 ${largura}`}
                style={{ background: COR.card, borderColor: visto ? COR.bordaAcento : COR.borda }}
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]"
                  style={{ background: 'rgba(52,197,204,0.12)', color: COR.acento }}
                >
                  <Icone size={20} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  {/* Só a linha do tema desvia da seta/selo "Visto" (canto superior direito); o
                      título usa a largura toda. `Medido 03/10/2026` no celular: reservar a
                      folga no bloco inteiro quebrava títulos de 3 linhas em 4. */}
                  <span className="block pr-16 text-[10.5px] font-bold uppercase tracking-[0.14em] lg:pr-0" style={{ color: COR.texto3 }}>{desafio.tema}</span>
                  <span className="mt-1 block text-[16px] font-semibold leading-snug lg:text-[17px]" style={{ color: COR.texto }}>{desafio.titulo}</span>
                </span>
                {visto ? (
                  <span
                    className="absolute right-3.5 top-3.5 inline-flex items-center gap-1 rounded-[10px] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em]"
                    style={{ background: 'rgba(52,197,204,0.12)', color: COR.acento }}
                  >
                    <Check size={12} strokeWidth={3} aria-hidden="true" /> Visto
                  </span>
                ) : (
                  <ArrowRight size={18} className="absolute right-4 top-4 shrink-0 lg:static lg:self-end" style={{ color: COR.acento }} aria-hidden="true" />
                )}
              </a>
            );
          })}
        </div>

        {outroAberto ? (
          <div className="mt-4 grid gap-2 lg:max-w-[640px]">
            <label htmlFor="outro-desafio" className="text-[13px]" style={{ color: COR.texto2 }}>Qual é o seu desafio?</label>
            <input
              id="outro-desafio"
              type="text"
              maxLength={OUTRO_DESAFIO_MAX}
              value={outro}
              onChange={(evento) => setOutro(evento.target.value)}
              placeholder="Escreva com as suas palavras"
              autoComplete="off"
              className="w-full rounded-[10px] border px-3.5 py-3 text-[15px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
              style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.22)', color: COR.texto }}
            />
            <p className="text-[12.5px]" style={{ color: COR.texto3 }}>Vai junto na mensagem, quando você falar com a gente.</p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                form="contato-c"
                disabled={outro.trim().length === 0}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-5 text-[14px] font-bold disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: 'transparent', color: COR.texto, border: `1px solid ${COR.bordaAcento}` }}
              >
                <MessageCircle size={16} aria-hidden="true" />
                Falar com a Vertho sobre isso
              </button>
              <button
                type="button"
                onClick={() => setOutroAberto(false)}
                className="min-h-11 px-2 text-[13.5px] underline underline-offset-4"
                style={{ color: COR.texto2 }}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOutroAberto(true)}
            className="mt-3 min-h-11 px-1 text-[14px] underline underline-offset-4"
            style={{ color: COR.texto2 }}
          >
            Não está na lista? Conte o seu desafio
          </button>
        )}
      </section>

      {jaViu && (
        <section className="mt-8 lg:mt-12" aria-label="Seu resumo" data-layout="resumo">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] lg:mb-4" style={{ color: COR.acento }}>Seu resumo</p>
          <div className="rounded-2xl border p-5 lg:p-8" style={{ background: COR.card, borderColor: COR.borda }}>
            <h2 className="text-[20px] font-bold lg:text-[22px]" style={{ color: COR.texto }}>O que você viu</h2>
            <ul className="mt-4 grid gap-3">
              {itensVistos.map((item) => (
                <li key={item.chave} className="flex items-start gap-3 text-[14.5px] leading-snug" style={{ color: COR.texto }}>
                  <Check size={16} strokeWidth={3} className="mt-0.5 shrink-0" style={{ color: COR.acento }} aria-hidden="true" />
                  <span>
                    {item.titulo}
                    <small className="mt-0.5 block text-[13px] leading-snug" style={{ color: COR.texto2 }}>Com a Vertho: {item.com}</small>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[13.5px] leading-relaxed" style={{ color: COR.texto2 }}>
              Leve para quem decide com você. O resumo não leva o seu link de acesso.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={copiarResumo}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-5 text-[14px] font-bold"
                style={{ background: 'transparent', color: COR.texto, border: `1px solid ${COR.bordaAcento}` }}
              >
                <Copy size={16} aria-hidden="true" />
                Copiar resumo
              </button>
              {podeCompartilhar && (
                <button
                  type="button"
                  onClick={compartilharResumo}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-5 text-[14px] font-bold"
                  style={{ background: 'transparent', color: COR.texto, border: `1px solid ${COR.borda}` }}
                >
                  <Share2 size={16} aria-hidden="true" />
                  Compartilhar
                </button>
              )}
            </div>
            <p role="status" aria-live="polite" className="mt-2 min-h-5 text-[13px]" style={{ color: COR.acento }}>{avisoResumo}</p>
          </div>
        </section>
      )}

      {children}

      <section id="proximo-passo" className="mt-8 scroll-mt-4 lg:mt-12" aria-label="Falar com a Vertho">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] lg:mb-4" style={{ color: COR.acento }}>Próximo passo</p>
        <div
          data-layout="cartao-contato"
          className="rounded-2xl border p-5 lg:grid lg:grid-cols-[1fr_300px] lg:items-center lg:gap-10 lg:p-8"
          style={{ background: COR.card, borderColor: COR.borda }}
        >
          <div>
            <h2 className="text-[20px] font-bold lg:text-[22px]" style={{ color: COR.texto }}>{contato.titulo}</h2>
            <p className="mt-1.5 text-[14px] leading-relaxed lg:text-[15px]" style={{ color: COR.texto2 }}>
              Converse com a gente sobre como aplicar a Vertho à realidade da sua equipe. A mensagem já vai escrita{jaViu ? ', com os desafios que você viu' : ''}.
            </p>
          </div>
          <form id="contato-c" action="/auth/degustacao/contato" method="post" target="_blank" rel="noopener">
            <input type="hidden" name="passe" value={passe} />
            <input type="hidden" name="dores" value={vistos.join(',')} />
            <input type="hidden" name="outro" value={outroAberto ? outro : ''} />
            <button
              type="submit"
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-center text-[15px] font-bold transition-transform active:scale-[0.99] lg:mt-0"
              style={{ background: 'transparent', color: COR.texto, border: `1px solid ${COR.bordaAcento}` }}
            >
              <MessageCircle size={17} className="shrink-0" aria-hidden="true" />
              {contato.botao}
            </button>
          </form>
        </div>
      </section>
    </>
  );
}
