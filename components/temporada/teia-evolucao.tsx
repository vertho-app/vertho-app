'use client';

import { useTranslations } from 'next-intl';
import { montarTeia, NOTA_MAX, NOTA_MIN } from '@/lib/season-engine/teia-evolucao';

/**
 * A geometria da teia da TELA, exportada para que o guard meça os mesmos
 * números que o componente desenha — número mágico repetido no teste casa
 * "outra coisa" no dia em que o layout muda.
 */
export const GEOMETRIA_TELA = { centro: { x: 250, y: 148 }, raio: 104, folgaRotulo: 16, larguraRotulo: 20 };

/**
 * A teia da competência na TELA (SVG inline, sem biblioteca de gráfico — o
 * produto não tem nenhuma, e o radar do perfil comportamental já era desenhado
 * assim).
 *
 * Geometria e piso vêm do núcleo (`lib/season-engine/teia-evolucao`), o mesmo
 * que o PDF usa: as duas superfícies não podem desenhar o mesmo relatório com
 * réguas diferentes.
 *
 * Cores validadas pelo `scripts/validate_palette.js` da skill `dataviz` contra
 * a superfície escura das telas (`#111F36`): `#3B82F6` × `#059669` passa nos
 * seis checks (ΔE 22,7 em deuteranopia). O par navy × verde do PAPEL reprova
 * aqui — cor de série se valida por superfície, não por marca.
 * A identidade nunca fica só na cor: o início é TRACEJADO, o fim é sólido, e
 * há legenda. A lista de comportamentos logo abaixo é a versão em texto do
 * mesmo dado.
 */
export default function TeiaEvolucao({
  descritores,
  competencia,
}: {
  descritores: any[];
  competencia?: string | null;
}) {
  const t = useTranslations('SeasonDone');
  const teia = montarTeia(descritores, GEOMETRIA_TELA);
  // Menos de 3 comportamentos medidos: não há teia, e a lista abaixo já conta
  // a mesma história.
  if (!teia) return null;

  const INICIO = '#3B82F6';
  const FIM = '#059669';

  return (
    <figure className="mb-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-2 py-3">
      <svg
        viewBox="0 0 500 300"
        className="w-full max-w-[560px] mx-auto block"
        role="img"
        aria-label={t('chart.alt', { competency: competencia || '' })}
      >
        {/* Grade recessiva: anéis dos níveis e um raio por comportamento. */}
        {teia.aneis.map((anel) => (
          <polygon
            key={anel.valor}
            points={anel.pontos}
            fill="none"
            stroke="rgba(255,255,255,0.10)"
            strokeWidth="0.8"
          />
        ))}
        {teia.eixos.map((eixo, i) => (
          <line
            key={i}
            x1={teia.centro.x}
            y1={teia.centro.y}
            x2={eixo.vertice.x}
            y2={eixo.vertice.y}
            stroke="rgba(255,255,255,0.07)"
            strokeWidth="0.8"
          />
        ))}
        {/* O fechamento preenchido; o diagnóstico por cima, tracejado, para as
            duas linhas se lerem quando coincidem. */}
        <polygon points={teia.poligonoFim} fill={FIM} fillOpacity="0.16" stroke={FIM} strokeWidth="2" />
        <polygon
          points={teia.poligonoInicio}
          fill="none"
          stroke={INICIO}
          strokeWidth="2"
          strokeDasharray="5 3"
        />
        {teia.eixos.map((eixo, i) => (
          <circle key={i} cx={eixo.pontoFim.x} cy={eixo.pontoFim.y} r="4" fill={FIM} stroke="#0B1D32" strokeWidth="1.5" />
        ))}

        {/* Os números dos níveis vêm DEPOIS dos polígonos, com um halo da cor do
            fundo: desenhados antes, o marcador do vértice cobria o "2" (visto na
            captura da segunda competência de um relatório real, 17/09/2026). */}
        {teia.aneis.map((anel) => (
          <text
            key={anel.valor}
            x={anel.rotuloEm.x + 7}
            y={anel.rotuloEm.y + 3}
            fill="rgba(255,255,255,0.45)"
            fontSize="10"
            stroke="#0F2A4A"
            strokeWidth="3"
            paintOrder="stroke"
          >
            {anel.valor}
          </text>
        ))}

        {/* Rótulos: texto em tinta de texto, nunca na cor da série. */}
        {teia.eixos.map((eixo, i) =>
          eixo.linhas.map((linha, l) => (
            <text
              key={`${i}-${l}`}
              x={eixo.pontoRotulo.x}
              y={eixo.pontoRotulo.y + 3 + (l - (eixo.linhas.length - 1) / 2) * 12.5}
              textAnchor={eixo.ancora}
              fill="rgba(255,255,255,0.68)"
              fontSize="12"
            >
              {linha}
            </text>
          )),
        )}
      </svg>

      <figcaption className="mt-1 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[11px] text-gray-400">
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden="true">
            <line x1="0" y1="4" x2="18" y2="4" stroke={INICIO} strokeWidth="2" strokeDasharray="5 3" />
          </svg>
          {t('chart.legendStart')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden="true">
            <line x1="0" y1="4" x2="18" y2="4" stroke={FIM} strokeWidth="2" />
          </svg>
          {t('chart.legendEnd')}
        </span>
        <span>{t('chart.scale', { min: NOTA_MIN, max: NOTA_MAX })}</span>
      </figcaption>
      <p className="mt-1 text-center text-[11px] text-gray-500">{t('chart.note')}</p>
    </figure>
  );
}
