// CONARH 52 — prancheta plastificada: o fallback de ZERO tecnologia.
// O caso completo em 2–3 páginas A4 retrato: registro da conversa, matriz
// N1–N4, leitura do motor e PDI. Design print-first (fundo branco, tinta
// preta) — na tela já parece papel; @media print limpa o resto.

import type { Metadata } from 'next';
import conteudoJson from '../_data/conteudo.json';
import type { ConteudoConarh } from '../_data/types';
import { BotaoImprimir } from './botao-imprimir';

export const metadata: Metadata = {
  title: 'Prancheta — CONARH 52',
  robots: { index: false, follow: false },
};

const conteudo = conteudoJson as unknown as ConteudoConarh;

const TINTA = '#111';
const SUAVE = '#444';
const LINHA = '#ccc';
const ACENTO = '#0e7c86';

export default function PranchetaPage() {
  const { caso, porta2, porta3 } = conteudo;
  return (
    <main
      style={{
        background: '#fff',
        color: TINTA,
        fontFamily: "var(--font-inter), system-ui, sans-serif",
        minHeight: '100vh',
      }}
    >
      <style>{`
        @page { size: A4 portrait; margin: 16mm; }
        @media print {
          .noprint { display: none !important; }
          main { background: #fff !important; }
          .quebra { break-before: page; }
          section, blockquote { break-inside: avoid; }
        }
      `}</style>

      <div style={{ maxWidth: 780, margin: '0 auto', padding: '28px 24px 60px' }}>
        <div className="noprint" style={{ marginBottom: 24 }}>
          <BotaoImprimir />
        </div>

        {/* Cabeçalho */}
        <header style={{ borderBottom: `3px solid ${TINTA}`, paddingBottom: 12 }}>
          <p style={{ margin: 0, fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: SUAVE }}>
            CONARH 52 · Vertho · {conteudo.rotulo}
          </p>
          <h1 style={{ margin: '6px 0 0', fontSize: 26, lineHeight: 1.2 }}>{caso.titulo}</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: SUAVE }}>
            {caso.personagem.nome} · {caso.personagem.cargo} — {caso.personagem.contexto}
          </p>
        </header>

        {/* Registro da conversa */}
        <section style={{ marginTop: 22 }}>
          <h2 style={{ fontSize: 17, margin: 0, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            1 · O registro da conversa
          </h2>
          <p style={{ fontSize: 13, color: SUAVE, margin: '4px 0 0' }}>{porta2.contexto}</p>
          <blockquote
            style={{
              margin: '10px 0 0',
              padding: '12px 16px',
              borderLeft: `4px solid ${ACENTO}`,
              background: '#f7f7f7',
              fontSize: 14,
              lineHeight: 1.55,
              whiteSpace: 'pre-line',
            }}
          >
            {porta2.registro_conversa}
          </blockquote>
          <p style={{ fontSize: 13, margin: '10px 0 0' }}>
            <strong>Pergunta ao visitante:</strong> de 1 a 4, que nota você dá para essa conversa?
            Anote: ______
          </p>
        </section>

        {/* Matriz N1–N4 */}
        <section className="quebra" style={{ marginTop: 26 }}>
          <h2 style={{ fontSize: 17, margin: 0, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            2 · A matriz — âncoras N1 a N4
          </h2>
          {porta2.descritores.map((d) => (
            <div key={d.cod} style={{ marginTop: 14, border: `1px solid ${LINHA}`, borderRadius: 8, padding: 12 }}>
              <p style={{ margin: 0, fontSize: 14 }}>
                <strong>{d.nome_curto}</strong>{' '}
                <span style={{ color: SUAVE, fontSize: 12 }}>({d.cod})</span>
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 12.5, color: SUAVE }}>{d.descritor_completo}</p>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: 11.5 }}>
                <tbody>
                  {(['n1', 'n2', 'n3', 'n4'] as const).map((chave, i) => (
                    <tr key={chave}>
                      <td
                        style={{
                          border: `1px solid ${LINHA}`,
                          padding: '5px 8px',
                          fontWeight: 700,
                          width: 34,
                          color: ACENTO,
                          verticalAlign: 'top',
                        }}
                      >
                        N{i + 1}
                      </td>
                      <td style={{ border: `1px solid ${LINHA}`, padding: '5px 8px', lineHeight: 1.45 }}>
                        {d[chave]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>

        {/* Leitura do motor */}
        <section className="quebra" style={{ marginTop: 26 }}>
          <h2 style={{ fontSize: 17, margin: 0, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            3 · A leitura com critério
          </h2>
          {porta2.descritores.map((d) => (
            <div key={d.cod} style={{ marginTop: 12, borderBottom: `1px solid ${LINHA}`, paddingBottom: 12 }}>
              <p style={{ margin: 0, fontSize: 14 }}>
                <strong>{d.nome_curto}</strong> — nível{' '}
                <strong style={{ color: ACENTO }}>
                  N{d.leitura_motor.nivel} ({d.leitura_motor.nota.toFixed(1)})
                </strong>
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 12.5, fontStyle: 'italic' }}>
                “{d.leitura_motor.evidencia}”
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 12.5, color: SUAVE }}>
                {d.leitura_motor.justificativa}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: SUAVE }}>
                Para o nível acima faltou: {d.leitura_motor.limite}
              </p>
            </div>
          ))}
        </section>

        {/* PDI */}
        <section style={{ marginTop: 26 }}>
          <h2 style={{ fontSize: 17, margin: 0, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            4 · O PDI que sai do cruzamento
          </h2>
          <p style={{ fontSize: 12.5, color: SUAVE, margin: '4px 0 0' }}>
            De {porta3.personagem} — gerado do cruzamento entre a matriz e o diagnóstico.
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10, fontSize: 13 }}>
            <tbody>
              {[
                ['Lacuna', porta3.lacuna],
                ['Objetivo', porta3.objetivo],
                ['Missão da semana', porta3.missao],
                ['Evidência esperada', porta3.evidencia_esperada],
                ['Ritual', porta3.ritual],
              ].map(([rotulo, valor]) => (
                <tr key={rotulo}>
                  <td
                    style={{
                      border: `1px solid ${LINHA}`,
                      padding: '7px 10px',
                      fontWeight: 700,
                      width: 150,
                      verticalAlign: 'top',
                    }}
                  >
                    {rotulo}
                  </td>
                  <td style={{ border: `1px solid ${LINHA}`, padding: '7px 10px', lineHeight: 1.5 }}>
                    {valor}
                  </td>
                </tr>
              ))}
              <tr>
                <td style={{ border: `1px solid ${LINHA}`, padding: '7px 10px', fontWeight: 700, verticalAlign: 'top' }}>
                  Checklist
                </td>
                <td style={{ border: `1px solid ${LINHA}`, padding: '7px 10px', lineHeight: 1.5 }}>
                  {porta3.checklist.map((item, i) => (
                    <span key={i}>
                      {i + 1}. {item}
                      <br />
                    </span>
                  ))}
                </td>
              </tr>
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: SUAVE, marginTop: 16 }}>
            vertho.ai · demonstração CONARH 52 · este material é um {conteudo.rotulo}
          </p>
        </section>
      </div>
    </main>
  );
}
