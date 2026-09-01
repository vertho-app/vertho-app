'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Activity,
  Briefcase,
  Building2,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  MessageCircle,
  MonitorPlay,
  RefreshCw,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import BackButton from '@/components/back-button';
import { useConfirm } from '@/components/admin/confirm-dialog';
import {
  listarConvidadosDemo,
  prepararExperienciaProspectAcme,
  prepararSalaApresentacaoDemo,
  resetarDemo,
} from '@/actions/demo';
import { launchDemoPresentationAccess } from '@/lib/demo/presentation';
import {
  papeisDaDegustacao,
  DEMO_PROSPECT_TENANTS,
  type DemoProspectTenantSlug,
  buildAcmeProspectShareText,
  getAcmeProspectExperienceSteps,
  type AcmeProspectExperienceAccess,
  type AcmeProspectRoleKey,
  type DemoGuestProgress,
} from '@/lib/demo/acme-prospect-config';

type TenantSlug = 'acme-demo' | 'gruposinal' | 'escolas-acme';

type PresentationLinkDemo = {
  roleKey: 'usuario' | 'gestor' | 'rh';
  visao: string;
  nome: string;
  email: string;
  url: string;
  directUrl: string;
};

type ProspectForm = {
  nome: string;
  empresa: string;
  whatsapp: string;
  roleKey: AcmeProspectRoleKey;
};

type ProspectAccessView = AcmeProspectExperienceAccess & {
  whatsapp: string;
  views: PresentationLinkDemo[];
};

/**
 * Os ambientes que têm sala ao vivo. O card abre a visão de QUEM PARTICIPA em
 * cada um; as outras duas visões continuam preparadas no mesmo carregamento, e
 * a troca de função acontece por dentro, no seletor "Visão apresentada" — que é
 * o que este card duplicava antes, enquanto deixava a escolha do ambiente de
 * fora (a única coisa que o seletor de lá não faz).
 */
const PRESENTATION_ROOMS = [
  { slug: 'acme-demo' as const, nome: 'ACME Demo' },
  { slug: 'escolas-acme' as const, nome: 'Rede de Escolas ACME' },
];

const VISAO_DE_ENTRADA = 'usuario' as const;

const EMPTY_PROSPECT_FORM: ProspectForm = {
  nome: '',
  empresa: '',
  whatsapp: '',
  roleKey: 'representante-comercial',
};

const inputClass = 'w-full rounded-lg border border-white/10 bg-[#081523]/80 px-3 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-white/20 focus:border-emerald-300/45 focus:ring-2 focus:ring-emerald-300/10';

/**
 * `oculto` tira o ambiente do SELETOR, não do produto.
 *
 * O tenant continua existindo por inteiro — reset, hosts, convidados e o
 * acompanhamento seguem funcionando —, ele só deixa de ocupar espaço numa tela
 * que é usada às pressas, antes de uma conversa comercial. Voltar é apagar a
 * linha `oculto`.
 *
 * ⚠️ O acompanhamento é POR AMBIENTE: ambiente fora do seletor é ambiente cujos
 * convidados ninguém vê. Só oculte o que não está com gente em experiência.
 */
const TENANTS: Record<TenantSlug, { nome: string; descricao: string; oculto?: boolean }> = {
  'acme-demo': {
    nome: 'ACME Demo',
    descricao: 'Ambiente genérico compartilhado pelo time comercial',
  },
  'escolas-acme': {
    nome: 'Rede de Escolas ACME',
    descricao: 'Rede de ensino com três unidades, para conversas do segmento educacional',
  },
  gruposinal: {
    nome: 'Grupo Sinal',
    descricao: 'Demonstração contextualizada para a oportunidade comercial',
    // Oculto a pedido do dono em 01/09/2026. Já tinha saído da sala de
    // apresentação (`PRESENTATION_ROOMS`); o card era o que restava dele aqui.
    oculto: true,
  },
};

const TENANTS_VISIVEIS = (Object.keys(TENANTS) as TenantSlug[]).filter((slug) => !TENANTS[slug].oculto);

/**
 * Ambientes que oferecem DEGUSTAÇÃO. Sai da allowlist do servidor
 * (`DEMO_PROSPECT_TENANTS`), não de uma segunda lista escrita aqui: a tela
 * ofereceria um ambiente que a action recusa, e o vendedor descobriria isso
 * com o prospect esperando.
 */
const AMBIENTES_DEGUSTACAO = (Object.keys(DEMO_PROSPECT_TENANTS) as DemoProspectTenantSlug[])
  .filter((slug) => !TENANTS[slug as TenantSlug]?.oculto);

export default function AdminDemoPage() {
  const confirmDialog = useConfirm();
  const [tenantSlug, setTenantSlug] = useState<TenantSlug>('acme-demo');
  const [busy, setBusy] = useState(false);
  const [ultimo, setUltimo] = useState<Record<string, number | null> | null>(null);
  const [presentationLinks, setPresentationLinks] = useState<Record<string, PresentationLinkDemo[]>>({});
  const [preparandoApresentacao, setPreparandoApresentacao] = useState(true);
  const [presentationError, setPresentationError] = useState<string | null>(null);
  const [presentationOpened, setPresentationOpened] = useState<Set<string>>(new Set());
  const presentationAutoRequested = useRef(false);
  const [prospectForm, setProspectForm] = useState<ProspectForm>(EMPTY_PROSPECT_FORM);
  const [prospectAccess, setProspectAccess] = useState<ProspectAccessView | null>(null);
  const [preparandoProspect, setPreparandoProspect] = useState(false);
  const [convidados, setConvidados] = useState<DemoGuestProgress[]>([]);
  const [carregandoProgress, setCarregandoProgress] = useState(true);
  const [progressUpdatedAt, setProgressUpdatedAt] = useState<Date | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  // Ambiente da DEGUSTAÇÃO: independente do ambiente selecionado lá em cima,
  // que é o alvo do reset. Amarrar os dois faria a escolha do que recriar mudar
  // em que ambiente o prospect entra — duas decisões diferentes, um controle só.
  const [degustacaoSlug, setDegustacaoSlug] = useState<DemoProspectTenantSlug>('acme-demo');
  const papeis = papeisDaDegustacao(degustacaoSlug);
  // Vem do SERVIDOR junto com a lista: `resetPausadoAte` mora no módulo do
  // reset, que carrega fixture e client service-role — importá-lo aqui o
  // arrastaria inteiro para o bundle do browser.
  const [resetPausado, setResetPausado] = useState<string | null>(null);

  const tenant = TENANTS[tenantSlug];

  const disponibilizarApresentacao = useCallback(async (notificar = false) => {
    setPreparandoApresentacao(true);
    setPresentationError(null);
    try {
      // Um ambiente que falha não pode esconder o outro: o vendedor pode estar
      // a caminho de uma reunião do segmento que funcionou.
      const resultados = await Promise.all(PRESENTATION_ROOMS.map(async (sala) => ({
        sala,
        r: await prepararSalaApresentacaoDemo(sala.slug),
      })));
      const acessosPorAmbiente: Record<string, PresentationLinkDemo[]> = {};
      const falhas: string[] = [];
      for (const { sala, r } of resultados) {
        if (r.success) acessosPorAmbiente[sala.slug] = r.acessos;
        else falhas.push(`${sala.nome}: ${r.error || 'erro desconhecido'}`);
      }
      setPresentationLinks(acessosPorAmbiente);
      if (falhas.length > 0) {
        const mensagem = falhas.join(' · ');
        setPresentationError(mensagem);
        if (notificar) toast.error(`Falha ao disponibilizar: ${mensagem}`);
        return;
      }
      if (notificar) toast.success('Os ambientes estão disponíveis.');
    } catch (e: any) {
      const mensagem = e?.message || 'erro inesperado';
      setPresentationError(mensagem);
      if (notificar) toast.error(`Falha ao disponibilizar as visões: ${mensagem}`);
    } finally {
      setPreparandoApresentacao(false);
    }
  }, []);

  const carregarAndamento = useCallback(async (options: { silencioso?: boolean } = {}) => {
    if (!options.silencioso) setCarregandoProgress(true);
    try {
      const result = await listarConvidadosDemo(tenantSlug);
      if (!result.success) {
        if (!options.silencioso) toast.error(`Falha ao carregar acompanhamento: ${result.error || 'erro'}`);
        return;
      }
      setConvidados(result.convidados);
      setResetPausado(result.resetPausadoAte ?? null);
      setProgressUpdatedAt(new Date());
    } catch (error: any) {
      if (!options.silencioso) toast.error(`Falha ao carregar acompanhamento: ${error?.message || 'erro'}`);
    } finally {
      setCarregandoProgress(false);
    }
  }, [tenantSlug]);

  // O acompanhamento é POR TENANT: trocar de ambiente troca a lista, senão a
  // tela mostraria os convidados do ACME com o Grupo Sinal selecionado.
  useEffect(() => {
    let active = true;
    setCarregandoProgress(true);
    setConvidados([]);
    void listarConvidadosDemo(tenantSlug)
      .then((result) => {
        if (!active || !result.success) return;
        setConvidados(result.convidados);
        setResetPausado(result.resetPausadoAte ?? null);
        setProgressUpdatedAt(new Date());
      })
      .catch(() => { /* o botão Atualizar permite tentar novamente */ })
      .finally(() => {
        if (active) setCarregandoProgress(false);
      });
    return () => { active = false; };
  }, [tenantSlug]);

  useEffect(() => {
    if (presentationAutoRequested.current) return;
    presentationAutoRequested.current = true;
    void disponibilizarApresentacao();
  }, [disponibilizarApresentacao]);

  function selecionarTenant(slug: TenantSlug) {
    setTenantSlug(slug);
    setUltimo(null);
    setCopiado(null);
  }

  async function resetar() {
    // O reset automático deste ambiente pode estar pausado (ex.: um convidado
    // percorrendo a experiência durante a semana). Quem aperta o botão é o dono
    // do ambiente: a pausa AVISA o que se perde, não recusa — recusar sem
    // caminho de saída na tela seria beco.
    const pausadoAte = resetPausado;
    const ok = await confirmDialog({
      title: `Resetar ${tenant.nome}`,
      message: pausadoAte
        ? `O reset automático deste ambiente está pausado até ${formatProspectExpiry(pausadoAte)}. Recriar agora apaga o que os convidados fizeram até aqui — inclusive DISC, respostas e análises.`
        : `Recriar o ambiente ${tenant.nome} a partir do estado-base? Os dados de demonstração criados neste tenant serão apagados.`,
      severity: 'danger',
      scopeNote: `Só afeta o tenant ${tenantSlug}`,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await resetarDemo(tenantSlug);
      if (r.success) {
        if (r.skipped) {
          toast.info(`Reset adiado: ${r.activeGuests} convidado(s) ainda estão no prazo D+2.`);
          await carregarAndamento({ silencioso: true });
          return;
        }
        setUltimo(r.counts || null);
        if (tenantSlug === 'acme-demo') setProspectAccess(null);
        toast.success(`${tenant.nome} foi recriado.`);
      } else {
        toast.error(`Falha ao resetar: ${r.error || 'erro'}`);
      }
    } catch (e: any) {
      toast.error(`Erro: ${e?.message || 'inesperado'}`);
    } finally {
      setBusy(false);
    }
  }

  function selecionarAmbienteDegustacao(slug: DemoProspectTenantSlug) {
    if (slug === degustacaoSlug) return;
    setDegustacaoSlug(slug);
    // O papel pertence ao ELENCO do ambiente: manter a escolha anterior levaria
    // um cargo comercial para um roteiro escolar, e o cargo é o que a etapa 01
    // usa para achar o Top 5 e o cenário.
    setProspectForm((atual) => ({ ...atual, roleKey: papeisDaDegustacao(slug)[0].key }));
    setProspectAccess(null);
  }

  function marcarVisaoAberta(roleKey: string) {
    setPresentationOpened((atuais) => new Set(atuais).add(roleKey));
  }

  function abrirVisaoApresentacao(acesso: PresentationLinkDemo, slug: string) {
    // A marca é por (ambiente, papel): dois ambientes têm o mesmo `roleKey`, e
    // uma chave só faria o segundo pular o callback — abrindo a URL direta sem
    // sessão criada, que cai no login.
    const chave = `${slug}:${acesso.roleKey}`;
    const jaPreparada = presentationOpened.has(chave);
    // Captura o destino ANTES de atualizar o estado. Quando isto era um <a>, o
    // setState do onClick trocava o href para `directUrl` antes da ação default
    // do navegador; a aba pulava o callback, não criava sessão e caía no login.
    launchDemoPresentationAccess(
      { authUrl: acesso.url, directUrl: acesso.directUrl, prepared: jaPreparada },
      (destino) => { window.open(destino, '_blank', 'noopener,noreferrer'); },
      () => marcarVisaoAberta(chave),
    );
  }

  function updateProspectForm<K extends keyof ProspectForm>(key: K, value: ProspectForm[K]) {
    setProspectForm((current) => ({ ...current, [key]: value }));
  }

  async function prepararProspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const whatsappDigits = prospectForm.whatsapp.replace(/\D/g, '');
    if (whatsappDigits && whatsappDigits.length < 10) {
      toast.error('Informe um WhatsApp com DDD.');
      return;
    }

    setPreparandoProspect(true);
    setProspectAccess(null);
    try {
      const r = await prepararExperienciaProspectAcme({
        nome: prospectForm.nome,
        empresa: prospectForm.empresa,
        roleKey: prospectForm.roleKey,
      }, degustacaoSlug);
      if (!r.success) {
        toast.error(`Falha ao preparar experiência: ${r.error || 'erro'}`);
        return;
      }
      setProspectAccess({
        ...r.acesso,
        whatsapp: prospectForm.whatsapp.trim(),
        views: r.visoes,
      });
      await carregarAndamento({ silencioso: true });
      toast.success('Roteiro com as quatro perspectivas criado.');
    } catch (e: any) {
      toast.error(`Erro: ${e?.message || 'inesperado'}`);
    } finally {
      setPreparandoProspect(false);
    }
  }

  function mensagemProspect(acesso: ProspectAccessView) {
    return buildAcmeProspectShareText(acesso);
  }

  function compartilharProspectWhatsapp(acesso: ProspectAccessView) {
    let digits = acesso.whatsapp.replace(/\D/g, '');
    if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
    const target = digits ? `https://wa.me/${digits}` : 'https://wa.me/';
    window.open(`${target}?text=${encodeURIComponent(mensagemProspect(acesso))}`, '_blank', 'noopener,noreferrer');
  }

  function formatProspectExpiry(value: string) {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  function formatProspectEvent(value: string | null) {
    if (!value) return 'Aguardando';
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  async function copiar(texto: string, chave: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(chave);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      toast.error('Não foi possível copiar.');
    }
  }

  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 sm:px-6">
      <BackButton href="/admin/dashboard" />

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#0d1726]">
        <div className="border-b border-white/10 bg-[linear-gradient(120deg,rgba(34,211,238,0.10),transparent_55%)] p-5 sm:p-6">
          <div className="mb-2 flex items-center gap-2 text-cyan-300">
            <Building2 size={16} aria-hidden="true" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Sala de demonstração</span>
          </div>
          <h1 className="text-xl font-bold text-white">Prepare a experiência do prospect</h1>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-gray-400">
            Escolha o contexto, recomponha os dados e gere entradas de um toque para cada visão.
          </p>
        </div>

        <div className="p-5 sm:p-6">
          <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Tenant de demonstração">
            {TENANTS_VISIVEIS.map((slug) => {
              const item = TENANTS[slug];
              const ativo = tenantSlug === slug;
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() => selecionarTenant(slug)}
                  aria-pressed={ativo}
                  className={`rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${ativo ? 'border-cyan-400/50 bg-cyan-400/[0.08]' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'}`}
                >
                  <span className={`block text-sm font-bold ${ativo ? 'text-cyan-200' : 'text-white'}`}>{item.nome}</span>
                  <span className="mt-1 block text-[10px] leading-relaxed text-gray-500">{item.descricao}</span>
                  <span className="mt-2 block font-mono text-[10px] text-white/35">{slug}.vertho.ai</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
            <p className="text-[11px] leading-relaxed text-amber-200/80">
              E-mails e WhatsApps automáticos continuam bloqueados. Os links abaixo são gerados com segurança e compartilhados por você.
            </p>
          </div>

          {/* Recriar dados é MANUTENÇÃO, não o que se faz antes de uma conversa:
              apagava e recriava o ambiente com o destaque de ação principal,
              logo acima do que o vendedor realmente vem fazer aqui. Vira ação
              discreta — continua a um clique, deixa de convidar ao clique. */}
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={resetar}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-white/50 transition-colors hover:bg-white/[0.07] hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 disabled:opacity-50"
            >
              {busy
                ? <><Loader2 size={13} className="animate-spin" /> Recriando {tenant.nome}…</>
                : <><RefreshCw size={13} /> Recriar dados de {tenant.nome}</>}
            </button>
          </div>

          {ultimo && (
            <div className="mt-4 rounded-xl bg-white/[0.03] p-3">
              <div className="mb-2 flex items-center gap-2 text-emerald-300">
                <ShieldCheck size={14} aria-hidden="true" />
                <p className="text-[10px] font-bold uppercase tracking-widest">Estado recriado</p>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {Object.entries(ultimo).map(([tabela, n]) => (
                  <div key={tabela} className="rounded-lg bg-white/[0.04] p-2 text-center">
                    <p className="text-sm font-bold text-white">{n ?? '—'}</p>
                    <p className="truncate text-[9px] text-gray-500">{tabela}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mora no card do AMBIENTE porque é dele que a lista fala: o
              acompanhamento é por tenant, e ficava no fim da tela, três seções
              abaixo de onde o ambiente é escolhido. Sem fundo próprio e sem
              padding lateral: aqui ele é uma seção do card, não um bloco solto. */}
          <div className="mt-6 border-t border-white/10 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-emerald-300">
                  <Activity size={14} aria-hidden="true" />
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.16em]">Acompanhamento dos clientes</h3>
                </div>
                <p className="mt-1 text-[10px] text-white/35">
                  Quem foi convidado para o {tenant.nome} e até onde chegou. As visões 02–04 só
                  existem no passaporte; quem entrou por cadastro tem acesso e DISC.
                </p>
              </div>
              <button
                type="button"
                onClick={() => carregarAndamento()}
                disabled={carregandoProgress}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-[9px] font-bold text-white/55 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50 disabled:opacity-50"
              >
                <RefreshCw size={11} className={carregandoProgress ? 'animate-spin' : ''} aria-hidden="true" />
                Atualizar andamento
              </button>
            </div>

            {carregandoProgress && convidados.length === 0 ? (
              <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-white/8 bg-black/10 py-7 text-[10px] text-white/35">
                <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Carregando experiências…
              </div>
            ) : convidados.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-center">
                <p className="text-[11px] font-semibold text-white/55">Nenhum convidado no {tenant.nome}</p>
                <p className="mt-1 text-[9px] text-white/30">O primeiro cliente convidado aparecerá aqui com o avanço de cada etapa.</p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {convidados.map((experience) => {
                  const comPassaporte = experience.origem === 'passaporte';
                  const expired = comPassaporte && (
                    Boolean(experience.accessClosedAt)
                    || Date.parse(experience.expiresAt || '') <= (progressUpdatedAt?.getTime() || 0)
                  );
                  // Quem entrou por cadastro não tem as visões 02–04: mostrá-las
                  // como "Aguardando" inventaria uma etapa que ninguém pode cumprir.
                  const milestones = comPassaporte
                    ? [
                      ['Acesso pessoal', experience.personalAccessedAt],
                      ['DISC', experience.discCompletedAt],
                      ['Colaborador', experience.colaboradorAccessedAt],
                      ['Gestor', experience.gestorAccessedAt],
                      ['RH', experience.rhAccessedAt],
                    ] as const
                    : [
                      ['Acesso', experience.personalAccessedAt],
                      ['DISC', experience.discCompletedAt],
                    ] as const;
                  const completed = milestones.filter(([, value]) => Boolean(value)).length;
                  return (
                    <article key={experience.id} className="relative overflow-hidden rounded-xl border border-white/10 bg-[#081523]/85 p-3.5">
                      <span className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-[#0b1928]" aria-hidden="true" />
                      <span className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-[#0b1928]" aria-hidden="true" />
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-[11px] font-bold text-white">{experience.nome}</p>
                            <span className={`rounded-full border px-1.5 py-0.5 font-mono text-[7px] uppercase tracking-wide ${comPassaporte ? 'border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-200/70' : 'border-white/10 bg-white/[0.04] text-white/40'}`}>
                              {comPassaporte ? 'Passaporte' : 'Cadastro'}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[9px] text-white/35">{experience.contexto} · {experience.cargo}</p>
                        </div>
                        <div className="text-right">
                          <span className={`inline-flex rounded-full border px-2 py-1 font-mono text-[8px] uppercase tracking-wide ${expired ? 'border-white/10 bg-white/[0.03] text-white/35' : 'border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-200/75'}`}>
                            {expired ? 'Encerrado' : `${completed}/${milestones.length} concluídos`}
                          </span>
                          <p className="mt-1 font-mono text-[8px] text-white/25">
                            {experience.expiresAt
                              ? `até ${formatProspectExpiry(experience.expiresAt)}`
                              : `desde ${formatProspectExpiry(experience.createdAt)}`}
                          </p>
                        </div>
                      </div>

                      {/* 5 colunas SEMPRE: com duas marcas esticadas na largura toda,
                          o cartão de cadastro não alinha com os de passaporte e a
                          comparação entre pessoas se perde. */}
                      <ol className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-5" aria-label={`Andamento de ${experience.nome}`}>
                        {milestones.map(([label, timestamp], index) => {
                          const done = Boolean(timestamp);
                          return (
                            <li key={label} className={`relative rounded-lg border px-2 py-2 ${done ? 'border-emerald-300/18 bg-emerald-300/[0.045]' : 'border-white/[0.07] bg-white/[0.018]'}`}>
                              <div className="flex items-center gap-1.5">
                                <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ${done ? 'bg-emerald-300 text-[#071923]' : 'border border-white/15 text-white/20'}`}>
                                  {done ? <Check size={9} strokeWidth={3} aria-hidden="true" /> : <span className="font-mono text-[7px]">{index + 1}</span>}
                                </span>
                                <span className={`truncate text-[8px] font-bold ${done ? 'text-emerald-100/80' : 'text-white/35'}`}>{label}</span>
                              </div>
                              <p className={`mt-1.5 font-mono text-[7px] ${done ? 'text-emerald-200/45' : 'text-white/20'}`}>{formatProspectEvent(timestamp)}</p>
                            </li>
                          );
                        })}
                      </ol>
                    </article>
                  );
                })}
              </div>
            )}

            {progressUpdatedAt && (
              <p className="mt-3 text-right font-mono text-[8px] text-white/20">
                Atualizado às {progressUpdatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>

          <div className="my-6 border-t border-white/10" />

          <section className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-[linear-gradient(135deg,rgba(34,211,238,0.08),rgba(255,255,255,0.015)_55%)]">
            <div className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-cyan-300">
                    <MonitorPlay size={15} aria-hidden="true" />
                    <span className="text-[9px] font-bold uppercase tracking-[0.18em]">Apresentação ao vivo</span>
                  </div>
                  <h2 className="text-sm font-bold text-white">Escolha o ambiente e apresente</h2>
                  <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
                    Abre como quem participa da jornada. As visões de liderança e de programa ficam prontas no mesmo ambiente, e a troca de função é por dentro.
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-white/10 bg-black/15 px-2 py-1 font-mono text-[9px] text-white/45">
                  AO VIVO
                </span>
              </div>

              <div className="mt-4" aria-busy={preparandoApresentacao}>
                <div className="grid gap-2 sm:grid-cols-2">
                  {PRESENTATION_ROOMS.map((sala) => {
                    const acessos = presentationLinks[sala.slug];
                    const acesso = acessos?.find((item) => item.roleKey === VISAO_DE_ENTRADA);
                    const aberto = presentationOpened.has(`${sala.slug}:${VISAO_DE_ENTRADA}`);
                    const carregando = preparandoApresentacao && !acesso;
                    return (
                      <button
                        type="button"
                        key={sala.slug}
                        onClick={() => acesso && abrirVisaoApresentacao(acesso, sala.slug)}
                        disabled={!acesso || busy}
                        className="group rounded-xl border border-white/10 bg-[#081523]/75 p-3 text-left transition-colors hover:border-cyan-300/35 hover:bg-[#0b1b2c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:cursor-wait disabled:opacity-65"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-white">{sala.nome}</span>
                          {carregando
                            ? <Loader2 size={13} className="animate-spin text-cyan-300" aria-hidden="true" />
                            : <ExternalLink size={13} className="text-white/35 transition-colors group-hover:text-cyan-300" aria-hidden="true" />}
                        </span>
                        <span className="mt-1 block truncate text-[9px] text-white/40">
                          {acesso ? `${acesso.visao} · ${acesso.nome}` : 'Preparando…'}
                        </span>
                        <span className={`mt-3 flex items-center gap-1.5 text-[9px] font-bold ${aberto ? 'text-emerald-300' : 'text-cyan-300'}`}>
                          {carregando
                            ? 'Disponibilizando acesso…'
                            : aberto
                              ? 'Sessão ativa'
                              : acesso
                                ? 'Abrir esta demo'
                                : 'Acesso indisponível'}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {presentationError && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2">
                    <p className="text-[10px] leading-relaxed text-amber-100/70">
                      Não foi possível liberar as visões automaticamente.
                    </p>
                    <button
                      type="button"
                      onClick={() => void disponibilizarApresentacao(true)}
                      disabled={preparandoApresentacao || busy}
                      className="text-[10px] font-bold text-cyan-300 transition-colors hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:opacity-50"
                    >
                      Tentar novamente
                    </button>
                  </div>
                )}

                <p className="mt-3 text-[10px] leading-relaxed text-gray-500">
                  Os dois ambientes ficam disponíveis automaticamente, cada um com as três visões prontas. Dentro da demo, use “Visão apresentada” para trocar de função sem login e “Dispositivo” para alternar entre Computador e a experiência responsiva de Celular.
                </p>
              </div>
            </div>
          </section>

          <div className="my-6 border-t border-white/10" />

          <section className="overflow-hidden rounded-2xl border border-emerald-300/20 bg-[linear-gradient(145deg,rgba(16,185,129,0.075),rgba(8,21,35,0.72)_52%,rgba(34,211,238,0.04))]">
            <div className="border-b border-dashed border-emerald-200/15 px-4 py-4 sm:px-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-emerald-300">
                    <UserPlus size={15} aria-hidden="true" />
                    <span className="text-[9px] font-bold uppercase tracking-[0.18em]">Degustação individual</span>
                  </div>
                  <h2 className="text-sm font-bold text-white">Crie um roteiro em quatro perspectivas</h2>
                  <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-gray-400">
                    A pessoa começa do zero e depois conhece as visões prontas de colaborador, gestor e RH.
                  </p>
                </div>
                {/* Era um selo fixo dizendo "ACME": informava o ambiente e não
                    deixava trocar, enquanto a degustação passou a existir nos
                    dois. Escolher aqui é o que evita preparar o roteiro no
                    ambiente errado no minuto antes da conversa. */}
                <div className="flex shrink-0 gap-1 rounded-full border border-emerald-300/15 bg-black/20 p-1" role="group" aria-label="Ambiente da degustação">
                  {AMBIENTES_DEGUSTACAO.map((slug) => {
                    const ativo = degustacaoSlug === slug;
                    return (
                      <button
                        key={slug}
                        type="button"
                        onClick={() => selecionarAmbienteDegustacao(slug)}
                        aria-pressed={ativo}
                        className={`rounded-full px-2.5 py-1 font-mono text-[9px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50 ${ativo ? 'bg-emerald-300/15 text-emerald-100' : 'text-white/40 hover:text-white/70'}`}
                      >
                        {TENANTS[slug].nome}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-1 sm:grid-cols-4" aria-label="Perspectivas da experiência">
                {[
                  ['01', 'Você'],
                  ['02', 'Colaborador'],
                  ['03', 'Gestor'],
                  ['04', 'RH'],
                ].map(([number, label], index) => (
                  <div key={number} className="relative flex items-center gap-2 rounded-lg bg-black/10 px-2 py-2">
                    <span className="font-mono text-[9px] text-emerald-300/70">{number}</span>
                    <span className="truncate text-[9px] font-semibold text-white/55">{label}</span>
                    {index < 3 && <span className="absolute -right-1 top-1/2 hidden h-px w-2 bg-emerald-200/20 sm:block" aria-hidden="true" />}
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={prepararProspect} className="p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-[10px] font-semibold text-white/55">
                  Nome do prospect
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={100}
                    value={prospectForm.nome}
                    onChange={(event) => updateProspectForm('nome', event.target.value)}
                    placeholder="Ex.: Marina Souza"
                    autoComplete="off"
                    className={`${inputClass} mt-1.5`}
                  />
                </label>
                <label className="block text-[10px] font-semibold text-white/55">
                  Empresa
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={120}
                    value={prospectForm.empresa}
                    onChange={(event) => updateProspectForm('empresa', event.target.value)}
                    placeholder="Ex.: Empresa Horizonte"
                    autoComplete="off"
                    className={`${inputClass} mt-1.5`}
                  />
                </label>
                <label className="block text-[10px] font-semibold text-white/55">
                  WhatsApp do prospect <span className="font-normal text-white/30">(opcional)</span>
                  <div className="relative mt-1.5">
                    <MessageCircle size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/25" aria-hidden="true" />
                    <input
                      type="tel"
                      value={prospectForm.whatsapp}
                      onChange={(event) => updateProspectForm('whatsapp', event.target.value)}
                      placeholder="+55 11 99999-9999"
                      autoComplete="off"
                      className={`${inputClass} pl-9`}
                    />
                  </div>
                </label>
                <label className="block text-[10px] font-semibold text-white/55">
                  Cargo da primeira etapa
                  <div className="relative mt-1.5">
                    <Briefcase size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/25" aria-hidden="true" />
                    <select
                      value={prospectForm.roleKey}
                      onChange={(event) => updateProspectForm('roleKey', event.target.value as AcmeProspectRoleKey)}
                      className={`${inputClass} appearance-none pl-9`}
                    >
                      {papeis.map((role: any) => (
                        <option key={role.key} value={role.key}>{role.label}</option>
                      ))}
                    </select>
                  </div>
                </label>
              </div>

              <div className="mt-3 flex items-start gap-2 text-[9px] leading-relaxed text-white/35">
                <ShieldCheck size={13} className="mt-0.5 shrink-0 text-emerald-300/55" aria-hidden="true" />
                <p>O WhatsApp não é enviado nem armazenado. Nome e empresa ficam no acompanhamento deste roteiro; o compartilhamento continua manual.</p>
              </div>

              <button
                type="submit"
                disabled={preparandoProspect || busy}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 py-3 text-sm font-bold text-[#071923] transition-colors hover:bg-emerald-200 disabled:opacity-50"
              >
                {preparandoProspect
                  ? <><Loader2 size={16} className="animate-spin" /> Preparando o roteiro…</>
                  : <><UserPlus size={16} /> {prospectAccess ? 'Criar um novo passe' : 'Preparar experiência individual'}</>}
              </button>

              {prospectAccess && (
                <div className="relative mt-5 overflow-hidden rounded-xl border border-dashed border-emerald-200/25 bg-[#06131f]/80" aria-live="polite">
                  <span className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-emerald-200/20 bg-[#0d1726]" aria-hidden="true" />
                  <span className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-emerald-200/20 bg-[#0d1726]" aria-hidden="true" />
                  <div className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-emerald-300/65">Roteiro preparado</p>
                        <p className="mt-1 text-sm font-bold text-white">{prospectAccess.nome}</p>
                        <p className="mt-0.5 text-[10px] text-white/40">{prospectAccess.empresa} · {prospectAccess.cargo}</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/[0.035] px-2.5 py-2 text-right">
                        <p className="flex items-center gap-1 font-mono text-[8px] uppercase tracking-wider text-white/30"><Clock size={10} /> Roteiro até</p>
                        <p className="mt-1 font-mono text-[10px] text-emerald-200">{formatProspectExpiry(prospectAccess.expiresAt)}</p>
                      </div>
                    </div>

                    <div className="my-4 border-t border-dashed border-white/10" />

                    <div className="space-y-2" aria-label="Roteiro de experiência do prospect">
                      {getAcmeProspectExperienceSteps(prospectAccess).map((step, index) => {
                        const copyKey = `prospect-step-${prospectAccess.sessionId}-${step.number}`;
                        const isPersonal = index === 0;
                        return (
                          <div
                            key={step.number}
                            className={`flex items-start gap-3 rounded-xl border px-3 py-3 ${isPersonal ? 'border-emerald-300/20 bg-emerald-300/[0.045]' : 'border-cyan-300/15 bg-cyan-300/[0.025]'}`}
                          >
                            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg font-mono text-[9px] font-bold ${isPersonal ? 'bg-emerald-300/[0.12] text-emerald-200' : 'bg-cyan-300/[0.08] text-cyan-200'}`}>
                              {step.number}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[11px] font-bold text-white">{step.title}</span>
                              <span className="mt-0.5 block text-[9px] leading-relaxed text-white/40">{step.description}</span>
                              <span className="mt-1.5 block font-mono text-[8px] uppercase tracking-wide text-white/25">{step.note}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => copiar(step.url, copyKey)}
                              aria-label={`Copiar link: ${step.title}`}
                              className="flex shrink-0 items-center gap-1 rounded-lg bg-white/[0.06] px-2 py-1.5 text-[9px] font-bold text-white/55 hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50"
                            >
                              {copiado === copyKey ? <Check size={11} className="text-emerald-300" /> : <Copy size={11} />}
                              Link
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => copiar(mensagemProspect(prospectAccess), `prospect-text-${prospectAccess.sessionId}`)}
                        className="flex items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2.5 text-[11px] font-bold text-[#071923] hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
                      >
                        {copiado === `prospect-text-${prospectAccess.sessionId}`
                          ? <><Check size={13} className="text-emerald-600" /> Texto copiado</>
                          : <><Copy size={13} /> Copiar texto completo</>}
                      </button>
                      <button
                        type="button"
                        onClick={() => compartilharProspectWhatsapp(prospectAccess)}
                        className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-2.5 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50"
                      >
                        <MessageCircle size={13} /> Abrir no WhatsApp
                      </button>
                    </div>
                    <p className="mt-3 text-[9px] leading-relaxed text-amber-200/65">
                      A etapa 01 usa um link individual de uso único. Depois da entrada, a sessão e as etapas 02–04 ficam disponíveis até as 04h BRT de D+2.
                    </p>
                  </div>
                </div>
              )}
            </form>

          </section>
        </div>
      </div>
    </div>
  );
}
