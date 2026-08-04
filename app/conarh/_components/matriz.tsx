'use client';

// CONARH 52 — a matriz como GRADE TOCÁVEL, não como documento.
//
// Por que existe: medido em 03/08, a porta 1 punha 1.382 palavras numa tela só
// (6 descritores × ~217, empilhados, sem nenhum toque) e o passo 3 da porta 2
// repetia a mesma pilha. São ~9 minutos de leitura para quem está em pé, num
// corredor, com o expositor falando. Aqui a tela abre com os 6 nomes curtos e
// UM descritor aberto: ~145 palavras visíveis, e trocar de descritor é um
// toque — o que também dá ao expositor o gesto de apontar a régua que interessa
// àquele visitante, em vez de rolar a página.

import { useState } from 'react';
import type { DescritorRegua } from '../_data/types';
import { COR, SANS, TOQUE } from './tema';

const NIVEIS = [
  { chave: 'n1' as const, rotulo: 'N1', nome: 'gap' },
  { chave: 'n2' as const, rotulo: 'N2', nome: 'desenvolvimento' },
  { chave: 'n3' as const, rotulo: 'N3', nome: 'meta' },
  { chave: 'n4' as const, rotulo: 'N4', nome: 'referência' },
];

export function MatrizDescritores({
  descritores,
  inicial,
}: {
  descritores: DescritorRegua[];
  /** cod do descritor que abre primeiro — na porta 2, o que o cenário testa. */
  inicial?: string;
}) {
  // Primeiro aberto por padrão: a tela nunca começa vazia e a régua já se prova
  // sem exigir um toque de quem só olhou de passagem.
  const [aberto, setAberto] = useState<string>(
    (inicial && descritores.some((d) => d.cod === inicial) ? inicial : descritores[0]?.cod) ?? '',
  );
  const atual = descritores.find((d) => d.cod === aberto) ?? descritores[0];

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {descritores.map((d, i) => {
          const ativo = d.cod === atual?.cod;
          return (
            <button
              key={d.cod}
              type="button"
              onClick={() => setAberto(d.cod)}
              className="rounded-2xl border p-4 text-left"
              style={{
                minHeight: TOQUE,
                background: ativo ? 'rgba(52,197,204,0.12)' : COR.card,
                borderColor: ativo ? COR.bordaAcento : COR.borda,
              }}
            >
              <span
                className="block font-bold"
                style={{ color: ativo ? COR.acento : COR.texto3, fontSize: 14, fontFamily: SANS }}
              >
                {i + 1}
              </span>
              <span
                className="block font-bold"
                style={{
                  color: ativo ? COR.texto : COR.texto2,
                  fontSize: 18,
                  lineHeight: 1.25,
                  fontFamily: SANS,
                  marginTop: 2,
                }}
              >
                {d.nome_curto}
              </span>
            </button>
          );
        })}
      </div>

      {atual && (
        <section
          className="rounded-3xl border p-6 mt-5"
          style={{ background: COR.card, borderColor: COR.bordaAcento }}
        >
          <p
            className="uppercase font-bold mb-1"
            style={{ color: COR.texto3, fontSize: 13, letterSpacing: '0.2em', fontFamily: SANS }}
          >
            {atual.cod}
          </p>
          <h3 style={{ color: COR.texto, fontSize: 24, fontWeight: 700, fontFamily: SANS, margin: 0 }}>
            {atual.nome_curto}
          </h3>
          <p style={{ color: COR.texto2, fontSize: 18, lineHeight: 1.5, fontFamily: SANS, marginTop: 6 }}>
            {atual.descritor_completo}
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
                <p
                  style={{
                    color: COR.texto2,
                    fontSize: 16,
                    lineHeight: 1.5,
                    fontFamily: SANS,
                    marginTop: 6,
                    marginBottom: 0,
                  }}
                >
                  {atual[n.chave]}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
