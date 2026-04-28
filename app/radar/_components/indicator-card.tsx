import { ETAPA_LABELS, DISC_LABELS, pctNivel0a1 } from '@/lib/radar/leitura-deterministica';
import type { SaebSnapshot } from '@/lib/radar/queries';

export function SaebCard({ snapshot }: { snapshot: SaebSnapshot }) {
  const pctEsc = pctNivel0a1(snapshot.distribuicao);
  const pctSim = snapshot.similares ? pctNivel0a1(snapshot.similares) : null;
  const delta = pctSim != null ? pctEsc - pctSim : null;
  const deltaCor = delta == null ? '#94A3B8' : delta > 5 ? '#F97354' : delta < -5 ? '#34D399' : '#94A3B8';

  return (
    <div
      className="rounded-2xl p-5 border"
      style={{
        background: 'rgba(255,255,255,0.03)',
        borderColor: 'rgba(255,255,255,0.06)',
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-[10px] tracking-[0.2em] uppercase font-mono" style={{ color: '#34c5cc' }}>
            Saeb {snapshot.ano} · {DISC_LABELS[snapshot.disciplina] || snapshot.disciplina}
          </p>
          <h3 className="text-base font-bold text-white mt-1">
            {ETAPA_LABELS[snapshot.etapa] || snapshot.etapa}
          </h3>
        </div>
        {delta != null && (
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-wider text-white/40 font-mono">vs similares</p>
            <p className="text-sm font-bold font-mono" style={{ color: deltaCor }}>
              {delta > 0 ? '+' : ''}{delta.toFixed(1)} p.p.
            </p>
          </div>
        )}
      </div>

      <p className="text-xs text-white/55 leading-relaxed mb-4">
        <strong className="text-white">{pctEsc.toFixed(1)}%</strong> dos estudantes nos níveis 0-1 (insuficiente).
        {pctSim != null && (
          <> Escolas similares: <strong>{pctSim.toFixed(1)}%</strong>.</>
        )}
      </p>

      {/* Barra de níveis cumulativos da escola */}
      <NivelBar dist={snapshot.distribuicao} />

      <dl className="grid grid-cols-3 gap-2 mt-4 text-[10px] font-mono">
        {snapshot.taxa_participacao != null && (
          <Stat label="Participação" valor={`${snapshot.taxa_participacao.toFixed(1)}%`} />
        )}
        {snapshot.formacao_docente != null && (
          <Stat label="Form. docente" valor={`${snapshot.formacao_docente.toFixed(1)}%`} />
        )}
        {snapshot.matriculados != null && (
          <Stat label="Matriculados" valor={String(snapshot.matriculados)} />
        )}
      </dl>
    </div>
  );
}

function Stat({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <dt className="text-white/35 uppercase tracking-wider text-[9px]">{label}</dt>
      <dd className="text-white/85 font-bold mt-0.5">{valor}</dd>
    </div>
  );
}

function NivelBar({ dist }: { dist: Record<string, number> }) {
  const niveis = Object.keys(dist).sort((a, b) => Number(a) - Number(b));
  const totalCheck = niveis.reduce((s, k) => s + Number(dist[k] || 0), 0);
  const norm = totalCheck > 0 ? 100 / totalCheck : 1;

  return (
    <div>
      <div className="flex h-2 rounded-full overflow-hidden">
        {niveis.map((k) => {
          const v = Number(dist[k] || 0) * norm;
          if (v <= 0) return null;
          const n = Number(k);
          const cor = n <= 1 ? '#F97354' : n <= 3 ? '#F4B740' : n <= 5 ? '#34c5cc' : '#34D399';
          return (
            <span
              key={k}
              style={{
                width: `${v}%`,
                background: cor,
              }}
              title={`Nível ${k}: ${Number(dist[k]).toFixed(1)}%`}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[9px] text-white/35 mt-1.5 font-mono">
        <span>N0 (insuficiente)</span>
        <span>N{niveis[niveis.length - 1] || '—'} (avançado)</span>
      </div>
    </div>
  );
}
