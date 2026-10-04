export interface AlternativaDeFormato {
  formato: string;
  rotulo: string;
  onAbrir: () => void;
}

/**
 * O formato da semana que não abriu, dito, com as saídas (R-93, 04/10/2026).
 *
 * Antes um PDF sem arquivo mostrava o JSON `{"error": ...}` dentro do quadro, um áudio
 * sem arquivo ficava mudo e a pessoa não via explicação nem caminho. Aqui ela lê o que
 * houve e abre outro formato da MESMA semana (os que de fato têm fonte), ou tenta de novo
 * quando repetir pode resolver.
 *
 * `t` é o `useTranslations('SeasonWeek')`: as chaves são `formats.*`.
 */
export default function FormatoIndisponivel({
  mensagem,
  alternativas,
  onTentarDeNovo,
  t,
}: {
  mensagem: string;
  alternativas: AlternativaDeFormato[];
  onTentarDeNovo?: () => void;
  t: (chave: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <div role="alert" className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
      <p className="leading-snug">{mensagem}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {onTentarDeNovo && (
          <button
            type="button"
            onClick={onTentarDeNovo}
            className="rounded-md bg-amber-400/20 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-400/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400"
          >
            {t('formats.retry')}
          </button>
        )}
        {alternativas.length > 0 && (
          <>
            <span className="text-[11px] text-amber-100/80">{t('formats.tryOther')}</span>
            {alternativas.map((a) => (
              <button
                key={a.formato}
                type="button"
                onClick={a.onAbrir}
                className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400"
              >
                {a.rotulo}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
