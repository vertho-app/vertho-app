import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Radar Vertho — Sua escola ou rede já sabe onde precisa agir primeiro?';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: '70px',
          background:
            'radial-gradient(800px 500px at 88% 0%, rgba(52,197,204,.18), transparent 55%),' +
            'radial-gradient(700px 500px at 0% 70%, rgba(154,226,230,.10), transparent 60%),' +
            'linear-gradient(180deg,#06172C 0%,#0F2B54 100%)',
          fontFamily: 'sans-serif',
          color: 'white',
          position: 'relative',
        }}
      >
        {/* Decorative ring */}
        <div
          style={{
            position: 'absolute',
            right: -160,
            top: -120,
            width: 460,
            height: 460,
            border: '46px solid rgba(52,197,204,0.10)',
            borderRadius: 9999,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: -100,
            bottom: -180,
            width: 360,
            height: 360,
            border: '34px solid rgba(154,226,230,0.06)',
            borderRadius: 9999,
          }}
        />

        {/* Eyebrow */}
        <div
          style={{
            display: 'flex',
            fontSize: 18,
            letterSpacing: 6,
            textTransform: 'uppercase',
            color: '#9ae2e6',
            fontWeight: 700,
            marginBottom: 28,
          }}
        >
          Radar Vertho · Bett 2026
        </div>

        {/* Headline */}
        <div
          style={{
            display: 'flex',
            fontSize: 70,
            fontWeight: 700,
            color: 'white',
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            maxWidth: 980,
          }}
        >
          Sua escola ou rede já sabe onde precisa{' '}
          <span style={{ color: '#34c5cc', marginLeft: 12 }}>agir primeiro?</span>
        </div>

        {/* Subhead */}
        <div
          style={{
            display: 'flex',
            fontSize: 26,
            color: 'rgba(255,255,255,0.65)',
            marginTop: 28,
            lineHeight: 1.4,
            maxWidth: 920,
          }}
        >
          Dados públicos viram leitura inicial de oportunidades. A Vertho transforma em plano
          de ação, desenvolvimento e evidências de evolução.
        </div>

        {/* Footer pill */}
        <div
          style={{
            position: 'absolute',
            bottom: 56,
            left: 70,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 22px',
            borderRadius: 9999,
            background: 'rgba(52,197,204,0.12)',
            border: '1px solid rgba(52,197,204,0.35)',
            fontSize: 22,
            color: '#34c5cc',
            fontWeight: 700,
          }}
        >
          radarbett.vertho.ai
        </div>
      </div>
    ),
    { ...size },
  );
}
