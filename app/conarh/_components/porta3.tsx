'use client';

// CONARH 52 — Porta 3: o PDI. lacuna → objetivo → missão → evidência.
// Mensagem central: saiu do cruzamento matriz × diagnóstico, ninguém escreveu à mão.

import { Crosshair, Flag, ClipboardCheck, Eye, FileText, Repeat } from 'lucide-react';
import type { ConteudoConarh } from '../_data/types';
import { COR, SANS, SERIF } from './tema';
import { BarraAcao, TituloPorta } from './chrome';
import { FechoPorta } from './porta-shell';
import { AbrirDocumento } from './documento';

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
  onProxima,
}: {
  conteudo: ConteudoConarh;
  onConcluiu: () => void;
  onCaptura: () => void;
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
        O PDI de {porta3.personagem} saiu do cruzamento entre a matriz, o diagnóstico, o perfil
        comportamental e o modelo de aprendizagem dela —{' '}
        <em style={{ color: COR.acento }}>ninguém escreveu à mão</em>.
      </p>

      {/* Os quatro insumos, com o valor DESTA pessoa e o que cada um decidiu.
          Sem isto, "o plano é automático" soa a template: é o perfil e a
          preferência de aprendizagem que explicam por que o plano dela não
          serviria para o vizinho de mesa. */}
      <div className="mt-9 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {porta3.insumos.map((insumo) => (
          <div
            key={insumo.rotulo}
            className="rounded-2xl border p-5"
            style={{ background: COR.card, borderColor: COR.borda }}
          >
            <p
              className="uppercase font-bold"
              style={{
                color: COR.acento,
                fontSize: 12,
                letterSpacing: '0.18em',
                fontFamily: SANS,
                margin: 0,
              }}
            >
              {insumo.rotulo}
            </p>
            <p
              style={{
                color: COR.texto,
                fontSize: 17,
                lineHeight: 1.45,
                fontFamily: SANS,
                margin: '8px 0 0',
              }}
            >
              {insumo.valor}
            </p>
            <p
              style={{
                color: COR.texto3,
                fontSize: 15,
                lineHeight: 1.5,
                fontFamily: SANS,
                margin: '6px 0 0',
              }}
            >
              {insumo.efeito}
            </p>
          </div>
        ))}
      </div>

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

      {/* O artefato que a pessoa RECEBE. Vem depois do plano, não antes: o
          visitante precisa ter lido de onde saiu cada parte para o PDF ser a
          prova, e não um folheto. A capa é imagem — abrir o PDF joga o tablet
          no visualizador do sistema, e ali o expositor perde a demo. */}
      <section
        className="mt-8 rounded-3xl border p-6 flex flex-col sm:flex-row gap-6 items-start"
        style={{ background: COR.card, borderColor: COR.bordaAcento }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={porta3.pdf.capa}
          alt={`Capa do ${porta3.pdf.titulo}`}
          style={{
            width: 172,
            borderRadius: 12,
            border: `1px solid ${COR.borda}`,
            flexShrink: 0,
          }}
        />
        <div>
          <p
            className="uppercase font-bold"
            style={{ color: COR.acento, fontSize: 13, letterSpacing: '0.2em', fontFamily: SANS, margin: 0 }}
          >
            O que {porta3.personagem.split(' ')[0]} recebe
          </p>
          <p
            style={{
              color: COR.texto,
              fontSize: 19,
              lineHeight: 1.5,
              fontFamily: SANS,
              margin: '10px 0 0',
            }}
          >
            {porta3.pdf.titulo} — {porta3.pdf.paginas} páginas, com a matriz, a leitura da régua,
            o plano ciclo a ciclo e a trilha que vem dele. Saiu da plataforma, não de um modelo
            preenchido à mão.
          </p>
          <AbrirDocumento
            src={porta3.pdf.src}
            titulo={porta3.pdf.titulo}
            className="inline-flex items-center gap-2 rounded-2xl px-7 font-bold mt-5"
            style={{
              minHeight: 60,
              background: 'rgba(52,197,204,0.14)',
              border: `1px solid ${COR.bordaAcento}`,
              color: COR.acento,
              fontSize: 18,
              fontFamily: SANS,
            }}
          >
            <FileText size={20} />
            Abrir o PDF completo
          </AbrirDocumento>
        </div>
      </section>

      <FechoPorta
        gancho="O plano é o mesmo para todos? É aí que a maioria dos programas quebra. A próxima etapa mostra o espelho."
        onConcluiu={onConcluiu}
        onCaptura={onCaptura}
      />

      <BarraAcao primaria={{ rotulo: 'Próxima etapa: personalizar', onClick: onProxima }} />
    </div>
  );
}
