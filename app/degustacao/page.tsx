import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { METADADOS_DA_DEGUSTACAO, PaginaDaDegustacaoView } from './pagina-da-degustacao';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = METADADOS_DA_DEGUSTACAO;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function lerParametro(valor: string | string[] | undefined): string | null {
  return typeof valor === 'string' && valor ? valor : null;
}

/**
 * Página de boas-vindas da degustação B pelo link LONGO (`?passe=`). O convite
 * novo usa o link curto (`/c/<código>`), que renderiza a mesma página; esta
 * rota continua valendo para os links já enviados e para os avisos de recusa do
 * botão pessoal.
 */
export default async function PaginaDaDegustacaoPorPasse({ searchParams }: Props) {
  const parametros = await searchParams;
  const cabecalhos = await headers();
  return (
    <PaginaDaDegustacaoView
      identificacao={{ passe: lerParametro(parametros.passe) }}
      aviso={lerParametro(parametros.aviso)}
      hostname={String(cabecalhos.get('host') || '').split(':')[0].toLowerCase()}
    />
  );
}
