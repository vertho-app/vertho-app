import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, ArrowRight, ExternalLink, Inbox, UsersRound } from 'lucide-react';
import { carregarTurmaWorkspace, type EtapaTurma } from '../../../../../actions';
import PessoasDaEtapa from './PessoasDaEtapa';

export const dynamic = 'force-dynamic';

const ETAPAS: EtapaTurma[] = ['preparar', 'diagnostico', 'pdi', 'lancamento', 'acompanhamento', 'evolucao'];

const CONTEUDO: Record<EtapaTurma, { eyebrow: string; titulo: string; descricao: string; acao: string; ferramenta: (empresaId: string) => string }> = {
  preparar: {
    eyebrow: 'Composição e regras',
    titulo: 'Preparar a turma',
    descricao: 'Confirme participantes, programa, calendário, módulos e canais antes de abrir qualquer etapa.',
    acao: 'Gerenciar composição',
    ferramenta: (empresaId) => `/admin-v2/clientes/${empresaId}#turmas`,
  },
  diagnostico: {
    eyebrow: 'Perfil e avaliação',
    titulo: 'Conduzir o diagnóstico',
    descricao: 'Acompanhe adesão, respostas, IA4 e exceções usando a turma — não a empresa inteira — como denominador.',
    acao: 'Abrir workbench de diagnóstico',
    ferramenta: (empresaId) => `/admin/empresas/${empresaId}/fase2`,
  },
  pdi: {
    eyebrow: 'Plano individual',
    titulo: 'Consolidar os PDIs',
    descricao: 'Transforme diagnósticos avaliados em planos revisados, aprovados e prontos para comunicar.',
    acao: 'Abrir geração de relatórios',
    ferramenta: (empresaId) => `/admin/empresas/${empresaId}/relatorios`,
  },
  lancamento: {
    eyebrow: 'Prontidão e geração',
    titulo: 'Lançar a jornada',
    descricao: 'Valide cobertura, custo, calendário e escopo antes de gerar ou liberar qualquer temporada.',
    acao: 'Abrir temporadas',
    ferramenta: (empresaId) => `/admin/temporadas?empresa=${empresaId}`,
  },
  acompanhamento: {
    eyebrow: 'Intervenção semanal',
    titulo: 'Acompanhar a jornada',
    descricao: 'Priorize atrasos, mensagens e falhas de entrega. Distribuição por semana substitui a média da empresa.',
    acao: 'Abrir engajamento',
    ferramenta: (empresaId) => `/admin/engajamento?empresa=${empresaId}`,
  },
  evolucao: {
    eyebrow: 'Fechamento e entrega',
    titulo: 'Comprovar a evolução',
    descricao: 'Resolva pendências de fechamento, valide os resultados e publique os entregáveis da turma.',
    acao: 'Abrir evolução',
    ferramenta: (empresaId) => `/admin/evolucao?empresa=${empresaId}`,
  },
};

function modoLegivel(modo: string | null) {
  if (!modo) return 'Programa herdado';
  return modo.replaceAll('_', ' ').replace(/\b\w/g, (letra) => letra.toUpperCase());
}

export default async function TurmaEtapaPage({ params }: {
  params: Promise<{ empresaId: string; turmaId: string; etapa: string }>;
}) {
  const { empresaId, turmaId, etapa: etapaParam } = await params;
  if (!ETAPAS.includes(etapaParam as EtapaTurma)) {
    redirect(`/admin-v2/clientes/${empresaId}/turmas/${turmaId}/diagnostico`);
  }
  const etapa = etapaParam as EtapaTurma;
  const { ws, erro } = await carregarTurmaWorkspace(empresaId, turmaId);

  if (erro || !ws) {
    return (
      <div className="rounded-[16px] border border-red-400/35 bg-red-400/[0.06] px-5 py-4 text-sm text-red-200">
        Esta turma não pôde ser carregada. {erro ?? 'Sem dados'}
      </div>
    );
  }

  const conteudo = CONTEUDO[etapa];
  const bloqueios = bloqueiosDaTurma(ws.contagens);

  return (
    <div className="space-y-6">
      <section className="border-b border-white/[0.08] pb-5">
        <Link href={`/admin-v2/clientes/${empresaId}`} className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-faint)] transition-colors hover:text-[var(--cyan)]">
          <ArrowLeft size={12} /> {ws.empresa.nome}
        </Link>
        <div className="mt-4 flex flex-wrap items-end gap-5">
          <div className="min-w-0 flex-1">
            <p className="font-[family-name:var(--font-manrope)] text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--cyan)]">Turma · {conteudo.eyebrow}</p>
            <h1 className="mt-2 text-[clamp(30px,4vw,48px)] font-semibold leading-[0.98] tracking-[-0.045em]">
              <span className="font-[family-name:var(--font-serif)] font-normal italic text-[var(--cyan-soft)]">{ws.turma.nome}</span>
            </h1>
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-[var(--ink-dim)]">
              <span className="inline-flex items-center gap-1.5"><UsersRound size={12} /> {ws.contagens.membros} pessoa(s)</span>
              <span>· {modoLegivel(ws.turma.programaModo)}</span>
              <span>· {ws.turma.dataInicio ? `início ${ws.turma.dataInicio}` : 'início não definido'}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Link href={`/admin-v2/inbox?empresa=${empresaId}`} className="inline-flex items-center gap-1.5 rounded-[10px] border border-white/[0.1] px-3 py-2 text-[11px] text-[var(--ink-dim)] transition-colors hover:border-[var(--cyan)] hover:text-[var(--cyan)]">
              <Inbox size={13} /> Mensagens
            </Link>
          </div>
        </div>
      </section>

      <nav aria-label="Trilho da turma" className="overflow-x-auto rounded-[16px] border border-white/[0.08] bg-[#091d35] p-2">
        <div className="grid min-w-[760px] grid-cols-6">
          {ws.etapas.map((item, index) => {
            const selecionada = item.chave === etapa;
            return (
              <Link
                key={item.chave}
                href={`/admin-v2/clientes/${empresaId}/turmas/${turmaId}/${item.chave}`}
                aria-current={selecionada ? 'step' : undefined}
                className={`group relative rounded-[10px] px-3 py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--cyan)] ${selecionada ? 'bg-[#34c5cc0f]' : 'hover:bg-white/[0.025]'}`}
              >
                {index < ws.etapas.length - 1 && (
                  <span className={`absolute left-[calc(50%+16px)] right-[calc(-50%+16px)] top-[20px] h-px ${item.estado === 'feito' ? 'bg-[#2ecc7160]' : 'bg-white/[0.1]'}`} aria-hidden="true" />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border font-[family-name:var(--font-manrope)] text-[8px] font-bold ${
                    item.estado === 'feito'
                      ? 'border-[#2ecc7160] bg-[#2ecc7115] text-[var(--success)]'
                      : item.estado === 'ativo'
                        ? 'border-[var(--cyan)] bg-[#34c5cc18] text-[var(--cyan)]'
                        : 'border-white/[0.14] bg-[#091d35] text-[var(--ink-faint)]'
                  }`}>
                    {item.estado === 'feito' ? '✓' : index + 1}
                  </span>
                  <span className={`text-[10.5px] font-semibold ${selecionada ? 'text-[var(--cyan)]' : 'text-[var(--ink-dim)] group-hover:text-[var(--ink)]'}`}>{item.rotulo}</span>
                </span>
                <span className="relative z-10 ml-7 mt-1 block font-[family-name:var(--font-manrope)] text-[8.5px] text-[var(--ink-faint)]">{item.feitos} de {item.total}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
        <div className="rounded-[16px] border border-[#34c5cc30] bg-[#34c5cc0a] p-5">
          <p className="font-[family-name:var(--font-manrope)] text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--cyan)]">Próxima ação da turma</p>
          <div className="mt-2 flex flex-wrap items-end gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold tracking-[-0.025em]">{ws.proximaAcao.titulo}</h2>
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--ink-dim)]">{ws.proximaAcao.detalhe}</p>
            </div>
            <Link href={CONTEUDO[ws.etapaAtual].ferramenta(empresaId)} className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--cyan)] px-4 py-2.5 text-[11px] font-semibold text-[#052227] transition-colors hover:bg-[var(--cyan-soft)]">
              {CONTEUDO[ws.etapaAtual].acao} <ArrowRight size={13} />
            </Link>
          </div>
        </div>
        <div className="rounded-[16px] border border-white/[0.08] bg-[var(--navy-card)] p-5">
          <p className="font-[family-name:var(--font-manrope)] text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)]">Leitura do escopo</p>
          <ul className="mt-2 space-y-1.5 text-[11.5px] text-[var(--ink-dim)]">
            {bloqueios.map((item) => <li key={item}>· {item}</li>)}
          </ul>
        </div>
      </section>

      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-[family-name:var(--font-manrope)] text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--cyan)]">Momento selecionado</p>
          <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em]">{conteudo.titulo}</h2>
          <p className="mt-1 max-w-[76ch] text-[12px] leading-relaxed text-[var(--ink-dim)]">{conteudo.descricao}</p>
        </div>
        <Link href={conteudo.ferramenta(empresaId)} className="inline-flex items-center gap-1.5 text-[10.5px] text-[var(--ink-faint)] transition-colors hover:text-[var(--cyan)]">
          Workbench atual <ExternalLink size={11} />
        </Link>
      </section>

      <PessoasDaEtapa pessoas={ws.pessoas} etapa={etapa} />
    </div>
  );
}

function bloqueiosDaTurma(contagens: {
  membros: number;
  comResposta: number;
  comIa4: number;
  comPdi: number;
  comTrilha: number;
  concluidas: number;
}) {
  const itens: string[] = [];
  if (contagens.membros === 0) return ['Turma sem participantes.'];
  if (contagens.comResposta < contagens.membros) itens.push(`${contagens.membros - contagens.comResposta} de ${contagens.membros} ainda não responderam.`);
  if (contagens.comIa4 < contagens.comResposta) itens.push(`${contagens.comResposta - contagens.comIa4} resposta(s) aguardam IA4.`);
  if (contagens.comPdi < contagens.comIa4) itens.push(`${contagens.comIa4 - contagens.comPdi} pessoa(s) elegível(is) ainda não têm PDI.`);
  if (contagens.comTrilha < contagens.comPdi) itens.push(`${contagens.comPdi - contagens.comTrilha} PDI(s) ainda não viraram jornada.`);
  if (contagens.concluidas < contagens.comTrilha) itens.push(`${contagens.comTrilha - contagens.concluidas} jornada(s) seguem em curso.`);
  return itens.length > 0 ? itens : ['Nenhum bloqueio aberto neste momento.'];
}
