'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  BarChart3, Eye, RefreshCw, MousePointerClick, Loader2, CheckCircle2,
  LayoutGrid, Video, Headphones, FileText, BookOpen, ClipboardCheck,
  MessagesSquare, TrendingUp, FileChartColumnIncreasing,
} from 'lucide-react';
import AdminPageHeader from '@/components/admin/page-header';
import { useEmpresaContexto } from '@/app/admin/_shell/useEmpresaContexto';
import { getEngajamentoEmpresa } from '@/actions/engajamento';

const FMT = {
  video: { Icon: Video, cor: 'text-cyan-400', label: 'vídeo' },
  audio: { Icon: Headphones, cor: 'text-violet-400', label: 'áudio' },
  texto: { Icon: FileText, cor: 'text-emerald-400', label: 'texto' },
  case: { Icon: BookOpen, cor: 'text-amber-400', label: 'caso' },
};

function Tile({ icon: Icon, label, value, sub, color }: any) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <Icon size={14} className={color} /> {label}
      </div>
      <div className="text-2xl font-bold text-white mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Bool({ v }: { v: boolean }) {
  return v ? <span className="text-emerald-400">✓</span> : <span className="text-gray-600">—</span>;
}

function FormatosIcons({ lista }: { lista: string[] }) {
  return (
    <>
      {(['video', 'audio', 'texto', 'case'] as const).filter((f) => lista?.includes(f)).map((f) => {
        const { Icon, cor, label } = FMT[f];
        return <span key={f} title={label}><Icon size={14} className={cor} /></span>;
      })}
    </>
  );
}

/** Célula de uma pílula: bolinha = abriu o link; ícones = formatos abertos daquele descritor. */
function PilulaCell({ abriu, formatos }: { abriu: boolean; formatos: string[] }) {
  if (!abriu && !formatos?.length) return <span className="text-gray-600">—</span>;
  return (
    <div className="flex items-center gap-2">
      <span title={abriu ? 'abriu o link' : 'não abriu o link'} className={abriu ? 'text-cyan-400 text-lg leading-none' : 'text-gray-700 text-lg leading-none'}>●</span>
      <FormatosIcons lista={formatos} />
    </div>
  );
}

function PctBar({ pct }: { pct: number }) {
  const cor = pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-cyan-500' : pct > 0 ? 'bg-amber-500' : 'bg-gray-600';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full ${cor}`} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      <span className="text-xs text-gray-400 tabular-nums w-9">{pct}%</span>
    </div>
  );
}

function SemanaBadge({
  semana,
  semanaCalendario,
  atrasada,
  concluida,
}: {
  semana: number | null;
  semanaCalendario: number;
  atrasada: boolean;
  concluida: boolean;
}) {
  if (semana == null) {
    return (
      <span
        title="Não foi possível ler a trilha e o progresso desta pessoa"
        className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-gray-500"
      >
        Posição indisponível
      </span>
    );
  }

  const situacao = atrasada
    ? { label: 'pendente', dot: 'bg-amber-400', style: 'border-amber-400/25 bg-amber-400/10 text-amber-200' }
    : concluida
      ? { label: 'concluída', dot: 'bg-emerald-400', style: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' }
      : { label: 'em curso', dot: 'bg-cyan-400', style: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200' };
  const titulo = atrasada
    ? `Pode continuar na semana ${semana}; o calendário da turma está na semana ${semanaCalendario}`
    : concluida
      ? `Concluiu a semana ${semana} e está em dia com o calendário da turma`
      : `Está na semana ${semana}, em dia com o calendário da turma`;

  return (
    <span
      title={titulo}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${situacao.style}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${situacao.dot}`} aria-hidden="true" />
      Semana {semana} · {situacao.label}
    </span>
  );
}

function DistribuicaoJornada({
  colaboradores,
  semanas,
  posicaoSelecionada,
  onSelecionar,
}: {
  colaboradores: any[];
  semanas: number[];
  posicaoSelecionada: number | null;
  onSelecionar: (semana: number | null) => void;
}) {
  const distribuicao = semanas.map((semana) => {
    const pessoas = colaboradores.filter((c) => Number(c.semanaAcessivel) === semana);
    const pendentes = pessoas.filter((c) => c.jornadaAtrasada).length;
    const concluidas = pessoas.filter((c) => !c.jornadaAtrasada && c.semanaAcessivelConcluida).length;
    return {
      semana,
      total: pessoas.length,
      pendentes,
      concluidas,
      emCurso: pessoas.length - pendentes - concluidas,
    };
  });
  const maiorTotal = Math.max(1, ...distribuicao.map((item) => item.total));
  const calendarios = colaboradores
    .map((c) => Number(c.semanaCalendario))
    .filter((s) => Number.isFinite(s) && s > 0);
  const calendarioMin = calendarios.length ? Math.min(...calendarios) : null;
  const calendarioMax = calendarios.length ? Math.max(...calendarios) : null;
  const calendarioTexto = calendarioMin == null || calendarioMax == null
    ? 'Calendário da turma indisponível'
    : calendarioMin === calendarioMax
      ? `Calendário da turma: semana ${calendarioMin}`
      : `Calendários das turmas: semanas ${calendarioMin}–${calendarioMax}`;
  const semPosicao = colaboradores.filter((c) => c.semanaAcessivel == null).length;

  return (
    <section aria-labelledby="distribuicao-jornada-titulo" className="mb-4 rounded-xl border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="distribuicao-jornada-titulo" className="text-sm font-semibold text-white">
            Etapa individual da jornada
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Semana que cada pessoa consegue acessar agora · {calendarioTexto}
          </p>
        </div>
        {posicaoSelecionada && (
          <button
            type="button"
            onClick={() => onSelecionar(null)}
            className="rounded-md px-2 py-1 text-xs text-cyan-300 transition-colors hover:bg-cyan-400/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          >
            Mostrar todas as pessoas
          </button>
        )}
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max items-end gap-1.5">
          {distribuicao.map(({ semana, total, pendentes, emCurso, concluidas }) => {
            const selecionada = posicaoSelecionada === semana;
            const altura = total === 0 ? 3 : Math.max(12, Math.round((total / maiorTotal) * 38));
            const pessoas = total === 1 ? 'pessoa' : 'pessoas';
            const detalhes = [
              pendentes > 0 && `${pendentes} pendente${pendentes === 1 ? '' : 's'}`,
              emCurso > 0 && `${emCurso} em curso`,
              concluidas > 0 && `${concluidas} concluída${concluidas === 1 ? '' : 's'}`,
            ].filter(Boolean).join(', ');

            return (
              <button
                key={semana}
                type="button"
                disabled={total === 0}
                aria-pressed={selecionada}
                aria-label={`${total} ${pessoas} na semana ${semana}${detalhes ? `: ${detalhes}` : ''}. ${selecionada ? 'Mostrar todas as pessoas' : 'Filtrar a tabela por esta etapa'}`}
                title={`${total} ${pessoas} na semana ${semana}${detalhes ? ` · ${detalhes}` : ''}`}
                onClick={() => onSelecionar(selecionada ? null : semana)}
                className={`group flex w-[68px] shrink-0 flex-col rounded-lg border px-2 pb-2 pt-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-default ${
                  selecionada
                    ? 'border-cyan-400/40 bg-cyan-400/10'
                    : 'border-white/[0.07] bg-black/10 enabled:hover:border-white/20 enabled:hover:bg-white/5'
                }`}
              >
                <span className="flex h-10 w-full items-end" aria-hidden="true">
                  <span
                    className={`flex w-full flex-col-reverse overflow-hidden rounded-sm transition-opacity ${selecionada ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}`}
                    style={{ height: `${altura}px` }}
                  >
                    {total === 0 && <span className="h-full bg-white/10" />}
                    {pendentes > 0 && <span className="bg-amber-400" style={{ flexGrow: pendentes }} />}
                    {emCurso > 0 && <span className="bg-cyan-400" style={{ flexGrow: emCurso }} />}
                    {concluidas > 0 && <span className="bg-emerald-400" style={{ flexGrow: concluidas }} />}
                  </span>
                </span>
                <span className={`mt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${selecionada ? 'text-cyan-200' : 'text-gray-500'}`}>
                  Semana {semana}
                </span>
                <span className={`mt-0.5 text-sm font-semibold tabular-nums ${selecionada ? 'text-white' : 'text-gray-300'}`}>
                  {total} <span className="text-[10px] font-normal text-gray-500">{pessoas}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/[0.06] pt-3 text-[11px] text-gray-500">
        <span><span className="text-amber-400">●</span> semana anterior pendente</span>
        <span><span className="text-cyan-400">●</span> etapa em curso</span>
        <span><span className="text-emerald-400">●</span> etapa atual concluída</span>
        {semPosicao > 0 && <span className="text-gray-400">{semPosicao} sem posição disponível</span>}
      </div>
    </section>
  );
}

export default function EngajamentoPage() {
  const { empresaId, empresa } = useEmpresaContexto();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [semanaSel, setSemanaSel] = useState<number | null>(null);
  const [posicaoSel, setPosicaoSel] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    if (!empresaId) { setData(null); return; }
    setLoading(true);
    try {
      setData(await getEngajamentoEmpresa(empresaId, semanaSel));
    } finally {
      setLoading(false);
    }
  }, [empresaId, semanaSel]);

  useEffect(() => { carregar(); }, [carregar]);

  const resumo = data?.resumo;
  const colabs = data?.colaboradores || [];
  const semanas: number[] = data?.semanas || [1];
  const posicaoSelAtiva = posicaoSel != null
    && colabs.some((c: any) => Number(c.semanaAcessivel) === posicaoSel)
    ? posicaoSel
    : null;
  const colabsVisiveis = posicaoSelAtiva == null
    ? colabs
    : colabs.filter((c: any) => Number(c.semanaAcessivel) === posicaoSelAtiva);

  return (
    <div>
      <AdminPageHeader
        icon={BarChart3}
        iconClassName="text-cyan-400"
        title="Engajamento da trilha"
        subtitle={empresa?.nome ? `${empresa.nome} — abriu · formato · vídeo · concluiu · evidência · tutor` : 'Selecione uma empresa no filtro do topo'}
        actions={
          <div className="flex items-center justify-end gap-2 flex-wrap">
            <Link
              href={empresaId ? `/admin/engajamento/relatorio?empresa=${empresaId}` : '/admin/engajamento/relatorio'}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-amber-400/10 border border-amber-400/20 text-amber-200 hover:bg-amber-400/15"
            >
              <FileChartColumnIncreasing size={13} /> Mockup relatório
            </Link>
            <Link
              href={empresaId ? `/admin/engajamento/evolucao?empresa=${empresaId}` : '/admin/engajamento/evolucao'}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-cyan-400/10 border border-cyan-400/20 text-cyan-300 hover:bg-cyan-400/15"
            >
              <TrendingUp size={13} /> Página B
            </Link>
            <select
              aria-label="Métricas da semana"
              value={semanaSel ?? ''}
              onChange={(e) => setSemanaSel(e.target.value ? Number(e.target.value) : null)}
              disabled={!empresaId}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 disabled:opacity-40">
              <option value="">Métricas · todas as semanas</option>
              {semanas.map((s) => <option key={s} value={s}>Métricas · semana {s}</option>)}
            </select>
            <button onClick={carregar} disabled={loading || !empresaId}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 disabled:opacity-40">
              {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Atualizar
            </button>
          </div>
        }
      />

      {!empresaId && (
        <div className="text-sm text-gray-500 bg-white/5 border border-white/10 rounded-xl p-6 text-center">
          Escolha uma empresa no filtro do topo para ver o engajamento.
        </div>
      )}

      {empresaId && resumo && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            <Tile icon={Eye} color="text-gray-400" label="Inscritos" value={resumo.inscritos} />
            <Tile icon={LayoutGrid} color="text-teal-400" label="Abriram conteúdo" value={resumo.abriramAlgumFormato} sub={`de ${resumo.inscritos}`} />
            <Tile icon={CheckCircle2} color="text-emerald-400" label="Consumiram" value={resumo.consumiram} sub="vídeo/áudio/marcou" />
            <Tile icon={MousePointerClick} color="text-cyan-400" label="Abriram o link" value={resumo.abriramLink} sub={`de ${resumo.inscritos}`} />
            <Tile icon={ClipboardCheck} color="text-amber-400" label="Evidência" value={resumo.enviaramEvidencia} sub="concluíram a semana" />
            <Tile icon={MessagesSquare} color="text-violet-400" label="Tira-Dúvidas" value={resumo.conversaramTutor} sub="conversaram com o tutor" />
          </div>

          {/* Quebra por PÍLULA (2 linhas) e por FORMATO PRINCIPAL (denominador correto) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Por pílula</div>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] text-gray-500">
                  <th className="font-medium pb-1"></th><th className="font-medium pb-1 text-center">Recebeu</th>
                  <th className="font-medium pb-1 text-center">Abriu</th><th className="font-medium pb-1 text-center">Abriu formato</th>
                </tr></thead>
                <tbody>
                  {(resumo.porPilula || []).map((p: any) => (
                    <tr key={p.pilula} className="border-t border-white/5">
                      <td className="py-1.5 text-gray-300 font-medium">Pílula {p.pilula}</td>
                      <td className="py-1.5 text-center text-gray-300">{p.recebeu}</td>
                      <td className="py-1.5 text-center text-cyan-400">{p.abriu}</td>
                      <td className="py-1.5 text-center text-teal-400">{p.abriuFormato}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Por formato principal <span className="normal-case text-gray-600">(engajou / preferido)</span></div>
              <table className="w-full text-sm">
                <tbody>
                  {(resumo.porFormato || []).map((f: any) => {
                    const meta = (FMT as any)[f.formato] || { Icon: FileText, cor: 'text-gray-400', label: f.formato };
                    const FmtIcon = meta.Icon;
                    const pct = f.principal ? Math.round((f.engajou / f.principal) * 100) : 0;
                    return (
                      <tr key={f.formato} className="border-t border-white/5 first:border-t-0">
                        <td className="py-1.5"><span className={`inline-flex items-center gap-1.5 ${meta.cor}`}><FmtIcon size={13} />{meta.label}</span></td>
                        <td className="py-1.5 text-center text-white font-medium">{f.engajou}<span className="text-gray-500 font-normal"> / {f.principal}</span></td>
                        <td className="py-1.5 text-center text-gray-400 text-xs">{pct}%</td>
                        <td className="py-1.5 text-right text-gray-400 text-xs">{f.pctMedio != null ? `${f.pctMedio}% médio vídeo` : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <DistribuicaoJornada
            colaboradores={colabs}
            semanas={semanas}
            posicaoSelecionada={posicaoSelAtiva}
            onSelecionar={setPosicaoSel}
          />

          <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-white/10">
                    <th className="px-4 py-2.5 font-medium">Colaborador</th>
                    <th className="hidden px-3 py-2.5 font-medium text-center sm:table-cell">Etapa individual</th>
                    <th className="px-3 py-2.5 font-medium text-center">Recebeu</th>
                    <th className="px-3 py-2.5 font-medium">Pílula 1</th>
                    <th className="px-3 py-2.5 font-medium">Pílula 2</th>
                    <th className="px-3 py-2.5 font-medium text-center">Terminou vídeo</th>
                    <th className="px-3 py-2.5 font-medium">% vídeo</th>
                    <th className="px-3 py-2.5 font-medium text-center">Consumiu</th>
                    <th className="px-3 py-2.5 font-medium text-center">Evidência</th>
                    <th className="px-3 py-2.5 font-medium text-center">Tutor</th>
                  </tr>
                </thead>
                <tbody>
                  {colabsVisiveis.map((c: any) => (
                    <tr key={c.colaboradorId} className="border-b border-white/5 hover:bg-white/5">
                      <td className="px-4 py-2.5">
                        <div className="text-white truncate max-w-[220px]">{c.nome}</div>
                        <div className="text-xs text-gray-500">{c.cargo}</div>
                        <div className="mt-1.5 sm:hidden">
                          <SemanaBadge
                            semana={c.semanaAcessivel}
                            semanaCalendario={c.semanaCalendario}
                            atrasada={c.jornadaAtrasada}
                            concluida={c.semanaAcessivelConcluida}
                          />
                        </div>
                      </td>
                      <td className="hidden px-3 py-2.5 text-center sm:table-cell">
                        <SemanaBadge
                          semana={c.semanaAcessivel}
                          semanaCalendario={c.semanaCalendario}
                          atrasada={c.jornadaAtrasada}
                          concluida={c.semanaAcessivelConcluida}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-center text-xs">
                        {/* null = sem registro POR SEMANA (o carimbo é só do último envio) */}
                        <span title={c.recebeuP1 === null ? 'sem registro por semana — só o último envio fica carimbado' : ''}
                          className={c.recebeuP1 === true ? 'text-emerald-400' : c.recebeuP1 === null ? 'text-gray-700' : 'text-gray-600'}>
                          {c.recebeuP1 === null ? '·' : 'P1'}
                        </span>
                        {' / '}
                        <span title={c.recebeuP2 === null ? 'sem registro por semana — só o último envio fica carimbado' : ''}
                          className={c.recebeuP2 === true ? 'text-emerald-400' : c.recebeuP2 === null ? 'text-gray-700' : 'text-gray-600'}>
                          {c.recebeuP2 === null ? '·' : 'P2'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5"><PilulaCell abriu={c.abriuP1} formatos={c.formatosP1} /></td>
                      <td className="px-3 py-2.5"><PilulaCell abriu={c.abriuP2} formatos={c.formatosP2} /></td>
                      <td className="px-3 py-2.5 text-center"><Bool v={c.terminouVideo} /></td>
                      <td className="px-3 py-2.5"><PctBar pct={c.pctVideo} /></td>
                      <td className="px-3 py-2.5 text-center">
                        {c.consumiu
                          ? <span className="text-emerald-400" title={[c.terminouVideo && 'vídeo', c.audioTerminou && 'áudio', c.marcouConcluido && 'marcou'].filter(Boolean).join(' · ')}>✓</span>
                          : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {c.enviouEvidencia
                          ? <span className="text-amber-400" title="enviou a evidência (semana concluída)">✓</span>
                          : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {c.conversouTutor
                          ? <span className="text-violet-400" title="usou o Tira-Dúvidas da semana">💬</span>
                          : <span className="text-gray-600">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-gray-600 mt-3 leading-relaxed">
            <strong>Pílula 1 / Pílula 2</strong>: ● = engajou com a pílula (abriu o link com <code>?p=</code> OU clicou um formato dela); ícones = formatos abertos (🎬 vídeo · 🎧 áudio · 📖 texto · 📋 caso). “—” não quer dizer que não viu — o play de vídeo é contado à parte (via <code>videos_watched</code>).
            <strong> Por formato principal</strong>: o denominador é quem tem aquele formato como <em>preferido</em> (não o total); vídeo = terminou o vídeo, demais = abriu o formato.
            <strong> Abriram o link</strong> = abriu a PÁGINA da semana; “Abriram conteúdo” = clicou/tocou um formato dentro dela. Da semana 2 em diante o funil é normal (link ≥ conteúdo; a diferença é quem abriu e não clicou nada). Na semana 1 o link SUBCONTA (rastreio de abertura só existe desde 15/07) e pode ficar menor que o conteúdo.
            <strong> Evidência</strong> = concluiu a semana enviando a reflexão (o texto completo fica em Vertho → Evidências).
            <strong> Tutor</strong> = abriu conversa no Tira-Dúvidas da página da semana.
            <strong> Com filtro de semana</strong>: Recebeu = envio DENTRO daquela semana (o banco só guarda o último carimbo — semana passada vira “·” sem registro); vídeos antigos sem semana (pré-15/07) contam só em “Todas as semanas”.
          </p>
        </>
      )}

      {empresaId && loading && !resumo && (
        <div className="flex items-center gap-2 text-sm text-gray-500 p-6">
          <Loader2 size={16} className="animate-spin" /> Carregando…
        </div>
      )}
    </div>
  );
}
