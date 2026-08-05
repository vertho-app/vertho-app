'use client';

// CONARH 52 — Porta 4: o espelho. DUAS pessoas, mesmo cargo, mesma competên-
// cia, mesma semana — jornadas diferentes. "Personaliza o caminho sem
// relativizar a chegada."
//
// 05/08/2026: o bloco de kits das personas saiu. Ele trazia uma TERCEIRA
// pessoa (de outra empresa e outra competência) para uma tela que promete
// "mesmo cargo, mesma competência" — e era só o carregador do material de
// perfil. O material virou `porta4.relatorio_perfil`, no card da Camada 2; as
// personas seguem no pacote como reserva de conteúdo.

import { FileText } from 'lucide-react';
import type { ConteudoConarh } from '../_data/types';
import { COR, SANS, SERIF } from './tema';
import { BarraAcao, TituloPorta } from './chrome';
import { FechoPorta } from './porta-shell';
import { Pilula } from './media';

/** "Marcos Vilela" → "Marcos". O card já traz o nome completo no topo. */
function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] || nome;
}

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
  onProxima,
}: {
  conteudo: ConteudoConarh;
  onConcluiu: () => void;
  onCaptura: () => void;
  onProxima: () => void;
}) {
  const { porta4, portas } = conteudo;
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
          O que é igual para todos
        </p>
        <p style={{ color: COR.texto, fontSize: 20, lineHeight: 1.55, fontFamily: SANS, margin: 0 }}>
          <strong>{porta4.comum.competencia}</strong> · {porta4.comum.descritor}
        </p>
        <p style={{ color: COR.texto2, fontSize: 19, lineHeight: 1.55, fontFamily: SANS, marginTop: 6, marginBottom: 0 }}>
          {porta4.comum.ideia_central}
        </p>
      </div>

      {/* As três camadas nomeadas — a moldura antes do espelho. A Camada 2
          carrega o relatório de perfil: é a prova do "como", e fica ONDE a
          camada é explicada. Antes vivia num kit de terceira pessoa embaixo do
          espelho — que punha três nomes numa tela que promete duas. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
        {[
          { camada: 'Camada 1 · o quê', texto: 'O descritor define o que cada pessoa precisa desenvolver.' },
          { camada: 'Camada 2 · como', texto: 'O perfil comportamental orienta como abordar, provocar, apoiar e dar feedback.', relatorio: porta4.relatorio_perfil },
          { camada: 'Camada 3 · formato', texto: 'A preferência de aprendizagem define a porta de entrada: vídeo, áudio, texto, visual ou caso.' },
        ].map((c) => (
          <div
            key={c.camada}
            className="rounded-2xl border p-5 flex flex-col"
            style={{
              background: COR.card,
              borderColor: c.relatorio ? COR.bordaAcento : COR.borda,
            }}
          >
            <p
              className="uppercase font-bold"
              style={{ color: COR.acento, fontSize: 14, letterSpacing: '0.16em', fontFamily: SANS, margin: 0 }}
            >
              {c.camada}
            </p>
            <p style={{ color: COR.texto2, fontSize: 17, lineHeight: 1.5, fontFamily: SANS, marginTop: 6, marginBottom: 0 }}>
              {c.texto}
            </p>
            {c.relatorio && (
              <div className="mt-4 pt-4 border-t" style={{ borderColor: COR.borda }}>
                <a
                  href={c.relatorio.src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 font-bold"
                  style={{ color: COR.acento, fontSize: 16, fontFamily: SANS, textDecoration: 'none' }}
                >
                  <FileText size={17} />
                  {c.relatorio.titulo} →
                </a>
                <p style={{ color: COR.texto3, fontSize: 14, lineHeight: 1.45, fontFamily: SANS, margin: '6px 0 0' }}>
                  {c.relatorio.nota}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* O espelho lado a lado — três pessoas, um formato cada (vídeo, texto
          e podcast). É a Camada 3 provada na tela, não descrita. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-6">
        {porta4.pessoas.map((p) => (
          <section
            key={p.nome}
            className="rounded-3xl border p-6"
            style={{ background: COR.card, borderColor: COR.borda }}
          >
            <div className="flex items-center gap-4 mb-2">
              <div
                className="rounded-xl flex items-center justify-center flex-shrink-0 font-bold"
                style={{
                  width: 44,
                  height: 44,
                  background: 'rgba(255,255,255,0.06)',
                  border: `1px solid ${COR.borda}`,
                  color: COR.texto2,
                  fontSize: 18,
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
                  {p.cargo} · perfil {p.perfil_disc} — uma das lentes do motor
                </p>
              </div>
            </div>
            {/* Rótulo com o NOME, não com pronome: "no contexto dela" ficava
                errado em cima do Marcos, e "no contexto dele(a)" é a saída
                preguiçosa. O nome já está no card e concorda sozinho. */}
            <LinhaEspelho rotulo={`No contexto de ${primeiroNome(p.nome)}`} valor={p.exemplo} />
            <LinhaEspelho rotulo="Linguagem" valor={p.linguagem} />
            <LinhaEspelho rotulo="Desafio proposto" valor={p.desafio} />
            <div className="pt-3">
              <p
                className="uppercase font-bold"
                style={{ color: COR.texto3, fontSize: 13, letterSpacing: '0.18em', fontFamily: SANS, margin: 0 }}
              >
                Formato · o que chega para {primeiroNome(p.nome)}
              </p>
              <p style={{ color: COR.acento, fontSize: 18, fontWeight: 700, fontFamily: SANS, marginTop: 4, marginBottom: 10 }}>
                {p.formato}
              </p>
              {/* A peça real, no formato prometido — play local, sem rede. */}
              {p.midia && (
                <Pilula
                  tipo={p.midia.tipo}
                  src={p.midia.src}
                  titulo={p.midia.titulo}
                  duracao={p.midia.duracao}
                  texto={p.midia.tipo === 'texto' ? p.desafio : undefined}
                />
              )}
            </div>
          </section>
        ))}
      </div>

      <p
        className="mt-8"
        style={{
          color: COR.texto,
          fontFamily: SERIF,
          fontSize: 'clamp(24px, 3vw, 32px)',
          lineHeight: 1.3,
          fontWeight: 500,
        }}
      >
        Uma competência. Três camadas de personalização.{' '}
        <em style={{ color: COR.acento }}>Uma régua comum.</em>
      </p>


      <FechoPorta
        gancho="Personalizado assim, dá para mostrar o que evoluiu de verdade. É o painel da última etapa."
        onConcluiu={onConcluiu}
        onCaptura={onCaptura}
      />

      <BarraAcao primaria={{ rotulo: 'Próxima etapa: o painel', onClick: onProxima }} />
    </div>
  );
}
