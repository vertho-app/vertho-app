// Página PÚBLICA (cliente-facing, SEM login) do documento da proposta.
//
// Rota solta fora de /dashboard, /admin, /representante — portanto já é pública.
// Não importa nenhum guard de auth/tenant. Renderiza apenas o VM cliente-safe
// devolvido por getPropostaPublica (que exclui comissão/margem/score).
import type { Metadata } from 'next';
import { Space_Grotesk, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import { getPropostaPublica } from '@/actions/sales/proposal-share';
import { fmtBRL, fmtDate } from '@/lib/sales/formatters';

export const dynamic = 'force-dynamic';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-prop-display',
  display: 'swap',
});
const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-prop-body',
  display: 'swap',
});
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-prop-mono',
  display: 'swap',
});

const FONT_DISPLAY = "var(--font-prop-display), 'Space Grotesk', sans-serif";
const FONT_BODY = "var(--font-prop-body), 'IBM Plex Sans', sans-serif";
const FONT_MONO = "var(--font-prop-mono), 'IBM Plex Mono', monospace";

const C = {
  accent: '#4F46E5',
  accentSoft: '#EEF0FE',
  accentSubtle: '#C3BFF7',
  cardSoft: '#F5F6FA',
  ink: '#0E1116',
  ink2: '#2B313C',
  ink3: '#3A414D',
  muted: '#5A6472',
  muted2: '#8189A0',
  line: '#E7E9EF',
  lineSoft: '#ECEEF3',
  footer: '#A2A8B8',
  rosa: '#C4488A',
  amber: '#92600A',
  amberBg: '#FBF1D9',
  green: '#166534',
  greenBg: '#DCFCE7',
  white: '#ffffff',
};

export async function generateMetadata(
  { params }: { params: Promise<{ token: string }> },
): Promise<Metadata> {
  const { token } = await params;
  const doc = await getPropostaPublica(token).catch(() => null);
  return { title: doc ? `Proposta Vertho — ${doc.numero}` : 'Proposta Vertho' };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'V';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: FONT_MONO,
        fontSize: 10.5,
        letterSpacing: '.16em',
        textTransform: 'uppercase',
        color: C.accent,
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

function NotFound() {
  return (
    <main
      className={`${spaceGrotesk.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable}`}
      style={{
        minHeight: '100vh',
        background: C.white,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: FONT_BODY,
        color: C.ink,
      }}
    >
      <div
        style={{
          maxWidth: 520,
          width: '100%',
          border: `1px solid ${C.line}`,
          borderRadius: 16,
          padding: '40px 32px',
          textAlign: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 24 }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, background: C.accent }} />
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 600, letterSpacing: '-.01em' }}>
            vertho
          </span>
        </div>
        <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 600, margin: '0 0 10px', color: C.ink }}>
          Proposta não encontrada ou indisponível
        </h1>
        <p style={{ color: C.muted, fontSize: 15, lineHeight: 1.6, margin: 0 }}>
          O link pode ter expirado ou está incorreto. Fale com o seu contato Vertho para receber uma
          nova proposta.
        </p>
        <div
          style={{
            marginTop: 28,
            paddingTop: 16,
            borderTop: `1px solid ${C.lineSoft}`,
            fontFamily: FONT_MONO,
            fontSize: 9.5,
            letterSpacing: '.06em',
            color: C.footer,
          }}
        >
          Vertho · vertho.ai · Documento confidencial
        </div>
      </div>
    </main>
  );
}

export default async function PropostaPublicaPage(
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const doc = await getPropostaPublica(token);
  if (!doc) return <NotFound />;

  const { investimento: inv } = doc;
  const escopo = doc.escopoItens.length > 0
    ? doc.escopoItens
    : (doc.produto ? [`Pacote: ${doc.produto}`] : []);

  // Cards de investimento (Desconto só entra se houver desconto real).
  const invCards: { label: string; value: string }[] = [
    { label: 'Valor mensal', value: fmtBRL(inv.mensal) },
    { label: 'Vigência', value: inv.meses != null ? `${inv.meses} meses` : '—' },
  ];
  if (inv.descontoPercent != null && inv.descontoPercent > 0) {
    invCards.push({ label: 'Desconto', value: `${inv.descontoPercent}%` });
  }

  return (
    <main
      className={`${spaceGrotesk.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable}`}
      style={{
        minHeight: '100vh',
        background: C.cardSoft,
        padding: '40px 16px',
        fontFamily: FONT_BODY,
        color: C.ink,
      }}
    >
      <style>{`
        .prop-doc { font-family: ${FONT_BODY}; }
        @media (max-width: 640px) {
          .prop-grid-2 { grid-template-columns: 1fr !important; }
          .prop-grid-3 { grid-template-columns: 1fr !important; }
          .prop-hero { flex-direction: column; align-items: flex-start !important; gap: 20px !important; }
          .prop-hero-meta { text-align: left !important; }
          .prop-total { flex-direction: column; align-items: flex-start !important; gap: 16px; }
          .prop-total-value { font-size: 30px !important; }
        }
        @media print {
          .no-print { display: none !important; }
          main { background: #fff !important; padding: 0 !important; }
          .prop-doc { border: none !important; box-shadow: none !important; }
        }
        @page { margin: 16mm; }
      `}</style>

      <article
        className="prop-doc"
        style={{
          maxWidth: 820,
          margin: '0 auto',
          background: C.white,
          border: `1px solid ${C.line}`,
          borderRadius: 18,
          padding: '44px 48px',
          color: C.ink,
        }}
      >
        {/* Baixar PDF */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
          <a
            href={`/proposta/${token}/pdf`}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-block',
              background: C.accent,
              color: C.white,
              fontFamily: FONT_MONO,
              fontSize: 11,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              padding: '9px 16px',
              borderRadius: 8,
            }}
          >
            Baixar PDF
          </a>
        </div>

        {/* Brand + pill */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: C.accent }} />
            <span style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 600, letterSpacing: '-.01em' }}>
              vertho
            </span>
          </div>
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 10.5,
              letterSpacing: '.18em',
              textTransform: 'uppercase',
              color: C.muted2,
              background: C.accentSoft,
              padding: '6px 12px',
              borderRadius: 6,
            }}
          >
            Proposta Comercial
          </div>
        </div>

        {/* Hero */}
        <div
          className="prop-hero"
          style={{ marginTop: 40, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 32 }}
        >
          <h1
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              fontSize: 44,
              lineHeight: 1,
              margin: 0,
              letterSpacing: '-.02em',
            }}
          >
            Proposta<br />Comercial
          </h1>
          <div
            className="prop-hero-meta"
            style={{ fontFamily: FONT_MONO, fontSize: 11.5, lineHeight: 2, color: C.muted, textAlign: 'right' }}
          >
            <div>Nº <span style={{ color: C.ink }}>{doc.numero}</span></div>
            <div>EMITIDA <span style={{ color: C.ink }}>{fmtDate(doc.emitidaEm)}</span></div>
            <div>VÁLIDA <span style={{ color: C.ink }}>{fmtDate(doc.validaAte)}</span></div>
          </div>
        </div>

        {/* Selo de status */}
        {(doc.expirada || doc.status === 'accepted') && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
            {doc.status === 'accepted' && !doc.expirada && (
              <span
                style={{
                  background: C.greenBg,
                  color: C.green,
                  fontSize: 12.5,
                  fontWeight: 600,
                  padding: '6px 13px',
                  borderRadius: 999,
                }}
              >
                Proposta aceita
              </span>
            )}
            {doc.expirada && (
              <span
                style={{
                  background: C.amberBg,
                  color: C.amber,
                  fontSize: 12.5,
                  fontWeight: 600,
                  padding: '6px 13px',
                  borderRadius: 999,
                }}
              >
                Validade expirada
              </span>
            )}
          </div>
        )}

        {/* Para */}
        <div
          style={{
            marginTop: 30,
            border: `1px solid ${C.line}`,
            borderRadius: 12,
            padding: '22px 26px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: FONT_MONO,
                fontSize: 10,
                letterSpacing: '.16em',
                textTransform: 'uppercase',
                color: C.muted2,
              }}
            >
              Para
            </div>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 600, marginTop: 4 }}>
              {doc.cliente.nome}
            </div>
          </div>
          {doc.cliente.tipo && (
            <div
              style={{
                fontSize: 13,
                color: C.muted,
                background: C.cardSoft,
                padding: '7px 14px',
                borderRadius: 999,
                whiteSpace: 'nowrap',
              }}
            >
              {doc.cliente.tipo}
            </div>
          )}
        </div>

        {/* Contexto */}
        <div style={{ marginTop: 34 }}>
          <SectionLabel>// Contexto</SectionLabel>
          <p style={{ fontSize: 16, lineHeight: 1.65, margin: 0, color: C.ink2 }}>
            {doc.contexto ? `${doc.contexto} ` : ''}
            A Vertho desenvolve competências por IA: diagnóstico por cargo, trilha individual e um{' '}
            <strong style={{ color: C.accent, fontWeight: 600 }}>Mentor IA</strong> que acompanha a
            aplicação prática no dia a dia.
          </p>
        </div>

        {/* Escopo incluído */}
        {escopo.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <SectionLabel>// Escopo incluído</SectionLabel>
            <div className="prop-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {escopo.map((item, i) => (
                <div
                  key={i}
                  style={{
                    background: C.accentSoft,
                    borderRadius: 8,
                    padding: '12px 16px',
                    fontSize: 13.5,
                    fontWeight: 500,
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Investimento */}
        <div style={{ marginTop: 32 }}>
          <SectionLabel>// Investimento</SectionLabel>
          <div
            className="prop-grid-3"
            style={{ display: 'grid', gridTemplateColumns: `repeat(${invCards.length}, 1fr)`, gap: 10 }}
          >
            {invCards.map((c, i) => (
              <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 11, color: C.muted2 }}>{c.label}</div>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 600, marginTop: 4 }}>
                  {c.value}
                </div>
              </div>
            ))}
          </div>
          <div
            className="prop-total"
            style={{
              marginTop: 10,
              background: C.accent,
              borderRadius: 12,
              padding: '22px 26px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: C.white,
              gap: 16,
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 10,
                  letterSpacing: '.16em',
                  textTransform: 'uppercase',
                  color: C.accentSubtle,
                }}
              >
                Valor total do contrato
              </div>
              {inv.condicoesPagamento && (
                <div style={{ fontSize: 12, color: C.accentSubtle, marginTop: 6 }}>
                  {inv.condicoesPagamento}
                </div>
              )}
            </div>
            <div
              className="prop-total-value"
              style={{ fontFamily: FONT_DISPLAY, fontSize: 38, fontWeight: 700, letterSpacing: '-.01em', whiteSpace: 'nowrap' }}
            >
              {fmtBRL(inv.total)}
            </div>
          </div>
        </div>

        {/* Cronograma */}
        {doc.cronograma.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <SectionLabel>// Cronograma</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', borderLeft: `2px solid ${C.line}`, paddingLeft: 24 }}>
              {doc.cronograma.map((etapa, i) => (
                <div
                  key={i}
                  style={{ position: 'relative', paddingBottom: i < doc.cronograma.length - 1 ? 16 : 0 }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: -31,
                      top: 2,
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: C.accent,
                      border: `3px solid ${C.white}`,
                      boxShadow: `0 0 0 1px ${C.accent}`,
                    }}
                  />
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: 14, fontWeight: 600 }}>{etapa.fase}</div>
                  <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5, marginTop: 2 }}>
                    {etapa.descricao}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* O que não está incluso */}
        {doc.naoIncluso.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <SectionLabel>// O que não está incluso</SectionLabel>
            <div
              className="prop-grid-2"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px 24px',
                fontSize: 12.5,
                color: C.ink3,
                lineHeight: 1.5,
              }}
            >
              {doc.naoIncluso.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 10 }}>
                  <span style={{ color: C.rosa, flexShrink: 0 }}>✕</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Premissas */}
        {doc.premissas.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <SectionLabel>// Premissas</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 13, color: C.ink3, lineHeight: 1.5 }}>
              {doc.premissas.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 10 }}>
                  <span style={{ color: C.accent, flexShrink: 0 }}>›</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Observações */}
        {doc.notasComerciais && (
          <div style={{ marginTop: 32 }}>
            <SectionLabel>// Observações</SectionLabel>
            <p style={{ fontSize: 16, lineHeight: 1.65, margin: 0, color: C.ink2, whiteSpace: 'pre-wrap' }}>
              {doc.notasComerciais}
            </p>
          </div>
        )}

        {/* Próximos passos */}
        {doc.proximosPassos.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <SectionLabel>// Próximos passos</SectionLabel>
            <div className="prop-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {doc.proximosPassos.map((item, i) => (
                <div key={i} style={{ background: C.cardSoft, borderRadius: 10, padding: '16px 18px' }}>
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 700, color: C.accent }}>
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <div style={{ fontSize: 13, color: C.ink2, marginTop: 6 }}>{item}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Contato */}
        <div
          style={{
            marginTop: 32,
            border: `1px solid ${C.line}`,
            borderRadius: 12,
            padding: '24px 26px',
            display: 'flex',
            alignItems: 'center',
            gap: 20,
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              background: C.accent,
              color: C.white,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: FONT_DISPLAY,
              fontSize: 19,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {initials(doc.representante.nome)}
          </div>
          <div>
            <div
              style={{
                fontFamily: FONT_MONO,
                fontSize: 10,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                color: C.muted2,
              }}
            >
              Seu contato na Vertho
            </div>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 600, marginTop: 4 }}>
              {doc.representante.nome}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 2, fontSize: 13 }}>
              {doc.representante.email && (
                <a href={`mailto:${doc.representante.email}`} style={{ color: C.accent, textDecoration: 'none' }}>
                  {doc.representante.email}
                </a>
              )}
              {doc.representante.telefone && (
                <span style={{ color: C.muted }}>{doc.representante.telefone}</span>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: 40,
            paddingTop: 12,
            borderTop: `1px solid ${C.lineSoft}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontFamily: FONT_MONO,
            fontSize: 9.5,
            letterSpacing: '.06em',
            color: C.footer,
          }}
        >
          <span>Vertho · vertho.ai</span>
          <span>Documento confidencial</span>
        </div>
      </article>
    </main>
  );
}
