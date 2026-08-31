'use client';

import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Briefcase,
  Building2,
  Check,
  Clock,
  Copy,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  Mail,
  MessageCircle,
  MonitorPlay,
  RefreshCw,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import BackButton from '@/components/back-button';
import { useConfirm } from '@/components/admin/confirm-dialog';
import {
  gerarMagicLinksTemporariosDemo,
  prepararExperienciaProspectAcme,
  prepararSalaApresentacaoDemo,
  prepararAcessosTemporariosDemo,
  resetarDemo,
} from '@/actions/demo';
import { launchDemoPresentationAccess } from '@/lib/demo/presentation';
import {
  ACME_PROSPECT_ROLES,
  type AcmeProspectExperienceAccess,
  type AcmeProspectRoleKey,
} from '@/lib/demo/acme-prospect-config';

type TenantSlug = 'acme-demo' | 'gruposinal';

type AcessosDemo = {
  url: string;
  senha: string;
  acessos: Array<{ visao: string; nome: string; email: string }>;
};

type MagicLinkDemo = {
  visao: string;
  nome: string;
  email: string;
  url: string;
};

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
  email: string;
  whatsapp: string;
  roleKey: AcmeProspectRoleKey;
};

type ProspectAccessView = AcmeProspectExperienceAccess & {
  contactEmail: string;
  whatsapp: string;
};

const EMPTY_PROSPECT_FORM: ProspectForm = {
  nome: '',
  empresa: '',
  email: '',
  whatsapp: '',
  roleKey: 'representante-comercial',
};

const inputClass = 'w-full rounded-lg border border-white/10 bg-[#081523]/80 px-3 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-white/20 focus:border-emerald-300/45 focus:ring-2 focus:ring-emerald-300/10';

const TENANTS: Record<TenantSlug, { nome: string; descricao: string }> = {
  'acme-demo': {
    nome: 'ACME Demo',
    descricao: 'Ambiente genérico compartilhado pelo time comercial',
  },
  gruposinal: {
    nome: 'Grupo Sinal',
    descricao: 'Demonstração contextualizada para a oportunidade comercial',
  },
};

export default function AdminDemoPage() {
  const confirmDialog = useConfirm();
  const [tenantSlug, setTenantSlug] = useState<TenantSlug>('acme-demo');
  const [busy, setBusy] = useState(false);
  const [ultimo, setUltimo] = useState<Record<string, number | null> | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [gerandoLinks, setGerandoLinks] = useState(false);
  const [credenciais, setCredenciais] = useState<AcessosDemo | null>(null);
  const [magicLinks, setMagicLinks] = useState<MagicLinkDemo[] | null>(null);
  const [presentationLinks, setPresentationLinks] = useState<PresentationLinkDemo[] | null>(null);
  const [preparandoApresentacao, setPreparandoApresentacao] = useState(false);
  const [presentationOpened, setPresentationOpened] = useState<Set<string>>(new Set());
  const [prospectForm, setProspectForm] = useState<ProspectForm>(EMPTY_PROSPECT_FORM);
  const [prospectAccess, setProspectAccess] = useState<ProspectAccessView | null>(null);
  const [preparandoProspect, setPreparandoProspect] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  const tenant = TENANTS[tenantSlug];

  function selecionarTenant(slug: TenantSlug) {
    setTenantSlug(slug);
    setUltimo(null);
    setCredenciais(null);
    setMagicLinks(null);
    setCopiado(null);
  }

  async function resetar() {
    const ok = await confirmDialog({
      title: `Resetar ${tenant.nome}`,
      message: `Recriar o ambiente ${tenant.nome} a partir do estado-base? Os dados de demonstração criados neste tenant serão apagados.`,
      severity: 'danger',
      scopeNote: `Só afeta o tenant ${tenantSlug}`,
    });
    if (!ok) return;
    setBusy(true);
    setMagicLinks(null);
    setCredenciais(null);
    try {
      const r = await resetarDemo(tenantSlug);
      if (r.success) {
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

  async function gerarLinks() {
    setGerandoLinks(true);
    setMagicLinks(null);
    try {
      const r = await gerarMagicLinksTemporariosDemo(tenantSlug);
      if (!r.success) {
        toast.error(`Falha ao gerar links: ${r.error || 'erro'}`);
        return;
      }
      setMagicLinks(r.acessos);
      toast.success('Links de entrada gerados.');
    } catch (e: any) {
      toast.error(`Erro: ${e?.message || 'inesperado'}`);
    } finally {
      setGerandoLinks(false);
    }
  }

  async function prepararAcessos() {
    const ok = await confirmDialog({
      title: 'Gerar senha de contingência',
      message: 'Criar uma nova senha compartilhada para Participante, Liderança e RH? A senha anterior deixará de funcionar.',
      severity: 'normal',
      scopeNote: `Só altera as três contas do tenant ${tenantSlug}`,
    });
    if (!ok) return;
    setPreparando(true);
    setCredenciais(null);
    try {
      const r = await prepararAcessosTemporariosDemo(tenantSlug);
      if (!r.success) {
        toast.error(`Falha ao preparar acessos: ${r.error || 'erro'}`);
        return;
      }
      setCredenciais({ url: r.url, senha: r.senha, acessos: r.acessos });
      toast.success('Senha de contingência preparada.');
    } catch (e: any) {
      toast.error(`Erro: ${e?.message || 'inesperado'}`);
    } finally {
      setPreparando(false);
    }
  }

  async function prepararApresentacao() {
    setPreparandoApresentacao(true);
    setPresentationLinks(null);
    setPresentationOpened(new Set());
    try {
      const r = await prepararSalaApresentacaoDemo();
      if (!r.success) {
        toast.error(`Falha ao preparar apresentação: ${r.error || 'erro'}`);
        return;
      }
      setPresentationLinks(r.acessos);
      toast.success('As três visões estão prontas para abrir.');
    } catch (e: any) {
      toast.error(`Erro: ${e?.message || 'inesperado'}`);
    } finally {
      setPreparandoApresentacao(false);
    }
  }

  function marcarVisaoAberta(roleKey: string) {
    setPresentationOpened((atuais) => new Set(atuais).add(roleKey));
  }

  function abrirVisaoApresentacao(acesso: PresentationLinkDemo) {
    const jaPreparada = presentationOpened.has(acesso.roleKey);
    // Captura o destino ANTES de atualizar o estado. Quando isto era um <a>, o
    // setState do onClick trocava o href para `directUrl` antes da ação default
    // do navegador; a aba pulava o callback, não criava sessão e caía no login.
    launchDemoPresentationAccess(
      { authUrl: acesso.url, directUrl: acesso.directUrl, prepared: jaPreparada },
      (destino) => { window.open(destino, '_blank', 'noopener,noreferrer'); },
      () => marcarVisaoAberta(acesso.roleKey),
    );
  }

  function updateProspectForm<K extends keyof ProspectForm>(key: K, value: ProspectForm[K]) {
    setProspectForm((current) => ({ ...current, [key]: value }));
  }

  async function prepararProspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = prospectForm.email.trim();
    const whatsappDigits = prospectForm.whatsapp.replace(/\D/g, '');
    if (!email && !whatsappDigits) {
      toast.error('Informe um e-mail ou WhatsApp para compartilhar o acesso.');
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Informe um e-mail válido.');
      return;
    }
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
      });
      if (!r.success) {
        toast.error(`Falha ao preparar experiência: ${r.error || 'erro'}`);
        return;
      }
      setProspectAccess({
        ...r.acesso,
        contactEmail: email,
        whatsapp: prospectForm.whatsapp.trim(),
      });
      toast.success('Passe temporário criado. Agora compartilhe o link sem abri-lo.');
    } catch (e: any) {
      toast.error(`Erro: ${e?.message || 'inesperado'}`);
    } finally {
      setPreparandoProspect(false);
    }
  }

  function mensagemProspect(acesso: ProspectAccessView) {
    return [
      `Olá, ${acesso.nome.split(' ')[0]}!`,
      '',
      `Preparei uma experiência da Vertho para você, em um ambiente neutro de demonstração para a ${acesso.empresa}.`,
      `Você começará como ${acesso.cargo} e poderá percorrer o mapeamento comportamental desde o início.`,
      '',
      'Toque no link para entrar — não precisa de senha:',
      acesso.url,
      '',
      'O link é individual e funciona uma única vez.',
    ].join('\n');
  }

  function compartilharProspectWhatsapp(acesso: ProspectAccessView) {
    let digits = acesso.whatsapp.replace(/\D/g, '');
    if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
    const target = digits ? `https://wa.me/${digits}` : 'https://wa.me/';
    window.open(`${target}?text=${encodeURIComponent(mensagemProspect(acesso))}`, '_blank', 'noopener,noreferrer');
  }

  function compartilharProspectEmail(acesso: ProspectAccessView) {
    const subject = 'Sua experiência Vertho está pronta';
    window.location.href = `mailto:${encodeURIComponent(acesso.contactEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mensagemProspect(acesso))}`;
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

  async function copiar(texto: string, chave: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(chave);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      toast.error('Não foi possível copiar.');
    }
  }

  function compartilharNoWhatsapp(acesso: MagicLinkDemo) {
    const mensagem = [
      `Olá! Este é o seu acesso à demonstração da Vertho para o ${tenant.nome}.`,
      `Visão: ${acesso.visao}`,
      'Basta tocar no link para entrar — não precisa de senha:',
      acesso.url,
    ].join('\n');
    window.open(`https://wa.me/?text=${encodeURIComponent(mensagem)}`, '_blank', 'noopener,noreferrer');
  }

  async function copiarAcessos() {
    if (!credenciais) return;
    const linhas = [
      `Endereço: ${credenciais.url}`,
      ...credenciais.acessos.map((a) => `${a.visao}: ${a.email}`),
      `Senha temporária: ${credenciais.senha}`,
      '',
      'Para trocar de visão, use Sair e entre com o próximo e-mail.',
    ];
    await copiar(linhas.join('\n'), 'senha');
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
            {(Object.keys(TENANTS) as TenantSlug[]).map((slug) => {
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

          <button
            type="button"
            onClick={resetar}
            disabled={busy || gerandoLinks || preparando}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 py-3 text-sm font-bold text-[#0C1829] hover:bg-cyan-400 disabled:opacity-50"
          >
            {busy ? <><Loader2 size={16} className="animate-spin" /> Recriando {tenant.nome}…</> : <><RefreshCw size={16} /> Recriar dados de {tenant.nome}</>}
          </button>

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

          <div className="my-6 border-t border-white/10" />

          <section className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-[linear-gradient(135deg,rgba(34,211,238,0.08),rgba(255,255,255,0.015)_55%)]">
            <div className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-cyan-300">
                    <MonitorPlay size={15} aria-hidden="true" />
                    <span className="text-[9px] font-bold uppercase tracking-[0.18em]">Apresentação ao vivo</span>
                  </div>
                  <h2 className="text-sm font-bold text-white">Troque de função sem sair da conta</h2>
                  <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
                    Usa o ACME Demo, que tem o mesmo conteúdo-base do Grupo Sinal sem a marca do prospect.
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-white/10 bg-black/15 px-2 py-1 font-mono text-[9px] text-white/45">
                  ACME
                </span>
              </div>

              <button
                type="button"
                onClick={prepararApresentacao}
                disabled={preparandoApresentacao || busy}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-bold text-[#0C1829] transition-colors hover:bg-cyan-50 disabled:opacity-50"
              >
                {preparandoApresentacao
                  ? <><Loader2 size={16} className="animate-spin" /> Preparando as três visões…</>
                  : <><MonitorPlay size={16} /> Preparar apresentação</>}
              </button>

              {presentationLinks && (
                <div className="mt-4">
                  <div className="grid gap-2 sm:grid-cols-3">
                    {presentationLinks.map((acesso) => {
                      const aberto = presentationOpened.has(acesso.roleKey);
                      return (
                        <button
                          type="button"
                          key={acesso.roleKey}
                          onClick={() => abrirVisaoApresentacao(acesso)}
                          className="group rounded-xl border border-white/10 bg-[#081523]/75 p-3 text-left transition-colors hover:border-cyan-300/35 hover:bg-[#0b1b2c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-white">{acesso.visao}</span>
                            <ExternalLink size={13} className="text-white/35 transition-colors group-hover:text-cyan-300" aria-hidden="true" />
                          </span>
                          <span className="mt-1 block truncate text-[9px] text-white/40">{acesso.nome}</span>
                          <span className={`mt-3 block text-[9px] font-bold ${aberto ? 'text-emerald-300' : 'text-cyan-300'}`}>
                            {aberto ? 'Sessão preparada' : 'Abrir esta visão'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-[10px] leading-relaxed text-gray-500">
                    Abra qualquer visão. Use “Visão apresentada” para trocar de função sem login e “Dispositivo” para alternar entre Computador e a experiência responsiva de Celular.
                  </p>
                </div>
              )}
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
                  <h2 className="text-sm font-bold text-white">Crie um passe para o prospect começar do zero</h2>
                  <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-gray-400">
                    A pessoa entra como participante do ACME, faz o próprio mapeamento e não altera os indicadores da sala.
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-emerald-300/20 bg-emerald-300/[0.06] px-2 py-1 font-mono text-[9px] text-emerald-200/70">
                  ACME
                </span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-1" aria-label="Etapas da degustação">
                {[
                  ['01', 'Identifique'],
                  ['02', 'Compartilhe'],
                  ['03', 'Experimente'],
                ].map(([number, label], index) => (
                  <div key={number} className="relative flex items-center gap-2 rounded-lg bg-black/10 px-2 py-2">
                    <span className="font-mono text-[9px] text-emerald-300/70">{number}</span>
                    <span className="truncate text-[9px] font-semibold text-white/55">{label}</span>
                    {index < 2 && <span className="absolute -right-1 top-1/2 h-px w-2 bg-emerald-200/20" aria-hidden="true" />}
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
                  E-mail para compartilhar
                  <div className="relative mt-1.5">
                    <Mail size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/25" aria-hidden="true" />
                    <input
                      type="email"
                      value={prospectForm.email}
                      onChange={(event) => updateProspectForm('email', event.target.value)}
                      placeholder="marina@empresa.com"
                      autoComplete="off"
                      className={`${inputClass} pl-9`}
                    />
                  </div>
                </label>
                <label className="block text-[10px] font-semibold text-white/55">
                  WhatsApp para compartilhar
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
              </div>

              <label className="mt-3 block text-[10px] font-semibold text-white/55">
                Papel demonstrado
                <div className="relative mt-1.5">
                  <Briefcase size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/25" aria-hidden="true" />
                  <select
                    value={prospectForm.roleKey}
                    onChange={(event) => updateProspectForm('roleKey', event.target.value as AcmeProspectRoleKey)}
                    className={`${inputClass} appearance-none pl-9`}
                  >
                    {ACME_PROSPECT_ROLES.map((role) => (
                      <option key={role.key} value={role.key}>{role.label}</option>
                    ))}
                  </select>
                </div>
              </label>

              <div className="mt-3 flex items-start gap-2 text-[9px] leading-relaxed text-white/35">
                <ShieldCheck size={13} className="mt-0.5 shrink-0 text-emerald-300/55" aria-hidden="true" />
                <p>O contato real fica apenas nesta tela. A Vertho não envia nada automaticamente; você escolhe como compartilhar.</p>
              </div>

              <button
                type="submit"
                disabled={preparandoProspect || busy}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 py-3 text-sm font-bold text-[#071923] transition-colors hover:bg-emerald-200 disabled:opacity-50"
              >
                {preparandoProspect
                  ? <><Loader2 size={16} className="animate-spin" /> Criando o passe…</>
                  : <><UserPlus size={16} /> {prospectAccess ? 'Criar um novo passe' : 'Preparar experiência individual'}</>}
              </button>

              {prospectAccess && (
                <div className="relative mt-5 overflow-hidden rounded-xl border border-dashed border-emerald-200/25 bg-[#06131f]/80" aria-live="polite">
                  <span className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-emerald-200/20 bg-[#0d1726]" aria-hidden="true" />
                  <span className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-emerald-200/20 bg-[#0d1726]" aria-hidden="true" />
                  <div className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-emerald-300/65">Passe preparado</p>
                        <p className="mt-1 text-sm font-bold text-white">{prospectAccess.nome}</p>
                        <p className="mt-0.5 text-[10px] text-white/40">{prospectAccess.empresa} · {prospectAccess.cargo}</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/[0.035] px-2.5 py-2 text-right">
                        <p className="flex items-center gap-1 font-mono text-[8px] uppercase tracking-wider text-white/30"><Clock size={10} /> Experiência até</p>
                        <p className="mt-1 font-mono text-[10px] text-emerald-200">{formatProspectExpiry(prospectAccess.expiresAt)}</p>
                      </div>
                    </div>

                    <div className="my-4 border-t border-dashed border-white/10" />

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => copiar(prospectAccess.url, `prospect-${prospectAccess.sessionId}`)}
                        className="flex min-w-[120px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/[0.07] px-3 py-2.5 text-[11px] font-bold text-white/75 hover:bg-white/[0.11]"
                      >
                        {copiado === `prospect-${prospectAccess.sessionId}`
                          ? <><Check size={13} className="text-emerald-300" /> Copiado</>
                          : <><Copy size={13} /> Copiar link</>}
                      </button>
                      {prospectAccess.whatsapp && (
                        <button
                          type="button"
                          onClick={() => compartilharProspectWhatsapp(prospectAccess)}
                          className="flex min-w-[120px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-2.5 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/20"
                        >
                          <MessageCircle size={13} /> WhatsApp
                        </button>
                      )}
                      {prospectAccess.contactEmail && (
                        <button
                          type="button"
                          onClick={() => compartilharProspectEmail(prospectAccess)}
                          className="flex min-w-[120px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-cyan-400/[0.09] px-3 py-2.5 text-[11px] font-bold text-cyan-200 hover:bg-cyan-400/[0.14]"
                        >
                          <Mail size={13} /> E-mail
                        </button>
                      )}
                    </div>
                    <p className="mt-3 text-[9px] leading-relaxed text-amber-200/65">
                      Não abra o link para testar: ele é individual e de uso único. Se for consumido antes do prospect, prepare um novo passe.
                    </p>
                  </div>
                </div>
              )}
            </form>
          </section>

          <div className="my-6 border-t border-white/10" />

          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold text-white">Entrada em um toque</h2>
              <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
                O prospect recebe o link no WhatsApp e entra direto na visão escolhida, sem digitar senha.
              </p>
            </div>
            <Link2 size={18} className="shrink-0 text-cyan-300" aria-hidden="true" />
          </div>

          <button
            type="button"
            onClick={gerarLinks}
            disabled={gerandoLinks || busy}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/[0.08] py-3 text-sm font-bold text-cyan-200 hover:bg-cyan-400/[0.12] disabled:opacity-50"
          >
            {gerandoLinks ? <><Loader2 size={16} className="animate-spin" /> Gerando links…</> : <><Link2 size={16} /> Gerar links de entrada</>}
          </button>

          {magicLinks && (
            <div className="mt-4 space-y-2">
              {magicLinks.map((acesso) => (
                <div key={acesso.email} className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-white">{acesso.visao}</p>
                      <p className="mt-0.5 text-[10px] text-gray-500">{acesso.nome} · link individual e de uso único</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => copiar(acesso.url, acesso.email)}
                      className="flex items-center justify-center gap-1.5 rounded-lg bg-white/[0.06] py-2 text-[11px] font-bold text-white/75 hover:bg-white/[0.1]"
                    >
                      {copiado === acesso.email ? <><Check size={13} className="text-emerald-400" /> Copiado</> : <><Copy size={13} /> Copiar link</>}
                    </button>
                    <button
                      type="button"
                      onClick={() => compartilharNoWhatsapp(acesso)}
                      className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/15 py-2 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/20"
                    >
                      <MessageCircle size={13} /> Enviar no WhatsApp
                    </button>
                  </div>
                </div>
              ))}
              <p className="pt-1 text-[10px] leading-relaxed text-gray-500">
                Gere novos links imediatamente antes de compartilhar. Cada link funciona uma única vez.
              </p>
            </div>
          )}

          <details className="mt-6 rounded-xl border border-white/10 bg-black/10 p-3">
            <summary className="cursor-pointer text-xs font-bold text-white/65">Usar senha como contingência</summary>
            <p className="mt-2 text-[10px] leading-relaxed text-gray-500">
              Rotaciona uma senha única para as três contas. Use apenas se o magic link não puder ser compartilhado.
            </p>
            <button
              type="button"
              onClick={prepararAcessos}
              disabled={preparando || busy}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-white/[0.06] py-2.5 text-xs font-bold text-white/75 hover:bg-white/[0.1] disabled:opacity-50"
            >
              {preparando ? <><Loader2 size={14} className="animate-spin" /> Preparando…</> : <><KeyRound size={14} /> Gerar senha de contingência</>}
            </button>

            {credenciais && (
              <div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04] p-3">
                <div className="space-y-1 text-[10px] text-white/65">
                  <p><span className="text-white/35">Endereço:</span> {credenciais.url}</p>
                  {credenciais.acessos.map((a) => (
                    <p key={a.email}><span className="text-white/35">{a.visao}:</span> {a.email}</p>
                  ))}
                  <p className="pt-1"><span className="text-white/35">Senha:</span> <span className="font-mono text-emerald-300">{credenciais.senha}</span></p>
                </div>
                <button
                  type="button"
                  onClick={copiarAcessos}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-white/[0.06] py-2 text-[11px] font-bold text-white/75 hover:bg-white/[0.1]"
                >
                  {copiado === 'senha' ? <><Check size={13} className="text-emerald-400" /> Copiado</> : <><Copy size={13} /> Copiar credenciais</>}
                </button>
              </div>
            )}
          </details>
        </div>
      </div>
    </div>
  );
}
