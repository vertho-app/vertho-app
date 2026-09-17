'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ExternalLink, Maximize2, X } from 'lucide-react';

/**
 * Foto e áudio dentro da conversa.
 *
 * Dois defeitos medidos em 17/09/2026 motivam este arquivo:
 *
 * 1. **Falha muda.** Quando o arquivo não vinha, a tela mostrava o ícone de
 *    imagem quebrada ou um player "0:00" que não tocava, e nada dizia por quê.
 *    A atendente escreveu à pessoa "não consegui abrir a imagem que você me
 *    enviou". Agora a falha vira frase, com o motivo que o servidor sabe
 *    (arquivo apagado pelo WhatsApp é diferente de falha de rede).
 * 2. **Imagem ilegível.** Print de celular é alto e estreito: limitado a 208 px
 *    de altura, a tela de uma lista de nomes virava uma faixa de 100 px de
 *    largura. A miniatura cresceu e abre em tela cheia com um clique. Ajustado
 *    à altura da tela, um print de 1600 px ainda sai a ~40%, então um segundo
 *    clique mostra o tamanho real, com rolagem.
 */

interface Falha {
  texto: string;
  /** O servidor TEM o arquivo; quem não conseguiu foi o navegador (formato). */
  arquivoExiste: boolean;
}

/**
 * Pergunta ao servidor POR QUE a mídia não carregou.
 *
 * `<img>` e `<audio>` só avisam "erro", sem status. A rota responde JSON com a
 * frase certa (410 = apagado, 502 = rede); com `redirect: 'manual'` a pergunta
 * não baixa o arquivo quando ele existe, e aí o problema é o formato, não o
 * arquivo.
 */
async function motivoDaFalha(src: string, rotulo: string): Promise<Falha> {
  try {
    const res = await fetch(src, { redirect: 'manual', cache: 'no-store' });
    if (res.type === 'opaqueredirect' || res.ok) {
      return {
        texto: `O arquivo existe, mas o navegador não conseguiu exibir este ${rotulo}.`,
        arquivoExiste: true,
      };
    }
    const json = await res.json().catch(() => null);
    if (json?.error) return { texto: String(json.error), arquivoExiste: false };
    return { texto: `Não foi possível carregar este ${rotulo} (HTTP ${res.status}).`, arquivoExiste: false };
  } catch {
    return {
      texto: `Não foi possível carregar este ${rotulo}. Verifique a conexão e atualize a conversa.`,
      arquivoExiste: false,
    };
  }
}

function useFalha(src: string, rotulo: string) {
  // A falha vale para a URL em que aconteceu: outra mídia no mesmo componente
  // começa limpa, sem precisar de efeito para zerar.
  const [registro, setRegistro] = useState<{ src: string; falha: Falha } | null>(null);
  const aoFalhar = () => {
    setRegistro({ src, falha: { texto: 'Verificando o arquivo…', arquivoExiste: false } });
    motivoDaFalha(src, rotulo).then((falha) => setRegistro({ src, falha }));
  };
  return { falha: registro?.src === src ? registro.falha : null, aoFalhar };
}

function MidiaIndisponivel({ falha, src }: { falha: Falha; src: string }) {
  const { texto: motivo, arquivoExiste } = falha;
  return (
    <div className="flex max-w-sm items-start gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px] text-[var(--ink-dim)]">
      <AlertTriangle size={13} className="mt-0.5 shrink-0 text-[var(--ink-faint)]" />
      <span>
        {motivo}
        {arquivoExiste && (
          <>
            {' '}
            <a href={src} target="_blank" rel="noreferrer" className="underline">
              abrir em nova aba
            </a>
          </>
        )}
      </span>
    </div>
  );
}

export function ImagemDaConversa({ src, alt }: { src: string; alt: string }) {
  const [ampliada, setAmpliada] = useState(false);
  const [tamanhoReal, setTamanhoReal] = useState(false);
  const { falha, aoFalhar } = useFalha(src, 'imagem');

  const fechar = () => {
    setAmpliada(false);
    setTamanhoReal(false);
  };

  useEffect(() => {
    if (!ampliada) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [ampliada]);

  if (falha) return <MidiaIndisponivel falha={falha} src={src} />;

  return (
    <>
      <button
        type="button"
        onClick={() => setAmpliada(true)}
        className="group relative mb-1 block cursor-zoom-in overflow-hidden rounded-lg"
        aria-label="Ampliar imagem"
        title="Clique para ampliar"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={alt} src={src} onError={aoFalhar} className="block max-h-96 max-w-full rounded-lg" />
        <span className="absolute right-1.5 top-1.5 rounded-md bg-black/60 p-1 text-white opacity-80 transition-opacity group-hover:opacity-100">
          <Maximize2 size={13} />
        </span>
      </button>

      {/*
        Portal para o <body>: dentro da bolha, um ancestral com transform ou
        backdrop-filter prenderia o `fixed` à caixa da conversa em vez da tela.
      */}
      {ampliada && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Imagem ampliada"
          className="fixed inset-0 z-[90] flex flex-col bg-[#030a14f0] p-3 sm:p-6"
          onClick={fechar}
        >
          <div className="mb-2 flex shrink-0 items-center justify-end gap-2">
            <span className="mr-auto hidden text-[12px] text-white/60 sm:inline">
              {tamanhoReal ? 'Clique na imagem para ajustar à tela' : 'Clique na imagem para ver em tamanho real'}
            </span>
            <a
              href={src}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ExternalLink size={13} /> Abrir em nova aba
            </a>
            <button
              type="button"
              onClick={fechar}
              aria-label="Fechar"
              autoFocus
              className="rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
          {/*
            Em tamanho real a caixa ROLA e não centraliza: centralizar com flex
            um conteúdo maior que a caixa corta o topo e a esquerda, que ficam
            fora do alcance da barra de rolagem.
          */}
          <div
            className={`min-h-0 flex-1 ${tamanhoReal ? 'overflow-auto' : 'flex items-center justify-center'}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={alt}
              src={src}
              onClick={(e) => {
                e.stopPropagation();
                setTamanhoReal((v) => !v);
              }}
              className={
                tamanhoReal
                  ? 'mx-auto block max-w-none cursor-zoom-out rounded-lg'
                  : 'max-h-full max-w-full cursor-zoom-in rounded-lg object-contain'
              }
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export function AudioDaConversa({ src }: { src: string }) {
  const { falha, aoFalhar } = useFalha(src, 'áudio');
  if (falha) return <MidiaIndisponivel falha={falha} src={src} />;
  // `metadata`, não `none`: com `none` o player nascia "0:00 / 0:00" igual para
  // áudio bom e para áudio que não existe, e a falha só aparecia depois do play.
  return <audio controls preload="metadata" className="h-8 max-w-full" src={src} onError={aoFalhar} />;
}
