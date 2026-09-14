'use client';
/**
 * Aba "Prontidão" do workspace Adequação (admin), duas lentes:
 *   configuração → o programa (cargo-alvo, população, corte);
 *   prévia       → a MESMA leitura que o RH vê, com as actions de admin.
 *
 * A Vertho opera, o cliente consome (§26): tudo que escreve mora aqui, no
 * admin; o RH só lê.
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, Power, RefreshCw, AlertTriangle } from 'lucide-react';
import ProntidaoLiderancaView from '@/components/prontidao-lideranca-view';
import {
  getConfigProntidaoAdmin, salvarConfigProntidaoAdmin, setModuloProntidaoAdmin,
  getProntidaoLiderancaAdmin, getParecerLiderancaAdmin,
  exportarParecerPDFAdmin, exportarConsolidadoPDFAdmin,
} from '@/actions/prontidao-lideranca';
import { DEFAULTS_PRONTIDAO } from '@/lib/prontidao-lideranca/config';

type Sub = 'config' | 'previa';
const fmt = (v: number | null | undefined) => (v == null ? '—' : Number(v).toFixed(2).replace('.', ','));

export default function ProntidaoLiderancaTab({ empresaId }: { empresaId: string }) {
  const [sub, setSub] = useState<Sub>('config');
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    cargo_alvo: '', escopoTipo: 'empresa_inteira' as 'empresa_inteira' | 'turma', turmaId: '',
    um_por_dia: DEFAULTS_PRONTIDAO.um_por_dia as boolean, corte_nota: DEFAULTS_PRONTIDAO.corte_nota as number,
  });
  const [salvando, setSalvando] = useState(false);
  const [alternando, setAlternando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const [erros, setErros] = useState<string[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [versao, setVersao] = useState(0);

  /**
   * O gate (`requireEmpresaSupabase`) fica FORA do try da action, de propósito:
   * negação não pode virar `{ success: false }` engolido. O preço é que ela
   * chega aqui como REJEIÇÃO, e sem try o `setLoading(false)` nunca roda e a aba
   * ficava girando para sempre, sem toast e sem texto (visto em 14/09 com uma
   * sessão sem `admin.access`). Spinner eterno é o pior formato de "negado".
   */
  const recarregar = useCallback(async () => {
    setLoading(true); setFalha(null);
    let r: any;
    try {
      r = await getConfigProntidaoAdmin(empresaId);
    } catch (e: any) {
      setFalha(e?.message || 'Não foi possível carregar o programa.');
      setLoading(false);
      return;
    }
    if (r.success) {
      setInfo(r);
      if (r.cfg) {
        setForm({
          cargo_alvo: r.cfg.cargo_alvo,
          escopoTipo: r.cfg.escopo.tipo, turmaId: r.cfg.escopo.tipo === 'turma' ? r.cfg.escopo.turmaId : '',
          um_por_dia: r.cfg.um_por_dia, corte_nota: r.cfg.corte_nota,
        });
      }
      setErros(r.validacao?.erros || []);
      setAvisos(r.validacao?.avisos || []);
    } else { setFalha(r.error || 'Erro ao carregar.'); toast.error(r.error || 'Erro ao carregar.'); }
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  async function alternarModulo() {
    if (!info) return;
    setAlternando(true);
    const r: any = await setModuloProntidaoAdmin(empresaId, !info.contratado);
    if (r.success) { toast.success(r.contratado ? 'Módulo ligado.' : 'Módulo desligado.'); await recarregar(); setVersao((v) => v + 1); }
    else toast.error(r.error || 'Erro.');
    setAlternando(false);
  }

  async function salvar() {
    setSalvando(true); setErros([]); setAvisos([]);
    const r: any = await salvarConfigProntidaoAdmin(empresaId, {
      cargo_alvo: form.cargo_alvo,
      escopo: form.escopoTipo === 'turma' ? { tipo: 'turma', turmaId: form.turmaId } : { tipo: 'empresa_inteira' },
      um_por_dia: form.um_por_dia, corte_nota: Number(form.corte_nota),
    });
    if (r.success) { toast.success('Programa salvo.'); setAvisos(r.avisos || []); setVersao((v) => v + 1); await recarregar(); }
    else { setErros(r.erros || [r.error]); setAvisos(r.avisos || []); toast.error(r.error || 'Configuração inválida.'); }
    setSalvando(false);
  }

  if (loading && !info) return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-cyan-400" /></div>;
  if (falha && !info) {
    return (
      <div className="rounded-xl p-4 border border-rose-400/30 flex flex-wrap items-center justify-between gap-3" style={{ background: '#0F2A4A' }}>
        <div className="flex items-start gap-2 text-sm text-rose-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{falha}</span>
        </div>
        <button type="button" onClick={() => void recarregar()} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold border border-white/10 text-gray-300 hover:bg-white/5">
          <RefreshCw size={12} /> Tentar de novo
        </button>
      </div>
    );
  }
  if (!info) return null;

  const inputCls = 'w-full px-3 py-2 rounded-lg text-sm text-white border border-white/10 outline-none focus:border-cyan-400/40';
  const bg = { background: '#091D35' } as const;

  return (
    <div className="space-y-4">
      {/* Cabeçalho: estado do módulo */}
      <div className="rounded-xl p-4 border border-white/[0.06] flex flex-wrap items-center justify-between gap-3" style={{ background: '#0F2A4A' }}>
        <div>
          <p className="text-sm font-bold text-white">Módulo Prontidão para Liderança</p>
          <p className="text-[11px] text-gray-400">{info.contratado ? 'Contratado: o RH vê a leitura e o menu, e o trilho de liderança abre para a população.' : 'Não contratado: nada aparece para o cliente nem para os participantes.'}</p>
        </div>
        <button type="button" onClick={alternarModulo} disabled={alternando}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold border transition disabled:opacity-50 ${info.contratado ? 'border-emerald-400/40 text-emerald-300 hover:bg-emerald-400/10' : 'border-white/10 text-gray-300 hover:bg-white/5'}`}>
          {alternando ? <Loader2 size={12} className="animate-spin" /> : <Power size={12} />} {info.contratado ? 'Ligado' : 'Desligado'}
        </button>
      </div>

      <div className="flex gap-1 p-1 rounded-xl border border-white/[0.06]" style={bg}>
        {([['config', 'Configuração'], ['previa', 'Prévia da leitura']] as [Sub, string][]).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setSub(k)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${sub === k ? 'bg-white/[0.06] text-white' : 'text-gray-500 hover:text-gray-300'}`}>{label}</button>
        ))}
      </div>

      {sub === 'config' && (
        <div className="rounded-xl p-4 border border-white/[0.06] space-y-4" style={{ background: '#0F2A4A' }}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Cargo-alvo (perfil de liderança)</span>
              <select value={form.cargo_alvo} onChange={(e) => setForm((f) => ({ ...f, cargo_alvo: e.target.value }))} className={inputCls} style={bg}>
                <option value="">escolha o cargo</option>
                {(info.cargos || []).map((c: any) => (
                  <option key={c.nome} value={c.nome}>{c.nome} · {c.temGabarito ? 'gabarito' : 'SEM gabarito'} · Top {c.top5.length}</option>
                ))}
              </select>
              <span className="block mt-1 text-[10px] text-gray-500">As competências do mapeamento são o Top 5 deste cargo, as mesmas que geram os cenários.</span>
            </label>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">População</span>
              <div className="mt-1 flex gap-2">
                <label className="flex items-center gap-1.5 text-xs text-gray-300"><input type="radio" checked={form.escopoTipo === 'empresa_inteira'} onChange={() => setForm((f) => ({ ...f, escopoTipo: 'empresa_inteira' }))} /> empresa inteira</label>
                <label className="flex items-center gap-1.5 text-xs text-gray-300"><input type="radio" checked={form.escopoTipo === 'turma'} onChange={() => setForm((f) => ({ ...f, escopoTipo: 'turma' }))} /> uma turma</label>
              </div>
              {form.escopoTipo === 'turma' && (
                <select value={form.turmaId} onChange={(e) => setForm((f) => ({ ...f, turmaId: e.target.value }))} className={`${inputCls} mt-2`} style={bg}>
                  <option value="">escolha a turma</option>
                  {(info.turmas || []).map((t: any) => <option key={t.id} value={t.id}>{t.nome} ({t.status})</option>)}
                </select>
              )}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" checked={form.um_por_dia} onChange={(e) => setForm((f) => ({ ...f, um_por_dia: e.target.checked }))} /> um cenário por dia (só no trilho de liderança)</label>
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Corte: nota que conta como demonstrada (1 a 4)</span>
              <input type="number" step="0.05" min={1} max={4} value={form.corte_nota} onChange={(e) => setForm((f) => ({ ...f, corte_nota: Number(e.target.value) }))} className={inputCls} style={bg} />
              <span className="block mt-1 text-[10px] text-gray-500">
                Média por competência a partir da qual a pessoa demonstra a competência. 3,00 é o N3 da régua, o nível de meta do modelo.
                A classificação é binária: {fmt(form.corte_nota)} ou acima demonstra, abaixo não demonstra.
              </span>
            </label>
          </div>

          {erros.length > 0 && <div className="rounded-lg border border-red-400/30 bg-red-400/5 p-3 space-y-1">{erros.map((e) => <p key={e} className="text-[11px] text-red-200 flex gap-1.5"><AlertTriangle size={11} className="mt-0.5 shrink-0" /> {e}</p>)}</div>}
          {avisos.length > 0 && <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 space-y-1">{avisos.map((a) => <p key={a} className="text-[11px] text-amber-200">{a}</p>)}</div>}

          <div className="flex justify-end">
            <button type="button" onClick={salvar} disabled={salvando || !form.cargo_alvo}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold text-[#0C1829] bg-gradient-to-br from-cyan-400 to-cyan-600 hover:brightness-110 disabled:opacity-50">
              {salvando ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar programa
            </button>
          </div>
        </div>
      )}

      {sub === 'previa' && (
        <ProntidaoLiderancaView
          scopeKey={`${empresaId}:${versao}`}
          carregar={() => getProntidaoLiderancaAdmin(empresaId)}
          parecer={(id) => getParecerLiderancaAdmin(empresaId, id)}
          exportarParecer={(id) => exportarParecerPDFAdmin(empresaId, id)}
          exportarConsolidado={() => exportarConsolidadoPDFAdmin(empresaId)}
        />
      )}

    </div>
  );
}
