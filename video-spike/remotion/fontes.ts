import { useEffect, useState } from 'react';
import { cancelRender, continueRender, delayRender, staticFile } from 'remotion';

/**
 * Fontes da marca DENTRO do bundle, carregadas antes do primeiro quadro.
 *
 * O vídeo pedia `Inter, "Segoe UI", system-ui, sans-serif`, e a box de render (imagem Debian slim, só com a Liberation)
 * não tem nenhuma delas: o Chrome caía na fonte de sistema que sobrasse. `Medido 18/10/2026` nas boxes 440722280 e
 * 445078579: títulos e legendas MONOESPAÇADOS e a saudação "Olá, {nome}" em SERIFA; o mesmo bundle no Ubuntu do WSL
 * saía em DejaVu Sans. Ou seja, a cara do vídeo dependia da máquina. Agora são as fontes do brand book (Codec Extra Bold
 * nos títulos, Roboto no resto), as mesmas do miolo da biblioteca v7 (`worker-hetzner/video-v7`).
 *
 * A espera vive no CICLO DO COMPONENTE (`useFontesDaMarca`, chamado na raiz das composições), não no topo do módulo.
 * `Medido 18/10/2026`: com o `delayRender` no topo, o `renderStill` passava (acaba em 5 s) e o `renderMedia` da box
 * morria no quadro 152 com "delayRender() 'fontes da marca' was called but not cleared", o tempo-limite de ~28 s do
 * Remotion: a espera criada no carregamento do módulo não era liberada durante o render longo.
 *
 * Falha ao carregar ABORTA o render (cancelRender): seguir renderizaria o vídeo na fonte errada sem ninguém ver.
 */
export const FONTE_TEXTO = '"Roboto", "Liberation Sans", Arial, sans-serif';
export const FONTE_TITULO = `"Codec-ExtraBold", ${FONTE_TEXTO}`;

/** Arquivos em `public/video-spike/fontes` (publicDir do Remotion). O Roboto é variável (100-900), subset latino. */
export const FACES_DA_MARCA = [
  { familia: 'Codec-ExtraBold', arquivo: 'fontes/codec-cold-extrabold.woff2' },
  { familia: 'Roboto', arquivo: 'fontes/roboto.woff2' },
] as const;

let carga: Promise<void> | null = null;

/** Carrega e registra as faces UMA vez por página (cada aba do render tem a sua). */
function carregarFontesDaMarca(): Promise<void> {
  if (!carga) {
    carga = Promise.all(
      FACES_DA_MARCA.map(async ({ familia, arquivo }) => {
        // Faixa 100-900 declarada: o Codec tem um peso só, e sem a faixa o fontWeight 800 dos títulos viraria negrito sintético.
        const face = new FontFace(familia, `url('${staticFile(arquivo)}') format('woff2')`, { weight: '100 900', display: 'block' });
        await face.load();
        document.fonts.add(face);
      }),
    ).then(() => undefined);
  }
  return carga;
}

/** Segura o quadro até as fontes da marca carregarem. Chamar na RAIZ de cada composição que o worker renderiza. */
export function useFontesDaMarca(): void {
  const [espera] = useState(() => delayRender('fontes da marca'));
  useEffect(() => {
    carregarFontesDaMarca()
      .then(() => continueRender(espera))
      .catch((e) => cancelRender(new Error(`fontes da marca não carregaram: ${e instanceof Error ? e.message : String(e)}`)));
  }, [espera]);
}
