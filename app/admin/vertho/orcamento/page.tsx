'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Calculator, School, Users, Briefcase, Vote, Building2 } from 'lucide-react';
import { CALLS, PRESETS, calcCost } from '@/lib/ia-cost-catalog';

type Metodo = 'votacao' | 'workshop';
type PresetKey = 'premium' | 'balanced' | 'cheap';

const PRESET_KEYS: PresetKey[] = ['premium', 'balanced', 'cheap'];

const PRECOS_DEFAULT = {
  cotacao: 5.30,            // USD → BRL
  precoSetupGeral: 5000,    // R$ taxa fixa de implantação (one-time, independente de clusters/colabs)
  precoColab: 1200,         // R$ por colaborador / ciclo
  precoCluster: 4000,       // R$ por cluster (setup do cluster)
  precoPerfil: 500,         // R$ por perfil (cargo) dentro do cluster
  adicionalWorkshop: 15000, // R$ por cluster quando método = workshop (consultoria humana)
  descontoPct: 0,
};

function moneyBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(v);
}

/**
 * Calcula o custo de IA (em USD) do setup de UM cluster.
 * Setup compreende: PPP + IA1/IA2 (só se votação) + IA3/CB sempre, escalando por nº de perfis.
 * Tagging de conteúdos NÃO entra aqui — é cobrado 1× por orçamento (banco compartilhado).
 */
function custoIASetupCluster(nPerfis: number, metodo: Metodo, presetFn: (call: any) => string): number {
  let total = 0;
  for (const call of CALLS) {
    if (call.scaleType !== 'empresa') continue;
    if (call.id === 'tagging-conteudos') continue; // cobrado 1× total

    let exec: number = call.exec;
    let skip = false;

    switch (call.id) {
      case 'ppp-extracao':
        exec = 1;
        break;
      case 'ia1-top10':
        if (metodo === 'workshop') skip = true;
        else exec = nPerfis;
        break;
      case 'ia2-gabarito':
        if (metodo === 'workshop') skip = true;
        else exec = nPerfis * 5;
        break;
      case 'ia3-cenarios':
      case 'ia3-cenarios-check':
      case 'cenarios-b':
      case 'cenarios-b-check':
        exec = nPerfis * 5;
        break;
    }

    if (skip) continue;

    const model = presetFn(call);
    const c = calcCost({ ...call, exec }, model, 1);
    if (c) total += c.usd;
  }
  return total;
}

function custoIATaggingTotal(presetFn: (call: any) => string): number {
  const call = CALLS.find((c) => c.id === 'tagging-conteudos');
  if (!call) return 0;
  const model = presetFn(call);
  return calcCost(call, model, 1)?.usd || 0;
}

function custoIAPorColab(presetFn: (call: any) => string): number {
  let total = 0;
  for (const call of CALLS) {
    if (call.scaleType !== 'colab') continue;
    const model = presetFn(call);
    const c = calcCost(call, model, 1);
    if (c) total += c.usd;
  }
  return total;
}

export default function OrcamentoPage() {
  const router = useRouter();

  // Inputs do escopo
  const [nClusters, setNClusters] = useState(1);
  const [nPerfis, setNPerfis] = useState(3);
  const [metodo, setMetodo] = useState<Metodo>('votacao');
  const [nColabs, setNColabs] = useState(100);
  const [preset, setPreset] = useState<PresetKey>('balanced');

  // Inputs de pricing
  const [pricing, setPricing] = useState(PRECOS_DEFAULT);

  function setPricingField<K extends keyof typeof PRECOS_DEFAULT>(k: K, v: number) {
    setPricing((p) => ({ ...p, [k]: v }));
  }

  const calc = useMemo(() => {
    const presetFn = PRESETS[preset].model;

    // Custo IA (USD)
    const custoSetupPorCluster = custoIASetupCluster(nPerfis, metodo, presetFn);
    const custoTaggingTotal = custoIATaggingTotal(presetFn);
    const custoPorColab = custoIAPorColab(presetFn);

    const custoSetupTotal = nClusters * custoSetupPorCluster + custoTaggingTotal;
    const custoColabsTotal = nColabs * custoPorColab;
    const custoIAUsd = custoSetupTotal + custoColabsTotal;
    const custoIABrl = custoIAUsd * pricing.cotacao;

    // Valor de tabela (BRL)
    const tabelaSetupGeral = pricing.precoSetupGeral;
    const tabelaColabs = nColabs * pricing.precoColab;
    const tabelaClusters = nClusters * pricing.precoCluster;
    const tabelaPerfis = nClusters * nPerfis * pricing.precoPerfil;
    const tabelaWorkshop = metodo === 'workshop' ? nClusters * pricing.adicionalWorkshop : 0;
    const valorTabela = tabelaSetupGeral + tabelaColabs + tabelaClusters + tabelaPerfis + tabelaWorkshop;

    const desconto = valorTabela * (pricing.descontoPct / 100);
    const valorFinal = valorTabela - desconto;

    const margemAbs = valorFinal - custoIABrl;
    const margemPct = valorFinal > 0 ? (margemAbs / valorFinal) * 100 : 0;

    return {
      custoSetupPorCluster,
      custoTaggingTotal,
      custoPorColab,
      custoSetupTotal,
      custoColabsTotal,
      custoIAUsd,
      custoIABrl,
      tabelaSetupGeral,
      tabelaColabs,
      tabelaClusters,
      tabelaPerfis,
      tabelaWorkshop,
      valorTabela,
      desconto,
      valorFinal,
      margemAbs,
      margemPct,
    };
  }, [nClusters, nPerfis, metodo, nColabs, preset, pricing]);

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6 sm:px-6 min-h-screen">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/admin/dashboard')}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Calculator size={20} className="text-cyan-400" /> Orçamento — Vertho Mentor IA
          </h1>
          <p className="text-xs text-gray-500">Calcula custo de IA, valor de tabela, desconto e valor final em BRL.</p>
        </div>
      </div>

      {/* Escopo do orçamento */}
      <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 mb-6">
        <p className="text-xs uppercase tracking-widest text-cyan-300 mb-3">Escopo</p>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <FieldNumber icon={<School size={14} />} label="Clusters de escola" sub="grupos com mesmo PPP/Top 5"
            value={nClusters} onChange={setNClusters} min={1} />
          <FieldNumber icon={<Briefcase size={14} />} label="Perfis por cluster" sub="cargos distintos"
            value={nPerfis} onChange={setNPerfis} min={1} />
          <FieldNumber icon={<Users size={14} />} label="Colaboradores" sub="total no ciclo"
            value={nColabs} onChange={setNColabs} min={0} />
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-gray-500 mb-1">
              <Vote size={14} /> Mapeamento
            </label>
            <div className="flex gap-1.5">
              {(['votacao', 'workshop'] as Metodo[]).map((m) => (
                <button key={m} onClick={() => setMetodo(m)}
                  className={`flex-1 px-2 py-1.5 rounded text-xs font-bold border ${
                    metodo === m ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300' : 'border-white/10 text-gray-400 hover:text-white'
                  }`}>
                  {m === 'votacao' ? 'Votação' : 'Workshop'}
                </button>
              ))}
            </div>
            <p className="text-[9px] text-gray-600 mt-1">
              {metodo === 'votacao' ? 'fluxo IA completo' : 'sem IA1/IA2 + custo workshop'}
            </p>
          </div>
        </div>

        {/* Preset IA */}
        <div className="mt-3">
          <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">Preset IA (afeta custo)</label>
          <div className="flex gap-2 flex-wrap">
            {PRESET_KEYS.map((k) => (
              <button key={k} onClick={() => setPreset(k)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
                  preset === k ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300' : 'border-white/10 text-gray-400 hover:text-white'
                }`}>
                {PRESETS[k].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabela de preços */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 mb-6">
        <p className="text-xs uppercase tracking-widest text-gray-400 mb-3">Tabela de preços (editável)</p>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          <FieldNumber label="Cotação USD→BRL" sub={`${moneyBRL(pricing.cotacao)} por USD`} value={pricing.cotacao} onChange={(v) => setPricingField('cotacao', v)} allowDecimals min={0} />
          <FieldNumber label="R$ setup geral" sub={`${moneyBRL(pricing.precoSetupGeral)} (fixo)`} value={pricing.precoSetupGeral} onChange={(v) => setPricingField('precoSetupGeral', v)} min={0} />
          <FieldNumber label="R$ por colab" sub={`${moneyBRL(pricing.precoColab)} / ciclo`} value={pricing.precoColab} onChange={(v) => setPricingField('precoColab', v)} min={0} />
          <FieldNumber label="R$ por cluster" sub={`${moneyBRL(pricing.precoCluster)} setup`} value={pricing.precoCluster} onChange={(v) => setPricingField('precoCluster', v)} min={0} />
          <FieldNumber label="R$ por perfil" sub={`${moneyBRL(pricing.precoPerfil)} / cargo`} value={pricing.precoPerfil} onChange={(v) => setPricingField('precoPerfil', v)} min={0} />
          <FieldNumber label="R$ workshop/cluster" sub={`${moneyBRL(pricing.adicionalWorkshop)} (se workshop)`} value={pricing.adicionalWorkshop} onChange={(v) => setPricingField('adicionalWorkshop', v)} min={0} />
          <FieldNumber label="Desconto %" sub={`${pricing.descontoPct.toLocaleString('pt-BR')}% no total`} value={pricing.descontoPct} onChange={(v) => setPricingField('descontoPct', v)} min={0} allowDecimals />
        </div>
      </div>

      {/* Resumo financeiro */}
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 mb-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiBox label="Valor de tabela" value={moneyBRL(calc.valorTabela)} tone="white" />
          <KpiBox label={`Desconto (${pricing.descontoPct}%)`} value={`- ${moneyBRL(calc.desconto)}`} tone="amber" />
          <KpiBox label="Valor final" value={moneyBRL(calc.valorFinal)} tone="emerald" big />
          <KpiBox label="Custo IA" value={moneyBRL(calc.custoIABrl)} sub={`USD ${calc.custoIAUsd.toFixed(2)} × ${pricing.cotacao}`} tone="gray" />
        </div>
        <div className="mt-4 pt-4 border-t border-white/5 flex items-baseline justify-between flex-wrap gap-2">
          <p className="text-xs text-gray-400">
            Margem (valor final − custo IA): <b className={calc.margemPct < 50 ? 'text-amber-300' : 'text-emerald-300'}>{moneyBRL(calc.margemAbs)}</b>
          </p>
          <p className="text-xs text-gray-500">
            Margem %: <b className={calc.margemPct < 50 ? 'text-amber-300' : 'text-emerald-300'}>{calc.margemPct.toFixed(1)}%</b>
          </p>
        </div>
      </div>

      {/* Detalhamento */}
      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        {/* Tabela */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h3 className="text-xs uppercase tracking-widest text-cyan-300 mb-3 flex items-center gap-1.5">
            <Building2 size={14} /> Composição do valor de tabela
          </h3>
          <div className="space-y-1.5 text-sm">
            <Row label="Setup geral (one-time)" value={moneyBRL(calc.tabelaSetupGeral)} />
            <Row label={`${nColabs.toLocaleString('pt-BR')} colabs × ${moneyBRL(pricing.precoColab)}`} value={moneyBRL(calc.tabelaColabs)} />
            <Row label={`${nClusters} cluster${nClusters > 1 ? 's' : ''} × ${moneyBRL(pricing.precoCluster)}`} value={moneyBRL(calc.tabelaClusters)} />
            <Row label={`${nClusters * nPerfis} perfis × ${moneyBRL(pricing.precoPerfil)}`} value={moneyBRL(calc.tabelaPerfis)} />
            {metodo === 'workshop' && (
              <Row label={`Workshop: ${nClusters} × ${moneyBRL(pricing.adicionalWorkshop)}`} value={moneyBRL(calc.tabelaWorkshop)} />
            )}
            <div className="pt-1.5 border-t border-white/5">
              <Row label="Subtotal" value={moneyBRL(calc.valorTabela)} bold />
            </div>
            <Row label={`Desconto (${pricing.descontoPct.toLocaleString('pt-BR')}%)`} value={`- ${moneyBRL(calc.desconto)}`} muted />
            <div className="pt-1.5 border-t border-white/5">
              <Row label="Valor final" value={moneyBRL(calc.valorFinal)} bold tone="emerald" />
            </div>
          </div>
        </div>

        {/* Custo IA */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h3 className="text-xs uppercase tracking-widest text-amber-300 mb-3 flex items-center gap-1.5">
            <Calculator size={14} /> Composição do custo IA
          </h3>
          <p className="text-[10px] text-gray-500 mb-2">Preset: {PRESETS[preset].label}</p>
          <div className="space-y-1.5 text-sm">
            <Row label={`Setup × ${nClusters} cluster${nClusters > 1 ? 's' : ''} (${nPerfis} perfis cada, ${metodo})`} value={`USD ${(nClusters * calc.custoSetupPorCluster).toFixed(2)}`} />
            <Row label="Tagging conteúdos (1× total)" value={`USD ${calc.custoTaggingTotal.toFixed(2)}`} />
            <Row label={`Mentor IA × ${nColabs} colab${nColabs !== 1 ? 's' : ''} (USD ${calc.custoPorColab.toFixed(2)} cada)`} value={`USD ${calc.custoColabsTotal.toFixed(2)}`} />
            <div className="pt-1.5 border-t border-white/5">
              <Row label="Total USD" value={`USD ${calc.custoIAUsd.toFixed(2)}`} bold />
            </div>
            <Row label={`× ${pricing.cotacao} (cotação)`} value={moneyBRL(calc.custoIABrl)} bold tone="amber" />
          </div>
        </div>
      </div>

      {/* Notas */}
      <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-xs text-gray-300 space-y-2">
        <p className="font-bold text-amber-300">Notas:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Setup geral</b> = taxa fixa de implantação inicial (one-time, independente de clusters/colabs). Cobrir onboarding, kick-off, configuração do tenant Vertho, ajuste de branding.</li>
          <li><b>Cluster</b> = grupo de escolas com o MESMO Top 5 / PPP / cenários. Cada cluster paga 1× setup (PPP + IA3 + Cenários B; IA1/IA2 só se método=votação).</li>
          <li><b>Perfis</b> = nº de cargos distintos no cluster (ex: Coordenador + Diretor + Professor = 3). IA1 escala por perfil; IA2/IA3/Cenários B escalam por perfil × 5 (Top 5).</li>
          <li><b>Votação</b> roda fluxo IA completo. <b>Workshop</b> pula IA1+IA2 (humanos definem Top 5) mas adiciona o adicional de consultoria por cluster no preço de tabela.</li>
          <li><b>Tagging conteúdos</b> roda 1× por orçamento (banco de conteúdos compartilhado entre clusters). Estimativa: 50 conteúdos × {`Sonnet/Gemini`}.</li>
          <li><b>Custo IA</b> usa o preset escolhido (premium/balanced/cheap). Detalhes por chamada em <a href="/admin/vertho/simulador-custo" className="text-cyan-400 hover:underline">Simulador de Custo</a>.</li>
          <li><b>Margem</b> compara valor final com custo IA convertido em BRL — não inclui custos operacionais (suporte, hosting, salários, consultoria humana do workshop).</li>
          <li><b>Adicional workshop</b> é apenas no preço de tabela. Se houver custo de consultor a ser repassado, considere refletir no preço por cluster ou criar campo separado.</li>
          <li>Tabela de preços é só estimativa — ajuste os valores antes de fechar uma proposta.</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Subcomponentes ──────────────────────────────────────────────

function FieldNumber({
  icon, label, sub, value, onChange, min = 0, allowDecimals = false,
}: {
  icon?: React.ReactNode;
  label: string;
  sub?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  allowDecimals?: boolean;
}) {
  const fmt = (n: number) =>
    n.toLocaleString('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: allowDecimals ? 2 : 0,
    });

  function parseBR(s: string): number {
    // pt-BR: pontos = milhares, vírgula = decimal
    const cleaned = s.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    const filtered = cleaned.replace(/[^\d.-]/g, '');
    const n = parseFloat(filtered);
    return isNaN(n) ? 0 : n;
  }

  const [text, setText] = useState(() => fmt(value));

  // Sincroniza quando value externo muda (ex: reset programático)
  useEffect(() => {
    if (parseBR(text) !== value) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 flex flex-col">
      <label className="flex items-start gap-1.5 text-[10px] leading-tight uppercase tracking-widest text-gray-500 mb-1 min-h-[28px]">
        {icon && <span className="shrink-0 mt-0.5">{icon}</span>}
        <span>{label}</span>
      </label>
      <input
        type="text"
        inputMode={allowDecimals ? 'decimal' : 'numeric'}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseBR(e.target.value);
          if (n >= min) onChange(n);
        }}
        onBlur={() => {
          const n = Math.max(min, parseBR(text));
          onChange(n);
          setText(fmt(n));
        }}
        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-cyan-500"
      />
      {sub && <p className="text-[9px] text-gray-600 mt-0.5 min-h-[12px]">{sub}</p>}
    </div>
  );
}

function KpiBox({ label, value, sub, tone = 'white', big = false }: { label: string; value: string; sub?: string; tone?: 'white' | 'emerald' | 'amber' | 'gray'; big?: boolean }) {
  const toneColor = {
    white: 'text-white',
    emerald: 'text-emerald-300',
    amber: 'text-amber-300',
    gray: 'text-gray-300',
  }[tone];
  return (
    <div className="rounded-xl bg-white/[0.03] px-3 py-3">
      <p className="text-[10px] uppercase tracking-widest text-gray-500">{label}</p>
      <p className={`${big ? 'text-3xl' : 'text-xl'} font-extrabold ${toneColor}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-600 mt-0.5">{sub}</p>}
    </div>
  );
}

function Row({ label, value, bold = false, muted = false, tone }: { label: string; value: string; bold?: boolean; muted?: boolean; tone?: 'emerald' | 'amber' }) {
  const toneColor = tone === 'emerald' ? 'text-emerald-300' : tone === 'amber' ? 'text-amber-300' : 'text-white';
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`text-xs ${muted ? 'text-gray-500' : 'text-gray-400'}`}>{label}</span>
      <span className={`${bold ? 'font-bold' : ''} ${muted ? 'text-gray-500' : toneColor} text-sm tabular-nums`}>{value}</span>
    </div>
  );
}
