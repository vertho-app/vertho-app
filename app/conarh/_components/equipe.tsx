'use client';

// CONARH 52 — moldura das telas da equipe (/conarh/fila e /conarh/painel):
// pede a chave UMA vez, guarda em localStorage e injeta ?key= nas chamadas.
// Sem reset por inatividade aqui — essas telas ficam abertas o dia todo.

import { useEffect, useState } from 'react';
import { COR, FUNDO, SANS, SERIF, TOQUE } from './tema';

const CHAVE_KEY = 'conarh:key-equipe-v1';

export function useChaveEquipe(): {
  key: string | null;
  pronto: boolean;
  definir: (k: string) => void;
} {
  const [key, setKey] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    try {
      setKey(localStorage.getItem(CHAVE_KEY));
    } catch {
      setKey(null);
    }
    setPronto(true);
  }, []);
  return {
    key,
    pronto,
    definir: (k: string) => {
      try {
        localStorage.setItem(CHAVE_KEY, k);
      } catch {
        // sem persistência — a key vale só para esta aba
      }
      setKey(k);
    },
  };
}

export function ShellEquipe({
  titulo,
  sub,
  children,
}: {
  titulo: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-dvh" style={{ background: FUNDO, fontFamily: SANS, color: COR.texto }}>
      <div className="mx-auto px-6 py-10" style={{ maxWidth: 1000 }}>
        <p
          className="uppercase font-bold mb-1"
          style={{ color: COR.acento, fontSize: 13, letterSpacing: '0.26em' }}
        >
          CONARH 52 · equipe
        </p>
        <h1 style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 600, margin: 0 }}>{titulo}</h1>
        <p style={{ color: COR.texto2, fontSize: 18, marginTop: 6 }}>{sub}</p>
        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
}

export function PortaoChave({ onDefinir }: { onDefinir: (k: string) => void }) {
  const [valor, setValor] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valor.trim()) onDefinir(valor.trim());
      }}
      style={{ maxWidth: 480 }}
    >
      <p style={{ color: COR.texto2, fontSize: 18, lineHeight: 1.5 }}>
        Esta tela é interna. Digite a chave da equipe (fica salva neste aparelho):
      </p>
      <input
        type="password"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        autoFocus
        style={{
          width: '100%',
          minHeight: TOQUE,
          borderRadius: 16,
          border: `1px solid ${COR.borda}`,
          background: 'rgba(255,255,255,0.05)',
          color: COR.texto,
          fontSize: 20,
          fontFamily: SANS,
          padding: '0 18px',
          marginTop: 12,
          outline: 'none',
        }}
      />
      <button
        type="submit"
        className="rounded-2xl px-8 font-bold mt-4"
        style={{
          minHeight: TOQUE,
          background: `linear-gradient(135deg, ${COR.acento}, ${COR.acentoEscuro})`,
          color: COR.fundo0,
          fontSize: 19,
          fontFamily: SANS,
        }}
      >
        Abrir
      </button>
    </form>
  );
}

/** Busca JSON com a key, mantendo o último resultado bom em cache local. */
export async function buscarComCache<T>(
  caminho: string,
  chaveCache: string,
): Promise<{ dados: T | null; sincronizadoEm: string | null; erro: string | null }> {
  let cache: { dados: T; sincronizadoEm: string } | null = null;
  try {
    const bruto = localStorage.getItem(chaveCache);
    if (bruto) cache = JSON.parse(bruto);
  } catch {
    cache = null;
  }
  try {
    const r = await fetch(caminho, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const dados = (await r.json()) as T;
    const sincronizadoEm = new Date().toISOString();
    try {
      localStorage.setItem(chaveCache, JSON.stringify({ dados, sincronizadoEm }));
    } catch {
      // cache é conveniência, não requisito
    }
    return { dados, sincronizadoEm, erro: null };
  } catch (e) {
    return {
      dados: cache?.dados ?? null,
      sincronizadoEm: cache?.sincronizadoEm ?? null,
      erro: e instanceof Error ? e.message : 'falha de rede',
    };
  }
}

export function AvisoSync({
  sincronizadoEm,
  erro,
}: {
  sincronizadoEm: string | null;
  erro: string | null;
}) {
  return (
    <p style={{ color: erro ? COR.ambar : COR.texto3, fontSize: 15, fontFamily: SANS }}>
      {erro
        ? `Sem conexão agora — mostrando a última sincronização${
            sincronizadoEm ? ` de ${new Date(sincronizadoEm).toLocaleTimeString('pt-BR')}` : ''
          }.`
        : sincronizadoEm
          ? `Sincronizado às ${new Date(sincronizadoEm).toLocaleTimeString('pt-BR')} · atualiza sozinho a cada 60 s.`
          : 'Carregando…'}
    </p>
  );
}
