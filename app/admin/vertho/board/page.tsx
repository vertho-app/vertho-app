import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CircleDashed, Loader2, CheckCircle2, XCircle, Ban } from 'lucide-react';
import { createSupabaseAdmin } from '@/lib/supabase';
import { checkAdminAccess } from '@/app/admin/admin-actions';
import { PAINEL } from '@/lib/status';
import NovoPainel from './_components/novo-painel';

export const dynamic = 'force-dynamic';

/**
 * /board — painéis multi-modelo (Claude + gpt-5.6-sol + Kimi K3 + Gemini).
 *
 * A web só ENFILEIRA. Os quatro modelos rodam por assinatura, como processos na
 * máquina do Rodrigo, então quem executa é o worker local (scripts/painel/worker.mjs).
 * A tela deixa isso explícito: pedido parado na fila significa worker desligado,
 * não painel lento.
 */

type Painel = {
  id: string;
  titulo: string | null;
  pergunta: string;
  status: string;
  criado_em: string;
  concluido_em: string | null;
  segundos: number | null;
  resumo: string | null;
  motores: string[];
  erro: string | null;
  resultado: { convergencia?: { alerta_conformidade?: boolean }; presenca?: { perdidos?: unknown[] } } | null;
};

const ESTILO: Record<string, { rotulo: string; cor: string; Icone: typeof CircleDashed }> = {
  [PAINEL.PENDENTE]: { rotulo: 'na fila', cor: 'text-amber-300', Icone: CircleDashed },
  [PAINEL.RODANDO]: { rotulo: 'rodando', cor: 'text-cyan-300', Icone: Loader2 },
  [PAINEL.CONCLUIDO]: { rotulo: 'pronto', cor: 'text-emerald-300', Icone: CheckCircle2 },
  [PAINEL.ERRO]: { rotulo: 'falhou', cor: 'text-red-300', Icone: XCircle },
  [PAINEL.CANCELADO]: { rotulo: 'cancelado', cor: 'text-white/40', Icone: Ban },
};

function quando(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function duracao(s: number | null) {
  if (!s) return null;
  return s < 90 ? `${s}s` : `${Math.round(s / 60)} min`;
}

export default async function BoardPage() {
  const acesso = await checkAdminAccess();
  if (!acesso.authorized) redirect('/login?redirect=/admin/vertho/board');

  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('board_paineis')
    .select('id, titulo, pergunta, status, criado_em, concluido_em, segundos, resumo, motores, erro, resultado')
    .order('criado_em', { ascending: false })
    .limit(60);

  // supabase-js RETORNA o erro, não lança — checar sempre, senão a falha some
  const paineis = (error ? [] : (data as Painel[])) || [];

  // Worker vivo = alguém pegou um pedido na última hora. Não é ping: é a única
  // evidência que a web tem de que a máquina está do outro lado.
  const umaHoraAtras = Date.now() - 60 * 60 * 1000;
  const workerAtivo = paineis.some(
    (p) => (p.status === PAINEL.RODANDO || p.concluido_em) && new Date(p.concluido_em || p.criado_em).getTime() > umaHoraAtras
  );

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-8 sm:px-6">
      <header className="mb-7">
        <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-300/70 font-mono">Board · uso interno</p>
        <h1 className="text-3xl sm:text-4xl font-semibold text-white mt-2">Painel de quatro modelos</h1>
        <p className="text-white/45 mt-2.5 max-w-[62ch] text-[15px]">
          A mesma pergunta vai para quatro famílias de IA, que respondem sozinhas, leem uma à outra sem saber quem
          escreveu o quê e fecham. O Claude compara a primeira rodada com a última e entrega a resposta — junto com o
          que a convergência matou pelo caminho.
        </p>
      </header>

      {error && (
        <p className="mb-6 text-[13px] text-red-300 border border-red-400/20 bg-red-400/[0.05] rounded-xl px-4 py-3">
          Não foi possível carregar o histórico: {error.message}
        </p>
      )}

      <NovoPainel workerAtivo={workerAtivo} />

      <section className="mt-9">
        <h2 className="text-xs uppercase tracking-wider text-white/40 mb-3 font-mono">
          Histórico {paineis.length ? `· ${paineis.length}` : ''}
        </h2>

        {!paineis.length ? (
          <p className="text-white/35 text-sm border border-dashed border-white/[0.08] rounded-2xl px-5 py-8 text-center">
            Nenhum painel ainda. O primeiro que você enfileirar aparece aqui.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {paineis.map((p) => {
              const e = ESTILO[p.status] || ESTILO[PAINEL.PENDENTE];
              const alerta = p.resultado?.convergencia?.alerta_conformidade;
              const perdidos = p.resultado?.presenca?.perdidos?.length || 0;
              return (
                <li key={p.id}>
                  <Link
                    href={`/admin/vertho/board/${p.id}`}
                    className="block rounded-2xl border border-white/[0.06] hover:border-cyan-400/25 px-5 py-4 transition-colors"
                    style={{ background: '#091D35' }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-white/90 font-medium truncate">{p.titulo || p.pergunta.slice(0, 80)}</p>
                        <p className="text-white/40 text-[13px] mt-1 line-clamp-2">{p.resumo || p.pergunta}</p>
                      </div>
                      <span className={`flex items-center gap-1.5 text-xs shrink-0 ${e.cor}`}>
                        <e.Icone className={`w-3.5 h-3.5 ${p.status === PAINEL.RODANDO ? 'animate-spin' : ''}`} />
                        {e.rotulo}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5 text-[11px] text-white/30 font-mono">
                      <span>{quando(p.criado_em)}</span>
                      <span>{p.motores.length} modelos</span>
                      {duracao(p.segundos) && <span>{duracao(p.segundos)}</span>}
                      {perdidos > 0 && <span className="text-amber-300/70">{perdidos} não terminaram</span>}
                      {alerta && <span className="text-amber-300/70">convergência suspeita</span>}
                      {p.status === PAINEL.ERRO && p.erro && (
                        <span className="text-red-300/70 truncate max-w-[40ch]">{p.erro}</span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
