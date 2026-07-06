// Página PÚBLICA (cliente-facing, SEM login) do documento da proposta.
//
// Rota solta fora de /dashboard, /admin, /representante — portanto já é pública.
// Não importa nenhum guard de auth/tenant. Renderiza apenas o VM cliente-safe
// devolvido por getPropostaPublica (que exclui comissão/margem/score).
import type { Metadata } from 'next';
import { getPropostaPublica } from '@/actions/sales/proposal-share';
import { fmtBRL, fmtDate } from '@/lib/sales/formatters';

export const dynamic = 'force-dynamic';

const BRAND = {
  navy: '#0f2b54',
  teal: '#34c5cc',
  bg: '#f6f7fb',
  ink: '#1f2937',
  muted: '#64748b',
  line: '#e5e7eb',
  amber: '#b45309',
  amberBg: '#fef3c7',
  green: '#15803d',
  greenBg: '#dcfce7',
  card: '#ffffff',
};

export async function generateMetadata(
  { params }: { params: Promise<{ token: string }> },
): Promise<Metadata> {
  const { token } = await params;
  const doc = await getPropostaPublica(token).catch(() => null);
  return { title: doc ? `Proposta Vertho — ${doc.numero}` : 'Proposta Vertho' };
}

function NotFound() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: BRAND.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
        color: BRAND.ink,
      }}
    >
      <div
        style={{
          maxWidth: 520,
          width: '100%',
          background: BRAND.card,
          borderRadius: 16,
          boxShadow: '0 8px 30px rgba(15,43,84,0.10)',
          overflow: 'hidden',
        }}
      >
        <div style={{ background: BRAND.navy, padding: '20px 28px' }}>
          <div style={{ color: '#fff', fontWeight: 800, letterSpacing: 2, fontSize: 20 }}>VERTHO</div>
        </div>
        <div style={{ padding: '32px 28px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, margin: '0 0 10px', color: BRAND.navy }}>
            Proposta não encontrada ou indisponível
          </h1>
          <p style={{ color: BRAND.muted, fontSize: 15, lineHeight: 1.6, margin: 0 }}>
            O link pode ter expirado ou está incorreto. Fale com o seu contato Vertho para receber
            uma nova proposta.
          </p>
        </div>
        <div
          style={{
            borderTop: `1px solid ${BRAND.line}`,
            padding: '14px 28px',
            fontSize: 12,
            color: BRAND.muted,
            textAlign: 'center',
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

  const money = (v: number | null) => fmtBRL(v);

  return (
    <main
      style={{
        minHeight: '100vh',
        background: BRAND.bg,
        padding: '32px 16px',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
        color: BRAND.ink,
      }}
    >
      <style>{`
        @media print {
          .no-print { display: none !important; }
          main { background: #fff !important; padding: 0 !important; }
        }
        @page { margin: 16mm; }
      `}</style>

      <article
        style={{
          maxWidth: 820,
          margin: '0 auto',
          background: BRAND.card,
          borderRadius: 16,
          boxShadow: '0 8px 30px rgba(15,43,84,0.10)',
          overflow: 'hidden',
        }}
      >
        {/* 1. Cabeçalho navy */}
        <header
          style={{
            background: BRAND.navy,
            color: '#fff',
            padding: '28px 32px',
            borderBottom: `4px solid ${BRAND.teal}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 16,
              alignItems: 'flex-start',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontWeight: 800, letterSpacing: 2, fontSize: 22 }}>VERTHO</div>
              <div style={{ color: BRAND.teal, fontWeight: 600, fontSize: 14, marginTop: 2 }}>
                Proposta Comercial
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, opacity: 0.85 }}>Nº</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{doc.numero}</div>
            </div>
          </div>

          <div style={{ marginTop: 16, fontSize: 13, opacity: 0.9 }}>
            Emitida em {fmtDate(doc.emitidaEm)} · Válida até {fmtDate(doc.validaAte)}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            {doc.status === 'accepted' && (
              <span
                style={{
                  background: BRAND.greenBg,
                  color: BRAND.green,
                  fontSize: 13,
                  fontWeight: 700,
                  padding: '6px 12px',
                  borderRadius: 999,
                }}
              >
                ✓ Proposta aceita
              </span>
            )}
            {doc.expirada && (
              <span
                style={{
                  background: BRAND.amberBg,
                  color: BRAND.amber,
                  fontSize: 13,
                  fontWeight: 700,
                  padding: '6px 12px',
                  borderRadius: 999,
                }}
              >
                Validade expirada — fale com seu contato Vertho
              </span>
            )}
          </div>

          {/* 2. Botão Baixar PDF */}
          <div className="no-print" style={{ marginTop: 18 }}>
            <a
              href={`/proposta/${token}/pdf`}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-block',
                background: BRAND.teal,
                color: BRAND.navy,
                fontWeight: 700,
                fontSize: 14,
                textDecoration: 'none',
                padding: '10px 18px',
                borderRadius: 10,
              }}
            >
              Baixar PDF
            </a>
          </div>
        </header>

        <div style={{ padding: '28px 32px' }}>
          {/* 3. Para */}
          <section style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: BRAND.muted }}>
              Para
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: BRAND.navy, marginTop: 4 }}>
              {doc.cliente.nome}
            </div>
            {doc.cliente.tipo && (
              <div style={{ fontSize: 14, color: BRAND.muted, marginTop: 2 }}>{doc.cliente.tipo}</div>
            )}
          </section>

          {/* Contexto (opcional) */}
          {doc.contexto && (
            <section style={{ marginBottom: 28 }}>
              <SectionTitle>Contexto</SectionTitle>
              <p style={{ fontSize: 15, lineHeight: 1.7, color: BRAND.ink, margin: 0, whiteSpace: 'pre-wrap' }}>
                {doc.contexto}
              </p>
            </section>
          )}

          {/* 4. Apresentação */}
          <section style={{ marginBottom: 28 }}>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: BRAND.ink, margin: 0 }}>
              A Vertho desenvolve competências por IA: diagnóstico por cargo, trilha individual e um
              Mentor IA que acompanha a aplicação prática no dia a dia. Esta proposta resume o escopo
              e o investimento para o seu contexto.
            </p>
          </section>

          {/* 5. Escopo incluído */}
          <section style={{ marginBottom: 28 }}>
            <SectionTitle>Escopo incluído</SectionTitle>
            {doc.produto && (
              <div style={{ marginBottom: 12 }}>
                <span
                  style={{
                    display: 'inline-block',
                    background: BRAND.navy,
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    padding: '5px 12px',
                    borderRadius: 999,
                  }}
                >
                  {doc.produto}
                </span>
              </div>
            )}
            {escopo.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
                {escopo.map((item, i) => (
                  <li
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                      padding: '8px 0',
                      borderBottom: i < escopo.length - 1 ? `1px solid ${BRAND.line}` : 'none',
                      fontSize: 15,
                      lineHeight: 1.5,
                    }}
                  >
                    <span style={{ color: BRAND.teal, fontWeight: 800, flexShrink: 0 }}>✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ color: BRAND.muted, fontSize: 14, margin: 0 }}>—</p>
            )}
          </section>

          {/* 6. Investimento */}
          <section style={{ marginBottom: 28 }}>
            <SectionTitle>Investimento</SectionTitle>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 12,
                marginBottom: 12,
              }}
            >
              <StatCard label="Valor mensal" value={money(inv.mensal)} />
              <StatCard label="Vigência" value={inv.meses != null ? `${inv.meses} meses` : '—'} />
              <StatCard label="Valor total do contrato" value={money(inv.total)} highlight />
            </div>

            {(inv.condicoesPagamento || inv.descontoPercent != null) && (
              <div
                style={{
                  border: `1px solid ${BRAND.line}`,
                  borderRadius: 12,
                  padding: '12px 16px',
                  fontSize: 14,
                  color: BRAND.ink,
                }}
              >
                {inv.condicoesPagamento && (
                  <div style={{ padding: '4px 0' }}>
                    <strong style={{ color: BRAND.navy }}>Condições de pagamento:</strong>{' '}
                    {inv.condicoesPagamento}
                  </div>
                )}
                {inv.descontoPercent != null && (
                  <div style={{ padding: '4px 0' }}>
                    <strong style={{ color: BRAND.navy }}>Desconto aplicado:</strong>{' '}
                    {inv.descontoPercent}%
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Cronograma */}
          {doc.cronograma.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <SectionTitle>Cronograma</SectionTitle>
              <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {doc.cronograma.map((etapa, i) => (
                  <li
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 14,
                      alignItems: 'flex-start',
                      paddingBottom: i < doc.cronograma.length - 1 ? 16 : 0,
                      position: 'relative',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        flexShrink: 0,
                        alignSelf: 'stretch',
                      }}
                    >
                      <span
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: BRAND.navy,
                          color: '#fff',
                          fontSize: 13,
                          fontWeight: 800,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {i + 1}
                      </span>
                      {i < doc.cronograma.length - 1 && (
                        <span style={{ flex: 1, width: 2, background: BRAND.line, marginTop: 4 }} />
                      )}
                    </div>
                    <div style={{ paddingTop: 2 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.navy }}>
                        {etapa.fase}
                      </div>
                      <div style={{ fontSize: 14, lineHeight: 1.6, color: BRAND.ink, marginTop: 2 }}>
                        {etapa.descricao}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* O que não está incluso */}
          {doc.naoIncluso.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <SectionTitle>O que não está incluso</SectionTitle>
              <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
                {doc.naoIncluso.map((item, i) => (
                  <li
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                      padding: '8px 0',
                      borderBottom: i < doc.naoIncluso.length - 1 ? `1px solid ${BRAND.line}` : 'none',
                      fontSize: 15,
                      lineHeight: 1.5,
                    }}
                  >
                    <span style={{ color: BRAND.muted, fontWeight: 800, flexShrink: 0 }}>×</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Premissas */}
          {doc.premissas.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <SectionTitle>Premissas</SectionTitle>
              <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
                {doc.premissas.map((item, i) => (
                  <li
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                      padding: '8px 0',
                      borderBottom: i < doc.premissas.length - 1 ? `1px solid ${BRAND.line}` : 'none',
                      fontSize: 15,
                      lineHeight: 1.5,
                    }}
                  >
                    <span style={{ color: BRAND.teal, fontWeight: 800, flexShrink: 0 }}>•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 7. Observações */}
          {doc.notasComerciais && (
            <section style={{ marginBottom: 28 }}>
              <SectionTitle>Observações</SectionTitle>
              <p style={{ fontSize: 15, lineHeight: 1.7, color: BRAND.ink, margin: 0, whiteSpace: 'pre-wrap' }}>
                {doc.notasComerciais}
              </p>
            </section>
          )}

          {/* Próximos passos */}
          {doc.proximosPassos.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <SectionTitle>Próximos passos</SectionTitle>
              <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
                {doc.proximosPassos.map((item, i) => (
                  <li
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                      padding: '8px 0',
                      borderBottom: i < doc.proximosPassos.length - 1 ? `1px solid ${BRAND.line}` : 'none',
                      fontSize: 15,
                      lineHeight: 1.5,
                    }}
                  >
                    <span
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: BRAND.teal,
                        color: BRAND.navy,
                        fontSize: 13,
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </span>
                    <span style={{ paddingTop: 1 }}>{item}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* 8. Seu contato na Vertho */}
          <section
            style={{
              marginBottom: 8,
              background: BRAND.bg,
              borderRadius: 12,
              padding: '18px 20px',
            }}
          >
            <SectionTitle>Seu contato na Vertho</SectionTitle>
            <div style={{ fontSize: 16, fontWeight: 700, color: BRAND.navy }}>
              {doc.representante.nome}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 6, fontSize: 14 }}>
              {doc.representante.email && (
                <a
                  href={`mailto:${doc.representante.email}`}
                  style={{ color: BRAND.navy, textDecoration: 'underline' }}
                >
                  {doc.representante.email}
                </a>
              )}
              {doc.representante.telefone && (
                <span style={{ color: BRAND.muted }}>{doc.representante.telefone}</span>
              )}
            </div>
          </section>
        </div>

        {/* 9. Rodapé */}
        <footer
          style={{
            borderTop: `1px solid ${BRAND.line}`,
            padding: '16px 32px',
            fontSize: 12,
            color: BRAND.muted,
            textAlign: 'center',
          }}
        >
          Vertho · vertho.ai · Documento confidencial
        </footer>
      </article>
    </main>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 13,
        textTransform: 'uppercase',
        letterSpacing: 1,
        color: BRAND.navy,
        fontWeight: 700,
        margin: '0 0 12px',
        paddingBottom: 8,
        borderBottom: `2px solid ${BRAND.teal}`,
      }}
    >
      {children}
    </h2>
  );
}

function StatCard(
  { label, value, highlight }: { label: string; value: string; highlight?: boolean },
) {
  return (
    <div
      style={{
        border: `1px solid ${highlight ? BRAND.navy : BRAND.line}`,
        background: highlight ? BRAND.navy : BRAND.card,
        borderRadius: 12,
        padding: '14px 16px',
      }}
    >
      <div style={{ fontSize: 12, color: highlight ? BRAND.teal : BRAND.muted, marginBottom: 4 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: highlight ? 22 : 18,
          fontWeight: 800,
          color: highlight ? '#fff' : BRAND.navy,
        }}
      >
        {value}
      </div>
    </div>
  );
}
