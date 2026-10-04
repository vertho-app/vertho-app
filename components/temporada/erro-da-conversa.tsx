import { chaveDaFalha, type FalhaDaConversa } from '@/lib/season-engine/falha-da-conversa';

/**
 * A falha de uma conversa da semana, dita no idioma da pessoa, com a saída quando há
 * uma (R-91, 04/10/2026).
 *
 * `role="alert"` para o leitor de tela anunciar sem a pessoa procurar. O botão só
 * aparece onde repetir o pedido pode mudar o resultado: sessão vencida, limite do dia
 * e semana bloqueada não melhoram tentando de novo (ver `chaveDaFalha`).
 *
 * Mora fora da página porque página do Next só exporta o componente da rota, e
 * porque assim a tela dos erros se renderiza em teste sem montar a semana inteira.
 */
export default function ErroDaConversa({
  falha,
  onRetry,
  t,
}: {
  falha: FalhaDaConversa;
  onRetry?: () => void;
  /** `useTranslations('SeasonWeek')`: as chaves são `chatError.*`. */
  t: (chave: string, params?: Record<string, number>) => string;
}) {
  const { chave, params, repetir } = chaveDaFalha(falha);
  return (
    <div role="alert" className="mt-3 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-[12px] leading-snug text-red-100">
      <p>{t(chave, params)}</p>
      {repetir && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1.5 rounded-md bg-red-400/20 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-red-400/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400"
        >
          {t('chatError.retry')}
        </button>
      )}
    </div>
  );
}
