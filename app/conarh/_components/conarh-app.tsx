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
    setTela(modoVisitante ? { tipo: 'porta', porta: 2 } : { tipo: 'hub' });
  }, [modoVisitante]);

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
    setTela({ tipo: 'porta', porta });
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
    setTela({ tipo: 'captura' });
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
        onHub={() => setTela({ tipo: 'hub' })}
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
            modoVisitante={modoVisitante}
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
            onProxima={() => setTela({ tipo: 'hub' })}
          />
        )}

        {tela.tipo === 'captura' && (
          <Captura
            conteudo={conteudo}
            telemetria={telemetria}
            modoVisitante={modoVisitante}
            onSucesso={(resultado) => setTela({ tipo: 'confirmacao', resultado })}
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
        {resultado.naFila ? 'Salvo no aparelho.' : 'Recebido!'}
      </h1>
      <p style={{ color: COR.texto2, fontSize: 21, lineHeight: 1.55, fontFamily: SANS, marginTop: 14 }}>
        {resultado.naFila
          ? 'A rede oscilou na hora de enviar — o contato está salvo no aparelho e enviamos em instantes, automaticamente.'
          : 'O recorte da demonstração chega pelo WhatsApp em alguns minutos.'}
      </p>
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
