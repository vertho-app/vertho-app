'use client';

// CONARH 52 — Porta 2: o único toque do visitante.
//
// Desde 05/08/2026 a porta roda o CENÁRIO AVALIATIVO da competência escolhida
// na porta 1 — o artefato que a plataforma produz de verdade: a situação e as
// QUATRO perguntas que a IA3 gera para ela (escolha · execução · tensão
// humana · sustentação), com as respostas da pessoa avaliada. O visitante lê
// tudo e faz o MESMO trabalho da régua: classifica a pessoa num nível.
// Depois compara.
//
// Por que trocou (de novo): escolher "qual resposta você aceitaria" media o
// gosto do visitante entre quatro textos escritos por nós. Classificar o
// instrumento real põe os dois — ele e a régua — olhando exatamente o mesmo
// material, que é a única comparação honesta. E é aqui que a demo prova a
// frase que vende: a régua não muda de gestor para gestor.
// (O registro escrito continua vivo na PRANCHETA, o fallback de papel.)
//
// Sequência em 4 estados:
//   1) escolhe a competência (as mesmas 3 da etapa 1) e lê a situação →
//   2) lê as 4 perguntas respondidas e CLASSIFICA num nível (o toque) →
//   3) a matriz revelada, aberta no descritor que o cenário testa →
//   4) a leitura dele × a da régua, resposta a resposta, com o trecho que ancora.
// Regra dura: NUNCA "certo/errado" — a linguagem é "a sua leitura" x "a régua".

import { useEffect, useState } from 'react';
import { Quote } from 'lucide-react';
import type { ConteudoConarh, PerguntaAvaliativa } from '../_data/types';
import type { ResultadoPorta2 } from './sessao';
import { COR, SANS, SERIF, TOQUE } from './tema';
import { BarraAcao, TituloPorta } from './chrome';
import { FechoPorta } from './porta-shell';
import { MatrizDescritores } from './matriz';
import { acharRegua, montarReguas } from './reguas';
import { SeletorRegua } from './seletor-regua';
import { compararComRegua, formatarNota, lerRespostas } from '@/lib/conarh/leitura';

const NIVEIS: Array<{ n: 1 | 2 | 3 | 4; rotulo: string }> = [
  { n: 1, rotulo: 'gap' },
  { n: 2, rotulo: 'desenvolvimento' },
  { n: 3, rotulo: 'meta' },
  { n: 4, rotulo: 'referência' },
];

export function Porta2({
  conteudo,
  reguaId,
  onTrocarRegua,
  modoVisitante,
  onVoltarNaEtapa,
  onFinalizar,
  onConcluiu,
  onCaptura,
  onProxima,
}: {
  conteudo: ConteudoConarh;
  reguaId: string;
  onTrocarRegua: (id: string) => void;
  modoVisitante?: boolean;
  /**
   * Diz ao app como desfazer UM passo desta etapa — ou `null` no passo 1, onde
   * voltar significa sair da etapa. É o app que desenha o botão (ele vive na
   * barra do topo, fora daqui), então o passo precisa subir de alguma forma.
   */
  onVoltarNaEtapa?: (fn: (() => void) | null) => void;
  onFinalizar: (r: ResultadoPorta2) => void;
  onConcluiu: () => void;
  onCaptura: () => void;
  onProxima: () => void;
}) {
  const { portas } = conteudo;
  const reguas = montarReguas(conteudo);
  const regua = acharRegua(conteudo, reguaId);
  const cenario = regua.cenario;
  const descritorTestado = regua.descritores.find((d) => d.cod === cenario.descritor_cod);
  const leitura = lerRespostas(cenario);

  const [passo, setPasso] = useState<1 | 2 | 3 | 4>(1);
  const [atribuido, setAtribuido] = useState<1 | 2 | 3 | 4 | null>(null);

  // Trocar de competência troca a CONVERSA inteira: a classificação feita na
  // anterior não significa nada aqui (é a leitura de outra pessoa, em outro
  // descritor), e a matriz é outra. Voltar ao passo 1 é a única leitura
  // honesta — herdar o estado deixaria a tela comparando a nota que ele deu ao
  // Marcelo com a leitura da régua sobre a Renata.
  function trocarRegua(id: string) {
    if (id === reguaId) return;
    onTrocarRegua(id);
    setAtribuido(null);
    setPasso(1);
  }

  function classificar(n: 1 | 2 | 3 | 4) {
    setAtribuido(n);
    onFinalizar({
      regua: regua.id,
      competencia: regua.competencia,
      cenario: cenario.id,
      descritor: cenario.descritor_cod,
      nivel_atribuido: n,
      nivel_regua: leitura.nivel,
      nota_regua: leitura.nota,
    });
    setPasso(3);
  }

  const relacao = atribuido ? compararComRegua(atribuido, leitura.nivel) : null;

  // Registra/desregistra o voltar-um-passo a cada mudança de passo. O cleanup
  // é o que garante que sair da etapa não deixa um handler órfão apontando
  // para um passo de uma tela que já não está montada.
  useEffect(() => {
    if (!onVoltarNaEtapa) return;
    onVoltarNaEtapa(passo > 1 ? () => setPasso((p) => (p > 1 ? ((p - 1) as 1 | 2 | 3) : p)) : null);
    return () => onVoltarNaEtapa(null);
  }, [passo, onVoltarNaEtapa]);

  return (
    <div>
      <TituloPorta numero={2} nome={portas[1].nome} sub={portas[1].sub} />

      {/* ── Passo 1: a competência e a situação ─────────────────── */}
      {passo === 1 && (
        <div>
          {/* Quem entra direto pela etapa 2 (o expositor abre a que o visitante
              apontou) nunca passou pela etapa 1 — sem isto responderia o
              cenário de liderança sem ter escolhido nada. */}
          <SeletorRegua
            reguas={reguas}
            reguaId={regua.id}
            onTrocar={trocarRegua}
            legenda="Escolha a competência — o cenário vem dela"
          />
          <p
            className="uppercase font-bold"
            style={{ color: COR.acento, fontSize: 13, letterSpacing: '0.2em', fontFamily: SANS, margin: 0 }}
          >
            Cenário situacional · {regua.competencia}
          </p>
          <p
            style={{
              color: COR.texto,
              fontSize: 21,
              lineHeight: 1.45,
              fontFamily: SANS,
              maxWidth: 900,
              marginTop: 10,
              marginBottom: 0,
            }}
          >
            {cenario.situacao}
          </p>
          <p
            style={{
              color: COR.texto3,
              fontSize: 16,
              lineHeight: 1.5,
              fontFamily: SANS,
              marginTop: 18,
              maxWidth: 900,
            }}
          >
            Na plataforma é assim que a evidência nasce: a situação é gerada para o cargo, a
            competência e o contexto da empresa, e vem com quatro perguntas abertas — cada uma
            forçando uma decisão com custo. Ninguém digita relatório depois.
          </p>

          <BarraAcao primaria={{ rotulo: 'Ver as 4 perguntas', onClick: () => setPasso(2) }} />
        </div>
      )}

      {/* ── Passo 2: as 4 perguntas + a classificação (o ÚNICO toque) ─ */}
      {passo === 2 && (
        <div>
          <h2
            style={{
              color: COR.texto,
              fontFamily: SERIF,
              fontSize: 'clamp(26px, 3.4vw, 38px)',
              fontWeight: 600,
              lineHeight: 1.15,
              margin: 0,
            }}
          >
            As quatro perguntas do cenário — e o que {cenario.avaliado.nome} respondeu
          </h2>
          <p style={{ color: COR.texto2, fontSize: 19, fontFamily: SANS, marginTop: 10 }}>
            {cenario.avaliado.cargo} · uma decisão em cada pergunta: escolher com custo, executar
            sob resistência, encarar quem discorda e sustentar no médio prazo. É tudo que a régua
            vai ter para ler — e tudo que você vai ter também.
          </p>

          <div className="space-y-4 mt-8">
            {cenario.perguntas.map((p, i) => (
              <Pergunta key={i} indice={i} item={p} avaliado={cenario.avaliado.nome} />
            ))}
          </div>

          {/* O toque. A régua NÃO está na tela: se estivesse, ele leria a âncora
              em vez de classificar — e a demo mediria a capacidade dele de
              casar dois textos. O nome do descritor fica, porque classificar
              sem saber o que está sendo avaliado não é instinto, é adivinhação. */}
          <section
            className="rounded-3xl border p-6 mt-10"
            style={{ background: COR.card, borderColor: COR.bordaAcento }}
          >
            <p
              className="uppercase font-bold"
              style={{ color: COR.acento, fontSize: 13, letterSpacing: '0.2em', fontFamily: SANS, margin: 0 }}
            >
              Descritor avaliado · {descritorTestado?.nome_curto ?? cenario.descritor_cod}
            </p>
            <h3
              style={{
                color: COR.texto,
                fontFamily: SERIF,
                fontSize: 'clamp(22px, 2.8vw, 30px)',
                fontWeight: 600,
                lineHeight: 1.2,
                marginTop: 10,
                marginBottom: 6,
              }}
            >
              Que nível você daria a {cenario.avaliado.nome} nesse ponto?
            </h3>
            <p style={{ color: COR.texto3, fontSize: 16, fontFamily: SANS, marginTop: 0, marginBottom: 18 }}>
              Sem a régua na tela — como acontece na avaliação de verdade, quando o gestor decide de
              cabeça.
            </p>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {NIVEIS.map(({ n, rotulo }) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => classificar(n)}
                  className="rounded-2xl border p-4 text-left"
                  style={{ minHeight: TOQUE, background: COR.fundo0, borderColor: COR.borda }}
                >
                  <span
                    className="block font-bold"
                    style={{ color: COR.acento, fontSize: 26, fontFamily: SANS, lineHeight: 1.1 }}
                  >
                    N{n}
                  </span>
                  <span style={{ color: COR.texto2, fontSize: 15, fontFamily: SANS }}>{rotulo}</span>
                </button>
              ))}
            </div>
          </section>

          <BarraAcao secundaria={{ rotulo: 'Reler a situação', onClick: () => setPasso(1) }} />
        </div>
      )}

      {/* ── Passo 3: a matriz revelada (antes da leitura) ───────── */}
      {passo === 3 && atribuido && (
        <div>
          <h2
            style={{
              color: COR.texto,
              fontFamily: SERIF,
              fontSize: 'clamp(26px, 3.4vw, 36px)',
              fontWeight: 600,
              lineHeight: 1.15,
              margin: 0,
            }}
          >
            Você classificou de cabeça — como todo mundo faz. Agora olha a régua que torna essa
            leitura <em style={{ color: COR.acento }}>auditável</em>.
          </h2>
          <p style={{ color: COR.texto3, fontSize: 16, fontFamily: SANS, marginTop: 20, marginBottom: 10 }}>
            {descritorTestado
              ? `O cenário testa um descritor: ${descritorTestado.nome_curto}. Ele já está aberto.`
              : `${regua.descritores.length} descritores. Toque para ver a régua de cada um.`}
          </p>
          <MatrizDescritores descritores={regua.descritores} inicial={cenario.descritor_cod} />
          <BarraAcao
            primaria={{ rotulo: 'Comparar com a leitura da régua', onClick: () => setPasso(4) }}
            secundaria={{ rotulo: 'Reler as respostas', onClick: () => setPasso(2) }}
          />
        </div>
      )}

      {/* ── Passo 4: a sua leitura × a da régua ─────────────────── */}
      {passo === 4 && atribuido && (
        <div>
          <h2
            style={{
              color: COR.texto,
              fontFamily: SERIF,
              fontSize: 'clamp(26px, 3.4vw, 36px)',
              fontWeight: 600,
              lineHeight: 1.2,
              margin: 0,
            }}
          >
            Você leu <em style={{ color: COR.acento }}>N{atribuido}</em>. A régua lê{' '}
            <em style={{ color: COR.acento }}>N{leitura.nivel}</em> — {formatarNota(leitura.nota)}{' '}
            {relacao === 'igual' ? 'na mesma direção.' : 'nas mesmas respostas.'}
          </h2>
          <p style={{ color: COR.texto2, fontSize: 19, lineHeight: 1.5, fontFamily: SANS, marginTop: 12 }}>
            {relacao === 'igual' &&
              'Mesma leitura — e é o que costuma acontecer com quem já tem uma régua na cabeça. A diferença não está na nota: está em conseguir mostrar em que trecho ela se apoia, e em repetir isso amanhã, com outro avaliador.'}
            {relacao === 'acima' &&
              'Não é certo ou errado: é o mesmo padrão dito em voz alta. Você leu as mesmas respostas com mais generosidade do que a régua — e é assim que a exigência muda de gestor para gestor, sem ninguém perceber.'}
            {relacao === 'abaixo' &&
              'Não é certo ou errado: é o mesmo padrão dito em voz alta. Você foi mais exigente do que a régua — e é assim que a exigência muda de gestor para gestor, sem ninguém perceber.'}
          </p>

          {/* A leitura do motor sobre o conjunto */}
          <section
            className="rounded-3xl border p-6 mt-8"
            style={{ background: COR.card, borderColor: COR.bordaAcento }}
          >
            <p
              className="uppercase font-bold"
              style={{ color: COR.acento, fontSize: 13, letterSpacing: '0.2em', fontFamily: SANS, margin: 0 }}
            >
              A leitura da régua · {descritorTestado?.nome_curto ?? cenario.descritor_cod}
            </p>
            <p style={{ color: COR.texto, fontSize: 18, lineHeight: 1.55, fontFamily: SANS, marginTop: 8, marginBottom: 0 }}>
              {cenario.justificativa}
            </p>
            <p style={{ color: COR.texto3, fontSize: 16, lineHeight: 1.5, fontFamily: SANS, marginTop: 10, marginBottom: 0 }}>
              {cenario.limite}
            </p>
          </section>

          {/* Resposta a resposta: é aqui que "auditável" deixa de ser palavra */}
          <p style={{ color: COR.texto3, fontSize: 16, fontFamily: SANS, marginTop: 26, marginBottom: 10 }}>
            Onde a régua se apoiou, resposta a resposta:
          </p>
          <div className="space-y-3">
            {cenario.perguntas.map((p, i) => (
              <Pergunta key={i} indice={i} item={p} avaliado={cenario.avaliado.nome} revelado />
            ))}
          </div>

          {/* O ponto que o expositor fala em voz alta neste momento. */}
          <section
            className="rounded-3xl border p-6 mt-8"
            style={{ background: 'rgba(52,197,204,0.08)', borderColor: COR.bordaAcento }}
          >
            <p
              className="uppercase font-bold"
              style={{ color: COR.acento, fontSize: 13, letterSpacing: '0.2em', fontFamily: SANS, margin: 0 }}
            >
              A régua não tem viés
            </p>
            <p style={{ color: COR.texto, fontSize: 18, lineHeight: 1.55, fontFamily: SANS, marginTop: 8, marginBottom: 0 }}>
              Ela lê o que está escrito ali — não a simpatia da pessoa, não a última reunião, não a
              sexta-feira que o avaliador teve. As mesmas respostas, amanhã, recebem a mesma leitura; e
              os outros líderes da empresa são lidos pelo mesmo critério, com o mesmo trecho na mão.
              É por isso que {cenario.avaliado.nome} pode discordar da nota sem que vire discussão
              de personalidade: discorda-se de um trecho, não de uma impressão.
            </p>
          </section>

          {modoVisitante ? (
            <div className="mt-10">
              <button
                type="button"
                onClick={onCaptura}
                className="rounded-2xl px-9 font-bold"
                style={{
                  minHeight: TOQUE,
                  background: `linear-gradient(135deg, ${COR.acento}, ${COR.acentoEscuro})`,
                  color: COR.fundo0,
                  fontSize: 21,
                  fontFamily: SANS,
                }}
              >
                Quero receber esse recorte no meu WhatsApp →
              </button>
            </div>
          ) : (
            <>
              <FechoPorta
                gancho="Com a avaliação criteriosa em mãos, o próximo passo é transformar isso em plano. É a etapa 3."
                onConcluiu={onConcluiu}
                onCaptura={onCaptura}
              />
              <BarraAcao primaria={{ rotulo: 'Próxima etapa: PDI', onClick: onProxima }} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Uma pergunta do cenário com a resposta dada. O MESMO componente serve os
 * dois momentos — antes da classificação (foco, pergunta e resposta) e depois
 * dela (`revelado`: nível, trecho e leitura). Um componente só porque o
 * visitante precisa reconhecer, na comparação, o mesmo material que leu — e
 * porque duplicar a marcação era o caminho curto para o nível vazar na tela
 * onde ele ainda não pode aparecer.
 */
function Pergunta({
  indice,
  item,
  avaliado,
  revelado,
}: {
  indice: number;
  item: PerguntaAvaliativa;
  avaliado: string;
  revelado?: boolean;
}) {
  return (
    <div
      className="rounded-2xl border p-5"
      style={{ background: COR.card, borderColor: revelado ? COR.bordaAcento : COR.borda }}
    >
      <div className="flex items-start gap-4">
        <span
          className="flex items-center justify-center rounded-full flex-shrink-0 font-bold"
          style={{
            width: 40,
            height: 40,
            background: revelado ? COR.acento : 'rgba(255,255,255,0.06)',
            color: revelado ? COR.fundo0 : COR.texto3,
            fontSize: revelado ? 15 : 17,
            fontFamily: SANS,
          }}
        >
          {revelado ? `N${item.nivel}` : indice + 1}
        </span>
        <div style={{ minWidth: 0 }}>
          {/* O papel da pergunta na régua da IA3. Fica visível porque é o que
              separa um instrumento de um questionário: cada uma cobra uma
              coisa diferente, e é isso que o expositor aponta com o dedo. */}
          <p
            className="uppercase font-bold"
            style={{
              color: COR.acento,
              fontSize: 12,
              letterSpacing: '0.18em',
              fontFamily: SANS,
              margin: '0 0 6px',
            }}
          >
            {item.foco}
          </p>
          <p
            style={{
              color: COR.texto3,
              fontSize: 16,
              lineHeight: 1.45,
              fontFamily: SANS,
              margin: 0,
              fontStyle: 'italic',
            }}
          >
            {item.pergunta}
          </p>
          <p
            style={{
              color: COR.texto,
              fontSize: 17,
              lineHeight: 1.55,
              fontFamily: SANS,
              marginTop: 8,
              marginBottom: 0,
            }}
          >
            <strong style={{ color: COR.texto2 }}>{avaliado}:</strong> {item.resposta}
          </p>

          {revelado && (
            <>
              <p
                className="flex items-start gap-2"
                style={{
                  color: COR.acento,
                  fontSize: 16,
                  lineHeight: 1.5,
                  fontFamily: SANS,
                  marginTop: 12,
                  marginBottom: 0,
                }}
              >
                <Quote size={16} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 4 }} />
                {item.evidencia}
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
                {item.leitura}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
