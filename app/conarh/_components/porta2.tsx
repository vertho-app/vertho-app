'use client';

// CONARH 52 — Porta 2: o único toque do visitante.
//
// Desde 04/08/2026 a porta roda o CENÁRIO SITUACIONAL da competência escolhida
// na porta 1 — o artefato que a plataforma gera de verdade — no lugar do
// registro escrito à mão. Motivo: o registro fazia a demo parecer depender de
// um gestor com boa memória escrevendo um relatório bom; o cenário mostra a
// engrenagem real, e as 4 respostas provam a tese melhor do que qualquer
// texto explicativo — as quatro são plausíveis, e a régua as separa.
// (O registro escrito continua vivo na PRANCHETA, o fallback de papel.)
//
// Sequência em 4 estados:
//   1) a situação (lê) → 2) escolhe a resposta que ACEITARIA (o toque) →
//   3) a matriz revelada, aberta no descritor que a situação testa →
//   4) a leitura da régua sobre a escolha dele + as outras três, por nível.
// Regra dura: NUNCA "certo/errado" — a linguagem é "o seu padrão" x "a régua".

import { useState } from 'react';
import { Check } from 'lucide-react';
import type { ConteudoConarh, RespostaCenario } from '../_data/types';
import type { ResultadoPorta2 } from './sessao';
import { COR, SANS, SERIF, TOQUE } from './tema';
import { BarraAcao, TituloPorta } from './chrome';
import { FechoPorta } from './porta-shell';
import { MatrizDescritores } from './matriz';
import { acharRegua } from './reguas';

const NOMES_NIVEL = ['', 'N1 · gap', 'N2 · desenvolvimento', 'N3 · meta', 'N4 · referência'];

/** A meta da régua: N3 é o nível que a empresa quer ver acontecendo. */
const NIVEL_META = 3;

export function Porta2({
  conteudo,
  reguaId,
  modoVisitante,
  onFinalizar,
  onConcluiu,
  onCaptura,
  onProxima,
}: {
  conteudo: ConteudoConarh;
  reguaId: string;
  modoVisitante?: boolean;
  onFinalizar: (r: ResultadoPorta2) => void;
  onConcluiu: () => void;
  onCaptura: () => void;
  onProxima: () => void;
}) {
  const { portas } = conteudo;
  const regua = acharRegua(conteudo, reguaId);
  const cenario = regua.cenario;
  const descritorTestado = regua.descritores.find((d) => d.cod === cenario.descritor_cod);

  const [passo, setPasso] = useState<1 | 2 | 3 | 4>(1);
  const [escolhaId, setEscolhaId] = useState<string | null>(null);

  const escolha = cenario.respostas.find((r) => r.id === escolhaId) ?? null;
  const porNivel = [...cenario.respostas].sort((a, b) => a.nivel - b.nivel);

  function escolher(r: RespostaCenario) {
    setEscolhaId(r.id);
    onFinalizar({
      regua: regua.id,
      competencia: regua.competencia,
      cenario: cenario.id,
      descritor: cenario.descritor_cod,
      nivel_aceito: r.nivel,
      nivel_meta: NIVEL_META,
    });
    setPasso(3);
  }

  return (
    <div>
      <TituloPorta numero={2} nome={portas[1].nome} sub={portas[1].sub} />

      {/* ── Passo 1: a situação ─────────────────────────────────── */}
      {passo === 1 && (
        <div>
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
            competência e o contexto da empresa — ninguém digita relatório depois.
          </p>

          <BarraAcao primaria={{ rotulo: 'Ver as 4 respostas', onClick: () => setPasso(2) }} />
        </div>
      )}

      {/* ── Passo 2: a escolha (o ÚNICO toque) ──────────────────── */}
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
            {cenario.pergunta}
          </h2>
          <p style={{ color: COR.texto2, fontSize: 19, fontFamily: SANS, marginTop: 10 }}>
            As quatro são plausíveis e você já ouviu todas elas. Sem tabela, sem régua — só o seu
            critério de gestor.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-8">
            {cenario.respostas.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => escolher(r)}
                className="rounded-3xl border p-5 text-left"
                style={{ minHeight: TOQUE, background: COR.card, borderColor: COR.bordaAcento }}
              >
                <span
                  className="block"
                  style={{ color: COR.texto2, fontSize: 17, lineHeight: 1.55, fontFamily: SANS }}
                >
                  {r.texto}
                </span>
              </button>
            ))}
          </div>

          <BarraAcao secundaria={{ rotulo: 'Reler a situação', onClick: () => setPasso(1) }} />
        </div>
      )}

      {/* ── Passo 3: a matriz revelada (antes da leitura) ───────── */}
      {passo === 3 && escolha && (
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
            Você aceitaria essa resposta. Agora olha a régua que torna essa escolha{' '}
            <em style={{ color: COR.acento }}>auditável</em>.
          </h2>
          <p style={{ color: COR.texto3, fontSize: 16, fontFamily: SANS, marginTop: 20, marginBottom: 10 }}>
            {descritorTestado
              ? `A situação testa um descritor: ${descritorTestado.nome_curto}. Ele já está aberto.`
              : `${regua.descritores.length} descritores. Toque para ver a régua de cada um.`}
          </p>
          <MatrizDescritores descritores={regua.descritores} inicial={cenario.descritor_cod} />
          <BarraAcao
            primaria={{ rotulo: 'Ver a leitura da sua escolha', onClick: () => setPasso(4) }}
            secundaria={{ rotulo: 'Voltar às respostas', onClick: () => setPasso(2) }}
          />
        </div>
      )}

      {/* ── Passo 4: a leitura da régua ─────────────────────────── */}
      {passo === 4 && escolha && (
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
            {escolha.nivel >= NIVEL_META ? (
              <>
                Você aceitaria um <em style={{ color: COR.acento }}>N{escolha.nivel}</em> — o seu
                padrão já está na meta da régua.
              </>
            ) : (
              <>
                Você aceitaria um <em style={{ color: COR.acento }}>N{escolha.nivel}</em> — e a meta
                da régua é N{NIVEL_META}.
              </>
            )}
          </h2>
          <p style={{ color: COR.texto2, fontSize: 19, lineHeight: 1.5, fontFamily: SANS, marginTop: 12 }}>
            Não é certo ou errado: é o mesmo padrão dito em voz alta. Sem a régua, essa exigência
            muda de gestor para gestor — e a pessoa avaliada não tem como saber qual delas vale.
          </p>

          {/* A escolha dele, lida em detalhe */}
          <section
            className="rounded-3xl border p-6 mt-8"
            style={{ background: COR.card, borderColor: COR.bordaAcento }}
          >
            <p
              className="uppercase font-bold"
              style={{ color: COR.acento, fontSize: 13, letterSpacing: '0.2em', fontFamily: SANS, margin: 0 }}
            >
              Sua escolha · {NOMES_NIVEL[escolha.nivel]}
            </p>
            <p style={{ color: COR.texto, fontSize: 18, lineHeight: 1.55, fontFamily: SANS, marginTop: 8, marginBottom: 0 }}>
              {escolha.texto}
            </p>
            <blockquote
              className="rounded-2xl p-4 mt-4"
              style={{ background: 'rgba(255,255,255,0.03)', borderLeft: `4px solid ${COR.acento}`, margin: 0 }}
            >
              <p style={{ color: COR.texto, fontSize: 17, lineHeight: 1.55, fontFamily: SANS, margin: 0, fontStyle: 'italic' }}>
                {escolha.evidencia}
              </p>
            </blockquote>
            <p style={{ color: COR.texto2, fontSize: 17, lineHeight: 1.55, fontFamily: SANS, marginTop: 10, marginBottom: 0 }}>
              {escolha.justificativa}
            </p>
            <p style={{ color: COR.texto3, fontSize: 16, lineHeight: 1.5, fontFamily: SANS, marginTop: 6, marginBottom: 0 }}>
              {escolha.limite}
            </p>
          </section>

          {/* As quatro, agora por nível — a prova de que a régua ordena */}
          <p style={{ color: COR.texto3, fontSize: 16, fontFamily: SANS, marginTop: 26, marginBottom: 10 }}>
            As quatro respostas, na régua:
          </p>
          <div className="space-y-3">
            {porNivel.map((r) => {
              const sua = r.id === escolha.id;
              return (
                <div
                  key={r.id}
                  className="rounded-2xl border p-4 flex gap-4"
                  style={{
                    background: sua ? 'rgba(52,197,204,0.10)' : COR.card,
                    borderColor: sua ? COR.bordaAcento : COR.borda,
                  }}
                >
                  <span
                    className="flex items-center justify-center rounded-full flex-shrink-0 font-bold"
                    style={{
                      width: 44,
                      height: 44,
                      background: sua ? COR.acento : 'rgba(255,255,255,0.06)',
                      color: sua ? COR.fundo0 : COR.texto3,
                      fontSize: 17,
                      fontFamily: SANS,
                    }}
                  >
                    N{r.nivel}
                  </span>
                  <span style={{ color: sua ? COR.texto : COR.texto2, fontSize: 16, lineHeight: 1.5, fontFamily: SANS }}>
                    {r.texto}
                    {sua && (
                      <strong className="flex items-center gap-1.5" style={{ color: COR.acento, marginTop: 6 }}>
                        <Check size={16} strokeWidth={3} /> a sua
                      </strong>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

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
