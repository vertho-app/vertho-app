'use client';

/**
 * Engajamento do time — o que a jornada produziu de SINAL, pessoa a pessoa.
 *
 * Não é nota nem avaliação de competência: é presença. A tela responde a uma
 * pergunta que o gestor faz toda semana e hoje não tinha onde olhar — "quem
 * abriu, quem consumiu, quem entregou, e quem sumiu?".
 *
 * Os sinais vêm do MESMO núcleo de /admin/engajamento (lib/engajamento/roll-up),
 * recortado ao escopo do papel. Se as réguas divergissem, o gestor e a Vertho
 * discordariam sobre a mesma pessoa na mesma semana.
 */

import { useEffect, useState } from 'react';
import {
  Loader2, Users, Eye, PlayCircle, CheckCircle2, MessageCircle, AlertTriangle,
} from 'lucide-react';
import { PageContainer, GlassCard } from '@/components/page-shell';
import BackButton from '@/components/back-button';
import { getEngajamentoDoTime } from '../actions';

/** Sinal ausente é '—', nunca um ✗: "não registrado" e "não fez" são coisas diferentes. */
function Sinal({ ativo, titulo }: { ativo: boolean | null; titulo: string }) {
  if (ativo === null) return <span className="text-white/25" title={`${titulo}: sem registro`}>—</span>;
  return ativo
    ? <CheckCircle2 size={15} className="text-emerald-400" aria-label={`${titulo}: sim`} />
    : <span className="text-white/25" aria-label={`${titulo}: não`}>·</span>;
}

function EtapaJornada({ pessoa }: { pessoa: any }) {
  if (pessoa.semanaAcessivel == null) {
    return <span className="text-white/25" title="Posição individual indisponível">—</span>;
  }
  const meta = pessoa.jornadaAtrasada
    ? { label: 'pendente', cor: 'text-amber-300' }
    : pessoa.semanaAcessivelConcluida
      ? { label: 'concluída', cor: 'text-emerald-300' }
      : { label: 'em curso', cor: 'text-brand-300' };

  return (
    <span
      className={`whitespace-nowrap text-[11px] font-semibold ${meta.cor}`}
      title={`Calendário da turma: semana ${pessoa.semanaCalendario}`}
    >
      S{pessoa.semanaAcessivel} · {meta.label}
    </span>
  );
}

function Kpi({ icon: Icon, valor, total, label }: any) {
  const pct = total > 0 ? Math.round((valor / total) * 100) : 0;
  return (
    <div className="rounded-2xl border border-white/[0.07] p-3.5" style={{ background: 'rgba(255,255,255,0.02)' }}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={14} className="text-brand-400 shrink-0" aria-hidden="true" />
        <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-white/45 truncate">{label}</p>
      </div>
      <p className="text-white text-xl font-bold leading-none">
        {valor}<span className="text-white/35 text-sm font-semibold">/{total}</span>
      </p>
      <p className="text-[11px] text-brand-300/80 mt-1">{pct}%</p>
    </div>
  );
}

export default function EngajamentoDoTimePage() {
  const [dados, setDados] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [semana, setSemana] = useState<number | null>(null);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    getEngajamentoDoTime(semana)
      .then((r: any) => {
        if (!vivo) return;
        if (!r?.ok) setErro(r?.error || 'Não foi possível carregar o engajamento');
        else { setDados(r); setErro(''); }
      })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [semana]);

  const pessoas = dados?.colaboradores || [];
  const resumo = dados?.resumo || {};
  const total = resumo.inscritos || 0;
  const ehRH = dados?.scope === 'rh';

  return (
    <PageContainer>
      <BackButton />

      <div className="flex items-baseline justify-between gap-3 mb-5 flex-wrap">
        <div>
          <p className="text-[10px] tracking-[0.2em] uppercase font-mono text-brand-300/80 mb-1">
            {ehRH ? 'Visão da empresa' : 'Visão do gestor'}
          </p>
          <h1 className="text-white text-2xl font-bold flex items-center gap-2">
            <Users size={22} className="text-brand-400" aria-hidden="true" />
            Engajamento do time
          </h1>
        </div>

        {(dados?.semanas || []).length > 1 && (
          <label className="flex items-center gap-2 text-[11px] text-white/55">
            Métricas
            <select
              value={semana ?? ''}
              onChange={(e) => setSemana(e.target.value ? Number(e.target.value) : null)}
              className="rounded-lg border border-white/12 bg-[#0b1a2b] px-2 py-1 text-[11px] font-bold text-white outline-none"
            >
              <option value="">Todas as semanas</option>
              {(dados?.semanas || []).map((s: number) => (
                <option key={s} value={s}>Semana {s}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {loading && (
        <GlassCard>
          <div className="flex items-center gap-2 text-white/60 text-sm">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Carregando sinais da jornada…
          </div>
        </GlassCard>
      )}

      {!loading && erro && (
        <GlassCard><p className="text-red-400 text-sm">{erro}</p></GlassCard>
      )}

      {!loading && !erro && total === 0 && (
        <GlassCard>
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-[12px] font-bold text-amber-200 mb-1">Ninguém do time está na cadência ainda</p>
              <p className="text-[11px] text-amber-100/75 leading-relaxed">
                O engajamento aparece a partir do momento em que a jornada começa a ser entregue.
                Enquanto não houver semana enviada, não há sinal para mostrar — e um número aqui
                seria invenção, não medida.
              </p>
            </div>
          </div>
        </GlassCard>
      )}

      {!loading && !erro && total > 0 && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
            <Kpi icon={Users} valor={total} total={total} label="Na cadência" />
            <Kpi icon={Eye} valor={resumo.abriramAlgumFormato || 0} total={total} label="Abriram" />
            <Kpi icon={PlayCircle} valor={resumo.consumiram || 0} total={total} label="Consumiram" />
            <Kpi icon={CheckCircle2} valor={resumo.enviaramEvidencia || 0} total={total} label="Entregaram" />
            <Kpi icon={MessageCircle} valor={resumo.conversaramTutor || 0} total={total} label="Tira-Dúvidas" />
          </div>

          <GlassCard>
            {/* Wide content rola dentro do próprio container: a página nunca rola de lado. */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.14em] text-white/40">
                    <th className="pb-2 font-bold">Pessoa</th>
                    <th className="pb-2 font-bold text-center">Etapa individual</th>
                    <th className="pb-2 font-bold text-center">Abriu</th>
                    <th className="pb-2 font-bold text-center">Consumiu</th>
                    <th className="pb-2 font-bold text-center">Evidência</th>
                    <th className="pb-2 font-bold text-center">Tutor</th>
                    <th className="pb-2 font-bold">Formatos</th>
                  </tr>
                </thead>
                <tbody>
                  {pessoas.map((p: any) => {
                    // Silêncio total = quem não deu nenhum sinal. É a linha que o
                    // gestor precisa achar primeiro, então ela se destaca.
                    const silencio = !p.abriuLink && !p.consumiu && !p.enviouEvidencia && !p.conversouTutor;
                    return (
                      <tr key={p.colaboradorId} className="border-t border-white/[0.06]">
                        <td className="py-2.5 pr-3">
                          <p className={`text-[13px] font-semibold ${silencio ? 'text-amber-200' : 'text-white'}`}>
                            {p.nome}
                          </p>
                          <p className="text-[11px] text-white/40">{p.cargo || '—'}</p>
                        </td>
                        <td className="py-2.5 text-center"><EtapaJornada pessoa={p} /></td>
                        <td className="py-2.5 text-center"><Sinal ativo={p.abriuLink} titulo="Abriu o link" /></td>
                        <td className="py-2.5 text-center"><Sinal ativo={p.consumiu} titulo="Consumiu o conteúdo" /></td>
                        <td className="py-2.5 text-center"><Sinal ativo={p.enviouEvidencia} titulo="Entregou evidência" /></td>
                        <td className="py-2.5 text-center"><Sinal ativo={p.conversouTutor} titulo="Usou o Tira-Dúvidas" /></td>
                        <td className="py-2.5 pl-3">
                          {(p.formatosAbertos || []).length
                            ? (
                              <span className="flex flex-wrap gap-1">
                                {p.formatosAbertos.map((f: string) => (
                                  <span key={f} className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/60">
                                    {f}
                                  </span>
                                ))}
                              </span>
                            )
                            : <span className="text-white/25 text-[11px]">nenhum</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </GlassCard>

          <p className="mt-3 text-[11px] leading-relaxed text-white/35">
            Engajamento mede presença na jornada, não desempenho: quem abriu, consumiu, entregou a
            evidência da semana e conversou com o Tira-Dúvidas. Um traço significa que não há
            registro daquele sinal — que é diferente de a pessoa não ter feito. A etapa individual
            é a semana que a pessoa consegue acessar; ela só acompanha o calendário quando as
            etapas anteriores foram concluídas.
          </p>
        </>
      )}
    </PageContainer>
  );
}
