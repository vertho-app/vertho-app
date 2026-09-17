import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { METADADOS_DA_DEGUSTACAO, PaginaDaDegustacaoView } from '@/app/degustacao/pagina-da-degustacao';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = METADADOS_DA_DEGUSTACAO;

type Props = {
  params: Promise<{ codigo: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Link curto do convite da degustação: `https://<ambiente>.vertho.ai/c/<código>`.
 *
 * Renderiza a página de boas-vindas direto, sem redirecionar: o endereço que a
 * pessoa vê continua curto, e nada com passe aparece na barra. A decisão de
 * acesso é a mesma do link longo (`abrirAcessoPorCodigoCurto`): código assinado
 * para o ambiente do hostname, sessão viva no banco. Abrir não cria sessão.
 */
export default async function PaginaDaDegustacaoPorCodigo({ params, searchParams }: Props) {
  const { codigo } = await params;
  const parametros = await searchParams;
  const cabecalhos = await headers();
  const aviso = typeof parametros.aviso === 'string' ? parametros.aviso : null;
  return (
    <PaginaDaDegustacaoView
      identificacao={{ codigo }}
      aviso={aviso}
      hostname={String(cabecalhos.get('host') || '').split(':')[0].toLowerCase()}
    />
  );
}
