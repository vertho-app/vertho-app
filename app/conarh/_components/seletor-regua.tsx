'use client';

// CONARH 52 — o seletor de competência, usado nas DUAS telas que dependem da
// escolha: a etapa 1 (qual matriz abrir) e a etapa 2 (qual cenário rodar).
//
// Existe como componente, e não copiado nas duas, porque a escolha é uma só:
// duas cópias divergem no primeiro ajuste de rótulo — e aí a mesma decisão
// aparece com dois nomes diferentes para o mesmo visitante, na mesma demo.
//
// Na etapa 2 ele aparece com legenda: quem entra direto pelo hub nunca passou
// pela etapa 1, e sem o seletor responderia o cenário de liderança sem nunca
// ter escolhido nada.

import type { ReguaVitrine } from '../_data/types';
import { COR, SANS, TOQUE } from './tema';

export function SeletorRegua({
  reguas,
  reguaId,
  onTrocar,
  legenda,
}: {
  reguas: ReguaVitrine[];
  reguaId: string;
  onTrocar: (id: string) => void;
  legenda?: string;
}) {
  if (reguas.length < 2) return null;
  return (
    <div className="mb-7">
      {legenda && (
        <p
          className="uppercase font-bold mb-3"
          style={{ color: COR.texto3, fontSize: 13, letterSpacing: '0.18em', fontFamily: SANS, margin: '0 0 12px' }}
        >
          {legenda}
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {reguas.map((r) => {
          const ativo = r.id === reguaId;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onTrocar(r.id)}
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
    </div>
  );
}
