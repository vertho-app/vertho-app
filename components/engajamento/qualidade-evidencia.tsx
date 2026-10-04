/**
 * Qualidade da reflexão entregue, como RH e gestor a veem: só o nível.
 * O texto da reflexão não chega a estas telas (ver `lib/engajamento/qualidade-evidencia.ts`).
 *
 * Os textos moram em `EngagementWorkspace.quality` nos quatro idiomas (R-67).
 * O componente é usado pelo Engajamento do RH e pelo do gestor (os dois são
 * componentes de cliente), então ele mesmo traduz: quem o usa não passa texto.
 */
import { useTranslations } from 'next-intl';
import {
  NIVEIS_QUALIDADE,
  normalizarQualidade,
  type QualidadeEvidencia,
} from '@/lib/engajamento/qualidade-evidencia';

const CLASSE: Record<QualidadeEvidencia, string> = {
  alta: 'border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-200',
  media: 'border-sky-300/25 bg-sky-300/[0.08] text-sky-200',
  baixa: 'border-amber-300/25 bg-amber-300/[0.08] text-amber-200',
};

/** Só a cor do texto, para o nível dentro de uma frase. */
const TEXTO: Record<QualidadeEvidencia, string> = {
  alta: 'text-emerald-200',
  media: 'text-sky-200',
  baixa: 'text-amber-200',
};

/**
 * Estado da entrega na etapa, em FRASE — não em selo aceso/apagado.
 *
 * 🔴 `Medido: 22/09/2026` (Ibipeba e Macaé, observação do dono sobre o print):
 * com os sinais presos à etapa da pessoa, o selo binário "Entrega" NUNCA acende
 * para quem está pendente — se tivesse entregue, teria andado para a semana
 * seguinte. Das 117 pessoas em jornada ativa, ele acendia para 18 (7 que
 * fecharam a etapa e esperam a próxima semana abrir, 11 com a jornada
 * concluída); nas outras 99 era um ícone cinza permanente, repetindo o que a
 * coluna "Etapa individual" já dizia.
 *
 * A frase informa nos TRÊS estados e nomeia a semana, para nunca mais haver
 * dúvida sobre de qual semana o sinal fala.
 */
export function EntregaDaEtapa({ pessoa }: { pessoa: any }) {
  const t = useTranslations('EngagementWorkspace');
  if (!pessoa || !('enviouEvidencia' in pessoa)) return null;
  const semana = Number(pessoa.semanaDoSinal);
  const temSemana = Number.isFinite(semana) && semana > 0;

  if (pessoa.jornadaConcluida) {
    const nivelFinal = normalizarQualidade(pessoa.qualidadeUltimaReflexao);
    return (
      <span
        className="block text-[10px] font-semibold leading-relaxed text-fuchsia-200"
        title={t('quality.stage.doneTitle')}
      >
        {nivelFinal
          ? t.rich('quality.stage.doneWithLevel', { level: t(`quality.levels.${nivelFinal}`), b: (trecho) => <b className={TEXTO[nivelFinal]}>{trecho}</b> })
          : t('quality.stage.done')}
      </span>
    );
  }

  if (pessoa.enviouEvidencia) {
    const nivel = normalizarQualidade(pessoa.qualidadeEvidencia);
    return (
      <span
        className="block text-[10px] font-semibold leading-relaxed text-emerald-200"
        title={t('quality.stage.deliveredTitle')}
      >
        {temSemana ? t('quality.stage.deliveredWeek', { week: semana }) : t('quality.stage.delivered')}
        {nivel
          ? <> · <b className={TEXTO[nivel]}>{t(`quality.levels.${nivel}`)}</b></>
          : <span className="text-white/35"> · {t('quality.stage.noLevel')}</span>}
      </span>
    );
  }

  return (
    <span
      className="block text-[10px] font-semibold leading-relaxed text-white/40"
      title={t('quality.stage.pendingTitle')}
    >
      {temSemana ? t('quality.stage.pendingWeek', { week: semana }) : t('quality.stage.pending')}
    </span>
  );
}

/** Faixa do resumo: quantas das pessoas que entregaram estão em cada nível. */
export function QualidadeEvidenciaResumo({ contagem }: { contagem?: Record<string, number> | null }) {
  const t = useTranslations('EngagementWorkspace');
  if (!contagem) return null;
  const semClassificacao = Number(contagem.semClassificacao) || 0;
  const total = NIVEIS_QUALIDADE.reduce((soma, nivel) => soma + (Number(contagem[nivel]) || 0), 0) + semClassificacao;
  if (!total) return null;
  return (
    <section aria-label={t('quality.title')} className="rounded-[16px] border border-white/[0.07] bg-white/[0.02] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold text-white/70">{t('quality.title')}</p>
        <p className="text-[9px] text-white/35">
          {t('quality.delivered', { count: total })}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {NIVEIS_QUALIDADE.map((nivel) => (
          <span key={nivel} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${CLASSE[nivel]}`}>
            {t(`quality.levels.${nivel}`)}
            <span className="font-mono tabular-nums">{Number(contagem[nivel]) || 0}</span>
          </span>
        ))}
        {semClassificacao > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1 text-[10px] font-bold text-white/40">
            {t('quality.noClassification')}
            <span className="font-mono tabular-nums">{semClassificacao}</span>
          </span>
        )}
      </div>
      <p className="mt-2 text-[9px] leading-relaxed text-white/32">
        {t('quality.note')}
      </p>
    </section>
  );
}
