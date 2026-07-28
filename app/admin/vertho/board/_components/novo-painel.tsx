'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send, Upload, X, FileText, FolderGit2 } from 'lucide-react';
import { criarPainel, subirArquivoContexto, type ArquivoContexto } from '../actions';

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
  const [arquivos, setArquivos] = useState<ArquivoContexto[]>([]);
  const [subindo, setSubindo] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [lerRepo, setLerRepo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function alternar(id: string) {
    setEscolhidos((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  }

  async function subir(lista: FileList | File[]) {
    setErro(null);
    setSubindo(true);
    const novos: ArquivoContexto[] = [];
    const falhas: string[] = [];
    for (const f of Array.from(lista)) {
      try {
        const form = new FormData();
        form.append('file', f);
        novos.push(await subirArquivoContexto(form));
      } catch (e) {
        falhas.push(e instanceof Error ? e.message : `Falhou: ${f.name}`);
      }
    }
    setArquivos((a) => [...a, ...novos]);
    if (falhas.length) setErro(falhas.join(' · '));
    setSubindo(false);
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
          arquivos,
          lerRepositorio: lerRepo,
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

        {/* upload — o arquivo vai para o Storage e o worker baixa para a máquina */}
        <div>
          <label className="block text-xs uppercase tracking-wider text-white/40 mb-1.5">
            Arquivos <span className="normal-case tracking-normal text-white/25">— o painel lê antes de responder</span>
          </label>

          <div
            onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastando(false); if (e.dataTransfer.files?.length) subir(e.dataTransfer.files); }}
            className={`rounded-xl border border-dashed px-4 py-5 text-center transition-colors ${
              arrastando ? 'border-cyan-400/60 bg-cyan-400/[0.06]' : 'border-white/[0.12] bg-white/[0.02]'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".md,.txt,.csv,.json,.yaml,.yml,.log,.ts,.tsx,.js,.jsx,.sql,.py,.html,.css,.pdf,.docx"
              className="hidden"
              onChange={(e) => { if (e.target.files?.length) subir(e.target.files); e.target.value = ''; }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={subindo}
              className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200 disabled:opacity-50"
            >
              {subindo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {subindo ? 'Enviando…' : 'Escolher arquivos'}
            </button>
            <p className="text-[11.5px] text-white/30 mt-1.5">
              ou arraste aqui · até 20 MB · texto, código, <b className="text-white/45">PDF</b> e{' '}
              <b className="text-white/45">DOCX</b>
            </p>
          </div>

          {arquivos.length > 0 && (
            <ul className="mt-2.5 flex flex-wrap gap-2">
              {arquivos.map((a) => (
                <li
                  key={a.path}
                  className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] pl-2.5 pr-1.5 py-1.5"
                >
                  <FileText className="w-3.5 h-3.5 text-white/35 shrink-0" />
                  <span className="text-[13px] text-white/80 max-w-[26ch] truncate">{a.origem || a.nome}</span>
                  {a.origem && (
                    <span className="text-[10.5px] text-cyan-300/70 border border-cyan-400/25 rounded px-1.5 py-px">
                      convertido em texto
                    </span>
                  )}
                  <span className="text-[11px] text-white/30 font-mono tabular-nums">{Math.max(1, Math.round(a.bytes / 1024))} KB</span>
                  <button
                    type="button"
                    onClick={() => setArquivos((l) => l.filter((x) => x.path !== a.path))}
                    aria-label={`Remover ${a.nome}`}
                    className="text-white/30 hover:text-white/80 p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="text-[11.5px] text-white/25 mt-2">
            PDF e DOCX são convertidos em texto no envio, para os quatro modelos lerem exatamente o mesmo conteúdo —
            cada CLI abre esses formatos de um jeito, e aí o painel opinaria sobre bases diferentes sem avisar. PDF
            escaneado é recusado: sem texto extraível, o painel leria uma página em branco e responderia como se
            tivesse lido.
          </p>
        </div>

        {/* repositório: eles sempre alcançam o disco — isto dá a orientação */}
        <label className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 cursor-pointer">
          <input
            type="checkbox"
            checked={lerRepo}
            onChange={(e) => setLerRepo(e.target.checked)}
            className="mt-0.5 accent-cyan-400"
          />
          <span>
            <span className="flex items-center gap-2 text-sm text-white/85">
              <FolderGit2 className="w-4 h-4 text-white/40" />
              A pergunta é sobre o código da Vertho
            </span>
            <span className="block text-[12px] text-white/35 mt-1">
              Diz aos modelos onde procurar (actions, app, lib, docs) e o que não existe. Eles já alcançam o
              repositório na sua máquina; sem isso, procuram no lugar errado.
            </span>
          </span>
        </label>

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
