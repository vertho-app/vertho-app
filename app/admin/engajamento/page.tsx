'use client';

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Eye,
  FileChartColumnIncreasing,
  FileText,
  Headphones,
  LayoutGrid,
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  TrendingUp,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react';
import AdminPageHeader from '@/components/admin/page-header';
import EngagementEvolutionPanel from '@/components/engajamento/evolution-panel';
import { SignalJourney } from '@/components/engajamento/signal-journey';
import { useEmpresaContexto } from '@/app/admin/_shell/useEmpresaContexto';
import { getEngajamentoEmpresa } from '@/actions/engajamento';

const FMT: Record<string, {
  Icon: LucideIcon;
  cor: string;
  fundo: string;
  label: string;
}> = {
  video: { Icon: Video, cor: 'text-cyan-300', fundo: 'bg-cyan-300/10 border-cyan-300/20', label: 'Vídeo' },
  audio: { Icon: Headphones, cor: 'text-violet-300', fundo: 'bg-violet-300/10 border-violet-300/20', label: 'Áudio' },
  texto: { Icon: FileText, cor: 'text-emerald-300', fundo: 'bg-emerald-300/10 border-emerald-300/20', label: 'Texto' },
  case: { Icon: BookOpen, cor: 'text-amber-300', fundo: 'bg-amber-300/10 border-amber-300/20', label: 'Caso' },
};

type Foco = 'todos' | 'atencao' | 'movimento';
type AbaEngajamento = 'atual' | 'evolucao';

function temSinal(pessoa: any): boolean {
  return Boolean(
    pessoa.abriuLink
    || pessoa.formatosAbertos?.length
    || pessoa.consumiu
    || pessoa.enviouEvidencia
    || pessoa.conversouTutor
  );
}

function pedeAcompanhamento(pessoa: any): boolean {
  return Boolean(pessoa.jornadaAtrasada || !temSinal(pessoa));
}

function FormatosIcons({ lista, comRotulo = false }: { lista?: string[]; comRotulo?: boolean }) {
  if (!lista?.length) return <span className="text-[10px] text-white/25">Nenhum formato aberto</span>;

  return (
    <span className="flex flex-wrap gap-1">
      {lista.map((formato) => {
        const meta = FMT[formato] || FMT.texto;
        const Icon = meta.Icon;
        return (
          <span
            key={formato}
            title={meta.label}
            aria-label={meta.label}
            className={`inline-flex items-center gap-1 rounded-[10px] border px-1.5 py-1 text-[9px] font-bold ${meta.fundo} ${meta.cor}`}
          >
            <Icon size={11} aria-hidden="true" />
            {comRotulo && meta.label}
          </span>
        );
      })}
    </span>
  );
}

function SemanaBadge({ pessoa }: { pessoa: any }) {
  if (pessoa.semanaAcessivel == null) {
    return (
      <span
        title="Não foi possível ler a trilha e o progresso desta pessoa"
        className="inline-flex rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] font-semibold text-white/30"
      >
        Posição indisponível
      </span>
    );
  }

  const situacao = pessoa.jornadaAtrasada
    ? { label: 'etapa pendente', dot: 'bg-amber-400', style: 'border-amber-300/20 bg-amber-300/[0.08] text-amber-200' }
    : pessoa.semanaAcessivelConcluida
      ? { label: 'concluída', dot: 'bg-emerald-400', style: 'border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200' }
      : { label: 'em curso', dot: 'bg-cyan-400', style: 'border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-200' };

  return (
    <span
      title={`Calendário da turma: semana ${pessoa.semanaCalendario}`}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-semibold tabular-nums ${situacao.style}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${situacao.dot}`} aria-hidden="true" />
      Semana {pessoa.semanaAcessivel} · {situacao.label}
    </span>
  );
}

function PilulaSignal({
  numero,
  recebeu,
  abriu,
  formatos,
}: {
  numero: 1 | 2;
  recebeu: boolean | null;
  abriu: boolean;
  formatos?: string[];
}) {
  const envio = recebeu === null ? 'envio sem registro semanal' : recebeu ? 'envio registrado' : 'envio não registrado';
  const envioCurto = recebeu === null ? 'Envio sem registro' : recebeu ? 'Enviada' : 'Sem envio';

  return (
    <div className="flex min-w-[154px] items-center gap-2 rounded-[10px] border border-white/[0.07] bg-white/[0.025] px-2 py-1.5">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-[8px] text-[10px] font-bold ${abriu ? 'bg-cyan-300/12 text-cyan-200' : 'bg-white/[0.04] text-white/35'}`}>
        P{numero}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <Send
            size={11}
            className={recebeu === true ? 'text-emerald-300' : 'text-white/20'}
            aria-label={envio}
          />
          <Eye
            size={12}
            className={abriu ? 'text-cyan-300' : 'text-white/20'}
            aria-label={abriu ? 'abertura registrada' : 'sem abertura registrada'}
          />
          <FormatosIcons lista={formatos} />
        </span>
        <span className="mt-0.5 block text-[9px] text-white/32">
          {envioCurto} · {abriu ? 'abriu' : 'sem abertura'}
        </span>
      </span>
    </div>
  );
}

function Consumo({ pessoa, compacto = false }: { pessoa: any; compacto?: boolean }) {
  const pct = Math.min(100, Math.max(0, Number(pessoa.pctVideo) || 0));
  const label = pessoa.consumiu ? 'Conteúdo consumido' : pct > 0 ? 'Vídeo em andamento' : 'Sem consumo registrado';
  const cor = pessoa.consumiu ? 'text-emerald-300' : pct > 0 ? 'text-amber-300' : 'text-white/30';

  return (
    <div className={compacto ? 'min-w-0' : 'min-w-[130px]'}>
      <div className={`flex items-center gap-1.5 text-[10px] font-semibold ${cor}`}>
        <CheckCircle2 size={12} aria-hidden="true" />
        {label}
      </div>
      {(pessoa.deuPlay || pessoa.formatoPrincipal === 'video') && (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-400' : pct > 0 ? 'bg-amber-400' : 'bg-white/10'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="w-8 text-right font-mono text-[9px] tabular-nums text-white/35">{pct}%</span>
        </div>
      )}
    </div>
  );
}

function EntregaETutor({ pessoa }: { pessoa: any }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-bold ${
        pessoa.enviouEvidencia
          ? 'border-amber-300/20 bg-amber-300/[0.08] text-amber-200'
          : 'border-white/[0.07] bg-white/[0.025] text-white/28'
      }`}>
        <ClipboardCheck size={11} aria-hidden="true" /> Evidência
      </span>
      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-bold ${
        pessoa.conversouTutor
          ? 'border-violet-300/20 bg-violet-300/[0.08] text-violet-200'
          : 'border-white/[0.07] bg-white/[0.025] text-white/28'
      }`}>
        <MessageCircle size={11} aria-hidden="true" /> Tutor
      </span>
    </div>
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
    ? 'Calendário indisponível'
    : calendarioMin === calendarioMax
      ? `Calendário na semana ${calendarioMin}`
      : `Turmas entre as semanas ${calendarioMin} e ${calendarioMax}`;
  const semPosicao = colaboradores.filter((c) => c.semanaAcessivel == null).length;

  return (
    <section aria-labelledby="distribuicao-jornada-titulo" className="rounded-[24px] border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/35">Posição na trilha</p>
          <h2
            id="distribuicao-jornada-titulo"
            className="mt-1 text-[21px] leading-tight text-white"
            style={{ fontFamily: 'var(--font-serif, "Instrument Serif", serif)', fontStyle: 'italic' }}
          >
            Onde as pessoas estão agora
          </h2>
          <p className="mt-1 text-[10px] text-white/35">{calendarioTexto}. Selecione uma semana para filtrar a lista.</p>
        </div>
        {posicaoSelecionada && (
          <button
            type="button"
            onClick={() => onSelecionar(null)}
            className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-3 py-1.5 text-[10px] font-bold text-cyan-200 transition-colors hover:bg-cyan-300/12 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          >
            Limpar semana
          </button>
        )}
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max items-end gap-2">
          {distribuicao.map(({ semana, total, pendentes, emCurso, concluidas }) => {
            const selecionada = posicaoSelecionada === semana;
            const altura = total === 0 ? 4 : Math.max(14, Math.round((total / maiorTotal) * 54));
            return (
              <button
                key={semana}
                type="button"
                disabled={total === 0}
                aria-pressed={selecionada}
                aria-label={`${total} pessoa${total === 1 ? '' : 's'} na semana ${semana}`}
                onClick={() => onSelecionar(selecionada ? null : semana)}
                className={`group w-[78px] shrink-0 rounded-[16px] border p-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-default ${
                  selecionada
                    ? 'border-cyan-300/35 bg-cyan-300/[0.09]'
                    : 'border-white/[0.07] bg-black/10 enabled:hover:border-white/15 enabled:hover:bg-white/[0.04]'
                }`}
              >
                <span className="flex h-14 w-full items-end" aria-hidden="true">
                  <span
                    className={`flex w-full flex-col-reverse overflow-hidden rounded-[6px] transition-opacity ${selecionada ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}`}
                    style={{ height: `${altura}px` }}
                  >
                    {total === 0 && <span className="h-full bg-white/[0.07]" />}
                    {pendentes > 0 && <span className="bg-amber-400" style={{ flexGrow: pendentes }} />}
                    {emCurso > 0 && <span className="bg-cyan-400" style={{ flexGrow: emCurso }} />}
                    {concluidas > 0 && <span className="bg-emerald-400" style={{ flexGrow: concluidas }} />}
                  </span>
                </span>
                <span className={`mt-2 block text-[9px] font-bold uppercase tracking-[0.12em] ${selecionada ? 'text-cyan-200' : 'text-white/35'}`}>
                  Semana {semana}
                </span>
                <span className="mt-0.5 block text-sm font-semibold tabular-nums text-white/80">{total}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-white/[0.06] pt-3 text-[9px] text-white/35">
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> etapa pendente</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-cyan-400" /> em curso</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> etapa concluída</span>
        {semPosicao > 0 && <span>{semPosicao} sem posição disponível</span>}
      </div>
    </section>
  );
}

function PilulasResumo({ itens }: { itens: any[] }) {
  return (
    <section className="rounded-[24px] border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/35">Entrega das pílulas</p>
      <h2 className="mt-1 text-sm font-semibold text-white">Do envio à escolha do formato</h2>
      <div className="mt-4 space-y-3">
        {itens.map((item) => (
          <div key={item.pilula} className="rounded-[16px] border border-white/[0.07] bg-black/10 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold text-white/70">Pílula {item.pilula}</span>
              <span className="text-[9px] text-white/30">sinais registrados</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Recebeu', valor: item.recebeu, cor: 'text-emerald-300' },
                { label: 'Abriu', valor: item.abriu, cor: 'text-cyan-300' },
                { label: 'Escolheu', valor: item.abriuFormato, cor: 'text-teal-300' },
              ].map((sinal) => (
                <div key={sinal.label}>
                  <p className={`text-lg font-semibold tabular-nums ${sinal.cor}`}>{sinal.valor}</p>
                  <p className="text-[9px] text-white/32">{sinal.label}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FormatosResumo({ itens }: { itens: any[] }) {
  return (
    <section className="rounded-[24px] border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/35">Preferência declarada</p>
      <h2 className="mt-1 text-sm font-semibold text-white">Engajamento no formato principal</h2>
      <div className="mt-4 space-y-3">
        {itens.map((item) => {
          const meta = FMT[item.formato] || FMT.texto;
          const Icon = meta.Icon;
          const pct = item.principal ? Math.round((item.engajou / item.principal) * 100) : 0;
          return (
            <div key={item.formato}>
              <div className="flex items-center justify-between gap-3 text-[10px]">
                <span className={`inline-flex items-center gap-1.5 font-bold ${meta.cor}`}>
                  <Icon size={12} aria-hidden="true" /> {meta.label}
                </span>
                <span className="font-mono tabular-nums text-white/45">
                  {item.engajou}/{item.principal} · {pct}%
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400" style={{ width: `${pct}%` }} />
              </div>
              {item.pctMedio != null && (
                <p className="mt-1 text-right text-[9px] text-white/28">Média assistida: {item.pctMedio}%</p>
              )}
            </div>
          );
        })}
        {!itens.length && <p className="text-[10px] text-white/30">Nenhuma preferência registrada neste recorte.</p>}
      </div>
    </section>
  );
}

function PessoaCard({ pessoa }: { pessoa: any }) {
  const atencao = pedeAcompanhamento(pessoa);
  return (
    <article className={`rounded-[16px] border p-4 ${atencao ? 'border-amber-300/16 bg-amber-300/[0.035]' : 'border-white/[0.07] bg-white/[0.02]'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-white">{pessoa.nome}</p>
          <p className="truncate text-[10px] text-white/35">{pessoa.cargo || 'Cargo não informado'}</p>
        </div>
        {atencao && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-300/10 px-2 py-1 text-[9px] font-bold text-amber-200">
            <AlertTriangle size={10} aria-hidden="true" /> Acompanhar
          </span>
        )}
      </div>
      <div className="mt-3"><SemanaBadge pessoa={pessoa} /></div>
      <div className="mt-3 space-y-2">
        <PilulaSignal numero={1} recebeu={pessoa.recebeuP1} abriu={pessoa.abriuP1} formatos={pessoa.formatosP1} />
        <PilulaSignal numero={2} recebeu={pessoa.recebeuP2} abriu={pessoa.abriuP2} formatos={pessoa.formatosP2} />
      </div>
      <div className="mt-3 border-t border-white/[0.06] pt-3"><Consumo pessoa={pessoa} compacto /></div>
      <div className="mt-3"><EntregaETutor pessoa={pessoa} /></div>
    </article>
  );
}

export default function EngajamentoPage() {
  const { empresaId, empresa } = useEmpresaContexto();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [semanaSel, setSemanaSel] = useState<number | null>(null);
  const [posicaoSel, setPosicaoSel] = useState<number | null>(null);
  const [foco, setFoco] = useState<Foco>('todos');
  const [busca, setBusca] = useState('');
  const [aba, setAba] = useState<AbaEngajamento>('atual');

  const carregar = useCallback(async () => {
    if (!empresaId) { setData(null); return; }
    setLoading(true);
    try {
      setData(await getEngajamentoEmpresa(empresaId, semanaSel));
    } finally {
      setLoading(false);
    }
  }, [empresaId, semanaSel]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void carregar(); }, 0);
    return () => window.clearTimeout(timer);
  }, [carregar]);

  // Compatibilidade com links antigos: seleciona a aba e limpa o marcador da
  // URL. Depois disso, alternar abas não navega nem altera o endereço.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('view') !== 'evolucao') return;
      setAba('evolucao');
      params.delete('view');
      const query = params.toString();
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${query ? `?${query}` : ''}`,
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const resumo = data?.resumo;
  const colabs: any[] = data?.colaboradores || [];
  const semanas: number[] = data?.semanas || [1];
  const total = Number(resumo?.inscritos) || 0;
  const posicaoSelAtiva = posicaoSel != null
    && colabs.some((c) => Number(c.semanaAcessivel) === posicaoSel)
    ? posicaoSel
    : null;
  const colabsNaPosicao = posicaoSelAtiva == null
    ? colabs
    : colabs.filter((c) => Number(c.semanaAcessivel) === posicaoSelAtiva);
  const emAtencao = colabs.filter(pedeAcompanhamento).length;
  const etapasPendentes = colabs.filter((c) => c.jornadaAtrasada).length;
  const semSinal = colabs.filter((c) => !temSinal(c)).length;

  const colabsVisiveis = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    return colabsNaPosicao
      .filter((c) => foco === 'todos' || (foco === 'atencao' ? pedeAcompanhamento(c) : !pedeAcompanhamento(c)))
      .filter((c) => !termo || `${c.nome} ${c.cargo || ''}`.toLocaleLowerCase('pt-BR').includes(termo))
      .sort((a, b) => Number(pedeAcompanhamento(b)) - Number(pedeAcompanhamento(a)) || a.nome.localeCompare(b.nome));
  }, [busca, colabsNaPosicao, foco]);

  const mostrarAtencao = () => {
    setFoco('atencao');
    window.setTimeout(() => document.getElementById('pessoas')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const navegarAbas = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const proxima: AbaEngajamento = event.key === 'ArrowLeft' || event.key === 'Home' ? 'atual' : 'evolucao';
    setAba(proxima);
    window.requestAnimationFrame(() => document.getElementById(`aba-engajamento-${proxima}`)?.focus());
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        icon={BarChart3}
        iconClassName="text-cyan-300"
        title="Engajamento da jornada"
        subtitle={empresa?.nome
          ? `${empresa.nome} · do primeiro acesso à evidência prática`
          : 'Selecione uma empresa no filtro do topo'}
        actions={empresaId ? (
          <Link
            href={`/admin/engajamento/relatorio?empresa=${empresaId}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.09] bg-white/[0.035] px-3 py-1.5 text-[10px] font-bold text-white/55 transition-colors hover:bg-white/[0.07] hover:text-white"
          >
            <FileChartColumnIncreasing size={12} aria-hidden="true" /> Prévia do relatório
          </Link>
        ) : null}
      />

      <div className="mb-5 flex flex-col gap-2 border-b border-white/[0.08] lg:flex-row lg:items-end lg:justify-between">
        <div role="tablist" aria-label="Visões de engajamento" className="flex items-center gap-5 sm:gap-7">
          <button
            id="aba-engajamento-atual"
            type="button"
            role="tab"
            aria-selected={aba === 'atual'}
            aria-controls="painel-engajamento-atual"
            tabIndex={aba === 'atual' ? 0 : -1}
            onClick={() => setAba('atual')}
            onKeyDown={navegarAbas}
            className={`relative inline-flex min-h-11 items-center gap-1.5 pb-3 text-[10px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:rounded-full after:transition-colors ${
              aba === 'atual'
                ? 'text-cyan-200 after:bg-cyan-300'
                : 'text-white/35 after:bg-transparent hover:text-white/70'
            }`}
          >
            <BarChart3 size={13} aria-hidden="true" /> Visão atual
          </button>
          <button
            id="aba-engajamento-evolucao"
            type="button"
            role="tab"
            aria-selected={aba === 'evolucao'}
            aria-controls="painel-engajamento-evolucao"
            tabIndex={aba === 'evolucao' ? 0 : -1}
            onClick={() => setAba('evolucao')}
            onKeyDown={navegarAbas}
            className={`relative inline-flex min-h-11 items-center gap-1.5 pb-3 text-[10px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:rounded-full after:transition-colors ${
              aba === 'evolucao'
                ? 'text-cyan-200 after:bg-cyan-300'
                : 'text-white/35 after:bg-transparent hover:text-white/70'
            }`}
          >
            <TrendingUp size={13} aria-hidden="true" /> Evolução semanal
          </button>
        </div>
        {aba === 'atual' && (
          <div className="flex flex-wrap items-center gap-2 pb-2">
          <select
            aria-label="Filtrar métricas por semana"
            value={semanaSel ?? ''}
            onChange={(event) => setSemanaSel(event.target.value ? Number(event.target.value) : null)}
            disabled={!empresaId}
            className="min-h-8 rounded-[10px] border border-white/[0.09] bg-[#081a2f] px-2.5 text-[10px] font-semibold text-white/65 outline-none focus:border-cyan-300/35 disabled:opacity-40"
          >
            <option value="">Todas as semanas</option>
            {semanas.map((s) => <option key={s} value={s}>Semana {s}</option>)}
          </select>
          <button
            type="button"
            onClick={carregar}
            disabled={loading || !empresaId}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-[10px] border border-white/[0.09] bg-white/[0.035] px-3 text-[10px] font-bold text-white/55 transition-colors hover:bg-white/[0.07] hover:text-white disabled:opacity-40"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Atualizar
          </button>
          </div>
        )}
      </div>

      {!empresaId && (
        <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.025] p-10 text-center">
          <Users size={22} className="mx-auto text-cyan-300/45" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-white/70">Escolha uma empresa para começar</p>
          <p className="mt-1 text-[11px] text-white/35">O filtro fica no topo da área administrativa.</p>
        </div>
      )}

      <div
        id="painel-engajamento-atual"
        role="tabpanel"
        aria-labelledby="aba-engajamento-atual"
        hidden={aba !== 'atual'}
      >
      {empresaId && loading && !resumo && (
        <div className="flex items-center gap-2 rounded-[24px] border border-white/[0.07] bg-white/[0.025] p-6 text-sm text-white/40">
          <Loader2 size={16} className="animate-spin" /> Organizando os sinais da jornada…
        </div>
      )}

      {empresaId && resumo && total === 0 && !loading && (
        <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.025] p-10 text-center">
          <BarChart3 size={22} className="mx-auto text-cyan-300/45" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-white/70">Ainda não há pessoas na cadência</p>
          <p className="mt-1 text-[11px] text-white/35">Os sinais aparecem depois do primeiro envio da jornada.</p>
        </div>
      )}

      {empresaId && resumo && total > 0 && (
        <div className="space-y-5">
          <SignalJourney
            title={semanaSel ? `Como o grupo avançou na semana ${semanaSel}` : 'Como o grupo avança pela jornada'}
            description={semanaSel
              ? 'Sinais registrados nesta semana: acessar, consumir e transformar o conteúdo em evidência.'
              : 'Uma leitura acumulada dos marcos que indicam presença: acessar, consumir e transformar o conteúdo em evidência.'}
            total={total}
            steps={[
              { label: 'Na cadência', value: total, detail: 'pessoas incluídas neste recorte', icon: Users, tone: 'cyan' },
              { label: 'Acessaram conteúdo', value: resumo.abriramAlgumFormato || 0, detail: 'abriram ao menos um formato', icon: LayoutGrid, tone: 'teal' },
              { label: 'Consumiram', value: resumo.consumiram || 0, detail: 'concluíram ou marcaram o conteúdo', icon: CheckCircle2, tone: 'emerald' },
              { label: 'Entregaram evidência', value: resumo.enviaramEvidencia || 0, detail: 'concluíram a prática da semana', icon: ClipboardCheck, tone: 'amber' },
            ]}
            action={(
              <button
                type="button"
                onClick={mostrarAtencao}
                className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/[0.08] px-3 py-2 text-[10px] font-bold text-amber-100 transition-colors hover:bg-amber-300/12 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
              >
                <AlertTriangle size={13} aria-hidden="true" />
                {emAtencao} para acompanhar
              </button>
            )}
          />

          <section aria-label="Sinais complementares" className="grid gap-2 sm:grid-cols-3">
            {[
              { icon: Eye, label: 'Abriram a página', value: resumo.abriramLink || 0, detail: 'abertura direta registrada', cor: 'text-cyan-300' },
              { icon: Video, label: 'Concluíram vídeo', value: resumo.terminaramVideo || 0, detail: `${resumo.pctMedioVideo || 0}% assistido em média`, cor: 'text-emerald-300' },
              { icon: MessageCircle, label: 'Usaram o Tira-Dúvidas', value: resumo.conversaramTutor || 0, detail: 'conversas iniciadas com o tutor', cor: 'text-violet-300' },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-center gap-3 rounded-[16px] border border-white/[0.07] bg-white/[0.02] px-4 py-3">
                  <Icon size={15} className={item.cor} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold text-white/60">{item.label}</p>
                    <p className="text-[9px] text-white/28">{item.detail}</p>
                  </div>
                  <span className="font-mono text-lg font-semibold tabular-nums text-white/80">{item.value}</span>
                </div>
              );
            })}
          </section>

          <DistribuicaoJornada
            colaboradores={colabs}
            semanas={semanas}
            posicaoSelecionada={posicaoSelAtiva}
            onSelecionar={setPosicaoSel}
          />

          <div className="grid gap-5 xl:grid-cols-2">
            <PilulasResumo itens={resumo.porPilula || []} />
            <FormatosResumo itens={resumo.porFormato || []} />
          </div>

          <section id="pessoas" aria-labelledby="pessoas-title" className="scroll-mt-5 rounded-[24px] border border-white/[0.08] bg-white/[0.025]">
            <div className="border-b border-white/[0.07] p-4 sm:p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/35">Detalhe por pessoa</p>
                  <h2
                    id="pessoas-title"
                    className="mt-1 text-[21px] leading-tight text-white"
                    style={{ fontFamily: 'var(--font-serif, "Instrument Serif", serif)', fontStyle: 'italic' }}
                  >
                    Quem avançou — e quem pede acompanhamento
                  </h2>
                  <p className="mt-1 text-[10px] text-white/32">
                    {etapasPendentes} com etapa pendente · {semSinal} sem sinal registrado
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-1 rounded-full border border-white/[0.07] bg-black/10 p-1">
                    {([
                      ['todos', 'Todos', colabsNaPosicao.length],
                      ['atencao', 'Acompanhar', colabsNaPosicao.filter(pedeAcompanhamento).length],
                      ['movimento', 'Em movimento', colabsNaPosicao.filter((c) => !pedeAcompanhamento(c)).length],
                    ] as const).map(([valor, label, quantidade]) => (
                      <button
                        key={valor}
                        type="button"
                        onClick={() => setFoco(valor)}
                        aria-pressed={foco === valor}
                        className={`rounded-full px-2.5 py-1.5 text-[9px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 ${
                          foco === valor ? 'bg-cyan-300/12 text-cyan-200' : 'text-white/35 hover:text-white/70'
                        }`}
                      >
                        {label} <span className="ml-0.5 font-mono">{quantidade}</span>
                      </button>
                    ))}
                  </div>
                  <label className="flex min-h-9 items-center gap-2 rounded-full border border-white/[0.08] bg-black/10 px-3 focus-within:border-cyan-300/30">
                    <Search size={12} className="text-white/30" aria-hidden="true" />
                    <span className="sr-only">Buscar pessoa</span>
                    <input
                      value={busca}
                      onChange={(event) => setBusca(event.target.value)}
                      placeholder="Buscar pessoa"
                      className="w-full bg-transparent text-[10px] text-white outline-none placeholder:text-white/25 sm:w-32"
                    />
                  </label>
                </div>
              </div>
              <p className="mt-3 text-[9px] text-white/25">Mostrando {colabsVisiveis.length} de {colabsNaPosicao.length} pessoas neste recorte.</p>
            </div>

            <div className="grid gap-2 p-3 md:grid-cols-2 lg:hidden">
              {colabsVisiveis.map((pessoa) => <PessoaCard key={pessoa.colaboradorId} pessoa={pessoa} />)}
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[980px] text-left">
                <thead>
                  <tr className="text-[9px] uppercase tracking-[0.12em] text-white/30">
                    <th className="px-5 py-3 font-bold">Pessoa</th>
                    <th className="px-3 py-3 font-bold">Etapa individual</th>
                    <th className="px-3 py-3 font-bold">Pílula 1</th>
                    <th className="px-3 py-3 font-bold">Pílula 2</th>
                    <th className="px-3 py-3 font-bold">Consumo</th>
                    <th className="px-3 py-3 font-bold">Entrega e apoio</th>
                  </tr>
                </thead>
                <tbody>
                  {colabsVisiveis.map((pessoa) => {
                    const atencao = pedeAcompanhamento(pessoa);
                    return (
                      <tr key={pessoa.colaboradorId} className={`border-t border-white/[0.055] transition-colors hover:bg-white/[0.025] ${atencao ? 'bg-amber-300/[0.018]' : ''}`}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${atencao ? 'bg-amber-400' : 'bg-emerald-400/70'}`} aria-hidden="true" />
                            <div className="min-w-0">
                              <p className={`max-w-[210px] truncate text-[12px] font-semibold ${atencao ? 'text-amber-100' : 'text-white/85'}`}>{pessoa.nome}</p>
                              <p className="max-w-[210px] truncate text-[9px] text-white/30">{pessoa.cargo || 'Cargo não informado'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3"><SemanaBadge pessoa={pessoa} /></td>
                        <td className="px-3 py-3"><PilulaSignal numero={1} recebeu={pessoa.recebeuP1} abriu={pessoa.abriuP1} formatos={pessoa.formatosP1} /></td>
                        <td className="px-3 py-3"><PilulaSignal numero={2} recebeu={pessoa.recebeuP2} abriu={pessoa.abriuP2} formatos={pessoa.formatosP2} /></td>
                        <td className="px-3 py-3"><Consumo pessoa={pessoa} /></td>
                        <td className="px-3 py-3"><EntregaETutor pessoa={pessoa} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!colabsVisiveis.length && (
              <div className="border-t border-white/[0.06] px-5 py-10 text-center text-[11px] text-white/35">
                Nenhuma pessoa corresponde aos filtros selecionados.
              </div>
            )}
          </section>

          <details className="group rounded-[16px] border border-white/[0.07] bg-black/10 px-4 py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[10px] font-semibold text-white/45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 [&::-webkit-details-marker]:hidden">
              Como interpretar estes sinais
              <ChevronDown size={13} className="transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="mt-3 grid gap-3 border-t border-white/[0.06] pt-3 text-[10px] leading-relaxed text-white/32 md:grid-cols-2">
              <p><strong className="text-white/55">Acesso:</strong> abrir a página e abrir um formato são sinais diferentes. Na semana 1, aberturas da página anteriores a 15/07 não foram registradas.</p>
              <p><strong className="text-white/55">Consumo:</strong> vídeo ou áudio concluído, ou conteúdo marcado como concluído. Um traço indica ausência de registro, não prova de que a pessoa não viu.</p>
              <p><strong className="text-white/55">Evidência:</strong> reflexão enviada ao concluir a semana. O texto completo continua disponível em Vertho → Evidências.</p>
              <p><strong className="text-white/55">Filtro semanal:</strong> o envio é registrado apenas pelo último carimbo; envios antigos podem aparecer sem semana. Vídeos antigos sem semana entram somente em “Todas as semanas”.</p>
            </div>
          </details>
        </div>
      )}
      </div>

      <div
        id="painel-engajamento-evolucao"
        role="tabpanel"
        aria-labelledby="aba-engajamento-evolucao"
        hidden={aba !== 'evolucao'}
      >
        {empresaId && (
          <EngagementEvolutionPanel
            key={empresaId}
            empresaId={empresaId}
            active={aba === 'evolucao'}
          />
        )}
      </div>
    </div>
  );
}
