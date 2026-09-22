/**
 * Qualidade da reflexão entregue, como RH e gestor a veem: só o nível.
 * O texto da reflexão não chega a estas telas (ver `lib/engajamento/qualidade-evidencia.ts`).
 */
import {
  NIVEIS_QUALIDADE,
  ROTULO_QUALIDADE,
  normalizarQualidade,
  type QualidadeEvidencia,
} from '@/lib/engajamento/qualidade-evidencia';

const CLASSE: Record<QualidadeEvidencia, string> = {
  alta: 'border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-200',
  media: 'border-sky-300/25 bg-sky-300/[0.08] text-sky-200',
  baixa: 'border-amber-300/25 bg-amber-300/[0.08] text-amber-200',
};

/** Selo por pessoa. Não renderiza nada se a pessoa não entregou. */
export function QualidadeEvidenciaSelo({ pessoa }: { pessoa: any }) {
  if (!pessoa?.enviouEvidencia || !('qualidadeEvidencia' in pessoa)) return null;
  const nivel = normalizarQualidade(pessoa.qualidadeEvidencia);
  if (!nivel) {
    return (
      <span
        className="inline-flex items-center rounded-full border border-white/[0.07] bg-white/[0.025] px-2 py-1 text-[9px] font-bold text-white/35"
        title="Semana de missão ou reflexão sem classificação. Só semanas de conteúdo recebem nível."
      >
        Reflexão: sem classificação
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-1 text-[9px] font-bold ${CLASSE[nivel]}`}
      title="Nível da reflexão da etapa atual da pessoa, classificado pela IA ao fechar a semana. O texto da reflexão é privado."
    >
      Reflexão: {ROTULO_QUALIDADE[nivel]}
    </span>
  );
}

/** Faixa do resumo: quantas das pessoas que entregaram estão em cada nível. */
export function QualidadeEvidenciaResumo({ contagem }: { contagem?: Record<string, number> | null }) {
  if (!contagem) return null;
  const semClassificacao = Number(contagem.semClassificacao) || 0;
  const total = NIVEIS_QUALIDADE.reduce((soma, nivel) => soma + (Number(contagem[nivel]) || 0), 0) + semClassificacao;
  if (!total) return null;
  return (
    <section aria-label="Qualidade das reflexões" className="rounded-[16px] border border-white/[0.07] bg-white/[0.02] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold text-white/70">Qualidade das reflexões</p>
        <p className="text-[9px] text-white/35">
          {total} {total === 1 ? 'pessoa entregou' : 'pessoas entregaram'} · nível da reflexão na etapa atual de cada uma
        </p>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {NIVEIS_QUALIDADE.map((nivel) => (
          <span key={nivel} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${CLASSE[nivel]}`}>
            {ROTULO_QUALIDADE[nivel]}
            <span className="font-mono tabular-nums">{Number(contagem[nivel]) || 0}</span>
          </span>
        ))}
        {semClassificacao > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1 text-[10px] font-bold text-white/40">
            Sem classificação
            <span className="font-mono tabular-nums">{semClassificacao}</span>
          </span>
        )}
      </div>
      <p className="mt-2 text-[9px] leading-relaxed text-white/32">
        A IA classifica a reflexão ao fechar cada semana de conteúdo: alta traz exemplo concreto e aprendizado próprio; média fica no geral; baixa é genérica ou muito curta. O texto é privado da pessoa e não aparece aqui.
      </p>
    </section>
  );
}
