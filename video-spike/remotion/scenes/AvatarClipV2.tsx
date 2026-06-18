import React from 'react';
import { AbsoluteFill, OffthreadVideo, useCurrentFrame, useVideoConfig } from 'remotion';
import { Brand, withAlpha } from '../theme';
import { reveal, fadeInOut, translateUp } from '../utils/timing';
import { BackgroundV2, EyebrowV2, INK, INK_DIM } from '../theme-v2';
import type { ComputedScene } from '../data/load-scenes';

// Faixa da direita reservada ao avatar (o resto é coluna de texto à esquerda).
// 0.62: faixa mais larga → o vídeo 16:9 sofre menos corte horizontal (cover numa
// faixa quase quadrada cortava ~45% da largura e comia o lado direito da pessoa).
const AVATAR_W = 0.62;
// Enquadramento: a mentora (Talking Photo aberto) fica no centro-direita do quadro
// 16:9; ancorar o crop à DIREITA mantém o ombro/braço direito dela dentro da cena.
const FACE_POS = '78% 34%';

/**
 * Avatar V2 com SAFE AREA: o MP4 ocupa só a faixa direita (com áudio próprio);
 * o texto vive numa coluna à esquerda. Nada de título/subtítulo sobre o rosto.
 */
export const AvatarClipV2: React.FC<{ scene: ComputedScene; brand: Brand; kicker: string; emphasizeSubtitle?: boolean }> = ({ scene, brand, kicker, emphasizeSubtitle }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const enter = fadeInOut(frame, durationInFrames, 18, 20);
  const tIn = reveal(frame, 10, 28);
  const ruleIn = reveal(frame, 24, 26);
  const sIn = reveal(frame, 30, 28);

  return (
    <AbsoluteFill style={{ backgroundColor: brand.background }}>
      <BackgroundV2 brand={brand} tone="deep" />

      {/* Avatar na faixa direita */}
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${AVATAR_W * 100}%`, overflow: 'hidden' }}>
        {scene.src && (
          // muted: o áudio vem do <Audio> (mp3) na composição — alinhado pelo Remotion
          // (o áudio embutido do OffthreadVideo entrava com um pequeno offset).
          <OffthreadVideo src={scene.src} muted style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: FACE_POS }} />
        )}
        {/* esfumado da borda esquerda → mistura no fundo (sem corte duro) */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 480, background: `linear-gradient(90deg, ${brand.background} 0%, ${withAlpha(brand.background, 0.55)} 48%, transparent 100%)` }} />
        {/* respiro inferior p/ a legenda */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 320, background: `linear-gradient(0deg, ${withAlpha('#04101f', 0.55)} 0%, transparent 100%)` }} />
      </div>

      {/* Coluna de texto à esquerda (centralizada na vertical) */}
      <div style={{ position: 'absolute', left: 132, top: 0, bottom: 0, width: '42%', display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: enter }}>
        <EyebrowV2 brand={brand}>{kicker}</EyebrowV2>
        <h1
          style={{
            margin: '28px 0 0',
            color: INK,
            fontSize: 104,
            fontWeight: 800,
            lineHeight: 1.0,
            letterSpacing: -2.2,
            opacity: tIn,
            transform: translateUp(tIn, 44),
          }}
        >
          {scene.title}
        </h1>
        <div style={{ height: 4, width: ruleIn * 132, marginTop: 28, borderRadius: 2, background: `linear-gradient(90deg, ${brand.primary}, ${withAlpha(brand.primary, 0)})` }} />
        <p
          style={{
            margin: '30px 0 0',
            color: emphasizeSubtitle ? INK : INK_DIM,
            fontSize: emphasizeSubtitle ? 52 : 44,
            fontWeight: emphasizeSubtitle ? 600 : 500,
            lineHeight: 1.22,
            maxWidth: 720,
            opacity: sIn,
            transform: translateUp(sIn, 28),
          }}
        >
          {scene.subtitle}
        </p>
      </div>
    </AbsoluteFill>
  );
};
