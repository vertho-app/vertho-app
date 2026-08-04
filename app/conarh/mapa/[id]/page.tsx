import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createSupabaseAdmin } from '@/lib/supabase';
import { cicloResumo, formatarDataHoraBRT, perguntasRevisao, portaInfo, primeiroNome } from '@/lib/conarh/conteudo';

/**
 * CONARH 52 — Mapa da Evolução (F5 do sprint consolidado).
 *
 * Página PÚBLICA (sem auth — o link vai por WhatsApp/e-mail para o lead e
 * precisa abrir no celular dele e sobreviver a um print encaminhado ao chefe):
 * 1 página com o problema declarado (etapa + competência, nas palavras dele),
 * o ciclo das 5 etapas em 5 linhas, as 3 perguntas de revisão, a marca Vertho
 * e o próximo passo. Sem nav, sem links para o resto do app.
 *
 * Lê SOMENTE leads do scope conarh-2026: sem esse filtro, a URL viraria
 * leitura pública de qualquer diag_lead por UUID.
 *
 * Envs: nenhuma nova.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mapa da Evolução — Vertho',
  robots: { index: false, follow: false },
};

export default async function MapaEvolucaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const sb = createSupabaseAdmin();
  const { data: lead } = await sb
    .from('diag_leads')
    .select('id, nome, organizacao, porta_escolhida, competencia_critica, reuniao_em')
    .eq('id', id)
    .eq('scope_id', 'conarh-2026')
    .maybeSingle();

  // 404 discreto: id inválido, fora da campanha ou apagado — mesma resposta,
  // sem confirmar se o id existe em outra campanha.
  if (!lead) notFound();

  const porta = portaInfo(lead.porta_escolhida);
  const ciclo = cicloResumo();
  const perguntas = perguntasRevisao();

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-2xl px-6 py-10 print:py-6">
        {/* Marca */}
        <header className="border-b-2 border-slate-900 pb-4">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-700">Vertho · CONARH 52</p>
          <h1 className="mt-1 text-3xl font-bold leading-tight">Mapa da Evolução</h1>
          <p className="mt-1 text-sm text-slate-500">
            {primeiroNome(lead.nome) ? `Preparado para ${primeiroNome(lead.nome)}` : 'Preparado no estande'}
            {lead.organizacao ? ` · ${lead.organizacao}` : ''}
          </p>
        </header>

        {/* Problema declarado */}
        <section className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">O problema que você descreveu</h2>
          {porta && (
            <p className="mt-3 text-lg">
              <span className="font-bold">Etapa {porta.numero} — {porta.nome}.</span>{' '}
              <span className="text-slate-600">{porta.sub}</span>
            </p>
          )}
          {lead.competencia_critica && (
            <blockquote className="mt-4 border-l-4 border-cyan-600 pl-4 text-xl italic leading-relaxed">
              “{lead.competencia_critica}”
            </blockquote>
          )}
          {!porta && !lead.competencia_critica && (
            <p className="mt-3 text-lg text-slate-600">Conversa registrada no estande do CONARH 52.</p>
          )}
        </section>

        {/* Ciclo completo */}
        {ciclo.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">O ciclo completo, em 5 passos</h2>
            <ol className="mt-3 space-y-2">
              {ciclo.slice(0, 5).map((linha, i) => (
                <li key={i} className="flex gap-3 text-base leading-relaxed">
                  <span className="font-bold text-cyan-700">{i + 1}.</span>
                  <span>{linha}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Perguntas de revisão */}
        {perguntas.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">3 perguntas para revisar seu processo atual</h2>
            <ul className="mt-3 space-y-2">
              {perguntas.slice(0, 3).map((p, i) => (
                <li key={i} className="flex gap-3 text-base leading-relaxed">
                  <span className="font-bold text-cyan-700">•</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Próximo passo */}
        <section className="mt-10 rounded-xl border-2 border-slate-900 p-5">
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">Próximo passo</h2>
          {lead.reuniao_em ? (
            <p className="mt-2 text-lg">
              <span className="font-bold">Conversa de 20 minutos marcada:</span>{' '}
              {formatarDataHoraBRT(lead.reuniao_em)} (horário de Brasília). A confirmação já está no seu WhatsApp.
            </p>
          ) : (
            <p className="mt-2 text-lg">
              A Vertho te chama no WhatsApp nos próximos dias com um recorte aplicado ao que você descreveu.
              Quer adiantar? Responda a mensagem que te enviamos.
            </p>
          )}
        </section>

        <footer className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-400">
          Vertho Mentor IA · vertho.ai · Material de demonstração do CONARH 52
        </footer>
      </div>
    </main>
  );
}
