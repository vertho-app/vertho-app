'use client';

// CONARH 52 — Porta 1: a matriz aberta. "Feedback não é uma coisa só" —
// descritores observáveis com âncoras N1–N4, um por vez (ver ./matriz.tsx).
// A tela abre com a manchete + os 6 nomes; o resto da introdução e os demais
// descritores vêm por toque. Em pé, tela cheia de texto não é lida.

import { useState } from 'react';
import type { ConteudoConarh } from '../_data/types';
import { COR, SERIF, SANS } from './tema';
import { BarraAcao, TituloPorta } from './chrome';
import { FechoPorta } from './porta-shell';
import { MatrizDescritores } from './matriz';
import { partirNaPrimeiraFrase } from './texto';

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
  const [verIntro, setVerIntro] = useState(false);
  const { manchete, resto } = partirNaPrimeiraFrase(porta1.introducao);

  return (
    <div>
      <TituloPorta numero={1} nome={portas[0].nome} sub={portas[0].sub} />

      <p
        style={{
          color: COR.texto,
          fontFamily: SERIF,
          fontSize: 'clamp(28px, 3.6vw, 40px)',
          lineHeight: 1.15,
          fontWeight: 600,
          maxWidth: 900,
          margin: 0,
        }}
      >
        {manchete}
      </p>
      <p style={{ color: COR.texto2, fontSize: 20, marginTop: 10, fontFamily: SANS }}>
        <strong style={{ color: COR.acento }}>{porta1.competencia}</strong> ·{' '}
        {porta1.descritores.length} descritores observáveis · régua N1 a N4
      </p>
      {resto && (
        <>
          <button
            type="button"
            onClick={() => setVerIntro(!verIntro)}
            style={{
              color: COR.acento,
              fontSize: 17,
              fontWeight: 700,
              fontFamily: SANS,
              background: 'none',
              border: 'none',
              padding: 0,
              marginTop: 8,
            }}
          >
            {verIntro ? 'Esconder ↑' : 'Por que isso importa ↓'}
          </button>
          {verIntro && (
            <p
              style={{
                color: COR.texto2,
                fontSize: 18,
                lineHeight: 1.55,
                fontFamily: SANS,
                marginTop: 10,
                maxWidth: 900,
              }}
            >
              {resto}
            </p>
          )}
        </>
      )}

      <p style={{ color: COR.texto3, fontSize: 16, fontFamily: SANS, marginTop: 26, marginBottom: 10 }}>
        Toque em um descritor para ver a régua.
      </p>
      <MatrizDescritores descritores={porta1.descritores} />

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
