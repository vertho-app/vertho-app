import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

/**
 * A Server Action do mapeamento faz trabalho pesado DEPOIS da resposta:
 * `after()` gera os textos do relatório, o PDF, o roteiro da devolutiva e o
 * TTS. Somados, passam com folga do orçamento padrão de uma função — e o que
 * estoura no `after()` não falha na cara de ninguém: some em silêncio, e a
 * pessoa só descobre ao clicar em "Ouvir" e esperar tudo de novo.
 *
 * 300s é o mesmo teto que as telas de lote do admin já usam.
 */
export const maxDuration = 300;

export default async function MapeamentoLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('Common.actions');
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-10 pt-5 sm:px-6 lg:px-10" data-mapeamento="container">
      {/* Perfil sem resultado redireciona para o mapeamento: voltar para lá cria um loop.
          /dashboard resolve a casa real, inclusive o convite do convidado B. */}
      <Link href="/dashboard" data-mapeamento="voltar-inicio" className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-brand-200 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-400">
        <ArrowLeft size={18} aria-hidden="true" />
        {t('backToHome')}
      </Link>
      {children}
    </div>
  );
}
