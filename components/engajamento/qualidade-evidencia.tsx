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
  if (!pessoa || !('enviouEvidencia' in pessoa)) return null;
  const semana = Number(pessoa.semanaDoSinal);
  const daSemana = Number.isFinite(semana) && semana > 0 ? ` da semana ${semana}` : '';

  if (pessoa.jornadaConcluida) {
    const nivelFinal = normalizarQualidade(pessoa.qualidadeUltimaReflexao);
    return (
      <span
        className="block text-[10px] font-semibold leading-relaxed text-fuchsia-200"
        title="A pessoa fechou a última semana do plano. O nível é o da última reflexão classificada; o texto é privado."
      >
        Jornada concluída{nivelFinal ? <> · última reflexão <b className={TEXTO[nivelFinal]}>{ROTULO_QUALIDADE[nivelFinal]}</b></> : null}
      </span>
    );
  }

  if (pessoa.enviouEvidencia) {
    const nivel = normalizarQualidade(pessoa.qualidadeEvidencia);
    return (
      <span
        className="block text-[10px] font-semibold leading-relaxed text-emerald-200"
        title="Etapa fechada: a evidência desta semana já foi registrada. O nível é classificado pela IA; o texto da reflexão é privado."
      >
        Evidência{daSemana} entregue
        {nivel
          ? <> · <b className={TEXTO[nivel]}>{ROTULO_QUALIDADE[nivel]}</b></>
          : <span className="text-white/35"> · semana de missão, sem nível</span>}
      </span>
    );
  }

  return (
    <span
      className="block text-[10px] font-semibold leading-relaxed text-white/40"
      title="A evidência que fecha esta semana ainda não foi registrada."
    >
      Evidência{daSemana} pendente
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
