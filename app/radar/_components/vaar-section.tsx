import { Award, AlertTriangle, Check, X } from 'lucide-react';

export type VaarSnapshot = {
  ano: number;
  cond_i: boolean | null;
  cond_ii: boolean | null;
  cond_iii: boolean | null;
  cond_iv: boolean | null;
  cond_v: boolean | null;
  habilitado: boolean | null;
  evoluiu_atendimento: boolean | null;
  evoluiu_aprendizagem: boolean | null;
  beneficiario: boolean | null;
  pendencia: string | null;
};

// Descrições derivadas da Lei nº 14.113/2020, art. 14, §1º (incisos I a V)
const COND_LABELS: Record<string, string> = {
  i:   'Avaliação institucional ao fim do ensino fundamental I (alfabetização)',
  ii:  'Plano de Carreira e Remuneração com avaliação periódica de desempenho docente',
  iii: 'Critério técnico de mérito e desempenho na nomeação dos diretores escolares',
  iv:  'Programa estruturado de educação em tempo integral',
  v:   'Programa estruturado de inclusão e atendimento educacional especializado',
};

function StatusBadge({ value, label }: { value: boolean | null; label: string }) {
  if (value === null) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.06]">
        <span className="text-white/40 text-xs">—</span>
        <span className="text-[11px] text-white/45">{label}</span>
      </div>
    );
  }
  const ok = value === true;
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg border"
      style={{
        borderColor: ok ? 'rgba(110, 231, 183, 0.2)' : 'rgba(249, 115, 84, 0.2)',
        background: ok ? 'rgba(110, 231, 183, 0.06)' : 'rgba(249, 115, 84, 0.06)',
      }}
    >
      {ok ? (
        <Check size={14} style={{ color: '#6EE7B7' }} />
      ) : (
        <X size={14} style={{ color: '#F97354' }} />
      )}
      <span className="text-[11px] text-white/80">{label}</span>
    </div>
  );
}

export function VaarSection({ vaar }: { vaar: VaarSnapshot | null }) {
  if (!vaar) return null;

  const isBeneficiario = vaar.beneficiario === true;
  const headerBg = isBeneficiario
    ? 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))'
    : 'linear-gradient(135deg, rgba(249,115,84,0.12), rgba(249,115,84,0.04))';
  const headerBorder = isBeneficiario ? 'rgba(110,231,183,0.25)' : 'rgba(249,115,84,0.25)';

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <Award size={18} style={{ color: '#34c5cc' }} />
        <h2 className="text-white text-xl font-bold">
          VAAR — Complementação por Resultado
        </h2>
      </div>
      <p className="text-xs text-white/55 mb-4 leading-relaxed">
        O VAAR é a parcela do FUNDEB que premia <strong className="text-white/80">resultado
        educacional</strong>. Para receber em {vaar.ano}, o município precisa cumprir as 5
        condições legais (Lei nº 14.113/2020, art. 14, §1º) <em>e</em> ter evoluído em
        <strong className="text-white/80"> pelo menos um</strong> dos indicadores
        (atendimento ou aprendizagem) em relação ao ano anterior.
      </p>

      <div
        className="rounded-2xl p-5 border mb-4"
        style={{ background: headerBg, borderColor: headerBorder }}
      >
        <p className="text-[9px] tracking-[0.25em] uppercase font-mono text-white/55 mb-1">
          Status {vaar.ano}
        </p>
        <p
          className="text-2xl font-bold"
          style={{ color: isBeneficiario ? '#6EE7B7' : '#F97354' }}
        >
          {isBeneficiario ? 'Beneficiário' : 'Não beneficiário'}
        </p>
        {vaar.habilitado === false && (
          <p className="text-[11px] text-white/55 mt-1">
            Não atende todas as condições legais para habilitação.
          </p>
        )}
        {vaar.habilitado === true && !isBeneficiario && (
          <p className="text-[11px] text-white/55 mt-1">
            Habilitado, mas não evoluiu em nenhum dos dois indicadores.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
        <StatusBadge value={vaar.cond_i}   label={`I — ${COND_LABELS.i}`} />
        <StatusBadge value={vaar.cond_ii}  label={`II — ${COND_LABELS.ii}`} />
        <StatusBadge value={vaar.cond_iii} label={`III — ${COND_LABELS.iii}`} />
        <StatusBadge value={vaar.cond_iv}  label={`IV — ${COND_LABELS.iv}`} />
        <StatusBadge value={vaar.cond_v}   label={`V — ${COND_LABELS.v}`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
        <StatusBadge value={vaar.evoluiu_atendimento}  label="Evoluiu indicador de atendimento" />
        <StatusBadge value={vaar.evoluiu_aprendizagem} label="Evoluiu indicador de aprendizagem" />
      </div>

      {vaar.pendencia && (
        <div
          className="rounded-2xl p-4 border flex gap-3"
          style={{ background: 'rgba(245,158,11,0.07)', borderColor: 'rgba(252,211,77,0.2)' }}
        >
          <AlertTriangle size={16} style={{ color: '#FCD34D', flexShrink: 0, marginTop: 2 }} />
          <div>
            <p className="text-[10px] tracking-[0.25em] uppercase font-mono mb-1"
               style={{ color: '#FCD34D' }}>
              Pendência identificada
            </p>
            <p className="text-xs text-white/75 leading-relaxed">{vaar.pendencia}</p>
          </div>
        </div>
      )}

      <p className="text-[10px] text-white/40 mt-3">
        Fonte: FNDE — Lista de entes beneficiários/não beneficiários da complementação VAAR · {vaar.ano}
      </p>
    </section>
  );
}
