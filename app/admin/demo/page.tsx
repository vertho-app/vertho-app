'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Building2,
  Check,
  Copy,
  KeyRound,
  Link2,
  Loader2,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import BackButton from '@/components/back-button';
import { useConfirm } from '@/components/admin/confirm-dialog';
import {
  gerarMagicLinksTemporariosDemo,
  prepararAcessosTemporariosDemo,
  resetarDemo,
} from '@/actions/demo';

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

const TENANTS: Record<TenantSlug, { nome: string; descricao: string }> = {
  gruposinal: {
    nome: 'Grupo Sinal',
    descricao: 'Demonstração contextualizada para a oportunidade comercial',
  },
  'acme-demo': {
    nome: 'ACME Demo',
    descricao: 'Ambiente genérico compartilhado pelo time comercial',
  },
};

export default function AdminDemoPage() {
  const confirmDialog = useConfirm();
  const [tenantSlug, setTenantSlug] = useState<TenantSlug>('gruposinal');
  const [busy, setBusy] = useState(false);
  const [ultimo, setUltimo] = useState<Record<string, number | null> | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [gerandoLinks, setGerandoLinks] = useState(false);
  const [credenciais, setCredenciais] = useState<AcessosDemo | null>(null);
  const [magicLinks, setMagicLinks] = useState<MagicLinkDemo[] | null>(null);
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
