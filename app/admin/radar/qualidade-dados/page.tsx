import Link from 'next/link';
import { ArrowLeft, Database, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireAdminAction } from '@/lib/auth/action-context';

export const dynamic = 'force-dynamic';

type Escopo = 'escola' | 'municipio' | 'misto';

interface TabelaSpec {
  nome: string;          // nome real da tabela
  label: string;         // exibição
  fonte: string;         // origem do dado (ex: INEP, FNDE, MEC)
  escopo: Escopo;
  chave?: 'codigo_inep' | 'municipio_ibge';
  comentario?: string;
}

interface TabelaStats {
  spec: TabelaSpec;
  total: number;
  anoMin: number | null;
  anoMax: number | null;
  ultimaAtualizacao: string | null;
  coberturaUltimoAno: number | null;  // % de escolas/municípios com dado no último ano
  cobertosUltimoAno: number | null;
  erro: string | null;
}

const TABELAS: TabelaSpec[] = [
  // Escolares
  { nome: 'diag_saeb_snapshots',        label: 'SAEB',                fonte: 'INEP',  escopo: 'escola',    chave: 'codigo_inep' },
  { nome: 'diag_censo_infra',           label: 'Censo — Infra',       fonte: 'INEP',  escopo: 'escola',    chave: 'codigo_inep' },
  { nome: 'diag_censo_docentes',        label: 'Censo — Docentes',    fonte: 'INEP',  escopo: 'escola',    chave: 'codigo_inep' },
  { nome: 'diag_enem_escola_snapshots', label: 'ENEM por escola',     fonte: 'INEP',  escopo: 'escola',    chave: 'codigo_inep' },
  { nome: 'diag_ideb_metas',            label: 'IDEB + metas',        fonte: 'INEP',  escopo: 'escola',    chave: 'codigo_inep' },
  { nome: 'diag_saresp_snapshots',      label: 'SARESP (SP)',         fonte: 'SEDUC-SP', escopo: 'escola', chave: 'codigo_inep' },
  { nome: 'diag_pdde_repasses',         label: 'PDDE — escola',       fonte: 'FNDE',  escopo: 'escola',    chave: 'codigo_inep' },
  // Municipais
  { nome: 'diag_ica_snapshots',         label: 'ICA — alfabetização', fonte: 'MEC',   escopo: 'municipio', chave: 'municipio_ibge' },
  { nome: 'diag_fundeb_repasses',       label: 'FUNDEB — repasses',   fonte: 'FNDE',  escopo: 'municipio', chave: 'municipio_ibge' },
  { nome: 'diag_fundeb_vaar',           label: 'FUNDEB — VAAR',       fonte: 'FNDE',  escopo: 'municipio', chave: 'municipio_ibge' },
  { nome: 'diag_fundeb_receita_prevista', label: 'FUNDEB — receita prevista', fonte: 'FNDE', escopo: 'municipio', chave: 'municipio_ibge' },
  { nome: 'diag_pdde_municipal',        label: 'PDDE — municipal',    fonte: 'FNDE',  escopo: 'municipio', chave: 'municipio_ibge' },
];

async function loadStatsTabela(sb: any, spec: TabelaSpec, totaisEscopo: { escolas: number; municipios: number }): Promise<TabelaStats> {
  try {
    const [{ count: total }, anoRes, updRes] = await Promise.all([
      sb.from(spec.nome).select('*', { count: 'exact', head: true }),
      sb.from(spec.nome).select('ano').order('ano', { ascending: false }).limit(1).maybeSingle(),
      sb.from(spec.nome).select('atualizado_em').order('atualizado_em', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const anoMax = (anoRes.data as any)?.ano ?? null;
    let anoMin: number | null = null;
    if (anoMax != null) {
      const { data: minData } = await sb.from(spec.nome).select('ano').order('ano', { ascending: true }).limit(1).maybeSingle();
      anoMin = (minData as any)?.ano ?? null;
    }

    let cobertosUltimoAno: number | null = null;
    let coberturaUltimoAno: number | null = null;
    if (anoMax != null && spec.chave) {
      // Distinct chave para o último ano
      const { data: distintos } = await sb.rpc('diag_qualidade_distinct_chave', {
        p_tabela: spec.nome,
        p_chave: spec.chave,
        p_ano: anoMax,
      });
      const n = Number((distintos as any)?.[0]?.distintos || (distintos as any)?.distintos || 0);
      if (n > 0) {
        cobertosUltimoAno = n;
        const denom = spec.chave === 'codigo_inep' ? totaisEscopo.escolas : totaisEscopo.municipios;
        if (denom > 0) coberturaUltimoAno = (n / denom) * 100;
      }
    }

    return {
      spec,
      total: total || 0,
      anoMin,
      anoMax,
      ultimaAtualizacao: (updRes.data as any)?.atualizado_em ?? null,
      coberturaUltimoAno,
      cobertosUltimoAno,
      erro: null,
    };
  } catch (err: any) {
    return {
      spec,
      total: 0,
      anoMin: null,
      anoMax: null,
      ultimaAtualizacao: null,
      coberturaUltimoAno: null,
      cobertosUltimoAno: null,
      erro: err?.message || 'erro desconhecido',
    };
  }
}

async function loadQualidadeDados() {
  await requireAdminAction();
  const sb = createSupabaseAdmin();

  // Universos
  const [{ count: escolasTotal }, distMunicipiosRes, ingestRunsRes] = await Promise.all([
    sb.from('diag_escolas').select('*', { count: 'exact', head: true }),
    sb.rpc('diag_qualidade_municipios_distintos'),
    sb.from('diag_ingest_runs')
      .select('id, fonte, status, total_processado, total_falha, total_skipped, criado_em, finalizado_em')
      .order('criado_em', { ascending: false })
      .limit(10),
  ]);

  const municipiosTotal = Number((distMunicipiosRes.data as any)?.[0]?.total || (distMunicipiosRes.data as any)?.total || 0);
  const totaisEscopo = { escolas: escolasTotal || 0, municipios: municipiosTotal };

  const stats = await Promise.all(TABELAS.map(t => loadStatsTabela(sb, t, totaisEscopo)));

  return {
    escolasTotal: escolasTotal || 0,
    municipiosTotal,
    stats,
    ingestRunsRecentes: (ingestRunsRes.data as any[]) || [],
  };
}

function fmt(n: any) { return Number(n ?? 0).toLocaleString('pt-BR'); }

function formatRel(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const dias = Math.floor(diff / 86400000);
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 30) return `${dias}d atrás`;
  if (dias < 365) return `${Math.floor(dias / 30)}m atrás`;
  return `${Math.floor(dias / 365)}a atrás`;
}

function classificarSaude(s: TabelaStats): { tom: 'ok' | 'aviso' | 'erro'; rotulo: string } {
  if (s.erro) return { tom: 'erro', rotulo: 'erro' };
  if (s.total === 0) return { tom: 'erro', rotulo: 'vazia' };
  if (s.coberturaUltimoAno != null && s.coberturaUltimoAno < 30) return { tom: 'aviso', rotulo: 'baixa cobertura' };
  if (s.ultimaAtualizacao) {
    const dias = (Date.now() - new Date(s.ultimaAtualizacao).getTime()) / 86400000;
    if (dias > 365) return { tom: 'aviso', rotulo: 'desatualizada' };
  }
  return { tom: 'ok', rotulo: 'ok' };
}

export default async function QualidadeDadosPage() {
  const data = await loadQualidadeDados();

  // Agregados
  const totalLinhas = data.stats.reduce((s, t) => s + t.total, 0);
  const tabelasVazias = data.stats.filter(t => t.total === 0).length;
  const tabelasComErro = data.stats.filter(t => t.erro).length;
  const tabelasComAviso = data.stats.filter(t => classificarSaude(t).tom === 'aviso').length;

  return (
    <div className="min-h-dvh"
      style={{ background: 'linear-gradient(180deg,#06172C 0%,#091D35 50%,#0a1f3a 100%)' }}>
      <div className="max-w-[1200px] mx-auto px-5 py-6">
        <div className="flex items-center justify-between gap-4 pb-5 mb-5 border-b border-white/[0.08]">
          <Link href="/admin/dashboard" className="flex items-center gap-1.5 text-xs font-medium text-white/50 hover:text-white">
            <ArrowLeft size={14} /> Admin Dashboard
          </Link>
          <span className="text-[10px] tracking-[0.2em] text-white/30 uppercase font-mono">
            RADAR · QUALIDADE DOS DADOS
          </span>
          <Link href="/admin/radar" className="text-xs text-white/50 hover:text-white">
            Ingestão →
          </Link>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <Database size={20} style={{ color: '#34c5cc' }} />
          <h1 className="text-xl font-bold text-white">Qualidade dos dados</h1>
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <Resumo titulo="Escolas no cadastro" valor={fmt(data.escolasTotal)} sublabel="diag_escolas" />
          <Resumo titulo="Municípios distintos" valor={fmt(data.municipiosTotal)} sublabel="dos snapshots municipais" />
          <Resumo titulo="Linhas totais" valor={fmt(totalLinhas)} sublabel={`${data.stats.length} tabelas monitoradas`} />
          <Resumo
            titulo="Saúde geral"
            valor={tabelasComErro > 0 ? `${tabelasComErro} erro` : tabelasComAviso > 0 ? `${tabelasComAviso} aviso` : 'ok'}
            sublabel={tabelasVazias > 0 ? `${tabelasVazias} vazia(s)` : 'tudo populado'}
            tom={tabelasComErro > 0 ? 'erro' : tabelasComAviso > 0 ? 'aviso' : 'ok'}
          />
        </div>

        {/* Tabela principal */}
        <div className="rounded-2xl border border-white/[0.06] overflow-hidden mb-8" style={{ background: '#0b1d36' }}>
          <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
            <p className="text-[10px] tracking-[0.2em] uppercase font-mono text-white/40">Cobertura por fonte</p>
            <p className="text-[10px] text-white/30 font-mono">% = chaves distintas no último ano / universo</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] tracking-[0.15em] uppercase text-white/40 font-mono border-b border-white/[0.06]">
                  <th className="px-4 py-2 text-left">Fonte</th>
                  <th className="px-4 py-2 text-left">Escopo</th>
                  <th className="px-4 py-2 text-right">Linhas</th>
                  <th className="px-4 py-2 text-right">Anos</th>
                  <th className="px-4 py-2 text-right">Cobertura</th>
                  <th className="px-4 py-2 text-right">Atualizado</th>
                  <th className="px-4 py-2 text-center">Saúde</th>
                </tr>
              </thead>
              <tbody>
                {data.stats.map((s) => {
                  const saude = classificarSaude(s);
                  return (
                    <tr key={s.spec.nome} className="border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <p className="text-white font-medium text-sm">{s.spec.label}</p>
                        <p className="text-[10px] text-white/35 font-mono">{s.spec.nome} · {s.spec.fonte}</p>
                      </td>
                      <td className="px-4 py-3 text-white/70 text-xs">
                        {s.spec.escopo === 'escola' ? 'escola' : s.spec.escopo === 'municipio' ? 'município' : 'misto'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-white/85">{fmt(s.total)}</td>
                      <td className="px-4 py-3 text-right font-mono text-white/70 text-xs">
                        {s.anoMin && s.anoMax ? (s.anoMin === s.anoMax ? s.anoMax : `${s.anoMin}–${s.anoMax}`) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {s.coberturaUltimoAno != null ? (
                          <div>
                            <p className="font-mono text-sm text-white/85">{s.coberturaUltimoAno.toFixed(1)}%</p>
                            <p className="text-[10px] text-white/40 font-mono">{fmt(s.cobertosUltimoAno)} em {s.anoMax}</p>
                          </div>
                        ) : (
                          <span className="text-white/30 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-white/60 font-mono" title={s.ultimaAtualizacao || ''}>
                        {formatRel(s.ultimaAtualizacao)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <SaudeBadge tom={saude.tom} rotulo={saude.rotulo} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Erros detalhados */}
        {data.stats.some(s => s.erro) && (
          <div className="rounded-2xl border border-red-500/30 p-4 mb-8" style={{ background: 'rgba(239,68,68,0.06)' }}>
            <p className="text-[10px] tracking-[0.2em] uppercase font-mono text-red-300/70 mb-2">Erros</p>
            <div className="space-y-1">
              {data.stats.filter(s => s.erro).map(s => (
                <p key={s.spec.nome} className="text-xs text-red-300/80 font-mono">
                  <span className="text-red-400">{s.spec.nome}</span> — {s.erro}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Últimas ingestões */}
        <div className="rounded-2xl border border-white/[0.06] overflow-hidden" style={{ background: '#0b1d36' }}>
          <div className="px-5 py-3 border-b border-white/[0.06]">
            <p className="text-[10px] tracking-[0.2em] uppercase font-mono text-white/40">Últimas ingestões</p>
          </div>
          {data.ingestRunsRecentes.length === 0 ? (
            <div className="px-5 py-6 text-center text-sm text-white/40">Nenhuma ingestão registrada</div>
          ) : (
            <div>
              {data.ingestRunsRecentes.map((r: any) => (
                <div key={r.id} className="px-5 py-3 border-b border-white/[0.04] last:border-b-0 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white">{r.fonte}</p>
                    <p className="text-[10px] text-white/40 font-mono">{new Date(r.criado_em).toLocaleString('pt-BR')}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="font-mono text-white/60">
                      {fmt(r.total_processado)} ✓ {fmt(r.total_falha)} ✗
                    </span>
                    <SaudeBadge
                      tom={r.status === 'sucesso' ? 'ok' : r.status === 'erro' ? 'erro' : 'aviso'}
                      rotulo={r.status}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-[10px] text-white/30 text-center mt-6 font-mono">
          Versão simples · cobertura calculada via RPC <code>diag_qualidade_distinct_chave</code>.
          Se uma fonte aparecer com cobertura "—", rode a migration 082.
        </p>
      </div>
    </div>
  );
}

function Resumo({ titulo, valor, sublabel, tom }: { titulo: string; valor: string; sublabel: string; tom?: 'ok' | 'aviso' | 'erro' }) {
  const cor = tom === 'erro' ? '#F97354' : tom === 'aviso' ? '#FCD34D' : '#FFFFFF';
  return (
    <div className="rounded-2xl p-4 border border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.03)' }}>
      <p className="text-[9px] tracking-[0.2em] uppercase font-mono text-white/40 mb-1">{titulo}</p>
      <p className="text-2xl font-bold font-mono" style={{ color: cor }}>{valor}</p>
      <p className="text-[10px] text-white/45 mt-1">{sublabel}</p>
    </div>
  );
}

function SaudeBadge({ tom, rotulo }: { tom: 'ok' | 'aviso' | 'erro'; rotulo: string }) {
  const cores = {
    ok:    { bg: 'rgba(16,185,129,0.15)', color: '#6EE7B7', Icon: CheckCircle2 },
    aviso: { bg: 'rgba(245,158,11,0.15)', color: '#FCD34D', Icon: Clock },
    erro:  { bg: 'rgba(239,68,68,0.15)',  color: '#F97354', Icon: AlertTriangle },
  }[tom];
  const Icon = cores.Icon;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-mono"
      style={{ background: cores.bg, color: cores.color }}>
      <Icon size={11} /> {rotulo}
    </span>
  );
}
