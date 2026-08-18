'use client';

// CONARH 52 — raiz cliente da demo: máquina de estados (hub → portas →
// captura → confirmação), sessão no cliente, reset total entre visitantes
// (botão "novo visitante" + 5 min sem toque) e flush da fila offline.
// Nenhuma rede durante a demo — só no submit final e no flush.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, WifiOff } from 'lucide-react';
import type { ConteudoConarh } from '../_data/types';
import type { NumeroPorta, Telemetria } from './sessao';
import {
  marcarConclusao,
  marcarInicio,
  registrarPorta2,
  telemetriaVazia,
  type ResultadoPorta2,
} from './sessao';
import { flushFila, totalPendentes } from './capture';
import type { ResultadoForm } from './captura';
import { LinkMapa, QrMapa } from './qr-mapa';
import { mapaEvolucaoUrl } from '@/lib/conarh/conteudo';
import { BarraTopo } from './chrome';
import { Hub } from './hub';
import { Porta1 } from './porta1';
import { Porta2 } from './porta2';
import { Porta3 } from './porta3';
import { Porta4 } from './porta4';
import { Porta5 } from './porta5';
import { Captura } from './captura';
import { ID_REGUA_CASO } from './reguas';
import { COR, FUNDO, SANS, SERIF, TOQUE } from './tema';

type Tela =
  | { tipo: 'hub' }
  | { tipo: 'porta'; porta: NumeroPorta }
  | { tipo: 'captura' }
  | { tipo: 'confirmacao'; resultado: ResultadoForm };

const TEMPO_RESET_MS = 5 * 60 * 1000; // 5 min sem toque → volta ao hub limpo

export function ConarhApp({
  conteudo,
  modoVisitante,
}: {
  conteudo: ConteudoConarh;
  modoVisitante: boolean;
}) {
  const [tela, setTela] = useState<Tela>(
    modoVisitante ? { tipo: 'porta', porta: 2 } : { tipo: 'hub' },
  );
  // Pilha de navegação do botão "Voltar". É explícita, e não o histórico do
  // browser, porque a demo é uma máquina de estados numa rota só: o botão do
  // sistema levaria o visitante para FORA de /conarh, e no tablet do estande
  // isso significa perder a sessão inteira na frente dele.
  const [historico, setHistorico] = useState<Tela[]>([]);
  // A etapa 2 tem passos internos; voltar ali é voltar UM passo, não a tela
  // inteira. Ela registra aqui como desfazer o próprio passo — e registra
  // `null` no primeiro passo, que é o que faz o botão sumir quando não há
  // para onde voltar dentro da etapa.
  const [voltarNaEtapa, setVoltarNaEtapa] = useState<(() => void) | null>(null);
  const [telemetria, setTelemetria] = useState<Telemetria>(telemetriaVazia);
  // A competência escolhida na etapa 1 vive AQUI porque a etapa 2 roda o
  // cenário dela — se cada porta guardasse a sua, o visitante escolheria
  // Vendas e responderia um cenário de liderança.
  const [reguaId, setReguaId] = useState(ID_REGUA_CASO);
  const [pendentes, setPendentes] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetar = useCallback(() => {
    setTelemetria(telemetriaVazia());
    // A régua também volta ao caso: sem isto, o próximo visitante herdaria a
    // competência escolhida pelo anterior — e o expositor não veria por quê.
    setReguaId(ID_REGUA_CASO);
    setHistorico([]);
    setTela(modoVisitante ? { tipo: 'porta', porta: 2 } : { tipo: 'hub' });
  }, [modoVisitante]);

  /** Toda navegação passa por aqui — é o que alimenta o "Voltar". */
  const irPara = useCallback((destino: Tela) => {
    setHistorico((h) => [...h, tela]);
    setTela(destino);
  }, [tela]);

  const voltar = useCallback(() => {
    // Dentro da etapa primeiro: no passo 3 da etapa 2, "Voltar" é o passo 2 —
    // não a tela anterior, que jogaria fora os três passos que ele já leu.
    if (voltarNaEtapa) {
      voltarNaEtapa();
      return;
    }
    const anterior = historico[historico.length - 1];
    if (!anterior) return;
    setHistorico((h) => h.slice(0, -1));
    setTela(anterior);
  }, [voltarNaEtapa, historico]);

  // `useCallback` sem dependência não é estilo: a etapa 2 registra o handler
  // dentro de um `useEffect` que depende desta função. Recriá-la a cada render
  // faria o efeito disparar de novo a cada render — set state, render, set
  // state — e o tablet trava no estande, não aqui.
  const registrarVoltarNaEtapa = useCallback((fn: (() => void) | null) => {
    setVoltarNaEtapa(() => fn);
  }, []);

  const podeVoltar = !!voltarNaEtapa || historico.length > 0;

  // Reset por inatividade — qualquer toque reinicia o relógio.
  useEffect(() => {
    const reiniciar = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(resetar, TEMPO_RESET_MS);
    };
    reiniciar();
    window.addEventListener('pointerdown', reiniciar);
    window.addEventListener('keydown', reiniciar);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener('pointerdown', reiniciar);
      window.removeEventListener('keydown', reiniciar);
    };
  }, [resetar]);

  // Fila offline: tenta enviar ao montar, quando a rede volta e a cada 30 s.
  useEffect(() => {
    let vivo = true;
    const tentar = async () => {
      const restam = await flushFila();
      if (vivo) setPendentes(restam);
    };
    tentar();
    const intervalo = setInterval(tentar, 30_000);
    window.addEventListener('online', tentar);
    setPendentes(totalPendentes());
    return () => {
      vivo = false;
      clearInterval(intervalo);
      window.removeEventListener('online', tentar);
    };
  }, [tela.tipo]); // re-tenta ao trocar de tela (ex.: depois de enfileirar)

  // Sobe a tela a cada troca — expositor nunca rola de volta manualmente.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tela]);

  function abrirPorta(porta: NumeroPorta) {
    setTelemetria((t) => marcarInicio(t, porta));
    irPara({ tipo: 'porta', porta });
  }

  // Caminho ÚNICO para o formulário desde 04/08/2026: o fecho de cada etapa
  // tem um CTA só ("Receber esse recorte"). Marcar a reunião voltou a ser
  // conversa — o fechador combina o horário depois, pelo WhatsApp.
  function abrirCaptura() {
    setTelemetria((t) =>
      tela.tipo === 'porta'
        ? { ...marcarConclusao(t, tela.porta), porta_origem: tela.porta }
        : t,
    );
    irPara({ tipo: 'captura' });
  }

  function finalizarPorta2(r: ResultadoPorta2) {
    setTelemetria((t) => registrarPorta2(t, r));
  }

  const portaAtual = tela.tipo === 'porta' ? tela.porta : null;

  return (
    <main
      className="min-h-dvh"
      style={{ background: FUNDO, fontFamily: SANS, color: COR.texto }}
    >
      <BarraTopo
        rotulo={conteudo.rotulo}
        onHub={() => irPara({ tipo: 'hub' })}
        onVoltar={podeVoltar ? voltar : undefined}
        onNovoVisitante={resetar}
        esconderNavegacao={modoVisitante}
      />

      {/* padding limpa as barras fixas (topo ~72px, ação ~100px) */}
      <div
        className="mx-auto px-6"
        style={{ maxWidth: 1060, paddingTop: 104, paddingBottom: 150 }}
      >
        {tela.tipo === 'hub' && (
          <>
            <Hub
              conteudo={conteudo}
              rotasConcluidas={telemetria.rotas_concluidas}
              onAbrir={abrirPorta}
            />
            {pendentes > 0 && (
              <p
                className="flex items-center gap-2 mt-8"
                style={{ color: COR.texto3, fontSize: 15, fontFamily: SANS }}
              >
                <WifiOff size={15} />
                {pendentes} contato(s) salvo(s) no aparelho — envio automático quando a rede voltar.
              </p>
            )}
          </>
        )}

        {portaAtual === 1 && (
          <Porta1
            conteudo={conteudo}
            reguaId={reguaId}
            onTrocarRegua={setReguaId}
            onConcluiu={() => setTelemetria((t) => marcarConclusao(t, 1))}
            onCaptura={() => abrirCaptura()}
            onProxima={() => abrirPorta(2)}
          />
        )}
        {portaAtual === 2 && (
          <Porta2
            conteudo={conteudo}
            reguaId={reguaId}
            onTrocarRegua={setReguaId}
            modoVisitante={modoVisitante}
            onVoltarNaEtapa={registrarVoltarNaEtapa}
            onFinalizar={finalizarPorta2}
            onConcluiu={() => setTelemetria((t) => marcarConclusao(t, 2))}
            onCaptura={() => abrirCaptura()}
            onProxima={() => abrirPorta(3)}
          />
        )}
        {portaAtual === 3 && (
          <Porta3
            conteudo={conteudo}
            onConcluiu={() => setTelemetria((t) => marcarConclusao(t, 3))}
            onCaptura={() => abrirCaptura()}
            onProxima={() => abrirPorta(4)}
          />
        )}
        {portaAtual === 4 && (
          <Porta4
            conteudo={conteudo}
            onConcluiu={() => setTelemetria((t) => marcarConclusao(t, 4))}
            onCaptura={() => abrirCaptura()}
            onProxima={() => abrirPorta(5)}
          />
        )}
        {portaAtual === 5 && (
          <Porta5
            conteudo={conteudo}
            onConcluiu={() => setTelemetria((t) => marcarConclusao(t, 5))}
            onCaptura={() => abrirCaptura()}
            onProxima={() => irPara({ tipo: 'hub' })}
          />
        )}

        {tela.tipo === 'captura' && (
          <Captura
            conteudo={conteudo}
            telemetria={telemetria}
            modoVisitante={modoVisitante}
            onSucesso={(resultado) => {
              // Confirmação ENCERRA o fluxo: a pilha é zerada de propósito.
              // "Voltar" aqui levaria ao formulário já enviado, e o expositor
              // reenviaria o mesmo lead sem perceber.
              setHistorico([]);
              setTela({ tipo: 'confirmacao', resultado });
            }}
          />
        )}

        {tela.tipo === 'confirmacao' && (
          <Confirmacao
            resultado={tela.resultado}
            modoVisitante={modoVisitante}
            onNovoVisitante={resetar}
          />
        )}
      </div>
    </main>
  );
}

function Confirmacao({
  resultado,
  modoVisitante,
  onNovoVisitante,
}: {
  resultado: ResultadoForm;
  modoVisitante: boolean;
  onNovoVisitante: () => void;
}) {
  return (
    <div style={{ maxWidth: 760 }}>
      <div
        className="flex items-center justify-center rounded-full mb-6"
        style={{ width: 88, height: 88, background: 'rgba(52,211,153,0.14)', color: COR.verde }}
      >
        <Check size={44} strokeWidth={2.5} />
      </div>
      <h1
        style={{
          color: COR.texto,
          fontFamily: SERIF,
          fontSize: 'clamp(32px, 4.4vw, 46px)',
          fontWeight: 600,
          lineHeight: 1.1,
          margin: 0,
        }}
      >
        {resultado.naFila ? 'Salvo no aparelho.' : resultado.leadId ? 'Pronto — leve agora.' : 'Recebido!'}
      </h1>

      {/*
        🔑 A ENTREGA SAIU DO CAMINHO CRÍTICO (18/08/2026). Esta tela prometia
        "chega pelo WhatsApp em alguns minutos" — e em 18/08 não chegava nada: o
        template `recorte_demonstracao` estava PENDING na Meta e o legado (Z-API)
        caiu em 11/08. Promessa de PRAZO num canal que depende de terceiro é a
        parte que quebra sozinha; o QR entrega ali, na câmera do visitante, e o
        WhatsApp passa a ser reforço.
      */}
      {resultado.leadId ? (
        <div className="flex flex-wrap items-center gap-7 mt-6">
          <QrMapa url={mapaEvolucaoUrl(resultado.leadId)} />
          <div style={{ minWidth: 260, flex: '1 1 260px' }}>
            <p style={{ color: COR.texto2, fontSize: 21, lineHeight: 1.5, fontFamily: SANS, margin: 0 }}>
              Aponte a câmera do seu celular para levar o Mapa da Evolução agora.
            </p>
            <p style={{ color: COR.texto3, fontSize: 17, lineHeight: 1.5, fontFamily: SANS, margin: '10px 0 0' }}>
              Também enviamos o recorte para o seu WhatsApp.
            </p>
            <LinkMapa url={mapaEvolucaoUrl(resultado.leadId)} />
          </div>
        </div>
      ) : (
        <p style={{ color: COR.texto2, fontSize: 21, lineHeight: 1.55, fontFamily: SANS, marginTop: 14 }}>
          {resultado.naFila
            ? 'A rede oscilou na hora de enviar — o contato está salvo no aparelho e enviamos em instantes, automaticamente.'
            : 'Enviamos o recorte da demonstração para o seu WhatsApp.'}
        </p>
      )}
      <button
        type="button"
        onClick={onNovoVisitante}
        className="rounded-2xl px-9 font-bold mt-10"
        style={{
          minHeight: TOQUE,
          background: `linear-gradient(135deg, ${COR.acento}, ${COR.acentoEscuro})`,
          color: COR.fundo0,
          fontSize: 21,
          fontFamily: SANS,
        }}
      >
        {modoVisitante ? 'Recomeçar a demonstração' : 'Novo visitante'}
      </button>
      <p
        style={{
          color: COR.texto3,
          fontFamily: SERIF,
          fontStyle: 'italic',
          fontSize: 22,
          marginTop: 40,
        }}
      >
        Vertho — <span style={{ color: COR.acento }}>desenvolvimento que deixa evidências.</span>
      </p>
    </div>
  );
}
