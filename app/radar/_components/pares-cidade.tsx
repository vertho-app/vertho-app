import Link from 'next/link';
import type { ParCidade } from '@/lib/radar/queries';

export function ParesCidadeSection({
  pares,
  municipio,
  inseGrupo,
}: {
  pares: ParCidade[];
  municipio: string;
  inseGrupo: number | null;
}) {
  if (!pares.length) return null;
  const target = pares.find((p) => p.is_target);
  if (!target) return null;
  const totalPares = target.total_pares;
  if (totalPares < 2) return null; // só faz sentido com pares pra comparar

  const targetGeral = target.saeb_geral;

  return (
    <section className="mb-12">
      <p className="text-[11px] tracking-[0.15em] uppercase font-bold mb-3" style={{ color: '#34c5cc' }}>
        Vizinhos diretos
      </p>
      <h2 className="text-white mb-3"
        style={{
          fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
          fontSize: 'clamp(24px, 3vw, 32px)',
          fontWeight: 600,
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
        }}>
        Compare com escolas do mesmo perfil em {municipio}
      </h2>
      <p className="text-white/60 mb-6 leading-relaxed" style={{ fontSize: 15, maxWidth: 720 }}>
        Lista nominal das melhores escolas de {municipio}{' '}
        {inseGrupo != null ? <>do <strong className="text-white/80">INSE Grupo {inseGrupo}</strong></> : 'do mesmo município'}{' '}
        ordenadas por Saeb (média LP + Mat). Sua escola está destacada — leia como
        "quem é referência local, e a que distância estou".
      </p>

      <div className="rounded-2xl border border-white/[0.06] overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.03)' }}>
        <div className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-white/[0.06]
                        text-[10px] tracking-[0.15em] uppercase font-mono text-white/40">
          <div className="col-span-1 text-right">#</div>
          <div className="col-span-5">Escola</div>
          <div className="col-span-2 text-right">LP</div>
          <div className="col-span-2 text-right">Mat</div>
          <div className="col-span-1 text-right">Ideb</div>
          <div className="col-span-1 text-right">Δ</div>
        </div>

        {pares.map((p) => {
          const diff = p.saeb_geral != null && targetGeral != null ? p.saeb_geral - targetGeral : null;
          const tone: 'good' | 'bad' | 'neutral' = !diff || Math.abs(diff) < 5
            ? 'neutral'
            : diff > 0 ? 'good' : 'bad';
          const corDiff = tone === 'good' ? '#86efac' : tone === 'bad' ? '#fca5a5' : 'rgba(255,255,255,0.5)';

          return (
            <Link
              key={p.codigo_inep}
              href={p.is_target ? '#' : `/radar/escola/${p.codigo_inep}`}
              aria-current={p.is_target ? 'page' : undefined}
              className={`grid grid-cols-12 gap-3 items-center px-4 py-3 border-b border-white/[0.04] last:border-b-0 transition-colors ${
                p.is_target ? '' : 'hover:bg-white/[0.04]'
              }`}
              style={
                p.is_target
                  ? {
                      background: 'rgba(220,38,38,0.06)',
                      borderLeft: '3px solid #fca5a5',
                      paddingLeft: 13, // compensa o border
                    }
                  : undefined
              }
            >
              <div className="col-span-1 text-right text-white/55 font-mono text-sm">
                {p.rank_geral}º
              </div>
              <div className="col-span-5 min-w-0">
                <p className={`text-sm truncate ${p.is_target ? 'text-white font-bold' : 'text-white/85'}`}>
                  {p.nome}
                </p>
                <p className="text-[11px] text-white/40 truncate">
                  {p.rede || '—'}{p.is_target && <span className="ml-2 text-[#fca5a5]">esta escola</span>}
                </p>
              </div>
              <div className="col-span-2 text-right font-mono"
                style={{
                  color: p.is_target ? '#fca5a5' : 'rgba(255,255,255,0.85)',
                  fontWeight: p.is_target ? 700 : 500,
                }}>
                {p.saeb_lp != null ? p.saeb_lp.toFixed(0) : '—'}
              </div>
              <div className="col-span-2 text-right font-mono"
                style={{
                  color: p.is_target ? '#fca5a5' : 'rgba(255,255,255,0.85)',
                  fontWeight: p.is_target ? 700 : 500,
                }}>
                {p.saeb_mat != null ? p.saeb_mat.toFixed(0) : '—'}
              </div>
              <div className="col-span-1 text-right font-mono text-white/65">
                {p.ideb_principal != null ? p.ideb_principal.toFixed(1) : '—'}
              </div>
              <div className="col-span-1 text-right font-mono text-xs"
                style={{ color: p.is_target ? 'rgba(255,255,255,0.4)' : corDiff }}>
                {p.is_target ? '—' : diff != null
                  ? (diff >= 0 ? '+' : '') + diff.toFixed(0)
                  : '—'}
              </div>
            </Link>
          );
        })}
      </div>

      <p className="text-[10px] text-white/40 mt-3">
        Fonte: INEP — Saeb · Ideb. Pareamento por município + grupo INSE. Δ = pontos da escola
        vs sua escola. Total de {totalPares} escolas no mesmo perfil em {municipio}.
      </p>
    </section>
  );
}
