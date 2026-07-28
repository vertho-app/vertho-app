'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send } from 'lucide-react';
import { criarPainel } from '../actions';

const MOTORES = [
  { id: 'claude', letra: 'A', nome: 'Claude', via: 'assinatura Claude' },
  { id: 'codex', letra: 'B', nome: 'gpt-5.6-sol', via: 'plano ChatGPT' },
  { id: 'kimi', letra: 'C', nome: 'Kimi K3', via: 'Kimi for Coding' },
  { id: 'gemini', letra: 'D', nome: 'Gemini 3.6 Flash', via: 'conta Google' },
];

const RAIZ_CONTEXTO = 'C:\\Users\\rdnav\\.claude\\painel\\contexto\\';

export default function NovoPainel({ workerAtivo }: { workerAtivo: boolean }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [pergunta, setPergunta] = useState('');
  const [titulo, setTitulo] = useState('');
  const [assunto, setAssunto] = useState('');
  const [contexto, setContexto] = useState('');
  const [escolhidos, setEscolhidos] = useState<string[]>(MOTORES.map((m) => m.id));
  const [erro, setErro] = useState<string | null>(null);

  function alternar(id: string) {
    setEscolhidos((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  }

  function enviar() {
    setErro(null);
    iniciar(async () => {
      try {
        const { id } = await criarPainel({
          titulo,
          pergunta,
          contexto,
          contextoDir: assunto.trim() ? RAIZ_CONTEXTO + assunto.trim() : undefined,
          motores: escolhidos,
        });
        router.push(`/admin/vertho/board/${id}`);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível enfileirar o painel.');
      }
    });
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] p-5 sm:p-6" style={{ background: '#091D35' }}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-xs uppercase tracking-wider text-white/40 mb-1.5">Pergunta</label>
          <textarea
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
            rows={4}
            placeholder="O que os quatro modelos devem responder? Quanto mais específico o pedido, mais acionável a resposta."
            className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] px-4 py-3 text-sm text-white/90 placeholder:text-white/25 focus:outline-none focus:border-cyan-400/50"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs uppercase tracking-wider text-white/40 mb-1.5">
              Título <span className="normal-case tracking-normal text-white/25">— opcional, para achar depois</span>
            </label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Stand do CONARH"
              className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] px-4 py-2.5 text-sm text-white/90 placeholder:text-white/25 focus:outline-none focus:border-cyan-400/50"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-white/40 mb-1.5">
              Pasta de contexto <span className="normal-case tracking-normal text-white/25">— subpasta em ~/.claude/painel/contexto</span>
            </label>
            <input
              value={assunto}
              onChange={(e) => setAssunto(e.target.value)}
              placeholder="conarh"
              className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] px-4 py-2.5 text-sm text-white/90 placeholder:text-white/25 focus:outline-none focus:border-cyan-400/50 font-mono"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-white/40 mb-1.5">
            Contexto <span className="normal-case tracking-normal text-white/25">— o que os modelos precisam saber e não está nos arquivos</span>
          </label>
          <textarea
            value={contexto}
            onChange={(e) => setContexto(e.target.value)}
            rows={2}
            className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] px-4 py-3 text-sm text-white/90 focus:outline-none focus:border-cyan-400/50"
          />
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-white/40 mb-2">Quem participa</label>
          <div className="flex flex-wrap gap-2">
            {MOTORES.map((m) => {
              const on = escolhidos.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => alternar(m.id)}
                  aria-pressed={on}
                  className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2 text-left transition-colors ${
                    on
                      ? 'border-cyan-400/40 bg-cyan-400/[0.07]'
                      : 'border-white/[0.08] bg-white/[0.02] opacity-50 hover:opacity-80'
                  }`}
                >
                  <span className={`font-serif text-lg leading-none ${on ? 'text-cyan-300' : 'text-white/40'}`}>{m.letra}</span>
                  <span className="flex flex-col">
                    <span className="text-sm text-white/85">{m.nome}</span>
                    <span className="text-[11px] text-white/35">{m.via}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {!workerAtivo && (
          <p className="text-[13px] text-amber-300/80 border border-amber-400/20 bg-amber-400/[0.05] rounded-xl px-4 py-3">
            Nenhum painel foi executado na última hora. Os modelos rodam na sua máquina — se o worker não estiver
            ligado, o pedido fica na fila até você rodar{' '}
            <code className="font-mono text-amber-200/90">node --env-file=.env.local scripts/painel/worker.mjs</code>.
          </p>
        )}

        {erro && (
          <p className="text-[13px] text-red-300 border border-red-400/20 bg-red-400/[0.05] rounded-xl px-4 py-3">{erro}</p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={enviar}
            disabled={pendente || pergunta.trim().length < 15 || escolhidos.length < 2}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-500/90 hover:bg-cyan-400 disabled:opacity-40 disabled:hover:bg-cyan-500/90 px-5 py-2.5 text-sm font-medium text-[#04121F] transition-colors"
          >
            {pendente ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {pendente ? 'Enfileirando…' : 'Enfileirar painel'}
          </button>
          <span className="text-xs text-white/35">
            {escolhidos.length} modelos · 2 rodadas · leva alguns minutos
          </span>
        </div>
      </div>
    </div>
  );
}
