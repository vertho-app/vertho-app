'use client';

import { useEffect, useState, useCallback } from 'react';
import { BarChart3, Eye, RefreshCw, MousePointerClick, Loader2, CheckCircle2, LayoutGrid, Video, Headphones, FileText, BookOpen, ClipboardCheck, MessagesSquare } from 'lucide-react';
import AdminPageHeader from '@/components/admin/page-header';
import { useEmpresaContexto } from '@/app/admin/_shell/useEmpresaContexto';
import { getEngajamentoEmpresa } from '@/actions/engajamento';

const FMT = {
  video: { Icon: Video, cor: 'text-cyan-400', label: 'vídeo' },
  audio: { Icon: Headphones, cor: 'text-violet-400', label: 'áudio' },
  texto: { Icon: FileText, cor: 'text-emerald-400', label: 'texto' },
  case: { Icon: BookOpen, cor: 'text-amber-400', label: 'caso' },
};

function Tile({ icon: Icon, label, value, sub, color }: any) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <Icon size={14} className={color} /> {label}
      </div>
      <div className="text-2xl font-bold text-white mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Bool({ v }: { v: boolean }) {
  return v ? <span className="text-emerald-400">✓</span> : <span className="text-gray-600">—</span>;
}

function FormatosIcons({ lista }: { lista: string[] }) {
  return (
    <>
      {(['video', 'audio', 'texto', 'case'] as const).filter((f) => lista?.includes(f)).map((f) => {
        const { Icon, cor, label } = FMT[f];
        return <span key={f} title={label}><Icon size={14} className={cor} /></span>;
      })}
    </>
  );
}

/** Célula de uma pílula: bolinha = abriu o link; ícones = formatos abertos daquele descritor. */
function PilulaCell({ abriu, formatos }: { abriu: boolean; formatos: string[] }) {
  if (!abriu && !formatos?.length) return <span className="text-gray-600">—</span>;
  return (
    <div className="flex items-center gap-2">
      <span title={abriu ? 'abriu o link' : 'não abriu o link'} className={abriu ? 'text-cyan-400 text-lg leading-none' : 'text-gray-700 text-lg leading-none'}>●</span>
      <FormatosIcons lista={formatos} />
    </div>
  );
}

function PctBar({ pct }: { pct: number }) {
  const cor = pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-cyan-500' : pct > 0 ? 'bg-amber-500' : 'bg-gray-600';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full ${cor}`} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      <span className="text-xs text-gray-400 tabular-nums w-9">{pct}%</span>
    </div>
  );
}

export default function EngajamentoPage() {
  const { empresaId, empresa } = useEmpresaContexto();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [semanaSel, setSemanaSel] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    if (!empresaId) { setData(null); return; }
    setLoading(true);
    try {
      setData(await getEngajamentoEmpresa(empresaId, semanaSel));
    } finally {
      setLoading(false);
    }
  }, [empresaId, semanaSel]);

  useEffect(() => { carregar(); }, [carregar]);

  const resumo = data?.resumo;
  const colabs = data?.colaboradores || [];
  const semanas: number[] = data?.semanas || [1];

  return (
    <div>
      <AdminPageHeader
        icon={BarChart3}
        iconClassName="text-cyan-400"
        title="Engajamento da trilha"
        subtitle={empresa?.nome ? `${empresa.nome} — abriu · formato · vídeo · concluiu · evidência · tutor` : 'Selecione uma empresa no filtro do topo'}
        actions={
          <div className="flex items-center gap-2">
            <select
              value={semanaSel ?? ''}
              onChange={(e) => setSemanaSel(e.target.value ? Number(e.target.value) : null)}
              disabled={!empresaId}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 disabled:opacity-40">
              <option value="">Todas as semanas</option>
              {semanas.map((s) => <option key={s} value={s}>Semana {s}</option>)}
            </select>
            <button onClick={carregar} disabled={loading || !empresaId}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 disabled:opacity-40">
              {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Atualizar
            </button>
          </div>
        }
      />

      {!empresaId && (
        <div className="text-sm text-gray-500 bg-white/5 border border-white/10 rounded-xl p-6 text-center">
          Escolha uma empresa no filtro do topo para ver o engajamento.
        </div>
      )}

      {empresaId && resumo && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            <Tile icon={Eye} color="text-gray-400" label="Inscritos" value={resumo.inscritos} />
            <Tile icon={LayoutGrid} color="text-teal-400" label="Abriram conteúdo" value={resumo.abriramAlgumFormato} sub={`de ${resumo.inscritos}`} />
            <Tile icon={CheckCircle2} color="text-emerald-400" label="Consumiram" value={resumo.consumiram} sub="vídeo/áudio/marcou" />
            <Tile icon={MousePointerClick} color="text-cyan-400" label="Abriram o link" value={resumo.abriramLink} sub={`de ${resumo.inscritos}`} />
            <Tile icon={ClipboardCheck} color="text-amber-400" label="Evidência" value={resumo.enviaramEvidencia} sub="concluíram a semana" />
            <Tile icon={MessagesSquare} color="text-violet-400" label="Tira-Dúvidas" value={resumo.conversaramTutor} sub="conversaram com o tutor" />
          </div>

          {/* Quebra por PÍLULA (2 linhas) e por FORMATO PRINCIPAL (denominador correto) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Por pílula</div>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] text-gray-500">
                  <th className="font-medium pb-1"></th><th className="font-medium pb-1 text-center">Recebeu</th>
                  <th className="font-medium pb-1 text-center">Abriu</th><th className="font-medium pb-1 text-center">Abriu formato</th>
                </tr></thead>
                <tbody>
                  {(resumo.porPilula || []).map((p: any) => (
                    <tr key={p.pilula} className="border-t border-white/5">
                      <td className="py-1.5 text-gray-300 font-medium">Pílula {p.pilula}</td>
                      <td className="py-1.5 text-center text-gray-300">{p.recebeu}</td>
                      <td className="py-1.5 text-center text-cyan-400">{p.abriu}</td>
                      <td className="py-1.5 text-center text-teal-400">{p.abriuFormato}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Por formato principal <span className="normal-case text-gray-600">(engajou / preferido)</span></div>
              <table className="w-full text-sm">
                <tbody>
                  {(resumo.porFormato || []).map((f: any) => {
                    const meta = (FMT as any)[f.formato] || { Icon: FileText, cor: 'text-gray-400', label: f.formato };
                    const FmtIcon = meta.Icon;
                    const pct = f.principal ? Math.round((f.engajou / f.principal) * 100) : 0;
                    return (
                      <tr key={f.formato} className="border-t border-white/5 first:border-t-0">
                        <td className="py-1.5"><span className={`inline-flex items-center gap-1.5 ${meta.cor}`}><FmtIcon size={13} />{meta.label}</span></td>
                        <td className="py-1.5 text-center text-white font-medium">{f.engajou}<span className="text-gray-500 font-normal"> / {f.principal}</span></td>
                        <td className="py-1.5 text-center text-gray-400 text-xs">{pct}%</td>
                        <td className="py-1.5 text-right text-gray-400 text-xs">{f.pctMedio != null ? `${f.pctMedio}% médio vídeo` : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-white/10">
                    <th className="px-4 py-2.5 font-medium">Colaborador</th>
                    <th className="px-3 py-2.5 font-medium text-center">Recebeu</th>
                    <th className="px-3 py-2.5 font-medium">Pílula 1</th>
                    <th className="px-3 py-2.5 font-medium">Pílula 2</th>
                    <th className="px-3 py-2.5 font-medium text-center">Terminou vídeo</th>
                    <th className="px-3 py-2.5 font-medium">% vídeo</th>
                    <th className="px-3 py-2.5 font-medium text-center">Consumiu</th>
                    <th className="px-3 py-2.5 font-medium text-center">Evidência</th>
                    <th className="px-3 py-2.5 font-medium text-center">Tutor</th>
                  </tr>
                </thead>
                <tbody>
                  {colabs.map((c: any) => (
                    <tr key={c.colaboradorId} className="border-b border-white/5 hover:bg-white/5">
                      <td className="px-4 py-2.5">
                        <div className="text-white truncate max-w-[220px]">{c.nome}</div>
                        <div className="text-xs text-gray-500">{c.cargo}</div>
                      </td>
                      <td className="px-3 py-2.5 text-center text-xs">
                        {/* null = sem registro POR SEMANA (o carimbo é só do último envio) */}
                        <span title={c.recebeuP1 === null ? 'sem registro por semana — só o último envio fica carimbado' : ''}
                          className={c.recebeuP1 === true ? 'text-emerald-400' : c.recebeuP1 === null ? 'text-gray-700' : 'text-gray-600'}>
                          {c.recebeuP1 === null ? '·' : 'P1'}
                        </span>
                        {' / '}
                        <span title={c.recebeuP2 === null ? 'sem registro por semana — só o último envio fica carimbado' : ''}
                          className={c.recebeuP2 === true ? 'text-emerald-400' : c.recebeuP2 === null ? 'text-gray-700' : 'text-gray-600'}>
                          {c.recebeuP2 === null ? '·' : 'P2'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5"><PilulaCell abriu={c.abriuP1} formatos={c.formatosP1} /></td>
                      <td className="px-3 py-2.5"><PilulaCell abriu={c.abriuP2} formatos={c.formatosP2} /></td>
                      <td className="px-3 py-2.5 text-center"><Bool v={c.terminouVideo} /></td>
                      <td className="px-3 py-2.5"><PctBar pct={c.pctVideo} /></td>
                      <td className="px-3 py-2.5 text-center">
                        {c.consumiu
                          ? <span className="text-emerald-400" title={[c.terminouVideo && 'vídeo', c.audioTerminou && 'áudio', c.marcouConcluido && 'marcou'].filter(Boolean).join(' · ')}>✓</span>
                          : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {c.enviouEvidencia
                          ? <span className="text-amber-400" title="enviou a evidência (semana concluída)">✓</span>
                          : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {c.conversouTutor
                          ? <span className="text-violet-400" title="usou o Tira-Dúvidas da semana">💬</span>
                          : <span className="text-gray-600">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-gray-600 mt-3 leading-relaxed">
            <strong>Pílula 1 / Pílula 2</strong>: ● = engajou com a pílula (abriu o link com <code>?p=</code> OU clicou um formato dela); ícones = formatos abertos (🎬 vídeo · 🎧 áudio · 📖 texto · 📋 caso). “—” não quer dizer que não viu — o play de vídeo é contado à parte (via <code>videos_watched</code>).
            <strong> Por formato principal</strong>: o denominador é quem tem aquele formato como <em>preferido</em> (não o total); vídeo = terminou o vídeo, demais = abriu o formato.
            <strong> Abriram o link</strong> conta só o evento de abertura (novo, a partir de 15/07) — subconta; “Abriram conteúdo” inclui quem deu play no vídeo e reflete melhor a realidade.
            <strong> Evidência</strong> = concluiu a semana enviando a reflexão (o texto completo fica em Vertho → Evidências).
            <strong> Tutor</strong> = abriu conversa no Tira-Dúvidas da página da semana.
            <strong> Com filtro de semana</strong>: Recebeu = envio DENTRO daquela semana (o banco só guarda o último carimbo — semana passada vira “·” sem registro); vídeos antigos sem semana (pré-15/07) contam só em “Todas as semanas”.
          </p>
        </>
      )}

      {empresaId && loading && !resumo && (
        <div className="flex items-center gap-2 text-sm text-gray-500 p-6">
          <Loader2 size={16} className="animate-spin" /> Carregando…
        </div>
      )}
    </div>
  );
}
