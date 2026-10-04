import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * A leitura que alimenta o painel falhou, dita com a saída (R-139, 04/10/2026).
 *
 * Antes, falha de banco virava lista vazia e o gestor lia "sem liderados" (ou a evolução
 * da equipe vazia). Aqui a tela diz que NÃO sabe, e que isso não quer dizer que a equipe
 * esteja vazia, e oferece tentar de novo.
 *
 * `t` é o `useTranslations('ManagerDashboard')`: chaves `unavailable` e `retry`.
 */
export default function LeituraIndisponivel({ onRetry, t }: { onRetry: () => void; t: (chave: string) => string }) {
  return (
    <div role="alert" className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.05] p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[13px] leading-snug text-amber-100">{t('unavailable')}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-400/20 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-400/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400"
          >
            <RefreshCw size={13} aria-hidden="true" /> {t('retry')}
          </button>
        </div>
      </div>
    </div>
  );
}
