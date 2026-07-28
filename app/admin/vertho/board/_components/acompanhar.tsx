'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CircleDashed } from 'lucide-react';
import { statusPainel } from '../actions';
import { PAINEL } from '@/lib/status';

type Evento = { fase?: string; letra?: string; ok?: boolean; segundos?: number; erro?: string; total?: number; arquivos?: number };

const FASE = { rodada1: 'Rodada 1 — cada um sozinho', rodada2: 'Rodada 2 — depois de ler as outras', sintese: 'Síntese' } as Record<string, string>;

/**
 * Acompanha um painel em execução. O trabalho acontece na máquina local, então
 * a única fonte de verdade é o que o worker gravou — daqui só se lê.
 */
export default function Acompanhar({
  id,
  statusInicial,
  progressoInicial,
  criadoEm,
}: {
  id: string;
  statusInicial: string;
  progressoInicial: Evento[];
  criadoEm: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(statusInicial);
  const [eventos, setEventos] = useState<Evento[]>(progressoInicial || []);
  const [esperando, setEsperando] = useState(0);

  useEffect(() => {
    if (status === PAINEL.CONCLUIDO || status === PAINEL.ERRO || status === PAINEL.CANCELADO) return;

    const t = setInterval(async () => {
      try {
        const s = await statusPainel(id);
        setEventos((s.progresso as Evento[]) || []);
        if (s.status !== status) {
          setStatus(s.status);
          if (s.status === PAINEL.CONCLUIDO || s.status === PAINEL.ERRO) router.refresh();
        }
      } catch {
        /* a próxima volta tenta de novo */
      }
      setEsperando((n) => n + 5);
    }, 5000);

    return () => clearInterval(t);
  }, [id, status, router]);

  const minutosNaFila = Math.floor((Date.now() - new Date(criadoEm).getTime()) / 60000);
  const paradoNaFila = status === PAINEL.PENDENTE && minutosNaFila >= 2;

  return (
    <div className="rounded-2xl border border-white/[0.06] p-6" style={{ background: '#091D35' }}>
      <div className="flex items-center gap-2.5 text-cyan-300">
        {status === PAINEL.PENDENTE ? <CircleDashed className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />}
        <span className="text-sm font-medium">
          {status === PAINEL.PENDENTE ? 'Na fila, esperando o worker' : 'Rodando na sua máquina'}
        </span>
      </div>

      {paradoNaFila && (
        <p className="mt-4 text-[13px] text-amber-300/85 border border-amber-400/20 bg-amber-400/[0.05] rounded-xl px-4 py-3">
          Parado há {minutosNaFila} min. Isso quase sempre significa que o worker não está rodando — os modelos são
          processos da sua máquina, não do servidor. Ligue com{' '}
          <code className="font-mono text-amber-200/90">node --env-file=.env.local scripts/painel/worker.mjs</code> e o
          pedido é pego em segundos.
        </p>
      )}

      {eventos.length > 0 && (
        <ul className="mt-5 flex flex-col gap-1.5 font-mono text-[12.5px]">
          {eventos.map((e, i) => (
            <li key={i} className="flex items-center gap-2.5">
              <span className="text-white/30 w-[13ch] shrink-0">{FASE[e.fase || ''] ? (e.fase === 'sintese' ? 'síntese' : e.fase) : e.fase}</span>
              {e.letra ? (
                <>
                  <span className="text-cyan-300/80 w-[2ch]">{e.letra}</span>
                  <span className={e.ok ? 'text-emerald-300/80' : 'text-red-300/80'}>
                    {e.ok ? `ok em ${e.segundos}s` : `falhou — ${String(e.erro).slice(0, 70)}`}
                  </span>
                </>
              ) : (
                <span className="text-white/40">
                  {e.total ? `${e.total} autores` : ''}
                  {e.arquivos != null ? ` · ${e.arquivos} arquivo(s) de contexto` : ''}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-5 text-[11px] text-white/25 font-mono">
        atualiza sozinho · {esperando}s acompanhando
      </p>
    </div>
  );
}
