'use client';

// CONARH 52 — Porta 2: o único toque do visitante. Sequência em 5 estados:
//   1) registro da conversa (lê) → 2) nota instintiva 1–4 (O toque) →
//   3) matriz revelada → 4) reavaliação descritor a descritor →
//   5) leitura do motor lado a lado (convergências/divergências + evidência).
// Regras duras: NUNCA "certo/errado" — só "convergiram/divergiram"; a matriz
// SEMPRE aparece antes da reavaliação.

import { useMemo, useState } from 'react';
import { Check, GitBranch } from 'lucide-react';
import type { ConteudoConarh } from '../_data/types';
import type { ResultadoPorta2 } from './sessao';
import { COR, SANS, SERIF, TOQUE } from './tema';
import { BarraAcao, TituloPorta } from './chrome';
import { FechoPorta } from './porta-shell';
import { MatrizDescritores } from './matriz';
import { RegistroRecorte } from './registro';
import { partirNaPrimeiraFrase } from './texto';

const NOMES_NIVEL = ['', 'N1 · gap', 'N2 · desenvolvimento', 'N3 · meta', 'N4 · referência'];

export function Porta2({
  conteudo,
  modoVisitante,
  onFinalizar,
  onConcluiu,
  onCaptura,
  onAgendar,
  onProxima,
}: {
  conteudo: ConteudoConarh;
  modoVisitante?: boolean;
  onFinalizar: (r: ResultadoPorta2) => void;
  onConcluiu: () => void;
  onCaptura: () => void;
  onAgendar: () => void;
  onProxima: () => void;
}) {
  const { porta2, portas } = conteudo;
  const [passo, setPasso] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [notaInstintiva, setNotaInstintiva] = useState<number | null>(null);
  const [indiceDescritor, setIndiceDescritor] = useState(0);
  const [reavaliacao, setReavaliacao] = useState<Array<{ descritor: string; nota: number }>>([]);
  const [verContexto, setVerContexto] = useState(false);
  const [cardAberto, setCardAberto] = useState<string | null>(null);
  const contexto = useMemo(() => partirNaPrimeiraFrase(porta2.contexto), [porta2.contexto]);

  const mediaMotor = useMemo(() => {
    if (porta2.descritores.length === 0) return 0;
    return (
      porta2.descritores.reduce((acc, d) => acc + d.leitura_motor.nota, 0) /
      porta2.descritores.length
    );
  }, [porta2.descritores]);

  function concluirReavaliacao(lista: Array<{ descritor: string; nota: number }>) {
    const divergencias = lista
      .filter((item) => {
        const d = porta2.descritores.find((x) => x.cod === item.descritor);
        return d ? item.nota !== d.leitura_motor.nivel : false;
      })
      .map((item) => item.descritor);
    onFinalizar({
      nota_instintiva: notaInstintiva ?? 0,
      reavaliacao: lista,
      divergencias,
    });
    // A primeira divergência já entra aberta: é o card que prova a porta, e
    // sem ele o fecho vira uma lista de rótulos sem evidência na tela.
    setCardAberto(divergencias[0] ?? null);
    setPasso(5);
  }

  function escolherReavaliacao(nota: number) {
    const d = porta2.descritores[indiceDescritor];
    const lista = [...reavaliacao, { descritor: d.cod, nota }];
    setReavaliacao(lista);
    if (indiceDescritor + 1 < porta2.descritores.length) {
      setIndiceDescritor(indiceDescritor + 1);
    } else {
      concluirReavaliacao(lista);
    }
  }

  const instintoConvergiu =
    notaInstintiva !== null && Math.abs(notaInstintiva - mediaMotor) <= 0.5;

  return (
    <div>
      <TituloPorta numero={2} nome={portas[1].nome} sub={portas[1].sub} />

      {/* ── Passo 1: o registro, em 3 momentos ──────────────────── */}
      {passo === 1 && (
        <div>
          <p
            style={{
              color: COR.texto,
              fontSize: 21,
              lineHeight: 1.4,
              fontFamily: SANS,
              maxWidth: 900,
              margin: 0,
            }}
          >
            {contexto.manchete}
          </p>
          {contexto.resto && (
            <>
              <button
                type="button"
                onClick={() => setVerContexto(!verContexto)}
                style={{
                  color: COR.acento,
                  fontSize: 17,
                  fontWeight: 700,
                  fontFamily: SANS,
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  marginTop: 6,
                }}
              >
                {verContexto ? 'Esconder ↑' : 'O que aconteceu na sexta ↓'}
              </button>
              {verContexto && (
                <p
                  style={{
                    color: COR.texto2,
                    fontSize: 18,
                    lineHeight: 1.55,
                    fontFamily: SANS,
                    marginTop: 8,
                    maxWidth: 900,
                  }}
                >
                  {contexto.resto}
                </p>
              )}
            </>
          )}

          <p style={{ color: COR.texto3, fontSize: 16, fontFamily: SANS, marginTop: 22, marginBottom: 10 }}>
            Renata registrou a conversa por escrito. Três momentos:
          </p>
          <RegistroRecorte trechos={porta2.registro_trechos} completo={porta2.registro_conversa} />

          <BarraAcao
            primaria={{ rotulo: 'Avaliar esse registro', onClick: () => setPasso(2) }}
          />
        </div>
      )}

      {/* ── Passo 2: a nota instintiva (o ÚNICO toque) ──────────── */}
      {passo === 2 && (
        <div>
          <h2
            style={{
              color: COR.texto,
              fontFamily: SERIF,
              fontSize: 'clamp(28px, 3.6vw, 40px)',
              fontWeight: 600,
              lineHeight: 1.15,
              margin: 0,
            }}
          >
            De 1 a 4, que nota você dá para essa conversa?
          </h2>
          <p style={{ color: COR.texto2, fontSize: 20, fontFamily: SANS, marginTop: 10 }}>
            Sem critério, sem tabela — só a sua intuição de gestor.
          </p>
          <div className="grid grid-cols-4 gap-4 mt-10" style={{ maxWidth: 720 }}>
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setNotaInstintiva(n);
                  setPasso(3);
                }}
                className="rounded-3xl border font-bold"
                style={{
                  minHeight: 120,
                  background: COR.card,
                  borderColor: COR.bordaAcento,
                  color: COR.acento,
                  fontSize: 52,
                  fontFamily: SERIF,
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Passo 3: a matriz revelada (SEMPRE antes da reavaliação) */}
      {passo === 3 && (
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
            Você deu <em style={{ color: COR.acento }}>{notaInstintiva}</em>. Agora olha a régua
            que torna essa nota auditável.
          </h2>
          <p style={{ color: COR.texto3, fontSize: 16, fontFamily: SANS, marginTop: 20, marginBottom: 10 }}>
            {porta2.descritores.length} descritores. Toque para ver a régua de cada um.
          </p>
          <MatrizDescritores descritores={porta2.descritores} />
          <BarraAcao
            primaria={{ rotulo: 'Reavaliar com a matriz', onClick: () => setPasso(4) }}
            secundaria={{ rotulo: 'Voltar ao registro', onClick: () => setPasso(1) }}
          />
        </div>
      )}

      {/* ── Passo 4: reavaliação descritor a descritor ──────────── */}
      {passo === 4 && porta2.descritores[indiceDescritor] && (
        <Passo4Reavaliacao
          key={porta2.descritores[indiceDescritor].cod}
          descritor={porta2.descritores[indiceDescritor]}
          indice={indiceDescritor}
          total={porta2.descritores.length}
          registro={porta2.registro_conversa}
          trechos={porta2.registro_trechos}
          onEscolher={escolherReavaliacao}
          onPular={() => concluirReavaliacao(reavaliacao)}
        />
      )}

      {/* ── Passo 5: leitura do motor lado a lado ───────────────── */}
      {passo === 5 && (
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
            {instintoConvergiu ? (
              <>
                Sua intuição já é criteriosa —{' '}
                <em style={{ color: COR.acento }}>a matriz só a torna auditável</em>.
              </>
            ) : (
              <>
                Instinto e critério contaram histórias diferentes —{' '}
                <em style={{ color: COR.acento }}>e agora dá para discutir com evidência</em>.
              </>
            )}
          </h2>
          <p style={{ color: COR.texto2, fontSize: 19, fontFamily: SANS, marginTop: 10 }}>
            Sua nota de olho: <strong style={{ color: COR.texto }}>{notaInstintiva}</strong>
            {' '}· leitura média do motor com a matriz:{' '}
            <strong style={{ color: COR.acento }}>{mediaMotor.toFixed(1)}</strong>. Não é questão de
            certo ou errado — é critério explícito contra critério implícito.
            {reavaliacao.length < porta2.descritores.length && (
              <span style={{ color: COR.texto3 }}>
                {' '}Você avaliou {reavaliacao.length} de {porta2.descritores.length} descritores —
                os demais aparecem só com a leitura do motor.
              </span>
            )}
          </p>

          <div className="mt-8 space-y-4">
            {porta2.descritores.map((d) => {
              const sua = reavaliacao.find((r) => r.descritor === d.cod)?.nota;
              const avaliado = sua !== undefined;
              const convergiu = avaliado && sua === d.leitura_motor.nivel;
              // Colapsado por padrão: 6 justificativas abertas somam 638
              // palavras numa tela só (medido 03/08). Abre-se a que o
              // visitante perguntar — e a primeira divergência já vem aberta,
              // porque é ela que prova a porta.
              const expandido = cardAberto === d.cod;
              return (
                <section
                  key={d.cod}
                  className="rounded-3xl border p-6"
                  style={{
                    background: COR.card,
                    borderColor: !avaliado
                      ? COR.borda
                      : convergiu
                        ? 'rgba(52,211,153,0.35)'
                        : 'rgba(251,191,36,0.35)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setCardAberto(expandido ? null : d.cod)}
                    className="flex items-center gap-3 flex-wrap w-full text-left"
                    style={{ background: 'none', border: 'none', padding: 0 }}
                  >
                    {avaliado &&
                      (convergiu ? (
                        <Check size={22} style={{ color: COR.verde }} />
                      ) : (
                        <GitBranch size={22} style={{ color: COR.ambar }} />
                      ))}
                    <span style={{ color: COR.texto, fontSize: 21, fontWeight: 700, fontFamily: SANS }}>
                      {d.nome_curto}
                    </span>
                    <span
                      className="rounded-full px-3.5 py-1.5 font-bold"
                      style={{
                        background: !avaliado
                          ? 'rgba(255,255,255,0.06)'
                          : convergiu
                            ? 'rgba(52,211,153,0.12)'
                            : 'rgba(251,191,36,0.12)',
                        color: !avaliado ? COR.texto3 : convergiu ? COR.verde : COR.ambar,
                        fontSize: 15,
                        fontFamily: SANS,
                      }}
                    >
                      {!avaliado ? 'não avaliado' : convergiu ? 'convergiram' : 'divergiram'}
                    </span>
                    <span style={{ color: COR.texto2, fontSize: 17, fontFamily: SANS }}>
                      você: <strong>{sua ? `N${sua}` : '—'}</strong> · motor:{' '}
                      <strong style={{ color: COR.acento }}>
                        N{d.leitura_motor.nivel} ({d.leitura_motor.nota.toFixed(1)})
                      </strong>
                    </span>
                    <span
                      style={{ color: COR.acento, fontSize: 16, fontWeight: 700, fontFamily: SANS, marginLeft: 'auto' }}
                    >
                      {expandido ? 'esconder ↑' : 'por quê ↓'}
                    </span>
                  </button>
                  {expandido && (
                    <>
                      <blockquote
                        className="rounded-2xl p-4 mt-4"
                        style={{
                          background: 'rgba(255,255,255,0.03)',
                          borderLeft: `4px solid ${COR.acento}`,
                          margin: 0,
                        }}
                      >
                        <p style={{ color: COR.texto, fontSize: 17, lineHeight: 1.55, fontFamily: SANS, margin: 0, fontStyle: 'italic' }}>
                          “{d.leitura_motor.evidencia}”
                        </p>
                      </blockquote>
                      <p style={{ color: COR.texto2, fontSize: 17, lineHeight: 1.55, fontFamily: SANS, marginTop: 10, marginBottom: 0 }}>
                        {d.leitura_motor.justificativa}
                      </p>
                      <p style={{ color: COR.texto3, fontSize: 16, lineHeight: 1.5, fontFamily: SANS, marginTop: 6, marginBottom: 0 }}>
                        Para o nível acima faltou: {d.leitura_motor.limite}
                      </p>
                    </>
                  )}
                </section>
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
                onAgendar={onAgendar}
              />
              <BarraAcao primaria={{ rotulo: 'Próxima etapa: PDI', onClick: onProxima }} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Sub-componente do passo 4 (remonta a cada descritor via `key`).
function Passo4Reavaliacao({
  descritor,
  indice,
  total,
  registro,
  trechos,
  onEscolher,
  onPular,
}: {
  descritor: ConteudoConarh['porta2']['descritores'][number];
  indice: number;
  total: number;
  registro: string;
  trechos: ConteudoConarh['porta2']['registro_trechos'];
  onEscolher: (nota: number) => void;
  onPular: () => void;
}) {
  const [verRegistro, setVerRegistro] = useState(false);
  const ancoraPorNivel = [descritor.n1, descritor.n2, descritor.n3, descritor.n4];
  return (
    <div>
      <p
        className="uppercase font-bold"
        style={{ color: COR.texto3, fontSize: 14, letterSpacing: '0.22em', fontFamily: SANS }}
      >
        Descritor {indice + 1} de {total}
      </p>
      <h2
        style={{
          color: COR.texto,
          fontFamily: SERIF,
          fontSize: 'clamp(26px, 3.4vw, 36px)',
          fontWeight: 600,
          lineHeight: 1.15,
          margin: '8px 0 0',
        }}
      >
        {descritor.nome_curto}
      </h2>
      <p style={{ color: COR.texto2, fontSize: 19, lineHeight: 1.5, fontFamily: SANS, marginTop: 8 }}>
        {descritor.descritor_completo}
      </p>
      <button
        type="button"
        onClick={() => setVerRegistro(!verRegistro)}
        style={{ color: COR.acento, fontSize: 17, fontWeight: 700, fontFamily: SANS, background: 'none', border: 'none', padding: 0, marginTop: 4 }}
      >
        {verRegistro ? 'Esconder o registro ↑' : 'Reler o registro da conversa ↓'}
      </button>
      {verRegistro && (
        <div className="mt-3">
          <RegistroRecorte trechos={trechos} completo={registro} />
        </div>
      )}
      <p style={{ color: COR.texto, fontSize: 21, fontWeight: 700, fontFamily: SANS, marginTop: 24 }}>
        Com a matriz na mão, em que nível está essa conversa?
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
        {ancoraPorNivel.map((ancora, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onEscolher(i + 1)}
            className="rounded-3xl border p-5 text-left"
            style={{ minHeight: TOQUE, background: COR.card, borderColor: COR.bordaAcento }}
          >
            <span style={{ color: COR.acento, fontSize: 17, fontWeight: 800, fontFamily: SANS }}>
              {NOMES_NIVEL[i + 1]}
            </span>
            <span className="block" style={{ color: COR.texto2, fontSize: 17, lineHeight: 1.5, fontFamily: SANS, marginTop: 6 }}>
              {ancora}
            </span>
          </button>
        ))}
      </div>
      {/* Modo curto: fila no estande → pula os descritores restantes e cai
          direto na leitura do motor com os que já foram avaliados.
          Só a partir do 3º descritor: com 0 ou 1 marcação a tela de fecho vira
          uma lista de "não avaliado" sem nenhum convergiu/divergiu — a porta 2
          é a prova da demo, e o atalho não pode esvaziá-la. */}
      {indice >= 2 && indice + 1 < total && (
        <button
          type="button"
          onClick={onPular}
          className="mt-6"
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            color: COR.texto3,
            fontSize: 16,
            fontWeight: 600,
            fontFamily: SANS,
            textDecoration: 'underline',
          }}
        >
          Sem tempo para os {total - indice - 1} descritores restantes? Ir direto para a leitura do motor →
        </button>
      )}
    </div>
  );
}
