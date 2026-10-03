'use client';
import DetalhesTreino from '@/components/simuladores/detalhes-treino';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  CalendarDays,
  ClipboardList,
  MessageCircle,
  Send,
  RotateCcw,
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { fetchAuth } from '@/lib/auth/fetch-auth';
import { PageContainer, PageHero } from '@/components/page-shell';
import { RECEPCAO_SESSAO } from '@/lib/status';
import { NIVEIS, rotuloClassificacao } from '@/lib/recepcao/schema';
import {
  DOMINIOS,
  DOMINIO_PADRAO,
  dominioExiste,
} from '@/lib/recepcao/dominio';
import { humanizarReferencias } from '@/lib/recepcao/texto';
import { registroDaSessao, tituloDoCaso } from '@/lib/recepcao/caso-da-sessao';
import { nivelDaNota } from '@/lib/nivel-regua';
import styles from './treino.module.css';
import MatrizAtendimento from './matriz-relatorio';
import GestaoRecepcao from './gestao';
import VozRecepcao from './voz';
import { posicaoNaConversa } from './relatorio-matriz';

// Fallback para relatórios anteriores à versão 1.0, que não gravavam `nome` na dimensão.
const nomes: Record<string, string> = {
  acolhimento: 'Acolhimento',
  compreensao: 'Compreensão da demanda',
  clareza: 'Clareza e precisão',
  resolucao: 'Resolução',
  procedimentos: 'Procedimentos',
  conducao_conflito: 'Condução sob pressão',
};
const DESFECHOS_CONHECIDOS = [
  'remarcado',
  'encaminhado',
  'orientado',
  'nao_resolvido',
  'inconclusivo',
];

/**
 * Reconsulta automática enquanto o servidor processa (27/09/2026, A-3). A
 * avaliação leva de 2 a 4 minutos e a lease do servidor vence em 330 s: a tela
 * confere a cada 12 s e desiste depois de 6 minutos. Antes, se a rede caísse no
 * meio da avaliação (celular bloqueado, troca de antena), a pessoa lia "Failed to
 * fetch" e a tela não tentava de novo sozinha.
 */
const CONSULTA_MS = 12_000;
const TETO_ESPERA_MS = 360_000;
/** Falha de rede (o `fetch` não chegou a ter resposta), distinta de erro do servidor. */
class ErroDeRede extends Error {}

/**
 * Simulador de atendimento, visão de quem treina. Desde 18/09/2026 a tela não
 * fala de clínica, paciente nem secretária: o segmento vem do caso
 * (`lib/recepcao/dominio.ts`) e a pessoa simulada é chamada pelo nome. Textos
 * nos quatro idiomas (`SimuladorAtendimento`); o conteúdo dos casos segue no
 * idioma em que foi escrito.
 */
export default function TreinoRecepcao({ admin = false }: { admin?: boolean }) {
  const t = useTranslations('SimuladorAtendimento');
  // Aviso de "não altera" comum aos três simuladores (R-119, 03/10/2026).
  const tRelatorio = useTranslations('SimuladoresRelatorio');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const empresaNaUrl = searchParams.get('empresa');
  const [empresas, setEmpresas] = useState<any[]>([]),
    [empresaId, setEmpresaId] = useState('');
  const [dados, setDados] = useState<any>(null),
    [sessao, setSessao] = useState<any>(null);
  const [carregando, setCarregando] = useState(true),
    [ocupado, setOcupado] = useState('');
  const [erro, setErro] = useState(''),
    [input, setInput] = useState('');
  const [podeConfigurar, setPodeConfigurar] = useState(false);
  const [confirmarFim, setConfirmarFim] = useState(false);
  // Trocar de atendimento no meio de uma conversa com respostas pede confirmação.
  const [confirmarOutro, setConfirmarOutro] = useState(false);
  // Páginas seguintes do histórico, carregadas sob demanda (A-5).
  const [maisHistorico, setMaisHistorico] = useState<any[]>([]),
    [paginaHistorico, setPaginaHistorico] = useState(0),
    [temMaisHistorico, setTemMaisHistorico] = useState<boolean | null>(null),
    [carregandoHistorico, setCarregandoHistorico] = useState(false);
  // Espera automática do servidor (A-3): desde quando, se é o relatório, e se o erro é de rede.
  const [esperaDesde, setEsperaDesde] = useState<number | null>(null),
    [esperaRelatorio, setEsperaRelatorio] = useState(false),
    [erroRede, setErroRede] = useState(false);
  const [aba, setAba] = useState<
    'treino' | 'equipe' | 'cenarios' | 'competencias'
  >('treino');
  const [cenarioId, setCenarioId] = useState('');
  const [vozOcupada, setVozOcupada] = useState(false);
  const pending = useRef<{ id: string; texto: string } | null>(null);
  const createId = useRef<string | null>(null),
    createPara = useRef<string | undefined>(undefined),
    seletor = useRef<HTMLSelectElement>(null),
    running = useRef(false),
    generation = useRef(0);
  const fim = useRef<HTMLDivElement>(null);
  const numero = (n: number) =>
    n.toLocaleString(locale, { maximumFractionDigits: 2 });

  async function api(url: string, init?: RequestInit) {
    let res: Response;
    try {
      res = await fetchAuth(url, { ...init, cache: 'no-store' });
    } catch (e) {
      // "Failed to fetch" / "Load failed" são TypeError do navegador, em inglês e sem ação.
      if (e instanceof TypeError) throw new ErroDeRede(t('networkError'));
      throw e;
    }
    // 504 do gateway chega como HTML: sem o catch, a pessoa lia "Unexpected token".
    const body = await res.json().catch(() => null);
    if (!res.ok || !body) throw new Error(body?.error || t('genericError'));
    return body;
  }
  async function carregar(
    id = empresaId,
    sessaoId?: string,
    ticket = generation.current,
  ) {
    const q = new URLSearchParams();
    if (admin && id) q.set('empresaId', id);
    if (sessaoId) q.set('sessaoId', sessaoId);
    const d = await api(`/api/recepcao?${q}`);
    if (ticket !== generation.current) return null;
    setDados(d);
    setSessao(d.sessao);
    // Servidor processando (lease ativa): a tela passa a conferir sozinha.
    if (d.sessao?.processando && !d.sessao.relatorio)
      setEsperaDesde((desde) => desde ?? Date.now());
    // Com um atendimento na tela, o seletor mostra a versão publicada DELE: o
    // registro exato ou, se ele saiu, o mesmo caso no mesmo degrau. Casar só pelo
    // caso levava ao primeiro degrau da lista (27/09/2026, `caso-da-sessao.ts`).
    // Caso que saiu do catálogo não troca a escolha em silêncio: a tela avisa.
    const doCaso = d.sessao ? registroDaSessao(d.cenarios, d.sessao) : null;
    // Mantém a escolha da pessoa; sem escolha, abre no degrau sugerido pelo histórico dela.
    setCenarioId((old) =>
      doCaso
        ? doCaso.id
        : d.cenarios?.some((c: any) => c.id === old)
          ? old
          : (
              d.cenarios?.find((c: any) => c.ficha.nivel === d.nivelSugerido) ||
              d.cenarios?.[0]
            )?.id || '',
    );
    return d;
  }
  // Reconsulta enquanto a sessão está em processamento, com teto; para ao chegar o
  // relatório, ao trocar de sessão e ao desmontar (o `clearInterval` da limpeza).
  useEffect(() => {
    if (!esperaDesde || !sessao?.id || sessao?.relatorio) return;
    const id = sessao.id;
    let vivo = true;
    const timer = setInterval(async () => {
      if (!vivo || running.current) return;
      if (Date.now() - esperaDesde > TETO_ESPERA_MS) {
        setEsperaDesde(null);
        setErroRede(false);
        setErro(t('reportTimeout'));
        return;
      }
      let d: any;
      try {
        d = await carregar(empresaId, id);
      } catch {
        return; // rede ainda fora: tenta no próximo ciclo
      }
      if (!vivo || !d?.sessao || d.sessao.id !== id) return;
      if (d.sessao.relatorio) return; // o efeito seguinte limpa a espera
      if (!d.sessao.processando) {
        // O servidor terminou sem relatório (falhou ou o pedido nem chegou).
        setEsperaDesde(null);
        if (esperaRelatorio) {
          setErroRede(false);
          setErro(t('reportNotFinished'));
        }
      }
    }, CONSULTA_MS);
    return () => {
      vivo = false;
      clearInterval(timer);
    };
  }, [esperaDesde, esperaRelatorio, sessao?.id, !!sessao?.relatorio]);
  useEffect(() => {
    if (!sessao?.relatorio) return;
    setEsperaDesde(null);
    setEsperaRelatorio(false);
    // O relatório chegou: o aviso de queda de rede deixou de valer.
    if (erroRede) {
      setErro('');
      setErroRede(false);
    }
  }, [!!sessao?.relatorio]);
  useEffect(() => {
    let alive = true;
    if (admin) {
      api('/api/recepcao/config')
        .then((d) => {
          if (!alive) return;
          setEmpresas(d.empresas);
          setPodeConfigurar(d.podeConfigurar);
        })
        .catch((e) => {
          if (alive) setErro(e.message);
        })
        .finally(() => {
          if (alive) setCarregando(false);
        });
    }
    return () => {
      alive = false;
      generation.current++;
    };
  }, [admin]);
  useEffect(() => {
    if (admin && empresaNaUrl && empresas.some((e) => e.id === empresaNaUrl))
      setEmpresaId(empresaNaUrl);
  }, [admin, empresaNaUrl, empresas]);
  // Gestor e RH acompanham a equipe e não treinam (17/09/2026): a tela abre na aba da equipe.
  const soAcompanha = !admin && dados?.soAcompanha === true;
  useEffect(() => {
    if (soAcompanha && aba === 'treino') setAba('equipe');
  }, [soAcompanha, aba]);
  useEffect(() => {
    const ticket = ++generation.current;
    setDados(null);
    setSessao(null);
    setInput('');
    pending.current = null;
    createId.current = null;
    setConfirmarFim(false);
    setConfirmarOutro(false);
    setEsperaDesde(null);
    setEsperaRelatorio(false);
    setErroRede(false);
    zerarHistorico();
    setAba('treino');
    setCenarioId('');
    if (admin && !empresaId) return;
    setCarregando(true);
    setErro('');
    carregar(empresaId, undefined, ticket)
      .catch((e) => {
        if (ticket === generation.current) setErro(e.message);
      })
      .finally(() => {
        if (ticket === generation.current) setCarregando(false);
      });
  }, [admin, empresaId]);
  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
  }, [sessao?.historico?.length, ocupado]);

  // `registroId` = a versão exata a iniciar ("Praticar novamente" repete a da tela);
  // sem ele, vale o que está no seletor.
  async function agir(acao: 'iniciar' | 'responder' | 'encerrar', registroId?: string) {
    if (running.current) return;
    const texto = input.trim();
    if (acao === 'responder' && !texto) return;
    const ticket = generation.current;
    running.current = true;
    setOcupado(acao);
    setErro('');
    setErroRede(false);
    setConfirmarFim(false);
    setConfirmarOutro(false);
    const body: any = { acao, ...(admin ? { empresaId } : {}) };
    if (acao === 'iniciar') {
      body.cenarioId = registroId || cenarioId || undefined;
      // A chave de criação é por caso: repetir o MESMO início reaproveita a sessão
      // (retry de rede), e outro caso nunca reusa a chave (o servidor recusaria).
      if (createPara.current !== body.cenarioId) createId.current = null;
      createPara.current = body.cenarioId;
      createId.current ||= crypto.randomUUID();
      body.requestId = createId.current;
    } else {
      body.sessaoId = sessao.id;
      body.revisao = sessao.revisao;
    }
    if (acao === 'responder') {
      if (!pending.current || pending.current.texto !== texto)
        pending.current = { id: crypto.randomUUID(), texto };
      Object.assign(body, { requestId: pending.current.id, mensagem: texto });
    }
    try {
      const d = await api('/api/recepcao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (ticket !== generation.current) return;
      setSessao(d.sessao);
      if (acao === 'responder') {
        setInput('');
        pending.current = null;
      }
      if (acao === 'iniciar') {
        createId.current = null;
        setInput('');
        pending.current = null;
        // A primeira página ganhou um item: as páginas seguintes já lidas ficaram deslocadas.
        zerarHistorico();
      }
      // Atualiza também a lista; falha nesta leitura não transforma um envio salvo em falha.
      await carregar(empresaId, d.sessao.id, ticket).catch(() => {});
    } catch (e: any) {
      if (ticket === generation.current) {
        const rede = e instanceof ErroDeRede;
        setErroRede(rede);
        if (rede && acao === 'encerrar') {
          // A avaliação pode seguir no servidor (lease de 330 s): a tela confere sozinha.
          setErro(t('networkErrorReport'));
          setEsperaRelatorio(true);
          setEsperaDesde(Date.now());
        } else setErro(e.message);
        // Recupera envio que pode ter sido confirmado após a conexão cair. ID pendente é preservado.
        if (sessao?.id)
          await carregar(empresaId, sessao.id, ticket).catch(() => {});
      }
    } finally {
      running.current = false;
      setOcupado('');
    }
  }
  async function configurar(mudanca: {
    habilitado?: boolean;
    dominio?: string;
  }) {
    if (running.current) return;
    const ticket = generation.current;
    running.current = true;
    setOcupado('config');
    setErro('');
    try {
      await api('/api/recepcao/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresaId,
          habilitado: dados.habilitado,
          ...mudanca,
        }),
      });
      await carregar(empresaId, undefined, ticket);
    } catch (e: any) {
      if (ticket === generation.current) setErro(e.message);
    } finally {
      running.current = false;
      setOcupado('');
    }
  }
  function zerarHistorico() {
    setMaisHistorico([]);
    setPaginaHistorico(0);
    setTemMaisHistorico(null);
  }
  async function verMaisHistorico() {
    if (carregandoHistorico) return;
    const ticket = generation.current;
    const pagina = paginaHistorico + 1;
    setCarregandoHistorico(true);
    try {
      const q = new URLSearchParams({ pagina: String(pagina) });
      if (admin && empresaId) q.set('empresaId', empresaId);
      const d = await api(`/api/recepcao?${q}`);
      if (ticket !== generation.current) return;
      setMaisHistorico((atual) => [...atual, ...(d.historico || [])]);
      setPaginaHistorico(pagina);
      setTemMaisHistorico(!!d.temMais);
    } catch (e: any) {
      if (ticket === generation.current) {
        setErroRede(e instanceof ErroDeRede);
        setErro(e.message);
      }
    } finally {
      setCarregandoHistorico(false);
    }
  }
  async function abrirHistorico(id: string) {
    if (running.current) return;
    running.current = true;
    setOcupado('historico');
    setErro('');
    setErroRede(false);
    setInput('');
    pending.current = null;
    setConfirmarFim(false);
    setConfirmarOutro(false);
    // A espera era da sessão anterior; a nova volta a esperar se o servidor a estiver processando.
    setEsperaDesde(null);
    setEsperaRelatorio(false);
    const ticket = ++generation.current;
    try {
      await carregar(empresaId, id, ticket);
    } catch (e: any) {
      if (ticket === generation.current) setErro(e.message);
    } finally {
      running.current = false;
      setOcupado('');
    }
  }
  const ficha =
    sessao?.cenario ||
    dados?.cenarios?.find((c: any) => c.id === cenarioId)?.ficha ||
    dados?.ficha;
  const nomePersona = ficha?.nomePaciente || t('personFallback');
  // Segmento da EMPRESA no cabeçalho; o do CASO decide a régua do relatório (um caso antigo
  // continua lido no segmento em que foi feito, mesmo que a empresa mude de segmento).
  const dominioEmpresa = dominioExiste(dados?.dominio)
    ? dados.dominio
    : DOMINIO_PADRAO;
  // Empresa sem configuração: nenhum segmento foi escolhido (27/09/2026). O motor segue no
  // padrão para o teste administrativo, mas a tela não finge que o padrão foi escolha.
  const segmentoDefinido = dados?.segmentoDefinido !== false;
  const rotuloSegmento = segmentoDefinido
    ? t(`segment_${dominioEmpresa}`)
    : t('segmentUndefined');
  const dominio = dominioExiste(sessao?.cenario?.dominio)
    ? sessao.cenario.dominio
    : dominioExiste(ficha?.dominio)
      ? ficha.dominio
      : dominioEmpresa;
  const relatorio = sessao?.relatorio;
  const resultado = useRef<HTMLElement>(null);
  useEffect(() => {
    if (relatorio) {
      resultado.current?.focus({ preventScroll: true });
      resultado.current?.scrollIntoView({ block: 'start' });
    }
  }, [sessao?.id, !!relatorio]);
  const nivelRotulo = (n?: string | null) =>
    n && (NIVEIS as readonly string[]).includes(n) ? t(`level_${n}`) : null;
  // As oportunidades vêm validadas pelo servidor (mensagem existente, trecho literal).
  // Ancorá-las na conversa mostra ONDE estava o momento, não só o que faltou.
  const momentos = new Map<
    string,
    Array<{ nome: string; classificacao: string }>
  >();
  for (const d of relatorio?.dimensoes || [])
    for (const o of d.oportunidades || [])
      momentos.set(o.mensagemId, [
        ...(momentos.get(o.mensagemId) || []),
        { nome: d.nome || nomes[d.id] || d.id, classificacao: d.classificacao },
      ]);
  const autor = (mensagemId: string) => {
    const p = posicaoNaConversa(sessao?.historico || [], mensagemId);
    if (!p) return nomePersona;
    return p.papel === 'user'
      ? t('yourReply', { n: p.ordem })
      : t('personLine', { n: p.ordem, name: nomePersona });
  };
  // Relatórios gravados antes de 08/09 podem trazer "m11" no texto: vira posição na conversa ao
  // exibir. O texto do relatório é escrito pela IA em português, e a posição segue a mesma língua.
  const h = (texto: string) =>
    humanizarReferencias(
      texto || '',
      sessao?.historico || [],
      nomePersona,
      'voce',
      dominio,
    );
  const travado = !!ocupado || vozOcupada || sessao?.processando;
  const emConversa = sessao && !relatorio;
  // A versão publicada do atendimento na tela; `null` com sessão = o caso saiu do catálogo.
  const registroNaTela = registroDaSessao(dados?.cenarios, sessao);
  const casoRetirado = !!sessao && !registroNaTela;
  function prepararOutro() {
    setSessao(null);
    setInput('');
    setConfirmarFim(false);
    setConfirmarOutro(false);
    setEsperaDesde(null);
    setEsperaRelatorio(false);
    pending.current = null;
    createId.current = null;
  }
  const desfecho = (tipo: string) =>
    DESFECHOS_CONHECIDOS.includes(tipo)
      ? t(`outcome_${tipo}`)
      : tipo.replaceAll('_', ' ');

  return (
    <PageContainer className={styles.root}>
      <PageHero
        showBack={false}
        eyebrow={t('eyebrow', { segment: rotuloSegmento })}
        title={t('title')}
        subtitle={t('subtitle')}
        actions={<span className={styles.piloto}>{t('pilotBadge')}</span>}
      />
      {admin && (
        <section className={styles.admin} aria-label={t('adminArea')}>
          <label>
            {t('company')}
            <select
              value={empresaId}
              disabled={!!ocupado}
              onChange={(e) => setEmpresaId(e.target.value)}
            >
              <option value="">{t('selectCompany')}</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </label>
          {dados && (
            <div>
              <p>{t(dados.habilitado ? 'enabledForTeam' : 'adminOnly')}</p>
              {podeConfigurar && (
                <>
                  <button
                    className={styles.secondary}
                    // Habilitar exige o segmento escolhido (a rota também recusa sem ele).
                    disabled={!!ocupado || (!dados.habilitado && !segmentoDefinido)}
                    onClick={() =>
                      configurar({ habilitado: !dados.habilitado })
                    }
                  >
                    {t(dados.habilitado ? 'disableForTeam' : 'enableForTeam')}
                  </button>
                  {/* Segmento da empresa (18/09/2026): decide os casos que a equipe vê. */}
                  <label className={styles.segmento}>
                    {t('segmentLabel')}
                    <select
                      value={segmentoDefinido ? dominioEmpresa : ''}
                      disabled={!!ocupado}
                      onChange={(e) => configurar({ dominio: e.target.value })}
                    >
                      {!segmentoDefinido && (
                        <option value="" disabled>
                          {t('segmentUndefined')}
                        </option>
                      )}
                      {DOMINIOS.map((d) => (
                        <option key={d.id} value={d.id}>
                          {t(`segment_${d.id}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          )}
          {/* Avisos em linha própria, abaixo dos controles (a linha dos controles não estica). */}
          {dados &&
            (!segmentoDefinido ? (
              <p className={styles.notice} role="status">
                {t('segmentUndefinedNotice', { segment: t(`segment_${dominioEmpresa}`) })}
              </p>
            ) : (
              !dados.cenarios?.length && (
                <p className={styles.notice} role="status">
                  {t('segmentNoCasesNotice', { segment: rotuloSegmento })}
                </p>
              )
            ))}
        </section>
      )}
      {dados && (
        <nav className={styles.tabs} aria-label={t('areas')}>
          {!soAcompanha && (
            <button
              aria-current={aba === 'treino' ? 'page' : undefined}
              disabled={!!ocupado || vozOcupada}
              onClick={() => {
                setAba('treino');
                carregar(empresaId, sessao?.id).catch((e) =>
                  setErro(e.message),
                );
              }}
            >
              {t('tabTraining')}
            </button>
          )}
          {dados.podeEquipe && (
            <button
              aria-current={aba === 'equipe' ? 'page' : undefined}
              disabled={!!ocupado || vozOcupada}
              onClick={() => setAba('equipe')}
            >
              {t('tabTeam')}
            </button>
          )}
          {dados.podeCenarios && (
            <button
              aria-current={aba === 'cenarios' ? 'page' : undefined}
              disabled={!!ocupado || vozOcupada}
              onClick={() => setAba('cenarios')}
            >
              {t('tabCases')}
            </button>
          )}
          {dados.podeCenarios && (
            <button
              aria-current={aba === 'competencias' ? 'page' : undefined}
              disabled={!!ocupado || vozOcupada}
              onClick={() => setAba('competencias')}
            >
              {t('tabCompetencies')}
            </button>
          )}
        </nav>
      )}
      {soAcompanha && !dados.podeEquipe && (
        <div className={styles.empty}>{t('teamUnavailable')}</div>
      )}
      {dados && aba !== 'treino' && !(soAcompanha && !dados.podeEquipe) && (
        <GestaoRecepcao
          key={`${empresaId}-${aba}`}
          empresaId={empresaId || dados.empresaId}
          visao={aba}
          admin={admin}
          dominio={dominioEmpresa}
        />
      )}
      <div hidden={aba !== 'treino'}>
        {erro && (
          <div role="alert" className={styles.error}>
            <AlertCircle size={19} />
            <span>{erro}</span>
            <button
              onClick={() => {
                // Queda de rede: confere de novo o MESMO atendimento (o envio pode ter sido salvo).
                const mesmo = erroRede ? sessao?.id : undefined;
                setErro('');
                setErroRede(false);
                carregar(empresaId, mesmo).catch((e) => {
                  setErroRede(e instanceof ErroDeRede);
                  setErro(e.message);
                });
              }}
              disabled={!!ocupado}
            >
              {t(erroRede ? 'tryAgain' : 'refresh')}
            </button>
          </div>
        )}
        {carregando ? (
          <div role="status" className={styles.empty}>
            <Loader2 className={styles.spin} /> {t('loading')}
          </div>
        ) : !dados ? (
          <div className={styles.empty}>
            {t(admin && !empresaId ? 'selectFirst' : 'unavailable')}
          </div>
        ) : !ficha ? (
          // Segmento sem caso publicado: nada de mostrar um caso de outro segmento.
          <div className={styles.empty}>
            {t('noCases', { segment: rotuloSegmento })}
          </div>
        ) : (
          <>
            <section className={styles.casePicker}>
              <label>
                {t('casePicker')}
                <select
                  ref={seletor}
                  value={cenarioId}
                  // Durante a conversa o caso é o da conversa: trocar o seletor não
                  // mudava nada e deixava a tela dizendo um caso e conversando outro.
                  disabled={travado || !!emConversa}
                  onChange={(e) => {
                    setCenarioId(e.target.value);
                    createId.current = null;
                  }}
                >
                  {[...NIVEIS, undefined].map((n) => {
                    const grupo = (dados.cenarios || []).filter(
                      (c: any) => (c.ficha.nivel || undefined) === n,
                    );
                    return grupo.length ? (
                      <optgroup
                        key={n || 'outros'}
                        label={nivelRotulo(n) || t('otherCases')}
                      >
                        {grupo.map((c: any) => (
                          <option key={c.id} value={c.id}>
                            {/* A versão do caso é informação de quem edita, não de quem treina. */}
                            {admin
                              ? `${c.ficha.titulo} · ${c.versao}`
                              : c.ficha.titulo}
                          </option>
                        ))}
                      </optgroup>
                    ) : null;
                  })}
                </select>
              </label>
              {/* O título inteiro fora do seletor: no celular o <select> cortava o nome do caso. */}
              <p className={styles.casoEscolhido}>
                {[nivelRotulo(ficha.nivel), tituloDoCaso(ficha.titulo, ficha.nivel)]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {sessao && !confirmarOutro && (
                <button
                  className={styles.secondary}
                  disabled={travado}
                  onClick={() =>
                    // Conversa com respostas fica no histórico para retomar: confirma antes.
                    // Sem resposta, o servidor descarta a sessão vazia ao iniciar outra.
                    emConversa && sessao.respostas > 0
                      ? setConfirmarOutro(true)
                      : prepararOutro()
                  }
                >
                  {t('prepareAnother')}
                </button>
              )}
              {confirmarOutro && (
                <div className={styles.confirmar} role="group" aria-label={t('prepareAnother')}>
                  <p>{t('confirmPrepareAnother')}</p>
                  <button className={styles.primary} disabled={travado} onClick={prepararOutro}>
                    {t('prepareAnother')}
                  </button>
                  <button className={styles.link} onClick={() => setConfirmarOutro(false)}>
                    {t('backToConversation')}
                  </button>
                </div>
              )}
              {emConversa && <p className={styles.small}>{t('caseLocked')}</p>}
              <p className={styles.small}>
                {nivelRotulo(dados.nivelSugerido) && (
                  <>
                    {t('suggestedLevel')}{' '}
                    <strong>{nivelRotulo(dados.nivelSugerido)}</strong>.{' '}
                    {/* O porquê da sugestão e se dá para segui-la (27/09/2026): sem isso, quem
                        treinava no Limite lia "Introdução" sem explicação, e a sugestão podia
                        apontar um degrau sem caso publicado. */}
                    {dados.sugestao?.motivo && (
                      <>
                        {t(`suggestionWhy_${dados.sugestao.motivo}`, {
                          base: nivelRotulo(dados.sugestao.base) || '',
                        })}{' '}
                      </>
                    )}
                    {!(dados.cenarios || []).some((c: any) => c.ficha.nivel === dados.nivelSugerido) &&
                      (() => {
                        const disponiveis = NIVEIS.filter((n) =>
                          (dados.cenarios || []).some((c: any) => c.ficha.nivel === n),
                        ).map((n) => nivelRotulo(n));
                        return disponiveis.length ? (
                          <>
                            {t('suggestionUnavailable', { available: disponiveis.join(', ') })}{' '}
                          </>
                        ) : null;
                      })()}
                  </>
                )}
                {t('caseHint')}
              </p>
            </section>
            {relatorio && (
              <section
                ref={resultado}
                tabIndex={-1}
                className={styles.report}
                aria-label={t('report')}
              >
                <header>
                  {/* O relatório começa pelo caso e pelo nível (27/09/2026). Abria pelo
                      desfecho: "Demanda não resolvida" em destaque mesmo com Nível 3, e no
                      Limite sustentar a recusa é o comportamento certo. */}
                  <div>
                    <p className={styles.eyebrow}>{t('reportEyebrow')}</p>
                    <h2>
                      {[nivelRotulo(ficha.nivel), tituloDoCaso(ficha.titulo, ficha.nivel)]
                        .filter(Boolean)
                        .join(' · ')}
                    </h2>
                    {relatorio.competencias && (
                      <p className={styles.nivelGeral}>
                        <span>{t('reportOverall')}</span>
                        {relatorio.nota === null ? (
                          <strong>{t('reportOverallNone')}</strong>
                        ) : (
                          <>
                            <strong>{t('levelShort', { n: nivelDaNota(relatorio.nota) })}</strong>
                            <small>{t('scoreOf4Short', { score: numero(relatorio.nota) })}</small>
                          </>
                        )}
                      </p>
                    )}
                    <div className={styles.desfecho}>
                      <p>
                        <strong>{t('reviewOutcome')}</strong> {desfecho(relatorio.desfecho.tipo)}.{' '}
                        {h(relatorio.desfecho.justificativa)}
                      </p>
                      {nivelRotulo(ficha.nivel) && (
                        <p className={styles.small}>{t(`outcomeReading_${ficha.nivel}`)}</p>
                      )}
                    </div>
                  </div>
                  {/* Com a matriz, a média aparece no relatório por competência. */}
                  {!relatorio.competencias && (
                    <div className={styles.score}>
                      <strong>
                        {relatorio.nota === null ? '—' : numero(relatorio.nota)}
                      </strong>
                      <span>
                        {t('scoreOf4', {
                          coverage: Math.round(
                            relatorio.coberturaPercentual,
                          ).toLocaleString(locale),
                        })}
                      </span>
                    </div>
                  )}
                </header>
                <p className={styles.small}>{tRelatorio('naoAltera')}</p>
                {relatorio.escalaOriginal && (
                  <p className={styles.small}>{t('legacyScale')}</p>
                )}
                {!relatorio.competencias &&
                  relatorio.situacao === 'avaliacao_parcial' && (
                    <p className={styles.notice}>{t('partial')}</p>
                  )}
                {relatorio.ocorrencias.length > 0 && (
                  <div className={styles.error}>
                    <AlertCircle />
                    <div>
                      <strong>{t('criticalTitle')}</strong>
                      {relatorio.ocorrencias.map((o: any, i: number) => (
                        <p key={i}>{h(o.motivo)}</p>
                      ))}
                    </div>
                  </div>
                )}
                <div className={styles.coaching}>
                  <div>
                    <CheckCircle2 size={21} />
                    <h3>{t('whatWorked')}</h3>
                    <p>{h(relatorio.feedback.acerto)}</p>
                  </div>
                  <div>
                    <ArrowRight size={21} />
                    <h3>{t('nextStep')}</h3>
                    <p>{h(relatorio.feedback.melhoria)}</p>
                    <p>{h(relatorio.feedback.novaTentativa)}</p>
                  </div>
                </div>
                {registroNaTela ? (
                  // Repete a versão do relatório na tela, não a que estiver no seletor.
                  <button
                    className={styles.primary}
                    disabled={travado}
                    onClick={() => agir('iniciar', registroNaTela.id)}
                  >
                    <RotateCcw size={18} /> {t('practiceAgain')}
                  </button>
                ) : casoRetirado ? (
                  // Caso retirado do catálogo: nada de trocar por outro em silêncio,
                  // nem de reativar o conteúdo retirado.
                  <div className={styles.notice} role="status">
                    <p>{t('caseRetired')}</p>
                    <button
                      className={styles.secondary}
                      disabled={travado}
                      onClick={() => {
                        prepararOutro();
                        requestAnimationFrame(() => seletor.current?.focus());
                      }}
                    >
                      {t('chooseAnotherCase')}
                    </button>
                  </div>
                ) : null}
                {relatorio.competencias ? (
                  <div className={styles.matriz}>
                    <MatrizAtendimento
                      relatorio={relatorio}
                      historico={sessao.historico}
                      nomePersona={nomePersona}
                      dominio={dominio}
                    />
                  </div>
                ) : (
                  <div className={styles.dimensions}>
                    {relatorio.dimensoes.map((d: any) => (
                      <article key={d.id}>
                        <div>
                          <h3>{d.nome || nomes[d.id] || d.id}</h3>
                          <span>
                            {rotuloClassificacao[d.classificacao] ||
                              d.classificacao}
                          </span>
                        </div>
                        <p>{h(d.justificativa)}</p>
                        {d.evidencias.length > 0 && (
                          <section className={styles.evidencias}>
                            <span>{t('whatYouDid')}</span>
                            {d.evidencias.map((e: any, i: number) => (
                              <blockquote key={i}>“{e.trecho}”</blockquote>
                            ))}
                          </section>
                        )}
                        {d.oportunidades?.length > 0 && (
                          <section className={styles.momentos}>
                            <span>{t('whereOpportunity')}</span>
                            {d.oportunidades.map((o: any, i: number) => (
                              <blockquote
                                key={i}
                                className={styles.oportunidade}
                              >
                                <small>{autor(o.mensagemId)}</small>“{o.trecho}”
                              </blockquote>
                            ))}
                          </section>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}
            <DetalhesTreino
              concluido={!!relatorio}
              titulo={t('trainingDetails')}
            >
              {/* Celular: o cartão de início (antes de iniciar) e a conversa vêm antes da ficha.
                  Antes de iniciar, o cartão já traz situação, objetivo, degrau e procedimentos;
                  o resto da ficha fica recolhido ("Iniciar" estava a 2.337 px de 2.430, 27/09/2026). */}
              <div
                className={`${styles.workspace} ${!relatorio ? styles.chatPrimeiro : ''}`}
              >
                <aside className={styles.ficha} id="ficha-atendimento">
                  <div className={styles.fichaTitle}>
                    <ClipboardList size={23} />
                    <div>
                      <span>{t('caseSheet')}</span>
                      <h2>{ficha.clinica || dados.empresaNome}</h2>
                    </div>
                  </div>
                  <p className={styles.small}>
                    {t('caseSheetNote', { company: dados.empresaNome })}
                  </p>
                  <details open={!!sessao}>
                    <summary>{t('situation')}</summary>
                    <p>{ficha.contexto}</p>
                    {ficha.agora && (
                      <p>
                        <strong>{t('reference')}</strong> {ficha.agora}
                      </p>
                    )}
                    {ficha.consultaAnterior && (
                      <p>
                        <strong>{t('previousBooking')}</strong>{' '}
                        {ficha.consultaAnterior}
                      </p>
                    )}
                  </details>
                  {ficha.alternativas?.length > 0 && (
                    <details open={!!sessao}>
                      <summary>{t('authorizedOptions')}</summary>
                      <div className={styles.slots}>
                        {ficha.alternativas.map((a: any) => (
                          <div key={a.id}>
                            <CalendarDays size={17} />
                            <div>
                              <strong>
                                {a.data} · {a.hora}
                              </strong>
                              <span>{a.profissional}</span>
                              {a.condicao && <small>{a.condicao}</small>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                  {ficha.secoes?.map((sec: any, i: number) => (
                    <details key={i} open={!!sessao}>
                      <summary>{sec.titulo}</summary>
                      <ul>
                        {sec.itens.map((texto: string, j: number) => (
                          <li key={j}>{texto}</li>
                        ))}
                      </ul>
                    </details>
                  ))}
                  {/* A avaliação se apoia nos procedimentos: abertos durante a conversa. */}
                  <details open={!!sessao}>
                    <summary>{t('procedures')}</summary>
                    <ul>
                      {ficha.procedimentos.map((p: string) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </details>
                </aside>
                <section
                  className={styles.conversa}
                  aria-label={t('conversation')}
                >
                  <div className={styles.chatHeader}>
                    <div className={styles.avatar}>
                      {nomePersona.slice(0, 1)}
                    </div>
                    <div>
                      <h2>{sessao ? nomePersona : ficha.titulo}</h2>
                      <p>
                        {nivelRotulo(ficha.nivel)
                          ? `${nivelRotulo(ficha.nivel)} · `
                          : ''}
                        {t(
                          ficha.canal === 'telefone'
                            ? 'channelPhone'
                            : 'channelMessages',
                        )}
                      </p>
                    </div>
                    {sessao && (
                      <span className={styles.count}>
                        {t('replyCount', {
                          n: sessao.respostas,
                          max: ficha.limiteRespostas || 12,
                        })}
                      </span>
                    )}
                    {emConversa && (
                      <a className={styles.linkFicha} href="#ficha-atendimento">
                        {t('seeCaseSheet')}
                      </a>
                    )}
                  </div>
                  {!sessao ? (
                    <div className={styles.start}>
                      <MessageCircle size={38} />
                      <h2>{t('startTitle')}</h2>
                      {/* O essencial para começar, no próprio cartão (o degrau está no cabeçalho acima). */}
                      <div className={styles.startFicha}>
                        <section>
                          <h3>{t('situation')}</h3>
                          <p>{ficha.contexto}</p>
                          {ficha.agora && (
                            <p>
                              <strong>{t('reference')}</strong> {ficha.agora}
                            </p>
                          )}
                        </section>
                        <section>
                          <h3>{t('objective')}</h3>
                          <p>{ficha.objetivo}</p>
                        </section>
                        <details open>
                          <summary>{t('procedures')}</summary>
                          <ul>
                            {ficha.procedimentos.map((p: string) => (
                              <li key={p}>{p}</li>
                            ))}
                          </ul>
                        </details>
                      </div>
                      <button
                        className={styles.primary}
                        onClick={() => agir('iniciar')}
                        disabled={travado}
                      >
                        {ocupado ? t('starting') : t('start')}
                        <ArrowRight size={18} />
                      </button>
                      <p className={styles.small}>
                        {ficha.competencias
                          ?.map((d: any) => d.nome)
                          .join(' · ')}
                      </p>
                      <p className={styles.small}>
                        {t('startMoreInSheet')}{' '}
                        <a className={styles.linkInline} href="#ficha-atendimento">
                          {t('seeCaseSheet')}
                        </a>
                      </p>
                    </div>
                  ) : (
                    <>
                      <div
                        className={styles.messages}
                        role="log"
                        aria-label={t('conversationWith', {
                          name: nomePersona,
                        })}
                        aria-live="polite"
                      >
                        {sessao.historico.map((m: any) => (
                          <article
                            key={m.id}
                            className={
                              m.role === 'user' ? styles.sent : styles.received
                            }
                          >
                            <span>
                              {m.role === 'user' ? t('you') : nomePersona}
                            </span>
                            <p>{m.content}</p>
                            {momentos.has(m.id) && (
                              <footer
                                className={styles.momento}
                                aria-label={t('opportunityHere')}
                              >
                                <span>{t('opportunity')}</span>
                                {/* Com 30 descritores, a fala de abertura pode ancorar dezenas: a lista vai ao relatório. */}
                                {momentos
                                  .get(m.id)!
                                  .slice(0, 5)
                                  .map((x, i) => (
                                    <em
                                      key={i}
                                      className={styles[`c_${x.classificacao}`]}
                                    >
                                      {x.nome}
                                    </em>
                                  ))}
                                {momentos.get(m.id)!.length > 5 && (
                                  <em>
                                    {t('moreOpportunities', {
                                      n: momentos.get(m.id)!.length - 5,
                                    })}
                                  </em>
                                )}
                              </footer>
                            )}
                          </article>
                        ))}
                        {ocupado === 'responder' && (
                          <p className={styles.waiting}>
                            <Loader2 size={15} className={styles.spin} />{' '}
                            {t('personTyping', { name: nomePersona })}
                          </p>
                        )}
                        <div ref={fim} />
                      </div>
                      {emConversa && (
                        <div className={styles.composer}>
                          {sessao.status === RECEPCAO_SESSAO.EM_ANDAMENTO && (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                agir('responder');
                              }}
                            >
                              <label
                                className={styles.srOnly}
                                htmlFor="recepcao-mensagem"
                              >
                                {t('replyLabel', { name: nomePersona })}
                              </label>
                              <textarea
                                id="recepcao-mensagem"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                disabled={travado}
                                maxLength={4000}
                                placeholder={t('replyPlaceholder', {
                                  name: nomePersona,
                                })}
                                rows={3}
                              />
                              <button
                                className={styles.send}
                                type="submit"
                                aria-label={t('send')}
                                disabled={travado || !input.trim()}
                              >
                                <Send size={20} />
                              </button>
                            </form>
                          )}
                          {sessao.status === 'aguardando_avaliacao' && (
                            <p>{t('turnLimit')}</p>
                          )}
                          {sessao.processando && (
                            <p role="status">
                              {/* Diz o que está em processamento: com o relatório, a espera é de minutos. */}
                              {t(
                                esperaRelatorio ||
                                  sessao.status === RECEPCAO_SESSAO.AGUARDANDO_AVALIACAO
                                  ? 'processingReport'
                                  : 'processing',
                              )}{' '}
                              <button
                                className={styles.link}
                                onClick={() =>
                                  carregar(empresaId, sessao.id).catch((e) =>
                                    setErro(e.message),
                                  )
                                }
                              >
                                {t('refreshConversation')}
                              </button>
                            </p>
                          )}
                          <VozRecepcao
                            key={sessao.id}
                            sessao={sessao}
                            nomePersona={nomePersona}
                            empresaId={admin ? empresaId : undefined}
                            disabled={travado}
                            onOcupado={setVozOcupada}
                            onTexto={(texto) =>
                              setInput((atual) =>
                                atual.trim() ? `${atual}\n${texto}` : texto,
                              )
                            }
                          />
                          <div className={styles.finish}>
                            <small>{t('fictitious')}</small>
                            {!confirmarFim ? (
                              <button
                                className={styles.secondary}
                                disabled={travado || !sessao.respostas}
                                onClick={() => setConfirmarFim(true)}
                              >
                                {t('finish')}
                              </button>
                            ) : (
                              <div>
                                <span>{t('confirmFinish')}</span>
                                <button
                                  className={styles.primary}
                                  disabled={travado}
                                  onClick={() => agir('encerrar')}
                                >
                                  {t('generateReport')}
                                </button>
                                <button
                                  className={styles.link}
                                  onClick={() => setConfirmarFim(false)}
                                >
                                  {t('continue')}
                                </button>
                              </div>
                            )}
                          </div>
                          {ocupado === 'encerrar' && (
                            <p role="status" className={styles.waiting}>
                              <Loader2 className={styles.spin} size={16} />{' '}
                              {t('analyzing')}
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </section>
              </div>
            </DetalhesTreino>
            {dados.evolucao && (
              <section
                className={styles.evolucao}
                aria-labelledby="atendimento-evolucao"
              >
                <h2 id="atendimento-evolucao">{t('evolutionTitle')}</h2>
                <p className={styles.small}>{t('evolutionHelp')}</p>
                <ul>
                  {dados.evolucao.competencias.map((c: any) => (
                    <li key={c.codigo}>
                      <span>{dados.evolucao.nomes[c.codigo] || c.codigo}</span>
                      <strong>
                        {c.nivelAlcancado === null
                          ? t('teamNoLevel')
                          : t('levelShort', { n: c.nivelAlcancado })}
                        {c.subiu && <small>{t('teamLevelUp')}</small>}
                      </strong>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {(() => {
              // Histórico em páginas de 20 (27/09/2026): a primeira vem com a tela, as
              // outras em "Ver atendimentos anteriores". Os atendimentos abertos COM
              // resposta que não estão nas páginas lidas ficam num bloco próprio, para
              // retomar: antes sumiam da tela depois de 20 inícios.
              const vistos: any[] = [];
              for (const item of [...(dados.historico || []), ...maisHistorico])
                if (!vistos.some((v) => v.id === item.id)) vistos.push(item);
              const abertosFora = (dados.abertos || []).filter(
                (a: any) => !vistos.some((v) => v.id === a.id),
              );
              const temMais = temMaisHistorico ?? !!dados.historicoTemMais;
              const botao = (item: any) => (
                <button
                  key={item.id}
                  disabled={travado}
                  onClick={() => abrirHistorico(item.id)}
                  aria-current={sessao?.id === item.id ? 'true' : undefined}
                >
                  <span>{item.titulo}</span>
                  <span>{new Date(item.data).toLocaleString(locale)}</span>
                  <strong>
                    {item.status === RECEPCAO_SESSAO.CONCLUIDA
                      ? [
                          item.nota === null
                            ? t('noScore')
                            : t('historyScore', {
                                score: numero(item.nota),
                              }),
                          item.escalaOriginal ? t('historyLegacy') : null,
                          item.situacao === 'atencao_critica'
                            ? t('historyAttention')
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : t('resume')}
                  </strong>
                </button>
              );
              return (
                <>
                  {abertosFora.length > 0 && (
                    <section className={styles.history} aria-labelledby="atendimento-abertos">
                      <h2 id="atendimento-abertos">{t('openSessions')}</h2>
                      <div>{abertosFora.map(botao)}</div>
                    </section>
                  )}
                  {vistos.length > 0 && (
                    <section className={styles.history} aria-labelledby="atendimento-historico">
                      <h2 id="atendimento-historico">{t('history')}</h2>
                      <div>{vistos.map(botao)}</div>
                    </section>
                  )}
                  {temMais && (
                    <div className={styles.historyMore}>
                      <button
                        className={styles.secondary}
                        disabled={travado || carregandoHistorico}
                        onClick={verMaisHistorico}
                      >
                        {carregandoHistorico ? t('loadingMore') : t('historyMore')}
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          </>
        )}
      </div>
    </PageContainer>
  );
}
