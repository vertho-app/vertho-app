import { loadAuditLog } from './actions';

export const dynamic = 'force-dynamic';

const ACAO_LABEL: Record<string, string> = {
  'whatsapp.broadcast': 'WhatsApp/Email — mensagem em lote',
  'whatsapp.magic_links': 'WhatsApp — magic-links de acesso',
  'envio.pdfs_lote': 'WhatsApp — PDFs em lote',
  'pulse.envio': 'Pulso — envio',
  'empresa.excluir': 'Empresa — exclusão',
  'empresa.criar': 'Empresa — criação',
  'temporada.gerar_lote': 'Temporadas — geração em lote',
  'colaboradores.export': 'Colaboradores — exportação',
  'colaborador.excluir': 'Colaborador — exclusão',
};

const RESULTADO_COR: Record<string, string> = {
  ok: '#34d399',
  parcial: '#fbbf24',
  erro: '#f87171',
};

function fmtData(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
  } catch {
    return iso;
  }
}

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ acao?: string; empresa?: string; admin?: string }>;
}) {
  const sp = await searchParams;
  const { rows, acoes, empresas, error } = await loadAuditLog({
    acao: sp.acao,
    empresaId: sp.empresa,
    adminEmail: sp.admin,
  });

  return (
    <div className="min-h-dvh bg-[#07162a] px-6 py-8 text-white">
      <div className="max-w-[1300px] mx-auto">
        <h1 className="text-2xl font-bold mb-1">Auditoria de admin</h1>
        <p className="text-sm text-white/55 mb-6">
          Rastros de ações sensíveis (disparos + mutações): quem fez, o quê, em qual empresa e com que resultado.
        </p>

        {error && (
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 mb-6 text-sm text-amber-200">
            Não foi possível carregar o log: <code>{error}</code>
            <br />
            <span className="text-amber-200/70">
              Se a tabela ainda não existe, aplique a migration <code>116-admin-audit-log.sql</code> no Supabase Studio.
            </span>
          </div>
        )}

        {/* Filtros (GET — server component, sem JS) */}
        <form method="GET" className="flex flex-wrap items-end gap-3 mb-6">
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/45">
            Ação
            <select name="acao" defaultValue={sp.acao || ''}
              className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-w-[200px]">
              <option value="">Todas</option>
              {acoes.map((a) => <option key={a} value={a}>{ACAO_LABEL[a] || a}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/45">
            Empresa
            <select name="empresa" defaultValue={sp.empresa || ''}
              className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-w-[160px]">
              <option value="">Todas</option>
              {empresas.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/45">
            Admin (e-mail)
            <input name="admin" defaultValue={sp.admin || ''} placeholder="contém…"
              className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-w-[200px] placeholder:text-white/25" />
          </label>
          <button type="submit"
            className="rounded-lg px-4 py-2 text-sm font-bold text-[#06172C]"
            style={{ background: 'linear-gradient(135deg,#34c5cc,#0D9488)' }}>
            Filtrar
          </button>
          <a href="/admin/auditoria" className="text-xs text-white/45 hover:text-white py-2">limpar</a>
        </form>

        <p className="text-xs text-white/40 mb-3">{rows.length} registro(s) — mostrando os mais recentes.</p>

        <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-white/45 border-b border-white/10">
                <th className="px-3 py-2.5 whitespace-nowrap">Quando</th>
                <th className="px-3 py-2.5">Admin</th>
                <th className="px-3 py-2.5">Ação</th>
                <th className="px-3 py-2.5">Empresa</th>
                <th className="px-3 py-2.5">Alvo</th>
                <th className="px-3 py-2.5">Resultado</th>
                <th className="px-3 py-2.5">Detalhes</th>
                <th className="px-3 py-2.5">IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !error && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-white/40">Nenhum registro ainda.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-white/[0.05] align-top hover:bg-white/[0.02]">
                  <td className="px-3 py-2.5 whitespace-nowrap font-mono text-[12px] text-white/70">{fmtData(r.criado_em)}</td>
                  <td className="px-3 py-2.5 text-white/85">{r.admin_email}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{ACAO_LABEL[r.acao] || r.acao}</td>
                  <td className="px-3 py-2.5 text-white/70">{r.empresa_slug || (r.empresa_id ? r.empresa_id.slice(0, 8) : '—')}</td>
                  <td className="px-3 py-2.5 text-white/70">{r.alvo || '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className="font-bold uppercase text-[11px]" style={{ color: RESULTADO_COR[r.resultado] || '#cbd5e1' }}>
                      {r.resultado}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 max-w-[320px]">
                    <code className="text-[11px] text-white/55 break-words">
                      {Object.keys(r.detalhes || {}).length ? JSON.stringify(r.detalhes) : '—'}
                    </code>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-white/40 whitespace-nowrap">{r.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
