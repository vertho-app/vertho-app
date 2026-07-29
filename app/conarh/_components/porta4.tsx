'use client';

// CONARH 52 — Porta 4: o espelho. Duas pessoas, mesmo cargo, mesma competên-
// cia, mesma semana — jornadas diferentes. "Personaliza o caminho sem
// relativizar a chegada." Abaixo, os kits das personas com play local.

import type { ConteudoConarh } from '../_data/types';
import { COR, SANS, SERIF } from './tema';
import { BarraAcao, TituloPorta } from './chrome';
import { FechoPorta } from './porta-shell';
import { Pilula } from './media';

function LinhaEspelho({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="py-3 border-b" style={{ borderColor: COR.borda }}>
      <p
        className="uppercase font-bold"
        style={{ color: COR.texto3, fontSize: 13, letterSpacing: '0.18em', fontFamily: SANS, margin: 0 }}
      >
        {rotulo}
      </p>
      <p style={{ color: COR.texto2, fontSize: 18, lineHeight: 1.5, fontFamily: SANS, marginTop: 4, marginBottom: 0 }}>
        {valor}
      </p>
    </div>
  );
}

export function Porta4({
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
  const { porta4, portas, personas } = conteudo;
  return (
    <div>
      <TituloPorta numero={4} nome={portas[3].nome} sub={portas[3].sub} />

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
        Semana {porta4.semana}. Mesmo cargo, mesma competência, mesma semana —{' '}
        <em style={{ color: COR.acento }}>caminhos diferentes, mesma chegada</em>.
      </p>

      {/* O que é comum — a chegada não se relativiza */}
      <div
        className="mt-8 rounded-3xl border p-6"
        style={{ background: 'rgba(52,197,204,0.07)', borderColor: COR.bordaAcento }}
      >
        <p
          className="uppercase font-bold mb-2"
          style={{ color: COR.acento, fontSize: 14, letterSpacing: '0.2em', fontFamily: SANS }}
        >
          O que é igual para os dois
        </p>
        <p style={{ color: COR.texto, fontSize: 20, lineHeight: 1.55, fontFamily: SANS, margin: 0 }}>
          <strong>{porta4.comum.competencia}</strong> · {porta4.comum.descritor}
        </p>
        <p style={{ color: COR.texto2, fontSize: 19, lineHeight: 1.55, fontFamily: SANS, marginTop: 6, marginBottom: 0 }}>
          {porta4.comum.ideia_central}
        </p>
      </div>

      {/* O espelho lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-6">
        {porta4.pessoas.map((p) => (
          <section
            key={p.nome}
            className="rounded-3xl border p-6"
            style={{ background: COR.card, borderColor: COR.borda }}
          >
            <div className="flex items-center gap-4 mb-2">
              <div
                className="rounded-2xl flex items-center justify-center flex-shrink-0 font-bold"
                style={{
                  width: 60,
                  height: 60,
                  background: 'rgba(52,197,204,0.14)',
                  color: COR.acento,
                  fontSize: 26,
                  fontFamily: SERIF,
                }}
              >
                {p.perfil_disc}
              </div>
              <div>
                <h2 style={{ color: COR.texto, fontSize: 24, fontWeight: 700, fontFamily: SANS, margin: 0 }}>
                  {p.nome}
                </h2>
                <p style={{ color: COR.texto3, fontSize: 16, fontFamily: SANS, margin: 0 }}>
                  {p.cargo} · perfil {p.perfil_disc}
                </p>
              </div>
            </div>
            <LinhaEspelho rotulo="Exemplo no contexto dela" valor={p.exemplo} />
            <LinhaEspelho rotulo="Linguagem" valor={p.linguagem} />
            <LinhaEspelho rotulo="Desafio proposto" valor={p.desafio} />
            <div className="pt-3">
              <p
                className="uppercase font-bold"
                style={{ color: COR.texto3, fontSize: 13, letterSpacing: '0.18em', fontFamily: SANS, margin: 0 }}
              >
                Formato
              </p>
              <p style={{ color: COR.acento, fontSize: 18, fontWeight: 700, fontFamily: SANS, marginTop: 4, marginBottom: 0 }}>
                {p.formato}
              </p>
            </div>
          </section>
        ))}
      </div>

      {/* Kits das personas — play local, offline */}
      {personas.length > 0 && (
        <div className="mt-12">
          <h2
            style={{
              color: COR.texto,
              fontFamily: SERIF,
              fontSize: 'clamp(24px, 3vw, 32px)',
              fontWeight: 600,
              margin: 0,
            }}
          >
            O kit que cada pessoa recebe
          </h2>
          <div className="mt-6 space-y-8">
            {personas.map((persona) => (
              <section
                key={persona.id}
                className="rounded-3xl border p-6"
                style={{ background: COR.card, borderColor: COR.borda }}
              >
                <p style={{ color: COR.texto, fontSize: 21, fontWeight: 700, fontFamily: SANS, margin: 0 }}>
                  {persona.nome}{' '}
                  <span style={{ color: COR.texto3, fontWeight: 500, fontSize: 17 }}>
                    · {persona.cargo} · perfil {persona.perfil_disc} · foco: {persona.descritor_foco}
                  </span>
                </p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5">
                  <Pilula
                    tipo={persona.kit.pilula1.tipo}
                    src={persona.kit.pilula1.src}
                    titulo={persona.kit.pilula1.titulo}
                    duracao={persona.kit.pilula1.duracao}
                  />
                  <Pilula
                    tipo={persona.kit.pilula2.tipo}
                    src={persona.kit.pilula2.src}
                    titulo={persona.kit.pilula2.titulo}
                    duracao={persona.kit.pilula2.duracao}
                  />
                </div>
                <div
                  className="rounded-2xl border p-4 mt-4"
                  style={{ background: 'rgba(255,255,255,0.03)', borderColor: COR.borda }}
                >
                  <p style={{ color: COR.texto, fontSize: 18, fontWeight: 700, fontFamily: SANS, margin: 0 }}>
                    Missão: {persona.kit.missao.titulo}
                  </p>
                  <p style={{ color: COR.texto2, fontSize: 17, lineHeight: 1.55, fontFamily: SANS, marginTop: 6, marginBottom: 0 }}>
                    {persona.kit.missao.texto}
                  </p>
                  <p style={{ color: COR.texto3, fontSize: 16, fontFamily: SANS, marginTop: 6, marginBottom: 0 }}>
                    Evidência: {persona.kit.missao.evidencia}
                  </p>
                </div>
                {persona.kit.pdf.src && (
                  <a
                    href={persona.kit.pdf.src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-4"
                    style={{ color: COR.acento, fontSize: 17, fontWeight: 700, fontFamily: SANS }}
                  >
                    Abrir material em PDF: {persona.kit.pdf.titulo} →
                  </a>
                )}
              </section>
            ))}
          </div>
        </div>
      )}

      <FechoPorta
        gancho="Personalizado assim, dá para mostrar o que evoluiu de verdade. É o painel da última etapa."
        onConcluiu={onConcluiu}
        onCaptura={onCaptura}
        onAgendar={onAgendar}
      />

      <BarraAcao primaria={{ rotulo: 'Próxima etapa: o painel', onClick: onProxima }} />
    </div>
  );
}
