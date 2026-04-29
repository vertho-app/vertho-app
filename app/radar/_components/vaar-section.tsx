import { Award, AlertTriangle, Check, X, TrendingUp } from 'lucide-react';
import type { VaarEstimativa } from '@/lib/radar/vaar-estimativa';

const FMT_BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
});

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

export type VaarReceita = {
  ano: number;
  receita_contribuicao: number | null;
  complementacao_vaaf: number | null;
  complementacao_vaat: number | null;
  complementacao_vaar: number | null;
  complementacao_uniao_total: number | null;
  total_receita_prevista: number | null;
};

// Descrições oficiais da Lei nº 14.113/2020, art. 14, §1º (incisos I a V).
// Detalhamento por Resoluções CIF (1/2022 a 17/2025).
const COND_LABELS: Record<string, string> = {
  i:   'Provimento de gestor escolar por critério técnico de mérito e desempenho',
  ii:  'Participação ≥ 80% dos estudantes nas avaliações Saeb',
  iii: 'Redução de desigualdades educacionais (raça/cor e socioeconômica)',
  iv:  'ICMS Educacional — lei estadual com critérios educacionais',
  v:   'Currículo alinhado à BNCC, com Computação na Educação Básica',
};

// Onde a Vertho atua — honestidade técnica em vez de prometer demais.
// 🟢 atuação direta · 🟡 atuação indireta · 🔴 fora do escopo
const COND_VERTHO_NOTA: Record<string, string> = {
  i:   '🟡 Vertho contribui via avaliação periódica de gestores (subcritério I.e da Resolução CIF 15/2025).',
  ii:  '🔴 Comparecimento dos alunos no Saeb depende de logística da rede; fora do escopo Vertho.',
  iii: '🟡 Vertho atua indiretamente via Diferenciação Pedagógica como competência docente.',
  iv:  '🔴 Critério estadual (lei do ICMS Educacional). Município herda o status do estado.',
  v:   '🟢 Vertho desenvolve professores dentro do referencial BNCC — atua na implementação efetiva.',
};

function ReceitaCell({
  label, valor, destaque,
}: { label: string; valor: number | null; destaque?: boolean }) {
  return (
    <div>
      <p className="text-[9px] tracking-[0.18em] uppercase font-mono text-white/40 mb-1">
        {label}
      </p>
      <p className={`text-base font-bold font-mono ${destaque ? '' : 'text-white/85'}`}
         style={destaque ? { color: '#6EE7B7' } : undefined}>
        {valor != null ? FMT_BRL.format(valor) : '—'}
      </p>
    </div>
  );
}

function StatusBadge({ value, label, nota }: { value: boolean | null; label: string; nota?: string }) {
  if (value === null) {
    return (
      <div
        className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-white/[0.06]"
        title={nota}
      >
        <span className="text-white/40 text-xs leading-none mt-0.5">—</span>
        <div className="flex-1 min-w-0">
          <span className="text-[11px] text-white/45 block leading-snug">{label}</span>
          {nota && <span className="text-[10px] text-white/35 block mt-1 leading-snug">{nota}</span>}
        </div>
      </div>
    );
  }
  const ok = value === true;
  return (
    <div
      className="flex items-start gap-2 px-3 py-2.5 rounded-lg border"
      style={{
        borderColor: ok ? 'rgba(110, 231, 183, 0.2)' : 'rgba(249, 115, 84, 0.2)',
        background: ok ? 'rgba(110, 231, 183, 0.06)' : 'rgba(249, 115, 84, 0.06)',
      }}
      title={nota}
    >
      {ok ? (
        <Check size={14} style={{ color: '#6EE7B7', marginTop: 2, flexShrink: 0 }} />
      ) : (
        <X size={14} style={{ color: '#F97354', marginTop: 2, flexShrink: 0 }} />
      )}
      <div className="flex-1 min-w-0">
        <span className="text-[11px] text-white/80 block leading-snug">{label}</span>
        {nota && <span className="text-[10px] text-white/55 block mt-1 leading-snug">{nota}</span>}
      </div>
    </div>
  );
}

export function VaarSection({
  vaar,
  receita,
  estimativa,
}: {
  vaar: VaarSnapshot | null;
  receita?: VaarReceita | null;
  estimativa?: VaarEstimativa | null;
}) {
  if (!vaar) return null;

  const isBeneficiario = vaar.beneficiario === true;
  const valorVaar = receita?.complementacao_vaar ?? null;
  const totalReceita = receita?.total_receita_prevista ?? null;
  const compTotal = receita?.complementacao_uniao_total ?? null;

  // Proximidade VAAR — quantas das 5 condições legais o município atende
  const condRespostas = [vaar.cond_i, vaar.cond_ii, vaar.cond_iii, vaar.cond_iv, vaar.cond_v];
  const condAtende = condRespostas.filter((c) => c === true).length;
  const condInformadas = condRespostas.filter((c) => c !== null).length;
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
        O VAAR é a parcela do FUNDEB (≈ 2,5% da complementação federal) que premia{' '}
        <strong className="text-white/80">resultado educacional</strong>. Para receber em {vaar.ano},
        o município precisa cumprir as 5 condicionalidades da Lei nº 14.113/2020, art. 14, §1º{' '}
        <em>e</em> ter evoluído em <strong className="text-white/80">pelo menos um</strong> dos
        indicadores (atendimento ou aprendizagem) em relação ao ano anterior. Detalhamento por
        Resoluções CIF (1/2022 a 17/2025); aferição via SIMEC (incisos I, IV, V) e microdados
        Saeb/INEP (II, III).
      </p>
      <p className="text-[11px] text-white/45 mb-4 leading-relaxed border-l-2 border-cyan-400/30 pl-3">
        Cada condicionalidade abaixo traz, em itálico, onde a Vertho atua:
        <span className="text-white/55"> 🟢 atuação direta · 🟡 atuação indireta · 🔴 fora do escopo</span>.
      </p>

      <div
        className="rounded-2xl p-5 border mb-4"
        style={{ background: headerBg, borderColor: headerBorder }}
      >
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
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
          {valorVaar != null && valorVaar > 0 && (
            <div className="text-right">
              <p className="text-[9px] tracking-[0.25em] uppercase font-mono text-white/55 mb-1">
                Recebimento {receita?.ano ?? vaar.ano}
              </p>
              <p className="text-2xl font-bold font-mono" style={{ color: '#6EE7B7' }}>
                {FMT_BRL.format(valorVaar)}
              </p>
            </div>
          )}
          {valorVaar != null && valorVaar === 0 && (
            <div className="text-right">
              <p className="text-[9px] tracking-[0.25em] uppercase font-mono text-white/55 mb-1">
                Recebimento {receita?.ano ?? vaar.ano}
              </p>
              <p className="text-lg font-bold font-mono text-white/45">R$ 0</p>
            </div>
          )}
        </div>
      </div>

      {receita && totalReceita != null && (
        <div className="rounded-2xl p-4 border border-white/[0.06] mb-4"
          style={{ background: 'rgba(255,255,255,0.03)' }}>
          <p className="text-[10px] tracking-[0.25em] uppercase font-mono text-white/45 mb-3">
            Receita FUNDEB prevista {receita.ano} (Portaria Interministerial)
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <ReceitaCell label="Contribuição UF/Mun." valor={receita.receita_contribuicao} />
            <ReceitaCell label="Compl. VAAF" valor={receita.complementacao_vaaf} />
            <ReceitaCell label="Compl. VAAT" valor={receita.complementacao_vaat} />
            <ReceitaCell
              label="Compl. VAAR"
              valor={receita.complementacao_vaar}
              destaque={isBeneficiario}
            />
          </div>
          <div className="flex justify-between items-baseline pt-3 border-t border-white/[0.06]">
            <span className="text-[11px] text-white/55">
              Complementação total da União: {compTotal != null ? FMT_BRL.format(compTotal) : '—'}
            </span>
            <span className="text-sm font-bold text-white font-mono">
              Total: {FMT_BRL.format(totalReceita)}
            </span>
          </div>
        </div>
      )}

      {condInformadas > 0 && (
        <div className="rounded-2xl p-4 border border-white/[0.06] mb-3"
          style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <p className="text-[10px] tracking-[0.25em] uppercase font-mono text-white/55">
              Proximidade VAAR · {vaar.ano}
            </p>
            <p className="text-xs text-white/45 font-mono">
              {condAtende} de 5
            </p>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="h-full rounded-full transition-all"
              style={{
                width: `${(condAtende / 5) * 100}%`,
                background: condAtende === 5 ? '#6EE7B7' : condAtende >= 3 ? '#FCD34D' : '#F97354',
              }} />
          </div>
          <p className="text-[11px] text-white/55 mt-2 leading-relaxed">
            {condAtende === 5 && !isBeneficiario && (
              <>Atende as 5 condições legais. Falta apenas evoluir em pelo menos um dos indicadores (atendimento ou aprendizagem).</>
            )}
            {condAtende === 5 && isBeneficiario && <>Atende as 5 condições legais e foi classificado como beneficiário.</>}
            {condAtende < 5 && condAtende > 0 && (
              <>Atende {condAtende} {condAtende === 1 ? 'das 5 condições' : 'das 5 condições'} legais. Para se habilitar, ajustar os {5 - condAtende} {5 - condAtende === 1 ? 'critério restante' : 'critérios restantes'} (detalhe abaixo).</>
            )}
            {condAtende === 0 && <>Não atende nenhuma das 5 condições legais para habilitação à VAAR.</>}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
        <StatusBadge value={vaar.cond_i}   label={`I — ${COND_LABELS.i}`}   nota={COND_VERTHO_NOTA.i} />
        <StatusBadge value={vaar.cond_ii}  label={`II — ${COND_LABELS.ii}`}  nota={COND_VERTHO_NOTA.ii} />
        <StatusBadge value={vaar.cond_iii} label={`III — ${COND_LABELS.iii}`} nota={COND_VERTHO_NOTA.iii} />
        <StatusBadge value={vaar.cond_iv}  label={`IV — ${COND_LABELS.iv}`}  nota={COND_VERTHO_NOTA.iv} />
        <StatusBadge value={vaar.cond_v}   label={`V — ${COND_LABELS.v}`}   nota={COND_VERTHO_NOTA.v} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
        <StatusBadge value={vaar.evoluiu_atendimento}  label="Evoluiu indicador de atendimento" />
        <StatusBadge value={vaar.evoluiu_aprendizagem} label="Evoluiu indicador de aprendizagem" />
      </div>

      {!isBeneficiario && !estimativa && receita && (
        <div
          className="rounded-2xl p-5 border mb-4"
          style={{
            background: 'rgba(255,255,255,0.03)',
            borderColor: 'rgba(255,255,255,0.08)',
          }}
        >
          <div className="flex items-start gap-3">
            <TrendingUp size={18} style={{ color: '#9ae2e6', flexShrink: 0, marginTop: 2 }} />
            <div className="flex-1">
              <p className="text-[10px] tracking-[0.25em] uppercase font-mono mb-1"
                 style={{ color: '#9ae2e6' }}>
                Estimativa de receita potencial · não aplicável
              </p>
              <p className="text-[12px] text-white/65 leading-relaxed">
                A VAAR é parte da <strong className="text-white/85">complementação da União ao FUNDEB</strong>{' '}
                — destinada a redes que recebem VAAF/VAAT (cidades com receita própria insuficiente
                para garantir o valor mínimo por aluno). Este município não recebe complementação federal
                em {receita.ano}, portanto a projeção financeira da VAAR não se aplica ao seu perfil.
                <br /><br />
                <span className="text-white/45">
                  O bloco de "Proximidade VAAR" acima ainda é útil: indica quais critérios pedagógicos a rede
                  já cumpre — relevantes mesmo para redes que não disputam complementação federal.
                </span>
              </p>
            </div>
          </div>
        </div>
      )}

      {!isBeneficiario && estimativa && (
        <div
          className="rounded-2xl p-5 border mb-4"
          style={{
            background: 'linear-gradient(135deg, rgba(52,197,204,0.08), rgba(52,197,204,0.02))',
            borderColor: 'rgba(52,197,204,0.25)',
          }}
        >
          <div className="flex items-start gap-3 mb-3">
            <TrendingUp size={18} style={{ color: '#34c5cc', flexShrink: 0, marginTop: 2 }} />
            <div className="flex-1">
              <p className="text-[10px] tracking-[0.25em] uppercase font-mono mb-1"
                 style={{ color: '#34c5cc' }}>
                Estimativa de receita potencial · projeção
              </p>
              <p className="text-[11px] text-white/65 leading-relaxed">
                Se o município se habilitasse à VAAR e fosse classificado como beneficiário em {estimativa.ano},
                a estimativa de receita complementar seria:
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <p className="text-[9px] tracking-[0.18em] uppercase font-mono text-white/40 mb-1">
                P25 (cenário conservador)
              </p>
              <p className="text-base font-mono text-white/75">
                {FMT_BRL.format(estimativa.estimativaP25)}
              </p>
            </div>
            <div>
              <p className="text-[9px] tracking-[0.18em] uppercase font-mono text-white/55 mb-1">
                Mediana
              </p>
              <p className="text-xl font-mono font-bold" style={{ color: '#34c5cc' }}>
                {FMT_BRL.format(estimativa.estimativaP50)}
              </p>
            </div>
            <div>
              <p className="text-[9px] tracking-[0.18em] uppercase font-mono text-white/40 mb-1">
                P75 (cenário otimista)
              </p>
              <p className="text-base font-mono text-white/75">
                {FMT_BRL.format(estimativa.estimativaP75)}
              </p>
            </div>
          </div>

          <p className="text-[10px] text-white/45 leading-relaxed border-t border-white/[0.06] pt-3">
            <strong className="text-white/65">Metodologia:</strong> projeção baseada na razão mediana entre
            VAAR e (VAAF + VAAT) entre {estimativa.amostraTamanho} municípios beneficiários
            {estimativa.metodologiaBase === 'uf' ? ` da mesma UF` : ' do Brasil (amostra UF insuficiente)'}, aplicada à
            complementação federal já recebida pelo município ({FMT_BRL.format(estimativa.baseComplementacao)}).
            Fração mediana usada: {(estimativa.ufRatio * 100).toFixed(1)}%.
            <br />
            <strong className="text-white/65">Não substitui</strong> análise oficial do FNDE — pressupõe que o município evolua nos indicadores
            de atendimento ou aprendizagem e atenda às 5 condições legais.
          </p>
        </div>
      )}

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
