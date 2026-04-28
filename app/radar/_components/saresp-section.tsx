import type { SarespSnapshot } from '@/lib/radar/queries';

const DISC_LABEL: Record<string, string> = {
  lp: 'Língua Portuguesa',
  mat: 'Matemática',
  cn: 'Ciências da Natureza',
  ch: 'Ciências Humanas',
};

const NIVEL_LABEL: Record<string, string> = {
  abaixo_basico: 'Abaixo do Básico',
  basico: 'Básico',
  adequado: 'Adequado',
  avancado: 'Avançado',
};

const NIVEL_COR: Record<string, string> = {
  abaixo_basico: '#F97354',
  basico: '#F4B740',
  adequado: '#34c5cc',
  avancado: '#34D399',
};

export function SarespSection({ saresp }: { saresp: SarespSnapshot[] }) {
  if (!saresp.length) return null;
  // Pega o ano mais recente
  const anoRecente = Math.max(...saresp.map((s) => s.ano));
  const recentes = saresp.filter((s) => s.ano === anoRecente);

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white text-xl font-bold">SARESP — Avaliação Estadual SP</h2>
        <span className="text-[10px] tracking-widest uppercase font-mono text-white/40">
          ano de referência: {anoRecente}
        </span>
      </div>
      <p className="text-xs text-white/55 mb-4">
        Sistema de Avaliação de Rendimento Escolar do Estado de São Paulo. Aplicado anualmente
        pela Seduc-SP em escolas estaduais e redes que aderem.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {recentes.map((r) => (
          <div key={`${r.serie}-${r.disciplina}`}
            className="rounded-2xl p-5 border border-white/[0.06]"
            style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-[10px] tracking-[0.2em] uppercase font-mono" style={{ color: '#34c5cc' }}>
                  Série {r.serie}{r.serie >= 10 ? '' : 'º'} · {DISC_LABEL[r.disciplina] || r.disciplina.toUpperCase()}
                </p>
                {r.proficiencia_media != null && (
                  <p className="text-2xl font-bold text-white mt-1 font-mono">
                    {r.proficiencia_media.toFixed(0)}
                    <span className="text-base text-white/45 ml-1">pts</span>
                  </p>
                )}
              </div>
              {r.total_alunos != null && (
                <span className="text-[10px] text-white/45 font-mono">
                  {r.total_alunos} alunos
                </span>
              )}
            </div>

            {r.distribuicao_niveis && Object.keys(r.distribuicao_niveis).length > 0 && (
              <>
                <div className="flex h-2 rounded-full overflow-hidden mb-2">
                  {Object.entries(NIVEL_COR).map(([k, cor]) => {
                    const v = Number(r.distribuicao_niveis[k] || 0);
                    if (v <= 0) return null;
                    return <span key={k} style={{ width: `${v}%`, background: cor }} title={`${NIVEL_LABEL[k]}: ${v.toFixed(1)}%`} />;
                  })}
                </div>
                <div className="grid grid-cols-2 gap-1 text-[10px] text-white/55 font-mono">
                  {Object.entries(NIVEL_LABEL).map(([k, label]) => {
                    const v = Number(r.distribuicao_niveis[k] || 0);
                    return (
                      <div key={k} className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: NIVEL_COR[k] }} />
                        <span className="text-white/50">{label}:</span>
                        <span className="text-white/80 font-bold">{v.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
