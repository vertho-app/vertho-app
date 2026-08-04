'use client';

// CONARH 52 — Porta 1: a matriz aberta. "Feedback não é uma coisa só" —
// descritores observáveis com âncoras N1–N4, um por vez (ver ./matriz.tsx).
// A tela abre com a manchete + os 6 nomes; o resto da introdução e os demais
// descritores vêm por toque. Em pé, tela cheia de texto não é lida.

import { useState } from 'react';
import type { ConteudoConarh, ReguaVitrine } from '../_data/types';
import { COR, SERIF, SANS, TOQUE } from './tema';
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

  // A competência do CASO vem primeiro — é ela que segue nas portas 2 a 5.
  // As demais são vitrine: provam que a engrenagem (descritor + régua N1–N4)
  // não é um truque de liderança, sem prometer que o caso mudou junto.
  const reguaCaso: ReguaVitrine = {
    id: 'caso',
    eixo: porta1.eixo ?? 'Liderança',
    competencia: porta1.competencia,
    introducao: porta1.introducao,
    descritores: porta1.descritores,
  };
  const reguas: ReguaVitrine[] = [reguaCaso, ...(porta1.reguas_vitrine ?? [])];
  const [reguaId, setReguaId] = useState(reguaCaso.id);
  const regua = reguas.find((r) => r.id === reguaId) ?? reguaCaso;
  const { manchete, resto } = partirNaPrimeiraFrase(regua.introducao);

  return (
    <div>
      <TituloPorta numero={1} nome={portas[0].nome} sub={portas[0].sub} />

      {reguas.length > 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-7">
          {reguas.map((r) => {
            const ativo = r.id === regua.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setReguaId(r.id);
                  setVerIntro(false);
                }}
                className="rounded-2xl border p-4 text-left"
                style={{
                  minHeight: TOQUE,
                  background: ativo ? 'rgba(52,197,204,0.12)' : COR.card,
                  borderColor: ativo ? COR.bordaAcento : COR.borda,
                }}
              >
                <span
                  className="block uppercase font-bold"
                  style={{
                    color: ativo ? COR.acento : COR.texto3,
                    fontSize: 12,
                    letterSpacing: '0.18em',
                    fontFamily: SANS,
                  }}
                >
                  {r.eixo}
                </span>
                <span
                  className="block font-bold"
                  style={{
                    color: ativo ? COR.texto : COR.texto2,
                    fontSize: 17,
                    lineHeight: 1.25,
                    fontFamily: SANS,
                    marginTop: 3,
                  }}
                >
                  {r.competencia}
                </span>
              </button>
            );
          })}
        </div>
      )}

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
        <strong style={{ color: COR.acento }}>{regua.competencia}</strong> ·{' '}
        {regua.descritores.length} descritores observáveis · régua N1 a N4
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
        {regua.id !== reguaCaso.id && (
          <>
            {' '}
            O caso das próximas etapas segue{' '}
            <strong style={{ color: COR.texto2 }}>{reguaCaso.competencia}</strong>.
          </>
        )}
      </p>
      {/* key = remonta a matriz ao trocar de competência: o descritor aberto
          volta para o primeiro, em vez de herdar a seleção da régua anterior. */}
      <MatrizDescritores key={regua.id} descritores={regua.descritores} />

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
