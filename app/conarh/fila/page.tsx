'use client';

// CONARH 52 — fila do dia (tela da equipe, somente-leitura): quem passou,
// por qual porta entrou, competência e classe. Para retomar a conversa em
// 2 segundos. Auto-refresh 60 s; funciona com sync atrasado (cache local).

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Send } from 'lucide-react';
import { AvisoSync, buscarComCache, PortaoChave, ShellEquipe, useChaveEquipe } from '../_components/equipe';
import { COR, SANS } from '../_components/tema';
import { ENTREGA_T0 } from '@/lib/status';

interface LeadFila {
  id: string;
  nome: string;
  organizacao: string;
  porta: number;
  competencia: string;
  horizonte: string;
  classe: string;
  criado_em: string;
  /** pendente | enviado | falhou | desconhecido — mig 221. */
  t0_status?: string;
  t0_erro?: string | null;
}

interface ContagemT0 {
  enviado: number;
  pendente: number;
  falhou: number;
  desconhecido: number;
  naFila: number;
}

const CACHE = 'conarh:cache-fila-v1';

const CLASSE_COR: Record<string, string> = { A: COR.verde, B: COR.ambar, C: COR.texto3 };

export default function FilaPage() {
  const { key, pronto, definir } = useChaveEquipe();
  const [leads, setLeads] = useState<LeadFila[]>([]);
  const [entregas, setEntregas] = useState<ContagemT0 | null>(null);
  const [sincronizadoEm, setSincronizadoEm] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [reenviando, setReenviando] = useState(false);
  const [avisoReenvio, setAvisoReenvio] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!key) return;
    const r = await buscarComCache<{ leads: LeadFila[]; entregas: ContagemT0 | null }>(
      `/api/conarh/fila?key=${encodeURIComponent(key)}`,
      CACHE,
    );
    if (r.dados) {
      setLeads(r.dados.leads ?? []);
      setEntregas(r.dados.entregas ?? null);
    }
    setSincronizadoEm(r.sincronizadoEm);
    setErro(r.erro);
  }, [key]);

  useEffect(() => {
    carregar();
    const intervalo = setInterval(carregar, 60_000);
    return () => clearInterval(intervalo);
  }, [carregar]);

  /**
   * Despeja a fila do T+0 à mão. O cron já faz isso de 15 em 15 min — o botão é
   * para o minuto em que a Meta aprova o template no meio de uma conversa.
   *
   * A chave vai no HEADER (a rota que escreve não aceita chave por query: URL
   * fica em histórico e log de acesso).
   *
   * O corpo vai VAZIO de propósito: quem decide insistir é o servidor. A rota
   * manual inclui os leads que esgotaram as tentativas automáticas — foi esse
   * o buraco de 18/08, quando o teto queimou contra um canal caído e o botão
   * não alcançava mais justamente quem ainda não tinha recebido nada.
   */
  async function reenviar() {
    if (!key || reenviando) return;
    setReenviando(true);
    setAvisoReenvio(null);
    try {
      const r = await fetch('/api/conarh/reenviar-t0', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-conarh-key': key },
        body: JSON.stringify({}),
      });
      const d = await r.json();
      if (!r.ok) {
        setAvisoReenvio(d?.error || 'Não deu para reenviar agora.');
      } else {
        // O que o expositor precisa saber é quem AINDA está devendo — por isso o
        // aviso reporta os adiados e o que restou, não só o sucesso.
        const partes = [`${d.entregues} entregue(s)`];
        if (d.falharam) partes.push(`${d.falharam} sem chegar`);
        if (d.adiados) partes.push(`${d.adiados} adiado(s) por teto de ${d.motivoDoTeto}`);
        if (d.restam) partes.push(`${d.restam} ainda na fila`);
        setAvisoReenvio(partes.join(' · '));
        if (d.contagem) setEntregas(d.contagem);
      }
    } catch {
      setAvisoReenvio('Sem conexão para reenviar agora.');
    } finally {
      setReenviando(false);
      carregar();
    }
  }

  return (
    <ShellEquipe titulo="Fila do dia" sub="Quem passou pelo estande hoje — retome a conversa em 2 segundos.">
      {!pronto ? null : !key ? (
        <PortaoChave onDefinir={definir} />
      ) : (
        <>
          <div className="flex items-center justify-between gap-4 mb-5">
            <AvisoSync sincronizadoEm={sincronizadoEm} erro={erro} />
            <button
              type="button"
              onClick={carregar}
              className="flex items-center gap-2 rounded-xl border px-4 py-2.5"
              style={{ borderColor: COR.borda, color: COR.texto2, fontSize: 15, fontFamily: SANS, background: 'transparent' }}
            >
              <RefreshCw size={15} /> Atualizar
            </button>
          </div>

          {/*
            🔑 A LACUNA PRECISA DE ONDE APARECER. Até 18/08 o recorte podia não
            sair (template PENDING na Meta + Z-API caída desde 11/08) e nada nesta
            tela dizia isso — o lead era marcado como atendido de qualquer jeito.
            O contador é da campanha inteira, não do dia: quem ficou devendo
            ontem continua devendo hoje.
          */}
          {entregas && entregas.naFila > 0 && (
            <div
              className="rounded-2xl border p-5 mb-5"
              style={{ background: 'rgba(245,158,11,0.10)', borderColor: 'rgba(245,158,11,0.35)' }}
            >
              <p style={{ color: COR.texto, fontSize: 18, fontWeight: 700, fontFamily: SANS, margin: 0 }}>
                {entregas.naFila} {entregas.naFila === 1 ? 'recorte não chegou' : 'recortes não chegaram'}
              </p>
              <p style={{ color: COR.texto2, fontSize: 15, fontFamily: SANS, margin: '6px 0 0' }}>
                Ficam guardados e saem sozinhos assim que o canal voltar (checagem a cada 15 min).
                {entregas.desconhecido > 0 && ` ${entregas.desconhecido} de antes desta contagem não são verificáveis.`}
              </p>
              <button
                type="button"
                onClick={reenviar}
                disabled={reenviando}
                className="flex items-center gap-2 rounded-xl px-5 py-3 font-bold mt-4"
                style={{
                  background: reenviando ? 'rgba(255,255,255,0.08)' : COR.acento,
                  color: reenviando ? COR.texto3 : COR.fundo0,
                  fontSize: 16,
                  fontFamily: SANS,
                  border: 'none',
                }}
              >
                <Send size={16} /> {reenviando ? 'Enviando…' : 'Tentar enviar agora'}
              </button>
              {avisoReenvio && (
                <p style={{ color: COR.texto2, fontSize: 15, fontFamily: SANS, margin: '12px 0 0' }}>
                  {avisoReenvio}
                </p>
              )}
            </div>
          )}

          {leads.length === 0 ? (
            <p style={{ color: COR.texto3, fontSize: 18, fontFamily: SANS }}>
              Ninguém registrado ainda — a fila aparece aqui assim que o primeiro recorte for enviado.
            </p>
          ) : (
            <div className="space-y-3">
              {leads.map((lead, i) => (
                <div
                  key={`${lead.criado_em}-${i}`}
                  className="rounded-2xl border p-5 flex flex-wrap items-center gap-x-6 gap-y-2"
                  style={{ background: COR.card, borderColor: COR.borda }}
                >
                  <span
                    className="flex items-center justify-center rounded-xl font-bold flex-shrink-0"
                    style={{
                      width: 44,
                      height: 44,
                      background: 'rgba(52,197,204,0.12)',
                      color: COR.acento,
                      fontSize: 20,
                      fontFamily: SANS,
                    }}
                  >
                    {lead.porta}
                  </span>
                  <div style={{ minWidth: 200, flex: '1 1 200px' }}>
                    <p style={{ color: COR.texto, fontSize: 19, fontWeight: 700, fontFamily: SANS, margin: 0 }}>
                      {lead.nome}
                    </p>
                    <p style={{ color: COR.texto3, fontSize: 15, fontFamily: SANS, margin: 0 }}>
                      {lead.organizacao}
                    </p>
                  </div>
                  <div style={{ minWidth: 200, flex: '1 1 200px' }}>
                    <p style={{ color: COR.texto2, fontSize: 16, fontFamily: SANS, margin: 0 }}>
                      {lead.competencia}
                    </p>
                    <p style={{ color: COR.texto3, fontSize: 14, fontFamily: SANS, margin: 0 }}>
                      {lead.horizonte}
                    </p>
                  </div>
                  <span
                    className="rounded-full px-3.5 py-1.5 font-bold"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      color: CLASSE_COR[lead.classe] ?? COR.texto2,
                      fontSize: 15,
                      fontFamily: SANS,
                    }}
                  >
                    {lead.classe}
                  </span>
                  {lead.t0_status && lead.t0_status !== ENTREGA_T0.ENVIADO && (
                    <span
                      className="rounded-full px-3.5 py-1.5 font-bold"
                      style={{
                        background: 'rgba(245,158,11,0.14)',
                        color: COR.ambar,
                        fontSize: 14,
                        fontFamily: SANS,
                      }}
                      title={lead.t0_erro || undefined}
                    >
                      {lead.t0_status === ENTREGA_T0.DESCONHECIDO ? 'recorte não verificado' : 'recorte não chegou'}
                    </span>
                  )}
                  <span style={{ color: COR.texto3, fontSize: 14, fontFamily: SANS }}>
                    {new Date(lead.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </ShellEquipe>
  );
}
