'use client';

// CONARH 52 — fila do dia (tela da equipe, somente-leitura): quem passou,
// por qual porta entrou, competência e classe. Para retomar a conversa em
// 2 segundos. Auto-refresh 60 s; funciona com sync atrasado (cache local).

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { AvisoSync, buscarComCache, PortaoChave, ShellEquipe, useChaveEquipe } from '../_components/equipe';
import { COR, SANS } from '../_components/tema';

interface LeadFila {
  nome: string;
  organizacao: string;
  porta: number;
  competencia: string;
  horizonte: string;
  classe: string;
  criado_em: string;
}

const CACHE = 'conarh:cache-fila-v1';

const CLASSE_COR: Record<string, string> = { A: COR.verde, B: COR.ambar, C: COR.texto3 };

export default function FilaPage() {
  const { key, pronto, definir } = useChaveEquipe();
  const [leads, setLeads] = useState<LeadFila[]>([]);
  const [sincronizadoEm, setSincronizadoEm] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!key) return;
    const r = await buscarComCache<{ leads: LeadFila[] }>(
      `/api/conarh/fila?key=${encodeURIComponent(key)}`,
      CACHE,
    );
    if (r.dados) setLeads(r.dados.leads ?? []);
    setSincronizadoEm(r.sincronizadoEm);
    setErro(r.erro);
  }, [key]);

  useEffect(() => {
    carregar();
    const intervalo = setInterval(carregar, 60_000);
    return () => clearInterval(intervalo);
  }, [carregar]);

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
