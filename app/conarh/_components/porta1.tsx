'use client';

// CONARH 52 — Porta 1: a matriz aberta. "Liderança não é uma coisa só" —
// descritores observáveis com âncoras N1–N4. Nenhum input do visitante.

import type { ConteudoConarh } from '../_data/types';
import { COR, SERIF, SANS } from './tema';
import { BarraAcao, TituloPorta } from './chrome';
import { FechoPorta } from './porta-shell';

const NIVEIS = [
  { chave: 'n1' as const, rotulo: 'N1', nome: 'gap' },
  { chave: 'n2' as const, rotulo: 'N2', nome: 'desenvolvimento' },
  { chave: 'n3' as const, rotulo: 'N3', nome: 'meta' },
  { chave: 'n4' as const, rotulo: 'N4', nome: 'referência' },
];

export function Porta1({
  conteudo,
  onConcluiu,
  onCaptura,
  onAgendar,
  onProxima,
}: {
  conteudo: ConteudoConarh;
  onConcluiu: () => void;
  onCaptura: () => void;
  onAgendar: () => void;
  onProxima: () => void;
}) {
  const { porta1, portas } = conteudo;
  return (
    <div>
      <TituloPorta numero={1} nome={portas[0].nome} sub={portas[0].sub} />

      <p
        style={{
          color: COR.texto,
          fontFamily: SERIF,
          fontSize: 'clamp(24px, 3vw, 32px)',
          lineHeight: 1.3,
          fontWeight: 500,
          maxWidth: 900,
        }}
      >
        {porta1.introducao}
      </p>
      <p style={{ color: COR.texto2, fontSize: 20, marginTop: 12, fontFamily: SANS }}>
        Competência do caso: <strong style={{ color: COR.acento }}>{porta1.competencia}</strong>
      </p>

      <div className="mt-10 space-y-6">
        {porta1.descritores.map((d) => (
          <section
            key={d.cod}
            className="rounded-3xl border p-6"
            style={{ background: COR.card, borderColor: COR.borda }}
          >
            <p
              className="uppercase font-bold mb-1"
              style={{ color: COR.texto3, fontSize: 13, letterSpacing: '0.2em', fontFamily: SANS }}
            >
              {d.cod}
            </p>
            <h2 style={{ color: COR.texto, fontSize: 24, fontWeight: 700, fontFamily: SANS, margin: 0 }}>
              {d.nome_curto}
            </h2>
            <p style={{ color: COR.texto2, fontSize: 18, lineHeight: 1.5, fontFamily: SANS, marginTop: 6 }}>
              {d.descritor_completo}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
              {NIVEIS.map((n) => (
                <div
                  key={n.rotulo}
                  className="rounded-2xl border p-4"
                  style={{ background: 'rgba(255,255,255,0.03)', borderColor: COR.borda }}
                >
                  <p style={{ margin: 0, fontFamily: SANS }}>
                    <strong style={{ color: COR.acento, fontSize: 17 }}>{n.rotulo}</strong>{' '}
                    <span style={{ color: COR.texto3, fontSize: 14 }}>· {n.nome}</span>
                  </p>
                  <p style={{ color: COR.texto2, fontSize: 16, lineHeight: 1.5, fontFamily: SANS, marginTop: 6, marginBottom: 0 }}>
                    {d[n.chave]}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <FechoPorta
        gancho="Com uma régua dessas na mão, como fica a avaliação? Na próxima etapa você testa a sua."
        onConcluiu={onConcluiu}
        onCaptura={onCaptura}
        onAgendar={onAgendar}
      />

      <BarraAcao primaria={{ rotulo: 'Próxima etapa: avaliar', onClick: onProxima }} />
    </div>
  );
}
