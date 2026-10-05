import { carregarDRE, normalizarJanela, type DadosDRE } from '@/lib/dre/carregar';
import DreView from './DreView';

export const metadata = { title: 'DRE por tenant · Admin' };
export const dynamic = 'force-dynamic';

export default async function DrePage({ searchParams }: { searchParams: Promise<{ semanas?: string; empresa?: string }> }) {
  const { semanas: semanasParam, empresa } = await searchParams;
  // Valores vindos da URL: a janela só vale se for uma das opções conhecidas.
  const semanas = normalizarJanela(Number(semanasParam));
  // O id da empresa só serve para abrir o cliente certo; quem confere é a carga.
  const empresaInicial = typeof empresa === 'string' && /^[0-9a-f-]{36}$/i.test(empresa) ? empresa : null;

  let dados: DadosDRE | null = null;
  let erro: string | null = null;
  let semAcesso = false;
  try {
    dados = await carregarDRE({ semanas });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.startsWith('FORBIDDEN') || msg.startsWith('UNAUTHORIZED')) semAcesso = true;
    else erro = msg || 'falha ao carregar';
  }

  if (semAcesso) {
    return (
      <div className="m-6 rounded-md border border-amber-400/35 bg-amber-400/[0.06] px-5 py-4 text-sm text-amber-100">
        Você não tem permissão para ver a DRE por tenant. Peça a um administrador master para liberar a permissão "Ver DRE por tenant".
      </div>
    );
  }
  if (erro || !dados) {
    return (
      <div className="m-6 rounded-md border border-red-400/35 bg-red-400/[0.06] px-5 py-4 text-sm text-red-200">
        A DRE não conseguiu carregar. {erro}
      </div>
    );
  }

  return <DreView dados={dados} empresaInicial={empresaInicial} />;
}
