'use client';

// CONARH 52 — Porta 3: o PDI. lacuna → objetivo → missão → evidência.
// Mensagem central: saiu do cruzamento matriz × diagnóstico, ninguém escreveu à mão.

import { Crosshair, Flag, ClipboardCheck, Eye, Repeat } from 'lucide-react';
import type { ConteudoConarh } from '../_data/types';
import { COR, SANS, SERIF } from './tema';
import { BarraAcao, TituloPorta } from './chrome';
import { FechoPorta } from './porta-shell';

function Bloco({
  icone,
  rotulo,
  texto,
  destaque,
}: {
  icone: React.ReactNode;
  rotulo: string;
  texto: string;
  destaque?: boolean;
}) {
  return (
    <div
      className="rounded-3xl border p-6 flex gap-5 items-start"
      style={{
        background: destaque ? 'rgba(52,197,204,0.08)' : COR.card,
        borderColor: destaque ? COR.bordaAcento : COR.borda,
      }}
    >
      <div
        className="rounded-2xl flex items-center justify-center flex-shrink-0"
        style={{ width: 56, height: 56, background: 'rgba(52,197,204,0.14)', color: COR.acento }}
      >
        {icone}
      </div>
      <div>
        <p
          className="uppercase font-bold"
          style={{ color: COR.acento, fontSize: 14, letterSpacing: '0.2em', fontFamily: SANS, margin: 0 }}
        >
          {rotulo}
        </p>
        <p
          style={{
            color: COR.texto,
            fontSize: 21,
            lineHeight: 1.5,
            fontFamily: SANS,
            marginTop: 6,
            marginBottom: 0,
          }}
        >
          {texto}
        </p>
      </div>
    </div>
  );
}

export function Porta3({
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
  const { porta3, portas } = conteudo;
  return (
    <div>
      <TituloPorta numero={3} nome={portas[2].nome} sub={portas[2].sub} />

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
        O PDI de {porta3.personagem} saiu do cruzamento entre a matriz e o diagnóstico —{' '}
        <em style={{ color: COR.acento }}>ninguém escreveu à mão</em>.
      </p>

      <div className="mt-10 space-y-5">
        <Bloco icone={<Crosshair size={26} />} rotulo="Lacuna" texto={porta3.lacuna} />
        <Bloco icone={<Flag size={26} />} rotulo="Objetivo" texto={porta3.objetivo} />
        <Bloco icone={<ClipboardCheck size={26} />} rotulo="Missão da semana" texto={porta3.missao} destaque />
        <Bloco icone={<Eye size={26} />} rotulo="Evidência esperada" texto={porta3.evidencia_esperada} />
        <Bloco icone={<Repeat size={26} />} rotulo="Ritual de acompanhamento" texto={porta3.ritual} />
      </div>

      <div
        className="mt-8 rounded-3xl border p-6"
        style={{ background: COR.card, borderColor: COR.borda }}
      >
        <p
          className="uppercase font-bold mb-3"
          style={{ color: COR.texto3, fontSize: 14, letterSpacing: '0.2em', fontFamily: SANS }}
        >
          Checklist do gestor
        </p>
        <ul className="space-y-3" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {porta3.checklist.map((item, i) => (
            <li
              key={i}
              className="flex gap-3 items-start"
              style={{ color: COR.texto2, fontSize: 19, lineHeight: 1.5, fontFamily: SANS }}
            >
              <span style={{ color: COR.acento, fontWeight: 800 }}>{i + 1}.</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <FechoPorta
        gancho="O plano é o mesmo para todos? É aí que a maioria dos programas quebra. A próxima etapa mostra o espelho."
        onConcluiu={onConcluiu}
        onCaptura={onCaptura}
        onAgendar={onAgendar}
      />

      <BarraAcao primaria={{ rotulo: 'Próxima etapa: personalizar', onClick: onProxima }} />
    </div>
  );
}
