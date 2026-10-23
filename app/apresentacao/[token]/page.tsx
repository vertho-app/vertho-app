// Página PÚBLICA (cliente-facing, SEM login) da apresentação que o RC gera pelo
// portal (decisão do dono de 23/10/2026; mig 299; VM em lib/sales/apresentacao.ts).
//
// Rota solta fora de /dashboard, /admin e /representante, portanto já é pública,
// como /proposta/[token]. Não tem preço nem nada interno: só o conteúdo
// institucional do segmento (o mesmo da proposta), o nome do cliente, o contexto
// que o RC confirmou e o contato do RC.
//
// Desenho: o do documento da proposta (capa navy + corpo claro, Space Grotesk +
// IBM Plex, paleta oficial lida de components/pdf/tokens), para as duas peças
// parecerem da mesma casa. Os vídeos entram quando o dono gravar
// (`VIDEOS_DA_APRESENTACAO`); até lá a seção não aparece.
import type { Metadata } from 'next';
import Image from 'next/image';
import localFont from 'next/font/local';
import { getApresentacaoPublica } from '@/actions/sales/apresentacoes';
import { brand, neutralRamps } from '@/components/pdf/tokens';
import { fmtTelefone, linkWhatsApp } from '@/lib/sales/formatters';

export const dynamic = 'force-dynamic';

const spaceGrotesk = localFont({
  src: [{ path: '../../fonts/space-grotesk.woff2', weight: '300 700', style: 'normal' }],
  variable: '--font-apr-display',
  display: 'swap',
});
const ibmPlexSans = localFont({
  src: [
    { path: '../../fonts/ibm-plex-sans-400.woff2', weight: '400', style: 'normal' },
    { path: '../../fonts/ibm-plex-sans-500.woff2', weight: '500', style: 'normal' },
    { path: '../../fonts/ibm-plex-sans-600.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-apr-body',
  display: 'swap',
});
const ibmPlexMono = localFont({
  src: [{ path: '../../fonts/ibm-plex-mono-500.woff2', weight: '500', style: 'normal' }],
  variable: '--font-apr-mono',
  display: 'swap',
});

const FONT_DISPLAY = "var(--font-apr-display), 'Space Grotesk', sans-serif";
const FONT_BODY = "var(--font-apr-body), 'IBM Plex Sans', sans-serif";
const FONT_MONO = "var(--font-apr-mono), 'IBM Plex Mono', monospace";

const N = neutralRamps.indigo;
const C = {
  navy: brand.navy[500],
  navyDeep: brand.navy[900],
  cyan: brand.cyan[500],
  cyanSoft: brand.cyan[100],
  cyanMarca: brand.cyan[700],
  roxo: brand.purple[500],
  cardSoft: N.bgLight,
  ink: N.textStrong,
  ink2: N.g700,
  muted: N.g600,
  line: N.border,
  footer: N.g400,
  white: brand.white,
};

// `logo-vertho.png` é o wordmark CLARO (vai na capa navy); o "cover" é o escuro.
const LOGO_CLARO = '/logo-vertho.png';
const LOGO_ESCURO = '/logo-vertho-cover.png';

// Sem o token no título: generateMetadata não pode contar uma abertura a mais.
export const metadata: Metadata = {
  title: 'Apresentação vertho.ai',
  robots: { index: false, follow: false },
};

function Eyebrow({ children, cor = C.roxo }: { children: React.ReactNode; cor?: string }) {
  return (
    <div style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', color: cor, marginBottom: 10 }}>
      {children}
    </div>
  );
}

function Secao({ eyebrow, titulo, intro, children }: { eyebrow: string; titulo: string; intro?: string; children?: React.ReactNode }) {
  return (
    <section style={{ marginTop: 48 }}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 600, letterSpacing: '-.02em', lineHeight: 1.2, margin: '0 0 10px', color: C.ink }}>
        {titulo}
      </h2>
      {intro && <p style={{ fontSize: 15.5, lineHeight: 1.65, color: C.ink2, margin: '0 0 20px', maxWidth: '64ch' }}>{intro}</p>}
      {children}
    </section>
  );
}

function Lista({ itens }: { itens: string[] }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
      {itens.map((t) => (
        <li key={t} style={{ display: 'flex', gap: 10, fontSize: 14.5, lineHeight: 1.55, color: C.ink2 }}>
          <span aria-hidden style={{ color: C.cyanMarca, fontWeight: 700 }}>›</span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function NaoEncontrada() {
  return (
    <main
      className={`${spaceGrotesk.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable}`}
      style={{ minHeight: '100vh', background: C.white, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: FONT_BODY, color: C.ink }}
    >
      <div style={{ maxWidth: 520, width: '100%', border: `1px solid ${C.line}`, borderRadius: 16, padding: '40px 32px', textAlign: 'center' }}>
        <Image src={LOGO_ESCURO} alt="vertho.ai" width={3148} height={800} style={{ height: 30, width: 'auto', margin: '0 auto 24px' }} />
        <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 600, margin: '0 0 10px' }}>Apresentação indisponível</h1>
        <p style={{ color: C.muted, fontSize: 15, lineHeight: 1.6, margin: 0 }}>
          O link pode ter sido desativado ou está incorreto. Fale com o seu contato da vertho.ai para receber um novo.
        </p>
      </div>
    </main>
  );
}

export default async function ApresentacaoPublicaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const doc = await getApresentacaoPublica(token);
  if (!doc) return <NaoEncontrada />;

  const { contato, termos } = doc;
  const educacao = doc.segmento === 'educacao';
  const wa = linkWhatsApp(contato.whatsapp, `Olá, ${contato.nome}! Vi a apresentação da vertho.ai e gostaria de conversar.`);
  const mail = contato.email ? `mailto:${contato.email}?subject=${encodeURIComponent('Apresentação vertho.ai')}` : null;

  return (
    <main
      className={`${spaceGrotesk.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable}`}
      style={{ minHeight: '100vh', background: C.cardSoft, padding: '28px 16px 56px', fontFamily: FONT_BODY, color: C.ink }}
    >
      <style>{`
        .apr-cta { transition: transform .16s ease; }
        .apr-cta:hover { transform: translateY(-1px); }
        @media (max-width: 720px) {
          .apr-grid-2, .apr-grid-3 { grid-template-columns: 1fr !important; }
          .apr-capa { padding: 32px 22px !important; }
          .apr-h1 { font-size: 34px !important; }
          .apr-corpo { padding: 8px 22px 34px !important; }
        }
      `}</style>

      <article style={{ maxWidth: 880, margin: '0 auto', background: C.white, border: `1px solid ${C.line}`, borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 60px -30px rgba(15,43,84,.28)' }}>
        {/* ── Capa ── */}
        <header
          className="apr-capa"
          style={{
            background:
              `radial-gradient(760px 320px at 88% -10%, rgba(52,197,204,.20), transparent 60%),`
              + `radial-gradient(620px 300px at -5% 110%, rgba(158,78,221,.26), transparent 60%),`
              + `linear-gradient(160deg, ${C.navy} 0%, ${C.navyDeep} 100%)`,
            color: C.white,
            padding: '38px 48px 40px',
          }}
        >
          <Image src={LOGO_CLARO} alt="vertho.ai" width={3148} height={744} priority style={{ height: 30, width: 'auto' }} />
          <div style={{ marginTop: 44 }}>
            <Eyebrow cor={C.cyan}>Apresentação</Eyebrow>
            <h1 className="apr-h1" style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 46, lineHeight: 1.04, letterSpacing: '-.03em', margin: 0, maxWidth: '18ch' }}>
              {educacao ? 'Desenvolvimento de educadores, pessoa a pessoa' : 'Desenvolvimento de competências, pessoa a pessoa'}
            </h1>
            {doc.cliente.nome && (
              <p style={{ margin: '18px 0 0', fontSize: 16, color: 'rgba(255,255,255,.72)' }}>
                Preparada para <strong style={{ color: C.white, fontWeight: 600 }}>{doc.cliente.nome}</strong>
              </p>
            )}
            <p style={{ margin: '6px 0 0', fontSize: 14, color: 'rgba(255,255,255,.6)' }}>por {contato.nome}, representante vertho.ai</p>
          </div>
        </header>

        <div className="apr-corpo" style={{ padding: '8px 48px 44px' }}>
          {doc.contexto && (
            <Secao eyebrow="// O ponto de partida" titulo="O que entendemos até aqui">
              <p style={{ fontSize: 16, lineHeight: 1.7, color: C.ink2, margin: 0, padding: '16px 20px', background: C.cyanSoft, borderRadius: 12, whiteSpace: 'pre-wrap' }}>
                {doc.contexto}
              </p>
            </Secao>
          )}

          <Secao
            eyebrow="// Como funciona"
            titulo="Diagnóstico, jornada e evidência"
            intro={`A vertho.ai desenvolve as competências que cada cargo ${termos.deEntidade} pede, a partir do ponto em que cada pessoa está.`}
          >
            <div className="apr-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {doc.pilares.map((p, i) => (
                <div key={p.titulo} style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: '20px 18px' }}>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: C.roxo }}>0{i + 1}</div>
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 600, margin: '6px 0 8px' }}>{p.titulo}</div>
                  <p style={{ fontSize: 14, lineHeight: 1.6, color: C.muted, margin: 0 }}>{p.texto}</p>
                </div>
              ))}
            </div>
          </Secao>

          <Secao eyebrow="// Na prática" titulo="Um cenário do dia a dia" intro={doc.cenario.fechamento}>
            <div style={{ borderRadius: 12, padding: '22px 22px 18px', background: `linear-gradient(160deg, ${C.navy} 0%, ${C.navyDeep} 100%)`, color: C.white }}>
              <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: C.cyan, letterSpacing: '.08em', textTransform: 'uppercase' }}>{doc.cenario.rotulo}</div>
              <p style={{ fontSize: 15, lineHeight: 1.65, margin: '10px 0 16px', color: 'rgba(255,255,255,.9)' }}>{doc.cenario.situacao}</p>
              <div className="apr-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {doc.cenario.perguntas.map((q) => (
                  <div key={q.nome} style={{ background: 'rgba(255,255,255,.07)', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.cyan }}>{q.nome}</div>
                    <div style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 4, color: 'rgba(255,255,255,.86)' }}>{q.pergunta}</div>
                  </div>
                ))}
              </div>
            </div>
          </Secao>

          <Secao eyebrow="// Personalização" titulo={doc.personalizacao.titulo} intro={doc.personalizacao.intro}>
            <div className="apr-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {doc.personalizacao.pessoas.map((p) => (
                <div key={p.nome} style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: '16px 18px' }}>
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: 15.5, fontWeight: 600 }}>{p.nome}</div>
                  <p style={{ fontSize: 14, lineHeight: 1.55, color: C.muted, margin: '6px 0 8px' }}>{p.necessidade}</p>
                  <div style={{ fontSize: 12.5, color: C.roxo, fontWeight: 600 }}>Foco: {p.foco}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 14.5, lineHeight: 1.55, color: C.ink2, margin: '14px 0 0', fontWeight: 500 }}>{doc.personalizacao.fechamento}</p>
          </Secao>

          <Secao eyebrow="// Quem faz" titulo="Curadoria humana com IA">
            <div className="apr-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[doc.curadoria.humano, doc.curadoria.ia].map((b) => (
                <div key={b.titulo} style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: '18px 18px' }}>
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 600 }}>{b.titulo}</div>
                  <p style={{ fontSize: 14, lineHeight: 1.55, color: C.muted, margin: '6px 0 12px' }}>{b.resumo}</p>
                  <Lista itens={b.itens} />
                </div>
              ))}
            </div>
          </Secao>

          <Secao eyebrow="// O que fica" titulo={termos.tituloQuemRecebe}>
            <div className="apr-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 15.5, fontWeight: 600, marginBottom: 10 }}>Cada pessoa recebe</div>
                <Lista itens={doc.paraPessoa} />
              </div>
              <div>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 15.5, fontWeight: 600, marginBottom: 10 }}>{termos.colunaCliente}</div>
                <Lista itens={doc.paraInstituicao} />
              </div>
            </div>
          </Secao>

          <Secao eyebrow="// Gestão" titulo="Perguntas que a gestão passa a responder" intro={`Leitura por ${doc.gestao.niveis}.`}>
            <Lista itens={doc.gestao.perguntas} />
          </Secao>

          <Secao eyebrow="// Etapas" titulo="Como é a jornada">
            <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
              {doc.cronograma.map((e, i) => (
                <li key={e.fase} style={{ display: 'grid', gridTemplateColumns: '36px 1fr', gap: 12, alignItems: 'start', border: `1px solid ${C.line}`, borderRadius: 12, padding: '14px 16px' }}>
                  <span style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 700, color: C.navy }}>{i + 1}</span>
                  <span>
                    <strong style={{ fontFamily: FONT_DISPLAY, fontSize: 15.5 }}>{e.fase}</strong>
                    {e.duracao && <span style={{ fontSize: 12.5, color: C.muted }}> · {e.duracao}</span>}
                    <span style={{ display: 'block', fontSize: 14, lineHeight: 1.55, color: C.ink2, marginTop: 4 }}>{e.descricao}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Secao>

          {doc.videos.length > 0 && (
            <Secao eyebrow="// Em vídeo" titulo="Veja como funciona">
              <div className="apr-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {doc.videos.map((v) => (
                  <a key={v.url} href={v.url} target="_blank" rel="noreferrer" style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: '16px 18px', color: C.navy, fontWeight: 600, textDecoration: 'none' }}>
                    ▶ {v.titulo}
                  </a>
                ))}
              </div>
            </Secao>
          )}

          <Secao eyebrow="// Quem move a vertho.ai" titulo="Experiência em educação, aprendizagem e tecnologia">
            <div className="apr-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {doc.fundadores.map((f) => (
                <div key={f.nome} style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: '22px 18px 18px', textAlign: 'center' }}>
                  <Image
                    src={`/proposta/${f.arquivo}`}
                    alt={f.nome}
                    width={360}
                    height={360}
                    sizes="96px"
                    style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', display: 'block', margin: '0 auto 12px' }}
                  />
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 600 }}>{f.nome}</div>
                  <p style={{ fontSize: 13, lineHeight: 1.55, color: C.muted, margin: '6px 0 0' }}>{f.bio}</p>
                </div>
              ))}
            </div>
          </Secao>

          {/* Próximo passo: a conversa que vira proposta */}
          <section style={{ marginTop: 48, borderRadius: 14, padding: '24px 24px', background: C.cyanSoft }}>
            <Eyebrow>// Próximo passo</Eyebrow>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: 600, margin: '0 0 8px', color: C.ink }}>
              Uma conversa para montar a proposta {termos.deEntidade}
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: C.ink2, margin: '0 0 16px' }}>
              {contato.nome} acompanha {doc.cliente.nome ?? `a ${termos.entidade}`} pela vertho.ai.
              {contato.whatsapp ? ` WhatsApp ${fmtTelefone(contato.whatsapp)}.` : ''}
              {contato.email ? ` E-mail ${contato.email}.` : ''}
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {wa && (
                <a href={wa} target="_blank" rel="noreferrer" className="apr-cta" style={{ background: C.navy, color: C.white, fontSize: 14, fontWeight: 600, textDecoration: 'none', padding: '11px 18px', borderRadius: 10 }}>
                  Conversar pelo WhatsApp
                </a>
              )}
              {mail && (
                <a href={mail} className="apr-cta" style={{ border: `1px solid ${C.navy}`, color: C.navy, fontSize: 14, fontWeight: 600, textDecoration: 'none', padding: '10px 18px', borderRadius: 10, background: C.white }}>
                  Escrever um e-mail
                </a>
              )}
            </div>
          </section>

          <div style={{ marginTop: 32, paddingTop: 16, borderTop: `1px solid ${C.line}`, fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.06em', color: C.footer }}>
            vertho.ai · Apresentação{doc.cliente.nome ? ` para ${doc.cliente.nome}` : ''}
          </div>
        </div>
      </article>
    </main>
  );
}
