'use client';

// CONARH 52 — fecho padrão de cada porta: gancho que puxa a próxima etapa +
// a pergunta de sempre ("ver outra etapa ou receber o recorte?") + UM CTA.
// Também marca a rota como concluída quando o fecho entra na tela.

import { Send } from 'lucide-react';
import { COR, SANS, TOQUE } from './tema';
import { useAoAparecer } from './chrome';

const FECHO =
  'Quer ver outra etapa — ou prefere que eu te mande esse recorte e a gente aprofunda em 20 min depois da feira?';

export function FechoPorta({
  gancho,
  onConcluiu,
  onCaptura,
}: {
  /** Frase que puxa a próxima porta (vazio na porta 5). */
  gancho: string;
  onConcluiu: () => void;
  onCaptura: () => void;
}) {
  const ref = useAoAparecer(onConcluiu);
  return (
    <div
      ref={ref}
      className="mt-12 rounded-3xl border p-7"
      style={{
        background: 'linear-gradient(135deg, rgba(52,197,204,0.08), rgba(255,255,255,0.02))',
        borderColor: COR.bordaAcento,
      }}
    >
      {gancho && (
        <p
          style={{
            color: COR.texto,
            fontSize: 22,
            lineHeight: 1.45,
            fontFamily: SANS,
            fontWeight: 600,
            margin: 0,
          }}
        >
          {gancho}
        </p>
      )}
      <p
        style={{
          color: COR.texto2,
          fontSize: 20,
          lineHeight: 1.5,
          fontFamily: SANS,
          marginTop: gancho ? 14 : 0,
          marginBottom: 0,
        }}
      >
        {FECHO}
      </p>
      {/* Um CTA só: "Marcar os 20 minutos" levava à MESMA tela desde que o
          seletor de horário saiu do formulário (04/08/2026) — dois botões
          idênticos com nomes diferentes só fazem o visitante escolher à toa.
          Marcar a reunião voltou a ser conversa (o fecho acima já a propõe),
          não interface. */}
      <div className="flex flex-wrap gap-3 mt-6">
        <button
          type="button"
          onClick={onCaptura}
          className="flex items-center gap-2.5 rounded-2xl px-7"
          style={{
            minHeight: TOQUE,
            background: `linear-gradient(135deg, ${COR.acento}, ${COR.acentoEscuro})`,
            color: COR.fundo0,
            fontSize: 19,
            fontWeight: 800,
            fontFamily: SANS,
          }}
        >
          <Send size={20} />
          Receber esse recorte
        </button>
      </div>
    </div>
  );
}
