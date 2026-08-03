'use client';

// CONARH 52 — Porta 5: painel do gestor navegável (rotulado "demo").
// Pessoas × descritores × antes/depois, com status de evolução.

import { TrendingUp, Minus, AlertCircle } from 'lucide-react';
import type { ConteudoConarh } from '../_data/types';
import { COR, SANS, SERIF } from './tema';
import { BarraAcao, TituloPorta } from './chrome';
import { FechoPorta } from './porta-shell';

const STATUS = {
  evolucao_confirmada: { rotulo: 'Evolução confirmada', cor: COR.verde, Icone: TrendingUp },
  evolucao_parcial: { rotulo: 'Evolução parcial', cor: COR.ambar, Icone: Minus },
  estagnacao: { rotulo: 'Estagnação', cor: COR.vermelho, Icone: AlertCircle },
} as const;

function Barra({ valor, cor }: { valor: number; cor: string }) {
  // escala 1–4
  const pct = Math.max(0, Math.min(100, ((valor - 1) / 3) * 100));
  return (
    <div className="rounded-full" style={{ background: 'rgba(255,255,255,0.08)', height: 10, width: 140 }}>
      <div className="rounded-full" style={{ background: cor, height: 10, width: `${pct}%` }} />
    </div>
  );
}

export function Porta5({
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
  const { porta5, portas } = conteudo;
  return (
    <div>
      <TituloPorta numero={5} nome={portas[4].nome} sub={portas[4].sub} />

      <div className="flex flex-wrap items-center gap-4">
        <p
          style={{
            color: COR.texto,
            fontFamily: SERIF,
            fontSize: 'clamp(24px, 3vw, 32px)',
            lineHeight: 1.3,
            fontWeight: 500,
            margin: 0,
          }}
        >
          O que o gestor vê ao fim do ciclo —{' '}
          <em style={{ color: COR.acento }}>{porta5.ciclo}</em>
        </p>
        <span
          className="rounded-full px-4 py-1.5 uppercase font-bold"
          style={{
            background: 'rgba(251,191,36,0.12)',
            border: '1px solid rgba(251,191,36,0.35)',
            color: COR.ambar,
            fontSize: 13,
            letterSpacing: '0.2em',
            fontFamily: SANS,
          }}
        >
          demo
        </span>
      </div>

      <div className="mt-10 space-y-6">
        {porta5.pessoas.map((pessoa) => (
          <section
            key={pessoa.nome}
            className="rounded-3xl border p-6"
            style={{ background: COR.card, borderColor: COR.borda }}
          >
            <h2 style={{ color: COR.texto, fontSize: 23, fontWeight: 700, fontFamily: SANS, margin: 0 }}>
              {pessoa.nome}{' '}
              <span style={{ color: COR.texto3, fontWeight: 500, fontSize: 17 }}>· {pessoa.cargo}</span>
            </h2>
            <div className="mt-4 space-y-4">
              {pessoa.descritores.map((d) => {
                const s = STATUS[d.status];
                return (
                  <div
                    key={d.nome}
                    className="rounded-2xl border p-4 flex flex-wrap items-center gap-x-6 gap-y-3"
                    style={{ background: 'rgba(255,255,255,0.03)', borderColor: COR.borda }}
                  >
                    <div style={{ minWidth: 220, flex: '1 1 220px' }}>
                      <p style={{ color: COR.texto, fontSize: 19, fontWeight: 700, fontFamily: SANS, margin: 0 }}>
                        {d.nome}
                      </p>
                      <p className="flex items-center gap-2" style={{ margin: '4px 0 0' }}>
                        <s.Icone size={17} style={{ color: s.cor }} />
                        <span style={{ color: s.cor, fontSize: 16, fontWeight: 700, fontFamily: SANS }}>
                          {s.rotulo}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span style={{ color: COR.texto3, fontSize: 15, fontFamily: SANS }}>antes</span>
                      <Barra valor={d.antes} cor="rgba(255,255,255,0.35)" />
                      <strong style={{ color: COR.texto2, fontSize: 18, fontFamily: SANS, width: 40 }}>
                        {d.antes.toFixed(1)}
                      </strong>
                    </div>
                    <div className="flex items-center gap-3">
                      <span style={{ color: COR.texto3, fontSize: 15, fontFamily: SANS }}>depois</span>
                      <Barra valor={d.depois} cor={COR.acento} />
                      <strong style={{ color: COR.acento, fontSize: 18, fontFamily: SANS, width: 40 }}>
                        {d.depois.toFixed(1)}
                      </strong>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <FechoPorta
        gancho="O piloto demonstra o método. A evolução é avaliada na jornada adequada — em 20 minutos a gente desenha um piloto com a competência crítica da sua equipe."
        onConcluiu={onConcluiu}
        onCaptura={onCaptura}
        onAgendar={onAgendar}
      />

      <BarraAcao primaria={{ rotulo: 'Voltar às 5 etapas', onClick: onProxima }} />
    </div>
  );
}
