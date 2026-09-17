// Página PÚBLICA (cliente-facing, SEM login) do documento da proposta.
//
// Rota solta fora de /dashboard, /admin, /representante — portanto já é pública.
// Não importa nenhum guard de auth/tenant. Renderiza apenas o VM cliente-safe
// devolvido por getPropostaPublica (que exclui comissão/margem/score).
//
// DESENHO (14/09/2026): capa em navy da marca + corpo claro editorial (Space
// Grotesk + IBM Plex, ver docs/DESIGN-SYSTEM.md). A capa existe porque a
// primeira dobra de um documento comercial é onde a decisão começa.
//
// CORES (16/09/2026): só a paleta oficial, lida dos tokens da marca — navy
// #0F2B54, cyan #34C5CC, roxo #9E4EDD e a rampa neutra indigo-tinted. O índigo
// #4F46E5 do template original saiu. ⚠️ O cyan NÃO passa como texto pequeno
// sobre branco (o 700 dá 4,13:1): ele pinta fundo, marcador e botão; texto de
// destaque vai em navy ou roxo (4,58:1).
import type { Metadata } from 'next';
import Image from 'next/image';
import localFont from 'next/font/local';
import { getPropostaPublica } from '@/actions/sales/proposal-share';
import { brand, neutralRamps, statusPalettes } from '@/components/pdf/tokens';
import { fmtBRL, fmtDate, fmtDateTime, fmtTelefone, linkWhatsApp } from '@/lib/sales/formatters';
import AceiteForm from './aceite-form';

export const dynamic = 'force-dynamic';

// Self-hosted (`app/fonts/`) pelo mesmo motivo do `app/layout.tsx`: o build do
// CI não pode depender do gstatic. Ver o comentário lá.
const spaceGrotesk = localFont({
  src: [{ path: '../../fonts/space-grotesk.woff2', weight: '300 700', style: 'normal' }],
  variable: '--font-prop-display',
  display: 'swap',
});
const ibmPlexSans = localFont({
  src: [
    { path: '../../fonts/ibm-plex-sans-400.woff2', weight: '400', style: 'normal' },
    { path: '../../fonts/ibm-plex-sans-500.woff2', weight: '500', style: 'normal' },
    { path: '../../fonts/ibm-plex-sans-600.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-prop-body',
  display: 'swap',
});
const ibmPlexMono = localFont({
  src: [
    { path: '../../fonts/ibm-plex-mono-400.woff2', weight: '400', style: 'normal' },
    { path: '../../fonts/ibm-plex-mono-500.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-prop-mono',
  display: 'swap',
});

const FONT_DISPLAY = "var(--font-prop-display), 'Space Grotesk', sans-serif";
const FONT_BODY = "var(--font-prop-body), 'IBM Plex Sans', sans-serif";
const FONT_MONO = "var(--font-prop-mono), 'IBM Plex Mono', monospace";
const FONTES = { display: FONT_DISPLAY, body: FONT_BODY, mono: FONT_MONO };

const N = neutralRamps.indigo;
const C = {
  navy: brand.navy[500],
  navyDeep: brand.navy[900],
  navyClaro: brand.navy[300],
  cyan: brand.cyan[500],
  cyanClaro: brand.cyan[300],
  cyanSoft: brand.cyan[100],
  // Marcador (›, ✓) e não texto: como glifo decorativo o piso é 3:1, e passa.
  cyanMarca: brand.cyan[700],
  roxo: brand.purple[500],
  cardSoft: N.bgLight,
  ink: N.textStrong,
  ink2: N.g700,
  muted: N.g600,
  muted2: N.g500,
  line: N.border,
  footer: N.g400,
  warning: statusPalettes.ds.warning,
  // Erro de formulário é TEXTO: o `danger` sóbrio do DS dá 4,32:1 e reprova.
  danger: statusPalettes.vivid.danger,
  white: brand.white,
};

// ⚠️ `logo-vertho.png` é o wordmark CLARO (branco + cyan): o sufixo dos assets
// da marca nomeia a TINTA, não o fundo. Ele vai na capa NAVY. Trocar pelo
// "escuro" põe logo índigo sobre navy e ele some sem erro nenhum.
const LOGO_CLARO = '/logo-vertho.png';
const LOGO_ESCURO = '/logo-vertho-cover.png';
// Mesmo arquivo que o PDF lê em lib/pdf-assets.ts (getTrajetoriaLogosBase64).
const TRAJETORIA_LOGOS = '/proposta/trajetoria-logos-2026-09.jpg';

export async function generateMetadata(
  { params }: { params: Promise<{ token: string }> },
): Promise<Metadata> {
  const { token } = await params;
  const doc = await getPropostaPublica(token).catch(() => null);
  return {
    title: doc ? `Proposta Vertho — ${doc.numero}` : 'Proposta Vertho',
    robots: { index: false, follow: false },
  };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'V';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function fmtNum(v: number | null | undefined): string {
  return v == null ? '—' : v.toLocaleString('pt-BR');
}

function Eyebrow({ children, cor = C.roxo }: { children: React.ReactNode; cor?: string }) {
  return (
    <div
      style={{
        fontFamily: FONT_MONO,
        fontSize: 13,
        fontWeight: 500,
        letterSpacing: '.12em',
        textTransform: 'uppercase',
        color: cor,
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function Secao(
  { eyebrow, titulo, intro, children, className }:
  { eyebrow: string; titulo?: string; intro?: string; children: React.ReactNode; className?: string },
) {
  return (
    <section className={className} style={{ marginTop: 44 }}>
      <Eyebrow>{eyebrow}</Eyebrow>
      {titulo && (
        <h2
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: '-.02em',
            lineHeight: 1.2,
            margin: '0 0 10px',
            color: C.ink,
          }}
        >
          {titulo}
        </h2>
      )}
      {intro && (
        <p style={{ fontSize: 15.5, lineHeight: 1.65, color: C.ink2, margin: '0 0 20px', maxWidth: '64ch' }}>
          {intro}
        </p>
      )}
      {children}
    </section>
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
        <Image
          src={LOGO_ESCURO}
          alt="Vertho"
          width={3148}
          height={800}
          style={{ height: 30, width: 'auto', margin: '0 auto 24px' }}
        />
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
            borderTop: `1px solid ${C.line}`,
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

  const { investimento: inv, programa: pg, contato } = doc;
  const aceita = doc.status === 'accepted' || doc.aceite != null;
  const mostrarAceite = doc.podeAceitar && !aceita;

  const assunto = `Proposta ${doc.numero} — Vertho`;
  const waContato = linkWhatsApp(contato.whatsapp, `Olá! Estou vendo a proposta ${doc.numero} da Vertho e gostaria de conversar.`);
  const mailContato = contato.email
    ? `mailto:${contato.email}?subject=${encodeURIComponent(assunto)}`
    : null;

  // Métricas da capa: só o que veio do orçamento/proposta. Nada é inventado —
  // sem números, a faixa inteira some.
  const metricas: { valor: string; label: string }[] = [];
  const pessoas = pg?.pessoas ?? null;
  if (pessoas) metricas.push({ valor: fmtNum(pessoas), label: pessoas === 1 ? 'participante' : 'participantes' });
  if (pg?.cargos) metricas.push({ valor: fmtNum(pg.cargos), label: pg.cargos === 1 ? 'cargo mapeado' : 'cargos mapeados' });
  if (pg?.ciclos) metricas.push({ valor: fmtNum(pg.ciclos), label: pg.ciclos === 1 ? 'ciclo' : 'ciclos de desenvolvimento' });
  if (pg?.mesesPrograma) metricas.push({ valor: fmtNum(pg.mesesPrograma), label: pg.mesesPrograma === 1 ? 'mês de programa' : 'meses de programa' });
  else if (!inv.vendidoPorProjeto && inv.meses) metricas.push({ valor: fmtNum(inv.meses), label: 'meses de contrato' });

  const escopo = doc.escopoItens.length > 0
    ? doc.escopoItens
    : (doc.produto ? [`Pacote: ${doc.produto}`] : []);

  return (
    <main
      className={`${spaceGrotesk.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable}`}
      style={{
        minHeight: '100vh',
        background: C.cardSoft,
        padding: '0 16px 56px',
        fontFamily: FONT_BODY,
        color: C.ink,
      }}
    >
      <style>{`
        .prop-doc { font-family: ${FONT_BODY}; }
        .prop-cta { transition: transform .16s ease, box-shadow .16s ease, background .16s ease; }
        .prop-cta:hover { transform: translateY(-1px); }
        @media (max-width: 720px) {
          .prop-grid-2 { grid-template-columns: 1fr !important; }
          .prop-grid-3 { grid-template-columns: 1fr !important; }
          .prop-capa { padding: 32px 24px !important; }
          .prop-capa-topo { flex-direction: column; align-items: flex-start !important; gap: 16px !important; }
          .prop-capa-meta { text-align: left !important; }
          .prop-h1 { font-size: 34px !important; }
          .prop-corpo { padding: 28px 22px 34px !important; }
          .prop-metricas { grid-template-columns: 1fr 1fr !important; }
          /* Em 2 colunas, o 3º item abre linha: a divisória dele sobrava na borda. */
          .prop-metricas > div:nth-child(odd) { border-left: none !important; }
          .prop-total { flex-direction: column; align-items: flex-start !important; gap: 14px; }
          .prop-total-value { font-size: 32px !important; }
          /* A barra FICA no celular — é onde o documento tem 8 mil pixels de
             rolagem e o "Baixar PDF" some de vista. Só o número da proposta
             sai, porque aí ela caberia em duas linhas. */
          .prop-barra-meta { display: none !important; }
          .prop-barra-acoes { width: 100%; justify-content: flex-end; }
        }
        @media print {
          .no-print { display: none !important; }
          main { background: #fff !important; padding: 0 !important; }
          .prop-doc { border: none !important; box-shadow: none !important; border-radius: 0 !important; }
          .prop-capa, .prop-invest, .prop-metricas { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          section { break-inside: avoid; }
        }
        @page { margin: 14mm; }
      `}</style>

      {/* Barra de ação — fica com o leitor durante a rolagem inteira */}
      <div
        className="no-print prop-barra"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'rgba(247,247,251,.86)',
          backdropFilter: 'blur(10px)',
          borderBottom: `1px solid ${C.line}`,
          margin: '0 -16px 28px',
          padding: '10px 16px',
        }}
      >
        <div
          style={{
            maxWidth: 880,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <span className="prop-barra-meta" style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.muted, letterSpacing: '.06em' }}>
            {doc.numero} · válida até <span style={{ color: C.ink }}>{fmtDate(doc.validaAte)}</span>
          </span>
          <span className="prop-barra-acoes" style={{ display: 'flex', gap: 8 }}>
            <a
              href={`/proposta/${token}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="prop-cta"
              style={{
                border: `1px solid ${C.line}`,
                background: C.white,
                color: C.ink2,
                fontSize: 12.5,
                fontWeight: 500,
                textDecoration: 'none',
                padding: '9px 14px',
                borderRadius: 8,
              }}
            >
              Baixar PDF
            </a>
            {mostrarAceite && (
              <a
                href="#aceite"
                className="prop-cta"
                style={{
                  background: C.cyan,
                  color: C.navy,
                  fontSize: 12.5,
                  fontWeight: 600,
                  textDecoration: 'none',
                  padding: '9px 16px',
                  borderRadius: 8,
                }}
              >
                Aceitar proposta
              </a>
            )}
          </span>
        </div>
      </div>

      <article
        className="prop-doc"
        style={{
          maxWidth: 880,
          margin: '0 auto',
          background: C.white,
          border: `1px solid ${C.line}`,
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 24px 60px -30px rgba(15,43,84,.28)',
          color: C.ink,
        }}
      >
        {/* ── Capa ───────────────────────────────────────────────────────── */}
        <header
          className="prop-capa"
          style={{
            background:
              `radial-gradient(760px 320px at 88% -10%, rgba(52,197,204,.20), transparent 60%),`
              + `radial-gradient(620px 300px at -5% 110%, rgba(158,78,221,.26), transparent 60%),`
              + `linear-gradient(160deg, ${C.navy} 0%, ${C.navyDeep} 100%)`,
            color: C.white,
            padding: '38px 48px 34px',
          }}
        >
          <div
            className="prop-capa-topo"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}
          >
            <Image
              src={LOGO_CLARO}
              alt="Vertho"
              width={3148}
              height={744}
              priority
              style={{ height: 30, width: 'auto' }}
            />
            <div
              className="prop-capa-meta"
              style={{ fontFamily: FONT_MONO, fontSize: 10.5, lineHeight: 1.9, color: 'rgba(255,255,255,.62)', textAlign: 'right' }}
            >
              <div>Nº <span style={{ color: C.white }}>{doc.numero}</span></div>
              <div>EMITIDA <span style={{ color: C.white }}>{fmtDate(doc.emitidaEm)}</span></div>
              <div>VÁLIDA ATÉ <span style={{ color: C.white }}>{fmtDate(doc.validaAte)}</span></div>
            </div>
          </div>

          <div style={{ marginTop: 40 }}>
            <Eyebrow cor={C.cyan}>Proposta comercial</Eyebrow>
            <h1
              className="prop-h1"
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                fontSize: 46,
                lineHeight: 1.04,
                letterSpacing: '-.03em',
                margin: 0,
                maxWidth: '18ch',
              }}
            >
              Programa de desenvolvimento de competências
            </h1>
            {doc.cliente.nome && (
              <p style={{ margin: '18px 0 0', fontSize: 16, color: 'rgba(255,255,255,.72)' }}>
                Preparada para{' '}
                <strong style={{ color: C.white, fontWeight: 600 }}>{doc.cliente.nome}</strong>
                {doc.cliente.tipo ? ` · ${doc.cliente.tipo}` : ''}
              </p>
            )}
          </div>

          {/* Selos de status */}
          {(aceita || doc.expirada) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 22 }}>
              {aceita && (
                <span
                  style={{
                    background: 'rgba(52,197,204,.16)',
                    border: '1px solid rgba(52,197,204,.4)',
                    color: C.cyan,
                    fontSize: 12.5,
                    fontWeight: 600,
                    padding: '6px 13px',
                    borderRadius: 999,
                  }}
                >
                  {doc.aceite
                    ? `Aceita por ${doc.aceite.nome} em ${fmtDateTime(doc.aceite.em)}`
                    : 'Proposta aceita'}
                </span>
              )}
              {doc.expirada && !aceita && (
                <span
                  style={{
                    background: 'rgba(255,255,255,.12)',
                    color: 'rgba(255,255,255,.86)',
                    fontSize: 12.5,
                    fontWeight: 600,
                    padding: '6px 13px',
                    borderRadius: 999,
                  }}
                >
                  Validade expirada — peça uma revisão
                </span>
              )}
            </div>
          )}

          {/* SEM valor na capa (decisão do Rodrigo, 16/09/2026): quem lê entende
              o escopo antes de ver o preço. O investimento aparece só na seção
              "// Investimento". */}
        </header>

        {/* Faixa de métricas do programa */}
        {metricas.length > 0 && (
          <div
            className="prop-metricas"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${metricas.length}, 1fr)`,
              background: C.cyanSoft,
              borderBottom: `1px solid ${C.line}`,
            }}
          >
            {metricas.map((m, i) => (
              <div
                key={i}
                style={{
                  padding: '18px 16px',
                  textAlign: 'center',
                  borderLeft: i === 0 ? 'none' : `1px solid rgba(28,138,144,.18)`,
                }}
              >
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 700, color: C.navy, letterSpacing: '-.02em' }}>
                  {m.valor}
                </div>
                <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{m.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Corpo ──────────────────────────────────────────────────────── */}
        <div className="prop-corpo" style={{ padding: '10px 48px 44px' }}>
          {/* Contexto / abertura */}
          <Secao
            eyebrow="// Contexto"
            titulo={doc.cliente.nome ? `Por que este programa, agora` : 'Por que este programa'}
          >
            {doc.contexto && (
              <p style={{ fontSize: 16, lineHeight: 1.7, margin: '0 0 14px', color: C.ink2, maxWidth: '64ch' }}>
                {doc.contexto}
              </p>
            )}
            <p style={{ fontSize: 16, lineHeight: 1.7, margin: 0, color: C.ink2, maxWidth: '64ch' }}>
              Formação genérica trata pessoas diferentes como se fossem a mesma pessoa — e termina
              sem deixar rastro do que mudou. A Vertho faz o contrário: entende o perfil e o nível de
              cada participante, entrega o desenvolvimento no formato em que ela aprende e{' '}
              <strong
                style={{
                  color: C.navy,
                  fontWeight: 600,
                  background: `linear-gradient(transparent 58%, ${C.cyanClaro} 58%)`,
                }}
              >
                mede a evolução
              </strong>{' '}com
              evidência ao fim de cada ciclo.
            </p>
          </Secao>

          {/* Pilares */}
          <Secao eyebrow="// Como a Vertho trabalha" titulo="Diagnóstico, trilha e evidência — no mesmo fluxo">
            <div className="prop-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {doc.pilares.map((p, i) => (
                <div
                  key={i}
                  style={{
                    border: `1px solid ${C.line}`,
                    borderRadius: 12,
                    padding: '20px 18px',
                    background: C.white,
                  }}
                >
                  <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.roxo, marginBottom: 8 }}>
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 600, marginBottom: 6, letterSpacing: '-.01em' }}>
                    {p.titulo}
                  </div>
                  <p style={{ fontSize: 13.5, lineHeight: 1.6, color: C.muted, margin: 0 }}>{p.texto}</p>
                </div>
              ))}
            </div>
          </Secao>

          {/* Trajetória: logos recortados do slide comercial. O subtítulo diz "e de
              seus fundadores" de propósito: nem todo logo é cliente da Vertho, e
              o texto não pode prometer o contrário. */}
          <Secao eyebrow="// Por onde já caminhamos" titulo="Experiências da Vertho e de seus fundadores">
            <div
              style={{
                border: `1px solid ${C.line}`,
                borderRadius: 12,
                padding: '18px 20px',
                background: C.white,
              }}
            >
              <Image
                src={TRAJETORIA_LOGOS}
                alt="Logos de empresas e instituições por onde a Vertho e seus fundadores já passaram, entre elas Votorantim, Suzano, Neoenergia, BASF, Ambev, Bradesco, Bayer, Cargill e Monsanto"
                width={1287}
                height={605}
                sizes="(max-width: 720px) 100vw, 780px"
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
            </div>
          </Secao>

          {/* Escopo do orçamento */}
          {escopo.length > 0 && (
            <Secao eyebrow="// Escopo desta proposta" titulo="O que está dimensionado aqui">
              <div className="prop-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {escopo.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      background: C.cyanSoft,
                      borderRadius: 10,
                      padding: '14px 16px',
                      fontSize: 13.5,
                      fontWeight: 500,
                      lineHeight: 1.45,
                      color: C.ink2,
                    }}
                  >
                    {item}
                  </div>
                ))}
              </div>
              {pg?.conteudosPorPessoaCiclo != null && (
                <p style={{ fontSize: 13, color: C.muted, margin: '12px 0 0' }}>
                  {/* Por PESSOA, nunca pessoas × ciclos × formatos: o conteúdo é gerado por
                      célula (competência × descritor × DISC × cargo) e reaproveitado por quem
                      compartilha a célula. "240.000 peças" seria número de entrega vendido
                      como número de peça distinta. */}
                  São {fmtNum(pg.conteudosPorPessoaCiclo)} conteúdos por pessoa a cada ciclo
                  {pg.ciclos && pg.ciclos > 1
                    ? ` — ${fmtNum(pg.conteudosPorPessoaCiclo * pg.ciclos)} ao longo dos ${pg.ciclos} ciclos`
                    : ''}.
                </p>
              )}
            </Secao>
          )}

          {/* O que está incluso */}
          <Secao eyebrow="// O que está incluso" titulo="Tudo o que acompanha o programa">
            <div className="prop-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 28px' }}>
              {doc.entregas.map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: 12 }}>
                  <span
                    style={{
                      flexShrink: 0,
                      marginTop: 3,
                      width: 18,
                      height: 18,
                      borderRadius: 6,
                      background: C.cyanSoft,
                      color: C.navy,
                      fontSize: 11,
                      lineHeight: '18px',
                      textAlign: 'center',
                      fontWeight: 700,
                    }}
                  >
                    ✓
                  </span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{e.titulo}</div>
                    <p style={{ fontSize: 13, lineHeight: 1.55, color: C.muted, margin: '3px 0 0' }}>{e.texto}</p>
                  </div>
                </div>
              ))}
            </div>
          </Secao>

          {/* Dois lados */}
          <Secao eyebrow="// Quem recebe o quê" titulo="Para cada pessoa, e para a instituição">
            <div className="prop-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { titulo: 'Cada participante recebe', itens: doc.paraPessoa, borda: C.cyan, marca: C.cyanMarca },
                { titulo: 'A instituição recebe', itens: doc.paraInstituicao, borda: C.navy, marca: C.navy },
              ].map((bloco, i) => (
                <div
                  key={i}
                  style={{
                    border: `1px solid ${C.line}`,
                    borderTop: `3px solid ${bloco.borda}`,
                    borderRadius: 12,
                    padding: '20px 20px 18px',
                  }}
                >
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 600, marginBottom: 12, letterSpacing: '-.01em' }}>
                    {bloco.titulo}
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {bloco.itens.map((item, j) => (
                      <li key={j} style={{ display: 'flex', gap: 10, fontSize: 13.5, lineHeight: 1.55, color: C.ink2 }}>
                        <span style={{ color: bloco.marca, flexShrink: 0 }}>›</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Secao>

          {/* Investimento */}
          <Secao eyebrow="// Investimento" titulo="O que está sendo proposto">
            <div
              className="prop-invest prop-total"
              style={{
                background:
                  `radial-gradient(420px 200px at 100% 0%, rgba(52,197,204,.22), transparent 65%),`
                  + `radial-gradient(360px 200px at 0% 100%, rgba(158,78,221,.24), transparent 65%),`
                  + `linear-gradient(135deg, ${C.navy} 0%, ${C.navyDeep} 100%)`,
                borderRadius: 14,
                padding: '26px 28px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                color: C.white,
                gap: 20,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 10,
                    letterSpacing: '.16em',
                    textTransform: 'uppercase',
                    color: C.cyanClaro,
                  }}
                >
                  {inv.vendidoPorProjeto ? 'Investimento total do programa' : 'Valor total do contrato'}
                </div>
                {inv.condicoesPagamento && (
                  <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,.88)', marginTop: 8 }}>
                    {inv.condicoesPagamento}
                  </div>
                )}
                {inv.descontoPercent != null && Number(inv.descontoPercent) > 0 && (
                  <div style={{ fontSize: 12.5, color: C.cyanClaro, marginTop: 6 }}>
                    Inclui desconto comercial de {Number(inv.descontoPercent)}%.
                  </div>
                )}
              </div>
              <div
                className="prop-total-value"
                style={{ fontFamily: FONT_DISPLAY, fontSize: 40, fontWeight: 700, letterSpacing: '-.02em', whiteSpace: 'nowrap' }}
              >
                {fmtBRL(inv.total)}
              </div>
            </div>

            <div
              className="prop-grid-3"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 10 }}
            >
              {[
                inv.porPessoa != null
                  ? { label: 'Por participante, no programa inteiro', valor: fmtBRL(inv.porPessoa) }
                  : null,
                inv.mensal != null
                  ? {
                    label: inv.vendidoPorProjeto ? 'Valor de cada parcela' : 'Valor mensal',
                    valor: fmtBRL(inv.mensal),
                  }
                  : null,
                inv.meses != null
                  ? {
                    label: inv.vendidoPorProjeto ? 'Parcelas' : 'Vigência',
                    valor: inv.vendidoPorProjeto ? `${inv.meses}×` : `${inv.meses} meses`,
                  }
                  : null,
              ].filter(Boolean).map((card, i) => (
                <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 11, padding: '16px 18px' }}>
                  <div style={{ fontSize: 11.5, color: C.muted2, lineHeight: 1.35 }}>{card!.label}</div>
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 600, marginTop: 5, letterSpacing: '-.01em' }}>
                    {card!.valor}
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12.5, color: C.muted, margin: '12px 0 0' }}>
              Esta proposta é válida até {fmtDate(doc.validaAte)}.
            </p>
          </Secao>

          {/* Cronograma */}
          {doc.cronograma.length > 0 && (
            <Secao eyebrow="// Como funciona" titulo="Do setup ao relatório de evolução">
              <div style={{ display: 'flex', flexDirection: 'column', borderLeft: `2px solid ${C.line}`, paddingLeft: 26 }}>
                {doc.cronograma.map((etapa, i) => (
                  <div
                    key={i}
                    style={{ position: 'relative', paddingBottom: i < doc.cronograma.length - 1 ? 22 : 0 }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        left: -33,
                        top: 3,
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        background: C.cyan,
                        border: `3px solid ${C.white}`,
                        boxShadow: `0 0 0 1px ${C.cyanMarca}`,
                      }}
                    />
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 600, letterSpacing: '-.01em' }}>
                        {etapa.fase}
                      </span>
                      {etapa.duracao && (
                        <span style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: C.muted2 }}>{etapa.duracao}</span>
                      )}
                    </div>
                    <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.55, margin: '4px 0 0' }}>
                      {etapa.descricao}
                    </p>
                    {etapa.entrega && (
                      <p style={{ fontSize: 12.5, color: C.navyClaro, lineHeight: 1.5, margin: '6px 0 0' }}>
                        → {etapa.entrega}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Secao>
          )}

          {/* Próximos passos */}
          {doc.proximosPassos.length > 0 && (
            <Secao eyebrow="// Próximos passos" titulo="O que acontece depois do aceite">
              <div className="prop-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {doc.proximosPassos.map((item, i) => (
                  <div key={i} style={{ background: C.cardSoft, borderRadius: 11, padding: '16px 18px' }}>
                    <div style={{ fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 700, color: C.roxo }}>
                      {String(i + 1).padStart(2, '0')}
                    </div>
                    <div style={{ fontSize: 13.5, color: C.ink2, marginTop: 6, lineHeight: 1.5 }}>{item}</div>
                  </div>
                ))}
              </div>
            </Secao>
          )}

          {/* Observações do comercial */}
          {doc.notasComerciais && (
            <Secao eyebrow="// Observações">
              <p style={{ fontSize: 15.5, lineHeight: 1.7, margin: 0, color: C.ink2, whiteSpace: 'pre-wrap' }}>
                {doc.notasComerciais}
              </p>
            </Secao>
          )}

          {/* Letras miúdas: premissas + não incluso */}
          {(doc.premissas.length > 0 || doc.naoIncluso.length > 0) && (
            <Secao eyebrow="// Condições" titulo="Premissas e limites do escopo">
              <div
                className="prop-grid-2"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                }}
              >
                {doc.premissas.length > 0 && (
                  <div style={{ background: C.cardSoft, borderRadius: 12, padding: '20px 20px 18px' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>Premissas</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {doc.premissas.map((item, i) => (
                        <div key={i} style={{ display: 'flex', gap: 9, fontSize: 12.5, color: C.ink2, lineHeight: 1.5 }}>
                          <span style={{ color: C.cyanMarca, flexShrink: 0 }}>›</span>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {doc.naoIncluso.length > 0 && (
                  <div style={{ background: C.cardSoft, borderRadius: 12, padding: '20px 20px 18px' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>O que não está incluso</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {doc.naoIncluso.map((item, i) => (
                        <div key={i} style={{ display: 'flex', gap: 9, fontSize: 12.5, color: C.ink2, lineHeight: 1.5 }}>
                          <span style={{ color: C.roxo, flexShrink: 0 }}>✕</span>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Secao>
          )}

          {/* Aceite */}
          <section id="aceite" style={{ marginTop: 44 }}>
            {aceita ? (
              <div
                style={{
                  background: C.cyanSoft,
                  border: `1px solid ${C.cyanClaro}`,
                  borderRadius: 14,
                  padding: '24px 26px',
                }}
              >
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 600, color: C.navy }}>
                  Proposta aceita
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.6, color: C.ink2 }}>
                  {doc.aceite
                    ? `Registrado por ${doc.aceite.nome}${doc.aceite.cargo ? ` (${doc.aceite.cargo})` : ''} em ${fmtDateTime(doc.aceite.em)}.`
                    : 'O aceite desta proposta já está registrado.'}{' '}
                  Seu contato na Vertho segue com os próximos passos.
                </p>
              </div>
            ) : mostrarAceite ? (
              // Borda no gradiente assinatura cyan → roxo: é o momento de destaque
              // do documento, e o DS reserva o gradiente para esses momentos.
              <div
                style={{
                  border: '1.5px solid transparent',
                  background:
                    `linear-gradient(${C.white}, ${C.white}) padding-box,`
                    + `linear-gradient(120deg, ${C.cyan} 0%, ${C.roxo} 100%) border-box`,
                  borderRadius: 14,
                  padding: '26px 28px',
                }}
              >
                <Eyebrow>// Aceite</Eyebrow>
                <h2
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontSize: 24,
                    fontWeight: 600,
                    letterSpacing: '-.02em',
                    margin: '0 0 8px',
                  }}
                >
                  Vamos começar?
                </h2>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: C.ink2, margin: '0 0 20px', maxWidth: '58ch' }}>
                  Ao aceitar, a Vertho envia a planilha de setup e o ambiente da instituição fica no
                  ar em até 2 dias úteis após o recebimento do material.
                </p>
                <div style={{ background: C.cardSoft, borderRadius: 12, padding: '20px 20px 18px' }}>
                  <AceiteForm token={token} cores={C} fontes={FONTES} />
                </div>
              </div>
            ) : (
              <div
                style={{
                  border: `1px solid ${C.line}`,
                  borderLeft: `3px solid ${C.warning}`,
                  background: C.cardSoft,
                  borderRadius: 14,
                  padding: '22px 24px',
                }}
              >
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 600, color: C.navy }}>
                  {doc.expirada ? 'A validade desta proposta expirou' : 'Esta proposta não está aberta para aceite'}
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.6, color: C.ink2 }}>
                  Fale com o seu contato na Vertho para receber uma versão atualizada.
                </p>
              </div>
            )}
          </section>

          {/* Contato */}
          <section style={{ marginTop: 28 }}>
            <div
              style={{
                border: `1px solid ${C.line}`,
                borderRadius: 14,
                padding: '24px 26px',
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 13,
                  background: C.navy,
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
                {initials(contato.nome)}
              </div>
              <div style={{ flex: '1 1 220px' }}>
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
                  {contato.nome}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 3, fontSize: 13.5 }}>
                  {contato.email && (
                    <a
                      href={`mailto:${contato.email}`}
                      style={{
                        color: C.navy,
                        textDecoration: 'underline',
                        textDecorationColor: C.cyan,
                        textDecorationThickness: 2,
                        textUnderlineOffset: 4,
                      }}
                    >
                      {contato.email}
                    </a>
                  )}
                  {contato.whatsapp && (
                    <span style={{ color: C.muted }}>{fmtTelefone(contato.whatsapp)}</span>
                  )}
                </div>
              </div>
              <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {waContato && (
                  <a
                    href={waContato}
                    target="_blank"
                    rel="noreferrer"
                    className="prop-cta"
                    style={{
                      background: C.navy,
                      color: C.white,
                      fontSize: 13,
                      fontWeight: 600,
                      textDecoration: 'none',
                      padding: '11px 16px',
                      borderRadius: 9,
                    }}
                  >
                    Falar no WhatsApp
                  </a>
                )}
                {mailContato && (
                  <a
                    href={mailContato}
                    className="prop-cta"
                    style={{
                      border: `1px solid ${C.line}`,
                      color: C.ink2,
                      fontSize: 13,
                      fontWeight: 600,
                      textDecoration: 'none',
                      padding: '11px 16px',
                      borderRadius: 9,
                    }}
                  >
                    Enviar e-mail
                  </a>
                )}
              </div>
            </div>
          </section>

          {/* Footer */}
          <div
            style={{
              marginTop: 36,
              paddingTop: 14,
              borderTop: `1px solid ${C.line}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              fontFamily: FONT_MONO,
              fontSize: 9.5,
              letterSpacing: '.06em',
              color: C.footer,
            }}
          >
            <span>Vertho · vertho.ai · {doc.numero}</span>
            <span>Documento confidencial</span>
          </div>
        </div>
      </article>
    </main>
  );
}
