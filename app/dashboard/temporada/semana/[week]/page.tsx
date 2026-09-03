'use client';

import { useEffect, useMemo, useRef, useState, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getSupabase } from '@/lib/supabase-browser';
import { formatarLiberacao, avaliarAcessoSemana, turnosIaNecessarios, semanaLiberadaPorData } from '@/lib/season-engine/week-gating';
import { totalSemanasDoPlano, semanaCenarioBDoPlano, ehSemanaQualitativa } from '@/lib/season-engine/trilha-runtime';
import ReactMarkdown from 'react-markdown';
import { Loader2, Video, FileText, Headphones, BookOpen, Send, Sparkles, Target, Check, HelpCircle, Lock, Eye } from 'lucide-react';
import BackButton from '@/components/back-button';
import { loadTemporada, loadTemporadaPorEmail, marcarConteudoConsumido } from '@/actions/temporadas';
import { resolverVideoDaSemana, resolverVideoDaSemanaGestor } from '@/actions/gerar-video';
import { useBunnyTracking } from '@/lib/use-bunny-tracking';
import { PageContainer, GlassCard } from '@/components/page-shell';
import MicInput from '@/components/mic-input';
import { fetchAuth } from '@/lib/auth/fetch-auth';
import { registrarEventoTrilha, jaAbriuConteudoDaSemana } from '@/actions/engajamento';
import { consumiuConteudo, estadoDoPrimeiroPasso } from '@/lib/season-engine/consumo-conteudo';
import FirstViewVideo from '@/components/first-view-video';
// Tutorial da semana de missão (Bunny) — constante única em programa-config,
// compartilhada com o envio de segunda do triggerDiario.
import { APLICACAO_VIDEO_ID, CONCLUSAO_VIDEO_ID } from '@/lib/season-engine/programa-config';
import { descritorParaHumano, descritoresParaHumano } from '@/lib/descritor-humano';

const FORMAT_ICON = { video: Video, audio: Headphones, texto: FileText, case: BookOpen };

/**
 * Remove o título do cenário (cenários antigos vinham com "## Título" ou
 * uma linha solta antes do "**Contexto:**"). Novos cenários já não têm,
 * mas mantemos o strip defensivo.
 */
function stripCenarioTitulo(texto) {
  if (!texto) return '';
  const linhas = String(texto).split('\n');
  let i = 0;
  while (i < linhas.length) {
    const l = linhas[i].trim();
    if (!l) { i++; continue; }
    // markdown heading
    if (/^#{1,6}\s/.test(l)) { i++; continue; }
    // linha solta antes do Contexto: (sem negrito, sem prefixo)
    if (!/^\*\*|^-\s/.test(l) && i + 1 < linhas.length && /\*\*Contexto:/i.test(linhas.slice(i + 1).join('\n'))) {
      i++;
      continue;
    }
    break;
  }
  return linhas.slice(i).join('\n');
}

export default function SemanaPage({ params }: { params: Promise<{ week: string }> }) {
  const t = useTranslations('SeasonWeek');
  const { week } = use(params);
  const semanaNum = Number(week);
  const router = useRouter();
  const searchParams = useSearchParams();
  const colaboradorAlvo = searchParams.get('colaborador');
  // Um ID de terceiro sempre ativa a prévia somente leitura. `origem` é apenas
  // navegação e nunca participa da autorização.
  const visaoLeitura = !!colaboradorAlvo;
  const sb = getSupabase();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formatoAtivo, setFormatoAtivo] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatFinished, setChatFinished] = useState(false);
  const [chatStarted, setChatStarted] = useState(false);

  /**
   * ONDE FICAM AS SEMANAS DE AVALIAÇÃO NESTE PLANO.
   *
   * 🔴 Esta tela decidia isso por número literal em OITO lugares (`=== 13` /
   * `=== 14`), e o formato de 14 semanas deixou de ser o único: a jornada põe o
   * fechamento na **7** (38 trilhas de Macaé) e o encerramento de Ibipeba na
   * **9**, com a conversa qualitativa na **8**. O mais caro dos oito era o
   * endpoint: `isEvalSemana` mandava qualquer avaliação fora de 13/14 para
   * `/reflection` em vez de `/evaluation` — a conversa de fechamento chamaria a
   * rota de conteúdo, gravaria no slot errado e a semana nunca concluiria.
   *
   * A régua agora sai do PLANO carimbado na geração (fonte única em
   * `trilha-runtime`), que é o mesmo lugar de onde a lista de semanas e o wizard
   * já liam. `?? 14` cobre trilha legada sem plano — comportamento anterior.
   */
  const planoTrilha = data?.trilha?.temporada_plano;
  const semCenarioB = useMemo(() => semanaCenarioBDoPlano(planoTrilha, 14), [planoTrilha]);
  const ehQualitativa = useMemo(() => ehSemanaQualitativa(planoTrilha, semanaNum), [planoTrilha, semanaNum]);

  // Telemetria: loga a ABERTURA do conteúdo (uma vez), com atribuição por pílula
  // (?p=1|2) e formato (?formato=) vindos do deep-link. Best-effort, nunca quebra.
  //
  // 🔑 Semana bloqueada loga `bloqueio`, NÃO `abertura`: a cadência manda o link
  // da semana do calendário, então quem está atrasado cai aqui toda semana — e
  // contar isso como abertura fazia a /admin/engajamento medir tentativa
  // frustrada como consumo de conteúdo.
  const aberturaLogada = useRef(false);
  useEffect(() => {
    if (visaoLeitura) return;
    const trilhaId = data?.trilha?.id;
    if (!trilhaId || aberturaLogada.current) return;
    aberturaLogada.current = true;
    const pRaw = Number(searchParams.get('p'));
    const pilula = pRaw === 1 || pRaw === 2 ? pRaw : null;
    const liberada = avaliarAcessoSemana({
      dataInicio: data?.trilha?.data_inicio,
      plano: data?.trilha?.temporada_plano,
      progresso: data?.progresso,
      semana: semanaNum,
    }).liberada;
    registrarEventoTrilha({
      trilhaId,
      semana: semanaNum,
      pilula,
      formato: searchParams.get('formato'),
      tipo: liberada ? 'abertura' : 'bloqueio',
    }).catch(() => {});
  }, [data?.trilha?.id, semanaNum, visaoLeitura]);

  // Hidrata `abriuConteudo` do histórico (ver o comentário do estado). Só LIGA,
  // nunca desliga: um `false` da rede não pode apagar o clique que a pessoa
  // acabou de dar nesta sessão.
  useEffect(() => {
    if (visaoLeitura) return;
    const trilhaId = data?.trilha?.id;
    if (!trilhaId) return;
    let vivo = true;
    jaAbriuConteudoDaSemana(semanaNum)
      .then((r) => { if (vivo && r?.abriu) setAbriuConteudo(true); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [data?.trilha?.id, semanaNum, visaoLeitura]);

  /**
   * A pessoa já abriu o conteúdo desta semana?
   *
   * 🔴 ISTO ERA `useState(false)` PURO, e essa era a trava mais cara da tela.
   * O estado só subia com um clique da sessão ATUAL: quem abria o conteúdo na
   * segunda e voltava na terça encontrava "Marcar como realizado" desabilitado
   * dizendo "abra o conteúdo antes de concluir" — tendo aberto. E como
   * Evidências dependia da marcação, a semana inteira ficava presa a um estado
   * de React que não sobrevive a um F5.
   *
   * Medido em 25/08/2026: das 61 pessoas travadas em Ibipeba e Macaé, **24
   * tinham evento de abertura registrado na semana em que estavam paradas**.
   * O dado sempre esteve em `trilha_eventos`; ninguém o lia de volta.
   *
   * Começa `false` e é hidratado pelo efeito abaixo — o clique da sessão atual
   * continua valendo na hora, sem esperar a rede.
   */
  const [abriuConteudo, setAbriuConteudo] = useState(false);
  // Pílulas SEM nenhuma fonte abrível (sem formato com url/id e sem vídeo): o
  // viewer reporta por índice. Se TODAS estiverem sem fonte, o gate "abra antes
  // de marcar" é insatisfazível — libera o marcar (senão a semana trava em
  // cadeia: marcar → Tira-Dúvidas → Evidências).
  const [semFonte, setSemFonte] = useState<Record<number, boolean>>({});
  // Tira-Dúvidas — estado independente do chat de Evidências.
  const [tdHistory, setTdHistory] = useState([]);
  const [tdInput, setTdInput] = useState('');
  const [tdBusy, setTdBusy] = useState(false);
  const [tdOpen, setTdOpen] = useState(false);
  // Missão Prática (sems 4/8/12): modo + compromisso.
  // modo=null → nada escolhido; 'pratica' → vai executar na vida real; 'cenario' → fallback escrito
  const [compromissoInput, setCompromissoInput] = useState('');
  const [missaoBusy, setMissaoBusy] = useState(false);
  // Refs pros MicInputs: ao enviar mensagem paramos a gravação automaticamente.
  const chatMicRef = useRef(null);
  const tdMicRef = useRef(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const r = colaboradorAlvo
        ? await loadTemporada(colaboradorAlvo, { semanaTranscrito: semanaNum })
        : await loadTemporadaPorEmail(user.email, { semanaTranscrito: semanaNum });
      if (!r.error) {
        setData(r);
        const semana = (r.trilha?.temporada_plano || []).find(s => s.semana === semanaNum);
        // Deep-link da pílula (?formato=video|audio|texto|case) abre a semana já
        // no formato preferido do colab; senão, cai no formato_core da semana.
        const fmtParam = searchParams.get('formato');
        setFormatoAtivo(fmtParam || semana?.conteudo?.formato_core || null);
        const prog = (r.progresso || []).find(p => p.semana === semanaNum);
        // O fechamento (cenário B) guarda em `feedback`, mesmo sendo
        // tipo='avaliacao'; a conversa qualitativa em `reflexao`. Aplicação em
        // `feedback`, conteúdo em `reflexao`. Mesma conta que a rota
        // /evaluation faz com `semCenarioB` — aqui derivada do plano de `r`,
        // que é o dado fresco (o memo ainda reflete o render anterior).
        const semFechamento = semanaCenarioBDoPlano(r.trilha?.temporada_plano, 14);
        const slot = (semana?.tipo === 'aplicacao' || semanaNum === semFechamento) ? 'feedback' : 'reflexao';
        const transcript = prog?.[slot]?.transcript_completo || [];
        if (transcript.length > 0) {
          setChatHistory(transcript);
          setChatStarted(true);
          setChatFinished(prog?.status === 'concluido');
        }
        const tdTranscript = prog?.tira_duvidas?.transcript_completo || [];
        if (tdTranscript.length > 0) {
          setTdHistory(tdTranscript);
          setTdOpen(true);
        }
      }
      setLoading(false);
    })();
  }, [colaboradorAlvo, router, sb, searchParams, semanaNum]);

  if (loading) return <Center><Loader2 className="animate-spin text-brand-400" /></Center>;
  if (!data?.trilha) return <Center><p className="text-gray-400">{t('errors.seasonNotFound')}</p></Center>;

  // A semana do cenário B tem UI própria (idêntica ao mapeamento). A avaliação é
  // mutativa e não entra na prévia de terceiros; o card correspondente já fica
  // desabilitado.
  //
  // ⚠️ `semCenarioB` vem do PLANO, não da constante 14: regular=14, jornada=7,
  // encerramento de Ibipeba=9. Enquanto era literal, a semana de fechamento de
  // qualquer outro formato caía aqui e renderizava a tela de conteúdo vazia, sem
  // wizard e sem erro. Por isso o redirect passou para DEPOIS do carregamento —
  // ele precisa do plano para saber qual é a semana.
  if (semanaNum === semCenarioB) {
    router.replace(visaoLeitura && colaboradorAlvo
      ? `/dashboard/temporada?colaborador=${encodeURIComponent(colaboradorAlvo)}&origem=gestor`
      : '/dashboard/temporada/sem14');
    return <Center><Loader2 className="animate-spin text-brand-400" /></Center>;
  }

  const semana = (data.trilha.temporada_plano || []).find(s => s.semana === semanaNum);
  if (!semana) return <Center><p className="text-gray-400">{t('errors.invalidWeek')}</p></Center>;

  // 🔴 GATE DA SEMANA — a mesma régua que as rotas de conversa aplicam.
  //
  // Até 20/08/2026 esta página não tinha gate nenhum: quem abria o link da
  // cadência (que aponta para a semana do CALENDÁRIO) via o conteúdo e só
  // descobria o bloqueio ao tentar conversar, num 403 que a tela engolia. Medido
  // em Ibipeba: 19 de 36 pessoas sem nenhuma semana concluída, uma delas parada
  // 36 dias a UM turno de destravar, e a reclamação chegando por WhatsApp
  // ("não estou conseguindo acessar os conteúdos das próximas semanas").
  // O bloqueio é intencional; o que faltava era ele ser dito — e dizer o que
  // exatamente falta, porque ninguém adivinha que é a conversa que conclui.
  const acesso = avaliarAcessoSemana({
    dataInicio: data.trilha.data_inicio,
    plano: data.trilha.temporada_plano,
    progresso: data.progresso,
    semana: semanaNum,
  });
  if (!acesso.liberada) {
    return (
      <SemanaBloqueada
        acesso={acesso}
        semana={semanaNum}
        colabId={data.trilha.colaborador_id}
        onIr={(n) => router.push(`/dashboard/temporada/semana/${n}`)}
        t={t}
      />
    );
  }

  const isAplicacao = semana.tipo === 'aplicacao';
  const isAvaliacao = semana.tipo === 'avaliacao';
  // DUO: a semana cobre 2 descritores (seg+ter). Rótulo único p/ título e Tira-Dúvidas.
  // `descritorParaHumano`: parte dos descritores traz o código da matriz colado no
  // texto (`COO03_D6 — Busca de apoio`) e este é o TÍTULO da semana. Limpeza só na
  // exibição — o valor cru continua sendo a chave que casa o kit.
  const descritoresLabel = (Array.isArray(semana.descritores_cobertos) && semana.descritores_cobertos.length > 1)
    ? descritoresParaHumano(semana.descritores_cobertos).join(' + ')
    : (descritorParaHumano(semana.descritor) || semana.competencia || data.trilha.competencia_foco);
  const conteudo = semana.conteudo;
  const entregasConteudo = Array.isArray(semana.conteudos_dia) && semana.conteudos_dia.length > 0
    ? semana.conteudos_dia.filter(e => e?.conteudo)
    : (conteudo ? [{ dia: 'semana', label: t('type.episode'), competencia: semana.competencia, descritor: semana.descritor, conteudo }] : []);
  const cenario = semana.cenario;
  const nadaParaAbrir = entregasConteudo.length > 0 && entregasConteudo.every((_, i) => semFonte[i]);
  /** Entregas que trazem tarefa: 2 nos modos de 14 semanas, 1 na jornada. */
  const entregasComDesafio = entregasConteudo.filter((e: any) => e?.conteudo?.desafio_texto);
  const progressoSemana = (data.progresso || []).find(p => p.semana === semanaNum);
  // Régua ÚNICA (`consumiuConteudo`) — era `progressoSemana?.conteudo_consumido`
  // cru, e o campo pode chegar como ARRAY (video-tracking). Array vazio é
  // truthy em JS: a tela diria "consumido" e liberaria Evidências enquanto o
  // painel de engajamento contava a mesma pessoa como não-consumida.
  const conteudoConsumido = consumiuConteudo(progressoSemana?.conteudo_consumido);

  async function handleConsumido() {
    if (visaoLeitura) return;
    await marcarConteudoConsumido(data.trilha.id, semanaNum);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { router.replace('/login'); return; }
    const r = await loadTemporadaPorEmail(user.email, { semanaTranscrito: semanaNum });
    setData(r);
  }

  // Escolhe endpoint conforme tipo da semana. TODA semana de avaliação do plano
  // fala com /evaluation — a qualitativa e o fechamento. Enquanto isto era
  // `13 || 14`, a conversa de fechamento de qualquer outro formato ia para
  // /reflection, que a trata como semana de conteúdo.
  const isEvalSemana = ehQualitativa || semanaNum === semCenarioB;
  const endpoint = isEvalSemana ? '/api/temporada/evaluation' : '/api/temporada/reflection';

  /**
   * A pessoa pode sair da leitura e ir para a conversa?
   *
   * 🔑 O DEGRAU MANUAL DEIXA DE SER CATRACA. Antes, Evidências e Tira-Dúvidas
   * exigiam `conteudo_consumido`, que só existia se a pessoa tivesse clicado em
   * "Marcar como realizado" — um botão que serve ao SISTEMA (métrica), não a
   * ela: quem abriu o conteúdo já consumiu, e o app já sabia disso por
   * `trilha_eventos`. Eram três gates em série (abrir → marcar → conversar) e
   * cada um invisível até você bater nele.
   *
   * Agora abrir o conteúdo basta. A marcação não some — `startChat` a grava
   * (ver abaixo), então a métrica continua sendo alimentada e fica MAIS
   * verdadeira: passa a significar "consumiu e foi conversar", em vez de
   * "lembrou de clicar num botão".
   *
   * `nadaParaAbrir` continua valendo: pílula sem nenhuma fonte abrível tornaria
   * a condição insatisfazível e travaria a semana em cadeia.
   */
  const podeConversar = conteudoConsumido || abriuConteudo || nadaParaAbrir;

  // Régua ÚNICA do primeiro passo do resumo — o porquê (e a medição que o
  // justifica) está em `estadoDoPrimeiroPasso`. Aqui não se repete condição
  // nenhuma: foi exatamente uma cópia de régua nesta tela que produziu
  // "Conteúdo · feito" ao lado de um botão pedindo para fazer.
  //
  // Em semana de APLICAÇÃO o passo é a MISSÃO, não o conteúdo: `feedback.modo`
  // só existe depois que a pessoa aceita a missão com um compromisso escrito.
  const primeiroPasso = estadoDoPrimeiroPasso({
    semanaEhAplicacao: isAplicacao,
    nadaParaAbrir,
    conteudoConsumido,
    missaoAceita: !!progressoSemana?.feedback?.modo,
  });

  /**
   * Progresso da conversa que CONCLUI a semana.
   *
   * 🔴 Não havia NADA disto na tela (medido 25/08/2026). A pessoa respondia e
   * nada dizia se faltava uma resposta ou cinco — e o modo do histograma de
   * quem abandonou é parar no **turno 1**: 6 das 13 que começaram. Quem não vê
   * um fim não sabe que está perto dele; duas pessoas pararam a UM turno de
   * destravar a semana, uma delas parada havia mais de um mês.
   *
   * A régua é `turnosIaNecessarios`, a MESMA que as rotas usam para virar
   * `finished` e que a tela BLOQUEADA já usava para dizer "faltam N". Ela só
   * nunca tinha sido mostrada para quem está DENTRO da conversa — exatamente
   * quem precisa dela. Nenhum número novo: o que faltava era ele ser dito.
   */
  const turnosFeitos = chatHistory.filter((m) => m?.role === 'assistant').length;
  const turnosNecessarios = turnosIaNecessarios(semanaNum, semana?.tipo, progressoSemana?.feedback?.modo);
  const turnosFaltando = Math.max(turnosNecessarios - turnosFeitos, 0);

  async function startChat() {
    if (visaoLeitura) return;
    setChatStarted(true);
    // Registra o consumo ao ENTRAR na conversa, para quem chegou aqui sem ter
    // clicado no botão manual. Best-effort e idempotente: se falhar, a conversa
    // acontece do mesmo jeito — o que não pode é a métrica virar pré-requisito
    // da experiência de novo.
    if (!conteudoConsumido) {
      marcarConteudoConsumido(data.trilha.id, semanaNum).catch(() => {});
    }
    setChatBusy(true);
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trilhaId: data.trilha.id, semana: semanaNum, action: 'init' }),
    }).then(r => r.json());
    if (r.history) setChatHistory(r.history);
    setChatFinished(!!r.finished);
    setChatBusy(false);
    // Fechamento: o init grava o cenário no feedback — recarrega pra renderizar.
    if (semanaNum === semCenarioB && r.cenario) {
      const user = (await sb.auth.getUser()).data.user;
      if (!user) { router.replace('/login'); return; }
      const fresh = await loadTemporadaPorEmail(user.email, { semanaTranscrito: semanaNum });
      setData(fresh);
    }
  }

  async function setMissaoModo(modo) {
    if (visaoLeitura) return;
    if (missaoBusy) return;
    if (modo === 'pratica' && !compromissoInput.trim()) return;
    setMissaoBusy(true);
    const r = await fetchAuth('/api/temporada/missao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trilhaId: data.trilha.id,
        semana: semanaNum,
        modo,
        compromisso: modo === 'pratica' ? compromissoInput.trim() : undefined,
      }),
    }).then(r => r.json());
    setMissaoBusy(false);
    if (!r.error) {
      const user = (await sb.auth.getUser()).data.user;
      if (!user) { router.replace('/login'); return; }
      const fresh = await loadTemporadaPorEmail(user.email, { semanaTranscrito: semanaNum });
      setData(fresh);
    }
  }

  async function sendTiraDuvida() {
    if (visaoLeitura) return;
    if (!tdInput.trim() || tdBusy) return;
    tdMicRef.current?.stop();
    const msg = tdInput;
    setTdInput('');
    setTdHistory(h => [...h, { role: 'user', content: msg, timestamp: new Date().toISOString() }]);
    setTdBusy(true);
    const r = await fetchAuth('/api/temporada/tira-duvidas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trilhaId: data.trilha.id, semana: semanaNum, message: msg }),
    }).then(r => r.json());
    if (r.history) setTdHistory(r.history);
    setTdBusy(false);
  }

  async function sendMessage() {
    if (visaoLeitura) return;
    if (!chatInput.trim() || chatBusy) return;
    chatMicRef.current?.stop();
    const msg = chatInput;
    setChatInput('');
    setChatHistory(h => [...h, { role: 'user', content: msg, timestamp: new Date().toISOString() }]);
    setChatBusy(true);
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trilhaId: data.trilha.id, semana: semanaNum, message: msg, action: 'send' }),
    }).then(r => r.json());
    if (r.history) setChatHistory(r.history);
    setChatFinished(!!r.finished);
    setChatBusy(false);
  }

  return (
    <PageContainer>
      <BackButton href={visaoLeitura && colaboradorAlvo
        ? `/dashboard/temporada?colaborador=${encodeURIComponent(colaboradorAlvo)}&origem=gestor`
        : '/dashboard/temporada'} />

      {/* Header */}
      <div className="mb-6">
        <div className="text-xs uppercase text-brand-400 mb-1">
          {/* D1: "Semana 3 de 14" numa jornada de 7 — nesta tela, que é onde a
              pessoa passa a trilha inteira. O literal estava DENTRO da
              interpolação do i18n, que é por onde ele escapou da primeira
              varredura: procurar a string "de 14" não acha `total: 14`. */}
          {t('header.weekOf', { week: semanaNum, total: totalSemanasDoPlano(data.trilha.temporada_plano, 14) })} · {isAplicacao ? t('type.practice') : isAvaliacao ? t('type.assessment') : t('type.episode')}
        </div>
        <h1 className="text-2xl font-bold text-white">{descritoresLabel}</h1>
        {/* Semana de aplicação (4/8/12) funciona diferente das de conteúdo — não tem
            pílula pra consumir, tem missão pra executar e relatar. O vídeo abre
            sozinho na PRIMEIRA que a pessoa acessar e depois fica como botão: a
            mecânica é a mesma nas três, então repetir seria ruído. */}
        {isAplicacao && !visaoLeitura && (
          <div className="mt-3">
            <FirstViewVideo
              videoId={APLICACAO_VIDEO_ID}
              title={t('missionVideo.title')}
              label={t('missionVideo.watch')}
              sectionKey="semana-aplicacao"
              colabId={data.trilha.colaborador_id}
            />
          </div>
        )}
      </div>

      {visaoLeitura && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-violet-400/25 bg-violet-400/[0.06] px-4 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-400/10 text-violet-300">
            <Eye size={17} />
          </span>
          <div>
            <p className="text-xs font-bold text-white">
              {t(data.viewerRole === 'rh' ? 'readonly.titleRh' : 'readonly.titleManager', {
                name: data.colaborador?.nome_completo || '—',
              })}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-white/50">{t('readonly.subtitle')}</p>
          </div>
        </div>
      )}

      {/*
        ESTADO DA SEMANA — o que falta para ela fechar, dito antes de tudo.

        🔴 POR QUE NO TOPO E NÃO EM MAIS UM CARD. A régua sequencial sempre
        existiu, mas só era DITA na tela da semana TRANCADA — ou seja, para quem
        já bateu na porta fechada. Quem está na semana que consegue abrir via
        três cards de peso visual igual (conteúdo, tira-dúvidas, evidências) e
        nada indicando que só um deles conclui a semana. Medido em 25/08/2026:
        das 61 pessoas travadas, 7 podiam clicar em Evidências e não clicaram, e
        13 começaram a conversa e pararam — 6 delas no primeiro turno.

        Não é decoração: é a mesma régua do gate (`turnosIaNecessarios`),
        mostrada onde a decisão acontece. Some quando a semana está concluída —
        aviso que fica depois de resolvido é aviso que se aprende a ignorar.
      */}
      {!visaoLeitura && !isAvaliacao && (
        chatFinished ? (
          /*
            SEMANA CONCLUÍDA — e este é o momento de MAIOR valor do produto.
            A 1ª versão desta barra simplesmente SUMIA quando `chatFinished`, com
            o argumento de que aviso resolvido vira ruído. Errado aqui: o que
            sobrava era um texto verde de 11px no rodapé do card de Evidências,
            então o indicador que a pessoa vinha acompanhando desaparecia
            exatamente quando ela venceu. Some o que COBRA; o que CELEBRA fica.
          */
          <div className="mb-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
            <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
              <Check size={18} className="shrink-0" />
              {t('progress.weekDone', { week: semanaNum })}
            </div>
            {/*
              🔴 "LIBERA seg 01/09" É UMA DATA NO PASSADO PARA QUEM ESTÁ ATRASADO
              — e atrasado é a MAIORIA de quem vê esta faixa hoje (das 61 pessoas
              travadas em 25/08, todas concluem semanas cujo sucessor já liberou
              há tempo). A frase mandava esperar por algo que já aconteceu, e
              justamente na tela de quem acabou de destravar uma semana e tem
              todo o impulso para continuar.

              A régua é `semanaLiberadaPorData`, a MESMA do gate — não uma
              comparação de datas escrita aqui. Três estados, não dois: acabou a
              trilha · a próxima já está aberta · a próxima ainda vai abrir.
            */}
            {(() => {
              const total = totalSemanasDoPlano(data.trilha.temporada_plano, 14);
              if (semanaNum >= total) {
                return <p className="mt-1 text-xs text-emerald-200/80">{t('progress.seasonDone')}</p>;
              }
              const proxima = semanaNum + 1;
              const jaLiberada = semanaLiberadaPorData(data.trilha.data_inicio, proxima);
              if (!jaLiberada) {
                return (
                  <p className="mt-1 text-xs text-emerald-200/80">
                    {t('progress.nextOpens', { date: formatarLiberacao(data.trilha.data_inicio, proxima) })}
                  </p>
                );
              }
              // Já liberada: além de dizer, LEVA. Quem está atrasado precisa de
              // um caminho, não de um aviso — é a mesma decisão do botão da
              // mensagem de WhatsApp, que aponta para a semana que destrava.
              return (
                <div className="mt-1">
                  <p className="text-xs text-emerald-200/80">{t('progress.nextAlreadyOpen', { week: proxima })}</p>
                  <button
                    onClick={() => router.push(`/dashboard/temporada/semana/${proxima}`)}
                    className="mt-2 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                  >
                    {t('progress.goToNext', { week: proxima })}
                  </button>
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-2">
              {t('progress.title')}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className={`flex items-center gap-1.5 ${primeiroPasso.estado === 'feito' ? 'text-emerald-400' : 'text-gray-400'}`}>
                {primeiroPasso.estado === 'feito'
                  ? <Check size={13} />
                  : <span className="w-[13px] text-center">{primeiroPasso.estado === 'sem-conteudo' ? '—' : '1'}</span>}
                {primeiroPasso.passo === 'missao' ? t('progress.stepMission') : t('progress.stepContent')}
                <span className="text-gray-500">
                  · {primeiroPasso.estado === 'sem-conteudo'
                      ? t('progress.contentNone')
                      : primeiroPasso.estado === 'feito'
                        ? t('progress.contentDone')
                        : t('progress.contentPending')}
                </span>
              </span>
              <span className="text-gray-600">→</span>
              <span className={`flex items-center gap-1.5 ${turnosFeitos > 0 ? 'text-brand-400' : 'text-gray-400'}`}>
                <span className="w-[13px] text-center">2</span>
                {t('progress.stepEvidence')}
                {/*
                  🔴 "não começou" VIROU "0 de 6 respostas" (28/08/2026, pedido
                  do dono depois do caso da Edileide, Ibipeba).

                  O estado inicial era o único da barra que não dizia TAMANHO.
                  Quem nunca clicou lia "Evidências · não começou" e não tinha
                  como saber se aquilo custava uma resposta ou vinte — e é
                  exatamente essa pessoa que a barra precisa convencer, porque
                  ela ainda acredita que o que fecha a semana é marcar o
                  conteúdo. Ela ficou 6 dias (21 a 27/08) escrevendo "assisti o
                  vídeo e não consigo marcar que concluí".

                  `evidenceNotStarted` saiu dos 4 locales junto: manter a chave
                  seria deixar registrada a formulação que omite o número.
                */}
                <span className="text-gray-500">
                  · {t('progress.evidenceProgress', { done: turnosFeitos, total: turnosNecessarios })}
                </span>
              </span>
              <span className="text-gray-600">→</span>
              <span className="flex items-center gap-1.5 text-gray-500">
                <span className="w-[13px] text-center">3</span>{t('progress.stepDone')}
              </span>
            </div>
            {/*
              A REGRA GANHOU PESO (pedido do dono, 25/08). Era um `<p>` de 11px
              em amber/80 — do tamanho de uma legenda, para a frase que explica
              por que a semana não fecha. É ela que desfaz a crença que trava
              essas pessoas ("abri o conteúdo, então terminei"), então tem que
              competir com o conteúdo da página, não sussurrar embaixo dele.
              Faixa própria, ícone, borda e texto de 13px.
            */}
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2">
              <Sparkles size={15} className="text-amber-300 shrink-0 mt-px" />
              <p className="text-[13px] leading-snug text-amber-100 font-medium">
                {t('progress.closesHere')}
              </p>
            </div>
          </div>
        )
      )}

      {/* Vínculo com o PDI (Blueprint) — só quando a trilha é dirigida pelo blueprint. */}
      {semana.acao_pdi && (
        <div className="mb-6 rounded-xl border border-brand-400/30 bg-brand-400/5 px-4 py-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-brand-400 font-bold mb-1">
            <Target size={12} /> {t('pdi.badge')}
          </div>
          {semana.objetivo_da_semana && (
            <p className="text-sm text-gray-200 mb-1.5">{semana.objetivo_da_semana}</p>
          )}
          <p className="text-xs text-gray-400">
            <span className="text-gray-500">{t('pdi.sustains')}: </span>{semana.acao_pdi}
          </p>
        </div>
      )}

      {/* Conteúdo da semana */}
      {!isAplicacao && !isAvaliacao && entregasConteudo.length > 0 && (
        <>
          <GlassCard className="mb-4 space-y-5">
            {entregasConteudo.map((entrega, idx) => (
              <div key={`${entrega.dia}-${entrega.competencia || idx}`} className={idx > 0 ? 'border-t border-white/10 pt-5' : ''}>
                <div className="mb-3">
                  <p className="text-[10px] uppercase tracking-widest text-brand-400 font-bold">{entrega.label}</p>
                  <h2 className="text-sm font-bold text-white">{entrega.competencia || semana.competencia}</h2>
                  {entrega.descritor && <p className="text-xs text-gray-400">{descritorParaHumano(entrega.descritor)}</p>}
                </div>
                <ConteudoViewer
                  conteudo={entrega.conteudo}
                  competencia={entrega.competencia || semana.competencia}
                  descritor={entrega.descritor}
                  pilula={idx + 1}
                  formatoAtivo={typeof formatoAtivo === 'object' && formatoAtivo !== null ? formatoAtivo[idx] : (idx === 0 ? formatoAtivo : null)}
                  setFormatoAtivo={(formato) => setFormatoAtivo(prev => ({ ...(typeof prev === 'object' && prev !== null ? prev : {}), [idx]: formato }))}
                  trilhaId={data.trilha.id}
                  semana={semanaNum}
                  colaboradorAlvo={colaboradorAlvo}
                  somenteLeitura={visaoLeitura}
                  /*
                   * Abrir um formato JÁ marca a semana como realizada.
                   *
                   * O botão manual existia para o sistema, não para a pessoa:
                   * ela abria o conteúdo e ainda precisava confirmar num
                   * segundo clique que tinha aberto. Agora o clique no formato
                   * faz as duas coisas — libera a conversa (estado local, na
                   * hora) e grava o consumo (persistente).
                   *
                   * ⚠️ O QUE ISSO FAZ COM A MÉTRICA, dito de propósito:
                   * `conteudo_consumido` passa a significar "ABRIU o conteúdo".
                   * Na prática já significava isso — o botão só ficava clicável
                   * depois de abrir, então marcava quem tinha aberto E lembrado
                   * de confirmar. O sinal de consumo REAL nunca foi este campo;
                   * é `videos_watched.play_finished` e o `audio_fim` da
                   * telemetria. O que muda é que ele deixa de subnotificar por
                   * esquecimento.
                   */
                  onAbrirConteudo={() => {
                    if (visaoLeitura) return;
                    setAbriuConteudo(true);
                    if (!conteudoConsumido) handleConsumido();
                  }}
                  onAutoConsumido={() => !visaoLeitura && !conteudoConsumido && handleConsumido()}
                  onSemFonte={() => setSemFonte((p) => (p[idx] ? p : { ...p, [idx]: true }))}
                  t={t}
                />
              </div>
            ))}
            {/*
              O BOTÃO MANUAL SAIU — ele não fazia mais nada neste caminho.
              (27/08/2026; o botão era `!conteudoConsumido && nadaParaAbrir`.)

              A justificativa que ele carregava — "sem este botão a semana
              ficaria sem caminho para fechar" — deixou de valer no MESMO
              commit que a escreveu (`b76eb17b`, 25/08), e por três motivos que
              se somam:

                1. `podeConversar` passou a incluir `nadaParaAbrir`, então a
                   conversa de evidências já está liberada sem clique nenhum;
                2. `startChat` grava `marcarConteudoConsumido` sozinho ao entrar
                   na conversa, então a métrica é alimentada sem o botão;
                3. `handleConsumido` fazia exatamente isso e nada mais.

              E ele não segurava o gate sequencial: quem libera a semana N+1 é
              `anterior.status === CONCLUIDO` (`week-gating.ts`), gravado pela
              CONVERSA (`reflection/route.ts`) — `conteudo_consumido` não
              participa. Removê-lo não tranca ninguém.

              O que sobrava era um botão verde pedindo "marcar como realizado"
              a três linhas de um resumo que já dizia "Conteúdo · feito", numa
              semana em que não havia o que marcar. Quem chega aqui vê que a
              semana não tem conteúdo e segue para as evidências, que é o que
              fecha a semana.

              🔑 `content.markDone` e `content.openBeforeComplete` saíram dos 4
              locales junto — ao contrário de `content.done` logo abaixo, que
              fica registrada de propósito. A diferença: `content.done` é o
              rótulo de um ESTADO que pode voltar a ser exibido; estas duas
              nomeiam o BOTÃO que não deve voltar. Deixá-las no i18n seria o
              convite para recriá-lo.
            */}
            {/*
              🔴 `!podeConversar`, NÃO `!conteudoConsumido` (achado 25/08 no
              screenshot da captura do tutorial). `conteudoConsumido` vem do
              progresso CARREGADO, e a gravação do consumo é assíncrona — então,
              logo após o clique que libera a semana, a tela mostrava a barra
              dizendo "Conteúdo · feito" E esta instrução mandando abrir o
              conteúdo, com os dois botões já ativos ao lado. Três estados
              contraditórios na mesma dobra.

              `podeConversar` é o MESMO predicado dos botões, então a instrução
              e o que ela promete destravar passam a falar do mesmo estado.
              Nenhum teste pegaria: o contrato estava certo em todos os pontos
              isolados — quem viu foi a captura de tela.
            */}
            {!podeConversar && (
              <p className="mt-4 text-xs text-amber-300/80">{t('content.openToUnlock')}</p>
            )}
            {/*
              O "✓ Conteúdo realizado" saiu daqui (25/08/2026, pedido do dono).
              A barra de estado no topo já diz "Conteúdo · feito" — repetir no
              rodapé dá a um passo CUMPRIDO o mesmo peso visual do que ainda
              falta, que é o oposto do que esta tela precisa comunicar. O estado
              não sumiu: passou a ter um lugar só.

              A chave `content.done` fica no i18n de propósito, sem consumidor:
              removê-la exigiria mexer nos 4 locales para poupar 4 linhas, e ela
              é o rótulo natural se o estado voltar a ser mostrado em algum
              lugar. Está registrada aqui para não virar mistério.
            */}
          </GlassCard>

          {entregasComDesafio.length > 0 && (
          <GlassCard className="mb-4 border-brand-500/30 bg-brand-500/5">
            <div className="flex items-center gap-2 mb-2">
              <Target size={16} className="text-brand-400" />
              <span className="text-xs uppercase text-brand-400 font-bold">{t('challenge.title')}</span>
            </div>
            <div className="space-y-4">
              {/* Só as entregas que TÊM desafio. Na jornada (05/08/2026) a semana
                  entrega duas pílulas e uma tarefa só, então a segunda entrega
                  vem sem desafio — sem este filtro, a tela mostrava um bloco
                  vazio com o rótulo da entrega e nada embaixo. Com uma única
                  tarefa, o rótulo da pílula também sai: a tarefa é da SEMANA. */}
              {entregasComDesafio.map((entrega, idx) => (
                <div key={`${entrega.dia}-challenge-${idx}`} className={idx > 0 ? 'border-t border-brand-500/20 pt-4' : ''}>
                  {entregasComDesafio.length > 1 && (
                    <p className="text-[10px] uppercase tracking-widest text-brand-400/70 font-semibold mb-1">{entrega.label}</p>
                  )}
                  <p className="text-sm text-gray-200">{entrega.conteudo?.desafio_texto}</p>
                  {entrega.conteudo?.acao_observavel && (
                    <div className="mt-3 space-y-2">
                      <div>
                        <span className="text-[10px] uppercase text-brand-400/70 font-semibold">{t('challenge.observe')}</span>
                        <p className="text-xs text-gray-300">{entrega.conteudo.acao_observavel}</p>
                      </div>
                    </div>
                  )}
                  {/*
                    O "Execução" (`criterio_de_execucao`) saiu daqui em 27/08/2026,
                    por decisão do dono. Ele passou a ser INSTRUMENTO DE AVALIAÇÃO:
                    vai para a IA que conduz as Evidências, que antes cobrava sem
                    saber o que contava como cumprido — o critério era escrito, era
                    exibido, e o único lugar que julga nunca o via.

                    Mostrá-lo aqui e usá-lo para avaliar ao mesmo tempo convida a
                    pessoa a escrever PARA o critério, e o que a conversa precisa
                    colher é o que aconteceu de fato.

                    A chave `challenge.execution` fica no i18n sem consumidor, pelo
                    mesmo motivo de `content.done` acima: removê-la custaria mexer
                    nos 4 locales, e ela é o rótulo natural se o bloco voltar.
                  */}
                </div>
              ))}
            </div>
          </GlassCard>
          )}
        </>
      )}

      {/* Missão Prática (sems 4/8/12). Três estados:
          (A) sem modo: apresenta missão + form de compromisso OU opção pelo cenário escrito.
          (B) modo=pratica: missão + compromisso salvo (readonly) — chat abaixo vira "relate o que você fez".
          (C) modo=cenario: fallback escrito (Contexto) — chat abaixo segue fluxo analítico clássico. */}
      {isAplicacao && (() => {
        const modoAplicacao = progressoSemana?.feedback?.modo;
        const compromissoSalvo = progressoSemana?.feedback?.compromisso;
        const missaoTexto = semana.missao?.texto;

        // Retro-compat: trilhas antigas não têm missao → skip escolha, vai direto pro cenário.
        const modoEfetivo = modoAplicacao || (!missaoTexto ? 'cenario' : null);

        // Estado A — escolha de modo (só se tem missao e ainda não escolheu)
        if (!modoEfetivo) {
          return (
            <GlassCard className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Target size={16} className="text-amber-400" />
                <span className="text-xs uppercase text-amber-400 font-bold">{t('mission.title')}</span>
              </div>
              <div className="prose prose-invert prose-sm max-w-none mb-4">
                <ReactMarkdown>{missaoTexto}</ReactMarkdown>
              </div>
              {visaoLeitura ? (
                <p className="text-xs text-white/45">{t('readonly.actionsHidden')}</p>
              ) : (
                <>
                  <label className="block text-xs text-gray-400 mb-2">
                    {t('mission.commitmentPrompt')}
                  </label>
                  <textarea value={compromissoInput}
                    onChange={e => setCompromissoInput(e.target.value)}
                    rows={2} placeholder={t('mission.commitmentPlaceholder')}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500 mb-3" />
                  <button onClick={() => setMissaoModo('pratica')}
                    disabled={missaoBusy || !compromissoInput.trim()}
                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-sm font-bold">
                    {t('mission.accept')}
                  </button>
                </>
              )}
            </GlassCard>
          );
        }

        // Estado B — modo=pratica
        if (modoAplicacao === 'pratica') {
          return (
            <GlassCard className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Target size={16} className="text-amber-400" />
                <span className="text-xs uppercase text-amber-400 font-bold">{t('mission.title')}</span>
              </div>
              {missaoTexto && (
                <div className="prose prose-invert prose-sm max-w-none mb-3">
                  <ReactMarkdown>{missaoTexto}</ReactMarkdown>
                </div>
              )}
              <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 mb-3">
                <p className="text-[10px] uppercase text-amber-400 font-bold tracking-wider mb-1">{t('mission.yourCommitment')}</p>
                <p className="text-sm text-gray-200">{compromissoSalvo}</p>
              </div>
              {!visaoLeitura && !chatStarted && (
                <>
                  <p className="text-xs text-gray-400 mb-3">
                    {t('mission.didYouExecute')}
                  </p>
                  <div className="flex gap-2">
                    <button onClick={startChat}
                      className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-bold min-w-[80px]">
                      {t('common.yes')}
                    </button>
                    <button onClick={() => setMissaoModo('cenario')}
                      disabled={missaoBusy}
                      className="px-5 py-2 rounded-lg border border-white/15 hover:border-white/30 disabled:opacity-50 text-sm text-gray-300 min-w-[80px]">
                      {t('common.no')}
                    </button>
                  </div>
                </>
              )}
            </GlassCard>
          );
        }

        // Estado C — modo=cenario (fallback)
        return (
          <GlassCard className="mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Target size={16} className="text-amber-400" />
              <span className="text-xs uppercase text-amber-400 font-bold">{t('context')}</span>
            </div>
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown>{stripCenarioTitulo(cenario?.texto || '')}</ReactMarkdown>
            </div>
          </GlassCard>
        );
      })()}

      {/* Conversa qualitativa: a avaliação que NÃO é o fechamento (regular=13,
          encerramento de Ibipeba=8). Nos modos de um slot só (piloto, jornada)
          isto é `false` — lá a acumulada roda em background, sem tela. */}
      {ehSemanaQualitativa(data.trilha.temporada_plano, semanaNum) && (
        <GlassCard className="mb-4 border-purple-500/30 bg-purple-500/5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={16} className="text-purple-400" />
            <span className="text-xs uppercase text-purple-400 font-bold">{t('qualitative.title')}</span>
          </div>
          <p className="text-sm text-gray-300">
            {t('qualitative.description')}
          </p>
        </GlassCard>
      )}

      {/* Fechamento. Hoje inalcançável na prática — a semana do cenário B
          redireciona para o wizard antes de chegar aqui —, mas mantido pela
          régua do plano em vez de um literal: ramo morto amarrado a um número
          é o que volta a mentir quando o redirect muda. */}
      {isAvaliacao && semanaNum === semCenarioB && (() => {
        // Se já tem cenário em feedback, mostra. Senão, placeholder informativo.
        const cenarioTexto = progressoSemana?.feedback?.cenario;
        return (
          <GlassCard className="mb-4 border-amber-500/30 bg-amber-500/5">
            <div className="flex items-center gap-2 mb-2">
              <Target size={16} className="text-amber-400" />
              <span className="text-xs uppercase text-amber-400 font-bold">{t('finalScenario.title')}</span>
            </div>
            {cenarioTexto ? (
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown>{stripCenarioTitulo(cenarioTexto)}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm text-gray-300">
                {t.rich('finalScenario.description', { action: (chunks) => <span className="text-purple-400">{chunks}</span> })}
              </p>
            )}
          </GlassCard>
        );
      })()}

      {/* Tira-Dúvidas: só em semanas de conteúdo. Botão liberado após marcar
          o conteúdo como realizado — mas renderiza o card sempre pra dar
          visibilidade do recurso. */}
      {!visaoLeitura && !isAplicacao && !isAvaliacao && (
        <GlassCard className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <HelpCircle size={16} className="text-brand-400" />
            <span className="text-xs uppercase text-brand-400 font-bold">{t('qa.title')}</span>
            <span className="text-[10px] text-gray-500">· {t('qa.scope', { descriptor: descritoresLabel })}</span>
          </div>

          {!tdOpen ? (
            <button onClick={() => {
                // A ROTA do tira-dúvidas exige consumo (403). Liberar o botão
                // sem gravar a marcação trocaria um botão cinza por um erro
                // mudo — pior. Grava e abre.
                if (!conteudoConsumido) marcarConteudoConsumido(data.trilha.id, semanaNum).catch(() => {});
                setTdOpen(true);
              }}
              disabled={!podeConversar}
              title={!podeConversar ? t('qa.markContentFirst') : ''}
              className="w-full px-4 py-3 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold">
              {podeConversar ? t('qa.ask') : t('qa.unlockAfterContent')}
            </button>
          ) : (
            <>
              <div className="space-y-3 max-h-80 overflow-y-auto mb-3">
                {tdHistory.length === 0 && (
                  <p className="text-xs text-gray-500 italic text-center py-4">
                    {t.rich('qa.empty', { descriptor: descritoresLabel, strong: (chunks) => <span className="text-brand-400">{chunks}</span> })}
                  </p>
                )}
                {tdHistory.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                      m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-white/5 text-gray-200 border border-white/10'
                    }`}>
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  </div>
                ))}
                {tdBusy && (
                  <div className="flex justify-start">
                    <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-2 text-sm text-gray-400">
                      <Loader2 size={14} className="animate-spin inline" /> {t('thinking')}
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <textarea value={tdInput}
                    onChange={e => setTdInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTiraDuvida(); } }}
                    placeholder={t('qa.placeholder')}
                    rows={2}
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-brand-500 resize-none"
                    disabled={tdBusy} />
                  <button onClick={sendTiraDuvida} disabled={tdBusy || !tdInput.trim()}
                    className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50">
                    <Send size={16} />
                  </button>
                </div>
                <MicInput ref={tdMicRef} value={tdInput} onChange={setTdInput} disabled={tdBusy} />
              </div>
            </>
          )}
        </GlassCard>
      )}

      {/* Evidências — socrático, levanta evidências do comportamento do colab.
          (Antes chamado de "Mentor IA".) Inclui semanas de avaliação (13/14).
          Em sems 4/8/12 com modo=prática, só aparece depois do colab clicar 'Sim'
          (chatStarted) pra não poluir a tela com botão duplicado / card sem sentido. */}
      {!visaoLeitura && !(isAplicacao && progressoSemana?.feedback?.modo === 'pratica' && !chatStarted) && (
        <GlassCard className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-purple-400" />
            <span className="text-xs uppercase text-purple-400 font-bold">
              {ehQualitativa ? t('evidence.closingConversation')
               : semanaNum === semCenarioB ? t('evidence.finalScenario')
               : isAplicacao
                 ? (progressoSemana?.feedback?.modo === 'pratica' ? t('evidence.missionReport') : t('evidence.feedback'))
                 : t('evidence.title')}
            </span>
          </div>

          {!chatStarted ? (() => {
            // Em sems 4/8/12 o chat só destrava após o modo ser definido.
            // Retro-compat: trilhas antigas sem missao não exigem modo.
            const temMissao = !!semana.missao?.texto;
            const modoPratica = progressoSemana?.feedback?.modo === 'pratica';
            const aplicacaoSemModo = isAplicacao && temMissao && !progressoSemana?.feedback?.modo;
            // Em modo prática, a entrada é o botão "Sim, consegui" no card acima.
            if (modoPratica) {
              return (
                <p className="text-xs text-gray-500 italic">
                  {t.rich('evidence.clickYes', { action: (chunks) => <span className="text-emerald-400">{chunks}</span> })}
                </p>
              );
            }
            return (
              <>
                {/*
                  O TAMANHO DA CONVERSA, DITO NA PORTA (28/08/2026, pedido do
                  dono).
                  🔴 ISTO CONTRARIA, DE PROPÓSITO, A DECISÃO DE 25/08 — que está
                  três blocos abaixo, no contador de dentro do chat: "antes do 1º
                  turno o número seria o total e soaria como uma tarefa de 6
                  passos anunciada na porta". A premissa era que anunciar o custo
                  afugenta. O caso que a derrubou: a pessoa não chegava a ser
                  afugentada pelo número porque não chegava ao botão — ela
                  passava dias procurando um "marcar como concluído" que não
                  existe mais, e o botão roxo ao lado, chamado "Levantar
                  evidências", não se anunciava como o que fecha a semana.
                  Custo desconhecido não é custo zero: é motivo para não clicar.
                  O contador de DENTRO continua como estava — lá o número é
                  "quanto falta", aqui é "quanto custa", e os dois saem da mesma
                  régua (`turnosFaltando`), então não podem divergir.
                  Fica de fora quando a missão da semana de aplicação ainda não
                  foi escolhida: ali o botão está desabilitado por outro motivo
                  (`chooseMissionFirst`), e cobrar respostas sem dar o caminho é
                  o defeito que esta tela passou o mês inteiro corrigindo.
                */}
                {!aplicacaoSemModo && turnosFaltando > 0 && (
                  <p className="mb-2 text-[13px] leading-snug text-purple-200">
                    {turnosFaltando === 1
                      ? t('evidence.remainingOne', { week: semanaNum })
                      : t('evidence.remaining', { count: turnosFaltando, week: semanaNum })}
                  </p>
                )}
                <button
                  onClick={startChat}
                  disabled={(!podeConversar && !isAplicacao && !isAvaliacao) || aplicacaoSemModo}
                  title={aplicacaoSemModo ? t('evidence.chooseMissionFirst') : ''}
                  className="w-full px-4 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold"
                >
                  {ehQualitativa ? t('evidence.startClosing')
                   : semanaNum === semCenarioB ? t('evidence.viewFinalScenario')
                   : isAplicacao ? t('evidence.sendAnswer')
                   : t('evidence.start')}
                </button>
              </>
            );
          })() : (
            <>
              <div className="space-y-3 max-h-96 overflow-y-auto mb-3">
                {chatHistory.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                      m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-white/5 text-gray-200 border border-white/10'
                    }`}>
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  </div>
                ))}
                {chatBusy && (
                  <div className="flex justify-start">
                    <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-2 text-sm text-gray-400">
                      <Loader2 size={14} className="animate-spin inline" /> {t('thinking')}
                    </div>
                  </div>
                )}
              </div>

              {!chatFinished ? (
                <div className="space-y-2">
                  {/*
                    Quantas respostas ainda faltam — a informação que a pessoa
                    precisa EXATAMENTE aqui, e que a tela nunca deu. Ver o
                    comentário de `turnosFeitos`: o abandono se concentra no
                    primeiro turno, que é onde uma conversa sem fim visível
                    parece infinita.

                    Só aparece depois do 1º turno da IA: antes disso, o número
                    seria o total e soaria como uma tarefa de 6 passos anunciada
                    na porta — o oposto do efeito desejado.
                  */}
                  {turnosFeitos > 0 && turnosFaltando > 0 && (
                    <p className="text-[11px] text-brand-300/90">
                      {turnosFaltando === 1
                        ? t('evidence.remainingOne', { week: semanaNum })
                        : t('evidence.remaining', { count: turnosFaltando, week: semanaNum })}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <textarea
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                      placeholder={
                        isAplicacao
                          ? (progressoSemana?.feedback?.modo === 'pratica'
                              ? t('evidence.placeholderPractice')
                              : t('evidence.placeholderScenario'))
                          : t('evidence.placeholderDefault')
                      }
                      rows={2}
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-brand-500 resize-none"
                      disabled={chatBusy}
                    />
                    <button onClick={sendMessage} disabled={chatBusy || !chatInput.trim()} className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50">
                      <Send size={16} />
                    </button>
                  </div>
                  <MicInput ref={chatMicRef} value={chatInput} onChange={setChatInput} disabled={chatBusy} />
                </div>
              ) : (
                <div className="text-center text-emerald-400 text-xs py-2">
                  {semanaNum >= 14
                    ? t('evidence.doneSeason')
                    : t('evidence.doneNextWeek', { date: formatarLiberacao(data.trilha.data_inicio, semanaNum + 1) })}
                </div>
              )}
            </>
          )}
        </GlassCard>
      )}
    </PageContainer>
  );
}

function ConteudoViewer({ conteudo, competencia, descritor, pilula, formatoAtivo, setFormatoAtivo, onAutoConsumido, onAbrirConteudo, onSemFonte, trilhaId, semana, colaboradorAlvo, somenteLeitura, t }) {
  // Vídeo da CÉLULA (cargo × DISC × PPP), resolvido pela competência da semana.
  // Aparece como um formato a mais (chip clicável); o player abre inline igual
  // aos outros. Não dispara geração (gerar=false) — só reusa pronto/em-preparo.
  const [vid, setVid] = useState<any>(null);
  const [mediaSession, setMediaSession] = useState(0);
  const videoIframeRef = useRef(null);
  useEffect(() => {
    if (!competencia) return;
    let alive = true;
    const resolver = somenteLeitura && colaboradorAlvo
      ? resolverVideoDaSemanaGestor(colaboradorAlvo, competencia, descritor || null, { coreId: conteudo?.core_id || null })
      : resolverVideoDaSemana(competencia, descritor || null, false, { coreId: conteudo?.core_id || null });
    resolver
      .then((r) => { if (alive) setVid(r); })
      .catch(() => { if (alive) setVid({ available: false }); });
    return () => { alive = false; };
  }, [colaboradorAlvo, competencia, descritor, conteudo?.core_id, somenteLeitura]);
  const videoPronto = !!(vid?.available && vid?.status === 'done' && vid?.bunny_video_id && vid?.bunny_library);
  const videoPreparando = !!(vid?.available && ['processing', 'render_queued', 'rendering'].includes(vid?.status));
  const temVideo = videoPronto || videoPreparando;

  // Formatos: conteúdo do kit (case/texto/audio) + vídeo da célula (quando há).
  const formatos = [...Object.keys(conteudo.formatos_disponiveis || {}).filter((f) => f !== 'video'), ...(temVideo ? ['video'] : [])];
  let ativo = formatoAtivo || conteudo.formato_core;
  if (ativo === 'video' && !temVideo) ativo = formatos[0]; // core era vídeo mas não há → 1º disponível
  const item = conteudo.formatos_disponiveis?.[ativo] || (ativo === conteudo.formato_core ? { url: conteudo.core_url, titulo: conteudo.core_titulo } : null);

  // audio (TTS) e texto/case (PDF) são servidos por ID via rota (gerados sob
  // demanda) — não precisam de URL pré-renderizada. Vídeo usa o embed da célula.
  const fonteId = (item as any)?.id || conteudo.core_id;
  const temFonte = ativo === 'video' ? temVideo : !!(item?.url || fonteId);

  useBunnyTracking(
    videoIframeRef,
    videoPronto && !somenteLeitura ? vid?.colaboradorId : null,
    videoPronto && !somenteLeitura ? vid?.bunny_video_id : null,
    mediaSession,
  );

  // Listener postMessage Bunny → auto-marca conteudo_consumido ao atingir 80%
  useEffect(() => {
    if (ativo !== 'video') return;
    let markedRef = false;
    const handler = (event) => {
      if (!event.origin?.includes('mediadelivery.net')) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        // Bunny player.js envia 'timeupdate' com seconds/duration, ou 'play_finished'
        const pct = data?.progress != null ? Number(data.progress) :
                    (data?.seconds && data?.duration ? data.seconds / data.duration : null);
        // Play iniciado libera o botão "Marcar como realizado"
        if (data?.event === 'play' || data?.event === 'playing' || data?.event === 'play_started') {
          onAbrirConteudo?.();
        }
        if ((pct && pct >= 0.8) || data?.event === 'play_finished' || data?.event === 'ended') {
          if (!markedRef && onAutoConsumido) {
            markedRef = true;
            onAutoConsumido();
          }
        }
      } catch {}
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [ativo, onAutoConsumido]);

  // Embed do vídeo da célula (Bunny) + metaData p/ atribuição de view.
  const embedUrl = (() => {
    if (!videoPronto) return null;
    const base = `https://iframe.mediadelivery.net/embed/${vid.bunny_library}/${vid.bunny_video_id}?autoplay=false&responsive=true`;
    try { const u = new URL(base); u.searchParams.set('metaData', `trilha-${trilhaId}_semana-${semana}`); return u.toString(); } catch { return base; }
  })();

  // Resolve a fonte de um formato qualquer (não só o ativo) — p/ chips clicáveis.
  const fonteDoFormato = (f: string) => {
    if (f === 'video') return { info: null, fid: null, tem: temVideo };
    const info = conteudo.formatos_disponiveis?.[f] || (f === conteudo.formato_core ? { id: conteudo.core_id, url: conteudo.core_url } : null);
    const fid = info?.id || (f === conteudo.formato_core ? conteudo.core_id : null);
    const tem = !!(info?.url || fid);
    return { info, fid, tem };
  };

  // Telemetria: loga qual formato o colab abriu (atribuído à pílula deste descritor).
  const logFormato = (f) => {
    if (somenteLeitura) return;
    registrarEventoTrilha({ trilhaId, semana, pilula, formato: f, tipo: 'formato' }).catch(() => {});
  };

  const abrirFormato = (f: string) => {
    const { tem } = fonteDoFormato(f);
    if (!tem) return;
    setFormatoAtivo(f);
    // Cada abertura de mídia é uma nova sessão. A key abaixo remonta o player,
    // impedindo que vídeo/podcast reaproveite a posição anterior.
    if (f === 'video' || f === 'audio') setMediaSession((current) => current + 1);
    onAbrirConteudo?.();
    logFormato(f);
  };

  // NADA abrível nesta pílula (nenhum formato com fonte e nem vídeo): reporta ao
  // pai — se todas as pílulas estiverem assim, o gate "abra antes de marcar" é
  // insatisfazível e o pai libera o marcar. Espera o vídeo RESOLVER (vid !== null)
  // pra não reportar durante o carregamento.
  const videoResolvido = !competencia || vid !== null;
  const algumAbrivel = formatos.some((f) => fonteDoFormato(f).tem);
  useEffect(() => {
    if (videoResolvido && !algumAbrivel) onSemFonte?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSemFonte muda a cada render do pai
  }, [videoResolvido, algumAbrivel]);

  return (
    <div>
      {/* Todos os formatos permanecem nesta experiência. Na apresentação em
          celular, sair por target=_blank também saía do aparelho simulado. */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[10px] uppercase text-gray-500">{t('content.availableIn')}</span>
        {formatos.map(f => {
          const Icon = FORMAT_ICON[f] || FileText;
          const { tem } = fonteDoFormato(f);
          const base = 'flex items-center gap-1 px-2.5 py-1 rounded text-[11px] transition-colors';
          const cls = `${base} ${f === ativo ? 'bg-brand-600 text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10'} ${!tem ? 'opacity-40 cursor-not-allowed' : ''}`;
          return (
            <button key={f} onClick={() => abrirFormato(f)} disabled={!tem} className={cls}>
              <Icon size={12} /> {f}
            </button>
          );
        })}
      </div>

      {/* Leitores inline: nenhum formato abandona a tela atual. */}
      {!temFonte && (
        <div className="text-sm text-gray-400 italic p-4 rounded bg-white/5 border border-amber-500/20">
          {t('content.preparingFormats')}
        </div>
      )}
      {ativo === 'video' && videoPronto && (
        <div className="aspect-video rounded-lg overflow-hidden bg-black">
          <iframe key={`video-${mediaSession}`} ref={videoIframeRef} src={embedUrl} className="w-full h-full" allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture" allowFullScreen />
          {vid?.isPersonalizado && <p className="text-[10px] text-emerald-400 font-semibold mt-1">· com seu nome</p>}
        </div>
      )}
      {ativo === 'video' && !videoPronto && videoPreparando && (
        <div className="text-sm text-gray-400 italic p-4 rounded bg-white/5 border border-violet-400/20">
          Estamos preparando seu vídeo personalizado — volte em alguns minutos.
        </div>
      )}
      {temFonte && ativo === 'audio' && (
        <audio
          key={`audio-${mediaSession}`}
          controls
          className="w-full"
          src={fonteId
            ? `/api/conteudo/${fonteId}/podcast${somenteLeitura && colaboradorAlvo ? `?colaboradorId=${encodeURIComponent(colaboradorAlvo)}` : ''}`
            : item.url}
          onLoadedMetadata={(event) => { event.currentTarget.currentTime = 0; }}
          onEnded={() => {
            if (!somenteLeitura) registrarEventoTrilha({ trilhaId, semana, pilula, formato: 'audio', tipo: 'audio_fim' }).catch(() => {});
          }}
        />
      )}
      {temFonte && (ativo === 'texto' || ativo === 'case') && (
        <div className="h-[68dvh] min-h-[480px] max-h-[760px] overflow-hidden rounded-xl border border-white/10 bg-white">
          <iframe
            src={fonteId
              ? `/api/conteudo/${encodeURIComponent(fonteId)}/pdf#view=FitH&navpanes=0`
              : `${item.url}#view=FitH&navpanes=0`}
            title={`${ativo}: ${item?.titulo || conteudo.core_titulo || ''}`}
            className="h-full w-full border-0 bg-white"
          />
        </div>
      )}
    </div>
  );
}

function Center({ children }) {
  // Sem fundo próprio — ver o comentário em `temporada/page.tsx`.
  return <div className="min-h-[60vh] flex items-center justify-center text-white">{children}</div>;
}

/**
 * Semana ainda não liberada — a tela que EXPLICA em vez de só negar.
 *
 * Três coisas, nesta ordem, porque é a ordem das perguntas de quem chegou aqui
 * por um link do WhatsApp: (1) o que está acontecendo; (2) por que — a régua da
 * trilha, dita com todas as letras; (3) o que fazer AGORA, com o botão já
 * apontando para a semana que destrava.
 */
function SemanaBloqueada({ acesso, semana, colabId, onIr, t }) {
  const porData = acesso.motivo === 'data';
  const pendente = acesso.semanaPendente;
  const faltam = typeof acesso.turnosFeitos === 'number' && acesso.turnosNecessarios
    ? Math.max(acesso.turnosNecessarios - acesso.turnosFeitos, 1)
    : null;

  return (
    <PageContainer>
      <BackButton href="/dashboard/temporada" />
      {/* `padding` é prop, não className: o default `p-5 md:p-6` continuaria na
          string de classes e o vencedor viraria a ordem do CSS, não a intenção. */}
      <GlassCard className="mt-6" padding="p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <div className="rounded-xl p-2.5 bg-amber-500/10 border border-amber-400/25 flex-shrink-0">
            <Lock size={20} className="text-amber-300" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-white">
              {t('locked.title', { week: semana })}
            </h1>
            <p className="mt-2 text-gray-300 leading-relaxed">
              {porData
                ? t('locked.becauseDate', { date: acesso.liberaEm })
                : t('locked.becausePrevious', { week: pendente })}
            </p>

            {!porData && (
              <>
                <p className="mt-4 text-sm text-gray-400 leading-relaxed">
                  {t('locked.rule')}
                </p>
                <p className="mt-3 text-sm text-amber-200/90 leading-relaxed">
                  {faltam === null
                    ? t('locked.notStarted', { week: pendente })
                    : t('locked.missing', { count: faltam, week: pendente })}
                </p>
                {/* O vídeo é a MESMA explicação do texto acima, para quem não lê —
                    e é aqui que ela precisa estar: esta tela é o destino do link
                    da cadência para quem está atrasado. Hoje é o tutorial da
                    Jornada, cujo passo `evidencias` já narra esta régua.

                    `sectionKey='jornada'` é DELIBERADO: é a chave da lista de
                    semanas, e sendo o mesmo vídeo, quem já assistiu lá não deve
                    vê-lo abrir sozinho outra vez — fica só o botão. Uma chave
                    própria reabriria o modal por cima justamente do texto que diz
                    o que fazer, para quem acabou de bater numa porta fechada. */}
                {CONCLUSAO_VIDEO_ID && (
                  <div className="mt-5">
                    <FirstViewVideo
                      videoId={CONCLUSAO_VIDEO_ID}
                      title={t('locked.videoTitle')}
                      label={t('locked.videoWatch')}
                      sectionKey="jornada"
                      colabId={colabId}
                    />
                  </div>
                )}
                <button
                  onClick={() => onIr(pendente)}
                  className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-500 hover:bg-brand-400 px-5 py-2.5 text-sm font-bold text-white transition"
                >
                  {t('locked.goToWeek', { week: pendente })}
                </button>
              </>
            )}
          </div>
        </div>
      </GlassCard>
    </PageContainer>
  );
}
