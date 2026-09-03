'use client';

/**
 * Engajamento do time — presença na jornada, pessoa a pessoa.
 *
 * Os sinais vêm do mesmo núcleo de /admin/engajamento. Esta visão reduz a
 * densidade operacional para responder à pergunta do gestor: quem está em
 * movimento e quem merece uma conversa nesta semana?
 */

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Eye,
  FileText,
  Headphones,
  LayoutGrid,
  Loader2,
  MessageCircle,
  PlayCircle,
  Search,
  Users,
  Video,
  BookOpen,
  type LucideIcon,
} from 'lucide-react';
import { PageContainer, GlassCard } from '@/components/page-shell';
import BackButton from '@/components/back-button';
import { SignalJourney } from '@/components/engajamento/signal-journey';
import { getEngajamentoDoTime } from '../actions';

type Foco = 'todos' | 'atencao' | 'movimento';

const NENHUMA_PESSOA: any[] = [];

const FORMATOS: Record<string, { label: string; Icon: LucideIcon; classe: string }> = {
  video: { label: 'Vídeo', Icon: Video, classe: 'border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-200' },
  audio: { label: 'Áudio', Icon: Headphones, classe: 'border-violet-300/20 bg-violet-300/[0.08] text-violet-200' },
  texto: { label: 'Texto', Icon: FileText, classe: 'border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200' },
  case: { label: 'Caso', Icon: BookOpen, classe: 'border-amber-300/20 bg-amber-300/[0.08] text-amber-200' },
};

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
  // A EVIDÊNCIA fecha a semana: quem acessou e consumiu mas não entregou parou
  // no meio, e é exatamente a conversa que o gestor precisa ter. Sem esta
  // condição, o painel dizia "0 para acompanhar" ao lado de um marco de
  // "6 de 7 entregaram" — dois números contando histórias diferentes na mesma
  // tela.
  return Boolean(pessoa.jornadaAtrasada || !temSinal(pessoa) || !pessoa.enviouEvidencia);
}

function EtapaJornada({ pessoa }: { pessoa: any }) {
  if (pessoa.semanaAcessivel == null) {
    return (
      <span className="inline-flex rounded-full border border-white/[0.07] bg-white/[0.025] px-2 py-1 text-[10px] font-semibold text-white/28">
        Posição indisponível
      </span>
    );
  }

  const meta = pessoa.jornadaAtrasada
    ? { label: 'etapa pendente', dot: 'bg-amber-400', classe: 'border-amber-300/20 bg-amber-300/[0.08] text-amber-200' }
    : pessoa.semanaAcessivelConcluida
      ? { label: 'concluída', dot: 'bg-emerald-400', classe: 'border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200' }
      : { label: 'em curso', dot: 'bg-brand-400', classe: 'border-brand-300/20 bg-brand-300/[0.08] text-brand-200' };

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-semibold tabular-nums ${meta.classe}`}
      title={`Calendário da turma: semana ${pessoa.semanaCalendario}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
      Semana {pessoa.semanaAcessivel} · {meta.label}
    </span>
  );
}

function statusDaPessoa(pessoa: any): { label: string; detail: string; classe: string } {
  if (!temSinal(pessoa)) {
    return {
      label: 'Sem sinal registrado',
      detail: 'Vale checar se a pessoa conseguiu começar.',
      classe: 'border-amber-300/20 bg-amber-300/[0.08] text-amber-200',
    };
  }
  if (pessoa.jornadaAtrasada) {
    return {
      label: 'Etapa pendente',
      detail: `O calendário da turma está na semana ${pessoa.semanaCalendario}.`,
      classe: 'border-amber-300/20 bg-amber-300/[0.08] text-amber-200',
    };
  }
  if (pessoa.enviouEvidencia) {
    return {
      label: 'Entrega concluída',
      detail: 'A evidência da semana já foi enviada.',
      classe: 'border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200',
    };
  }
  if (pessoa.consumiu) {
    return {
      label: 'Em movimento',
      detail: 'Consumiu o conteúdo; a entrega ainda não apareceu.',
      classe: 'border-brand-300/20 bg-brand-300/[0.08] text-brand-200',
    };
  }
  return {
    label: 'Começou a jornada',
    detail: 'Já acessou conteúdo nesta semana.',
    classe: 'border-brand-300/20 bg-brand-300/[0.08] text-brand-200',
  };
}

function SignalPoint({
  icon: Icon,
  label,
  ativo,
  classe,
}: {
  icon: LucideIcon;
  label: string;
  ativo: boolean;
  classe: string;
}) {
  return (
    <div className="min-w-0 text-center" title={`${label}: ${ativo ? 'registrado' : 'sem registro'}`}>
      <span className={`mx-auto grid h-8 w-8 place-items-center rounded-full border ${ativo ? classe : 'border-white/[0.07] bg-white/[0.025] text-white/22'}`}>
        <Icon size={13} aria-hidden="true" />
      </span>
      <span className={`mt-1.5 block truncate text-[8px] font-bold uppercase tracking-[0.08em] ${ativo ? 'text-white/60' : 'text-white/25'}`}>
        {label}
      </span>
    </div>
  );
}

function SinaisDaPessoa({ pessoa }: { pessoa: any }) {
  const acessou = Boolean(pessoa.abriuLink || pessoa.formatosAbertos?.length);
  return (
    <div className="relative grid grid-cols-4 gap-2 before:absolute before:left-[12.5%] before:right-[12.5%] before:top-4 before:h-px before:bg-white/[0.07]">
      <div className="relative z-10">
        <SignalPoint icon={Eye} label="Acessou" ativo={acessou} classe="border-brand-300/25 bg-brand-300/10 text-brand-200" />
      </div>
      <div className="relative z-10">
        <SignalPoint icon={PlayCircle} label="Consumiu" ativo={Boolean(pessoa.consumiu)} classe="border-emerald-300/25 bg-emerald-300/10 text-emerald-200" />
      </div>
      <div className="relative z-10">
        <SignalPoint icon={ClipboardCheck} label="Entregou" ativo={Boolean(pessoa.enviouEvidencia)} classe="border-amber-300/25 bg-amber-300/10 text-amber-200" />
      </div>
      <div className="relative z-10">
        <SignalPoint icon={MessageCircle} label="Tutor" ativo={Boolean(pessoa.conversouTutor)} classe="border-violet-300/25 bg-violet-300/10 text-violet-200" />
      </div>
    </div>
  );
}

function FormatosAbertos({ formatos }: { formatos?: string[] }) {
  if (!formatos?.length) return <span className="text-[10px] text-white/25">Nenhum formato registrado</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {formatos.map((formato) => {
        const meta = FORMATOS[formato] || FORMATOS.texto;
        const Icon = meta.Icon;
        return (
          <span key={formato} className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-bold ${meta.classe}`}>
            <Icon size={10} aria-hidden="true" /> {meta.label}
          </span>
        );
      })}
    </span>
  );
}

function PessoaRow({ pessoa }: { pessoa: any }) {
  const atencao = pedeAcompanhamento(pessoa);
  const status = statusDaPessoa(pessoa);

  return (
    <article className={`rounded-[16px] border p-4 transition-colors ${
      atencao
        ? 'border-amber-300/15 bg-amber-300/[0.035]'
        : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.035]'
    }`}>
      <div className="grid gap-4 md:grid-cols-[minmax(170px,1fr)_minmax(150px,0.85fr)_minmax(260px,1.25fr)_minmax(150px,0.85fr)] md:items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${atencao ? 'bg-amber-400' : 'bg-emerald-400/75'}`} aria-hidden="true" />
            <p className={`truncate text-[13px] font-semibold ${atencao ? 'text-amber-100' : 'text-white'}`}>{pessoa.nome}</p>
          </div>
          <p className="ml-3.5 mt-0.5 truncate text-[10px] text-white/35">{pessoa.cargo || 'Cargo não informado'}</p>
          <span className={`ml-3.5 mt-2 inline-flex rounded-full border px-2 py-1 text-[9px] font-bold ${status.classe}`}>
            {status.label}
          </span>
        </div>

        <div>
          <p className="mb-2 text-[8px] font-bold uppercase tracking-[0.14em] text-white/28">Etapa individual</p>
          <EtapaJornada pessoa={pessoa} />
          <p className="mt-2 text-[9px] leading-relaxed text-white/30">{status.detail}</p>
        </div>

        <div>
          <p className="mb-2 text-[8px] font-bold uppercase tracking-[0.14em] text-white/28 md:text-center">Sinais da semana</p>
          <SinaisDaPessoa pessoa={pessoa} />
        </div>

        <div>
          <p className="mb-2 text-[8px] font-bold uppercase tracking-[0.14em] text-white/28">Formatos acessados</p>
          <FormatosAbertos formatos={pessoa.formatosAbertos} />
        </div>
      </div>
    </article>
  );
}

export default function EngajamentoDoTimePage() {
  const [dados, setDados] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [semana, setSemana] = useState<number | null>(null);
  const [foco, setFoco] = useState<Foco>('todos');
  const [busca, setBusca] = useState('');

  useEffect(() => {
    let vivo = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      getEngajamentoDoTime(semana)
        .then((resultado: any) => {
          if (!vivo) return;
          if (!resultado?.ok) setErro(resultado?.error || 'Não foi possível carregar o engajamento');
          else { setDados(resultado); setErro(''); }
        })
        .finally(() => { if (vivo) setLoading(false); });
    }, 0);
    return () => {
      vivo = false;
      window.clearTimeout(timer);
    };
  }, [semana]);

  const pessoas: any[] = dados?.colaboradores || NENHUMA_PESSOA;
  const resumo = dados?.resumo || {};
  const total = Number(resumo.inscritos) || 0;
  const emAtencao = pessoas.filter(pedeAcompanhamento).length;
  const etapasPendentes = pessoas.filter((pessoa) => pessoa.jornadaAtrasada).length;
  const semSinal = pessoas.filter((pessoa) => !temSinal(pessoa)).length;
  const semEvidencia = pessoas.filter((pessoa) => !pessoa.enviouEvidencia).length;
  const scopeLabel = dados?.scope === 'rh'
    ? 'Visão da empresa'
    : dados?.scope === 'tutor'
      ? 'Visão do tutor'
      : 'Visão do gestor';

  const pessoasVisiveis = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    return pessoas
      .filter((pessoa) => foco === 'todos' || (foco === 'atencao' ? pedeAcompanhamento(pessoa) : !pedeAcompanhamento(pessoa)))
      .filter((pessoa) => !termo || `${pessoa.nome} ${pessoa.cargo || ''}`.toLocaleLowerCase('pt-BR').includes(termo))
      .sort((a, b) => Number(pedeAcompanhamento(b)) - Number(pedeAcompanhamento(a)) || a.nome.localeCompare(b.nome));
  }, [busca, foco, pessoas]);

  const mostrarAtencao = () => {
    setFoco('atencao');
    window.setTimeout(() => document.getElementById('time')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  return (
    <PageContainer className="max-w-[1180px]">
      <BackButton />

      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-brand-300/75">{scopeLabel}</p>
          <h1
            className="mt-1 text-[30px] leading-none text-white sm:text-[36px]"
            style={{ fontFamily: 'var(--font-serif, "Instrument Serif", serif)', fontStyle: 'italic' }}
          >
            Engajamento do time
          </h1>
          <p className="mt-2 max-w-xl text-[11px] leading-relaxed text-white/42">
            Veja quem está em movimento e onde uma conversa pode ajudar a jornada a continuar.
          </p>
        </div>

        {(dados?.semanas || []).length > 1 && (
          <label className="flex shrink-0 items-center gap-2 text-[10px] font-semibold text-white/40">
            Período
            <select
              value={semana ?? ''}
              onChange={(event) => setSemana(event.target.value ? Number(event.target.value) : null)}
              className="min-h-9 rounded-[10px] border border-white/[0.1] bg-[#081a2f] px-3 text-[10px] font-bold text-white/70 outline-none focus:border-brand-300/35"
            >
              <option value="">Todas as semanas</option>
              {(dados?.semanas || []).map((item: number) => <option key={item} value={item}>Semana {item}</option>)}
            </select>
          </label>
        )}
      </header>

      {loading && !dados && (
        <GlassCard>
          <div className="flex items-center gap-2 text-sm text-white/45">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Organizando os sinais da jornada…
          </div>
        </GlassCard>
      )}

      {!loading && erro && (
        <GlassCard className="border-red-400/15 bg-red-400/[0.04]">
          <p className="text-sm text-red-300">{erro}</p>
        </GlassCard>
      )}

      {!loading && !erro && total === 0 && (
        <GlassCard className="border-dashed text-center" padding="p-9">
          <Users size={22} className="mx-auto text-brand-300/45" aria-hidden="true" />
          <p className="mt-3 text-[13px] font-bold text-white/70">A jornada do time ainda não começou</p>
          <p className="mx-auto mt-1 max-w-lg text-[10px] leading-relaxed text-white/35">
            Os sinais aparecem após o primeiro envio da cadência. Até lá, não há movimento para acompanhar.
          </p>
        </GlassCard>
      )}

      {!erro && total > 0 && (
        <div className={`space-y-5 transition-opacity ${loading ? 'pointer-events-none opacity-55' : 'opacity-100'}`} aria-busy={loading}>
          {/* O badge "N para acompanhar" saiu do cabeçalho deste bloco
              (03/09/2026): ele levava ao MESMO filtro do card "Acompanhamento
              sugerido" logo abaixo, com o mesmo número. Dois gatilhos idênticos
              na mesma tela fazem o leitor procurar a diferença que não existe. */}
          <SignalJourney
            eyebrow={semana ? `Semana ${semana}` : 'Panorama da jornada'}
            title="Do primeiro acesso à entrega"
            description="Os quatro marcos mostram presença na jornada. Eles não são nota nem avaliação de desempenho."
            total={total}
            steps={[
              { label: 'Na cadência', value: total, detail: 'pessoas do seu recorte', icon: Users, tone: 'cyan' },
              { label: 'Acessaram conteúdo', value: resumo.abriramAlgumFormato || 0, detail: 'abriram ao menos um formato', icon: LayoutGrid, tone: 'teal' },
              { label: 'Consumiram', value: resumo.consumiram || 0, detail: 'concluíram ou marcaram conteúdo', icon: CheckCircle2, tone: 'emerald' },
              { label: 'Entregaram evidência', value: resumo.enviaramEvidencia || 0, detail: 'finalizaram a prática', icon: ClipboardCheck, tone: 'amber' },
            ]}
          />

          <section aria-label="Leitura rápida" className="grid gap-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(220px,0.5fr)]">
            <button
              type="button"
              onClick={mostrarAtencao}
              className="flex items-center gap-4 rounded-[16px] border border-amber-300/15 bg-amber-300/[0.035] p-4 text-left transition-colors hover:bg-amber-300/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border border-amber-300/20 bg-amber-300/[0.08] text-amber-300">
                <AlertTriangle size={17} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold text-amber-100">Acompanhamento sugerido</span>
                <span className="mt-0.5 block text-[9px] leading-relaxed text-amber-100/55">
                  {etapasPendentes} com etapa pendente · {semEvidencia} sem entregar · {semSinal} sem sinal
                </span>
              </span>
              <span className="font-mono text-2xl font-semibold tabular-nums text-amber-100">{emAtencao}</span>
            </button>

            <div className="flex items-center gap-4 rounded-[16px] border border-violet-300/15 bg-violet-300/[0.035] p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border border-violet-300/20 bg-violet-300/[0.08] text-violet-300">
                <MessageCircle size={17} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold text-white/65">Acionaram o tutor</span>
                <span className="mt-0.5 block text-[9px] text-white/30">Tira-Dúvidas aberto</span>
              </span>
              <span className="font-mono text-2xl font-semibold tabular-nums text-violet-200">{resumo.conversaramTutor || 0}</span>
            </div>
          </section>

          <section id="time" aria-labelledby="time-title" className="scroll-mt-5">
            <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/30">Pessoa a pessoa</p>
                <h2
                  id="time-title"
                  className="mt-1 text-[23px] leading-tight text-white"
                  style={{ fontFamily: 'var(--font-serif, "Instrument Serif", serif)', fontStyle: 'italic' }}
                >
                  Onde apoiar o próximo passo
                </h2>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex items-center gap-1 rounded-full border border-white/[0.07] bg-black/10 p-1">
                  {([
                    ['todos', 'Todos', pessoas.length],
                    ['atencao', 'Acompanhar', emAtencao],
                    ['movimento', 'Em movimento', pessoas.length - emAtencao],
                  ] as const).map(([valor, label, quantidade]) => (
                    <button
                      key={valor}
                      type="button"
                      onClick={() => setFoco(valor)}
                      aria-pressed={foco === valor}
                      className={`rounded-full px-2.5 py-1.5 text-[9px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300 ${
                        foco === valor ? 'bg-brand-300/12 text-brand-200' : 'text-white/35 hover:text-white/70'
                      }`}
                    >
                      {label} <span className="ml-0.5 font-mono">{quantidade}</span>
                    </button>
                  ))}
                </div>
                <label className="flex min-h-9 items-center gap-2 rounded-full border border-white/[0.08] bg-black/10 px-3 focus-within:border-brand-300/30">
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

            <p className="mb-3 text-[9px] text-white/25">Mostrando {pessoasVisiveis.length} de {pessoas.length} pessoas.</p>
            <div className="space-y-2">
              {pessoasVisiveis.map((pessoa) => <PessoaRow key={pessoa.colaboradorId} pessoa={pessoa} />)}
            </div>
            {!pessoasVisiveis.length && (
              <div className="rounded-[16px] border border-dashed border-white/10 bg-white/[0.02] px-5 py-9 text-center text-[11px] text-white/35">
                Nenhuma pessoa corresponde aos filtros selecionados.
              </div>
            )}
          </section>

          <details className="group rounded-[16px] border border-white/[0.07] bg-black/10 px-4 py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[10px] font-semibold text-white/42 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300 [&::-webkit-details-marker]:hidden">
              Entenda o que cada sinal significa
              <ChevronDown size={13} className="transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="mt-3 grid gap-3 border-t border-white/[0.06] pt-3 text-[10px] leading-relaxed text-white/32 sm:grid-cols-2">
              <p><strong className="text-white/55">Acessou:</strong> abriu a página ou um dos formatos disponíveis.</p>
              <p><strong className="text-white/55">Consumiu:</strong> concluiu vídeo ou áudio, ou marcou o conteúdo como concluído.</p>
              <p><strong className="text-white/55">Entregou:</strong> enviou a evidência prática que fecha a semana.</p>
              <p><strong className="text-white/55">Sem registro:</strong> significa apenas que o sistema não recebeu aquele sinal; não é uma avaliação da pessoa.</p>
            </div>
          </details>
        </div>
      )}
    </PageContainer>
  );
}
