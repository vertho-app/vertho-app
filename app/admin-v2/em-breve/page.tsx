export const metadata = { title: 'Área do protótipo · em breve' };

const TEXTO: Record<string, { titulo: string; descricao: string }> = {
  conteudo: {
    titulo: 'Estúdio de Conteúdo',
    descricao:
      'Biblioteca, produção, jobs, kits e cobertura, fontes e desempenho. É o destino com maior peso operacional do mapa (393): extração e importação são caras, irreversíveis e em lote, então é onde o preflight importa mais.',
  },
  crescimento: {
    titulo: 'Crescimento',
    descricao: 'Radar Empresas, mercado potencial e prospecção — 5 telas de hoje, com a ficha da empresa virando drawer.',
  },
  comercial: {
    titulo: 'Comercial & Financeiro',
    descricao:
      'Filas do canal, propostas, representantes, comissões e custos com precificação. O Orçamento migra de “Custos” porque é ferramenta de pré-venda.',
  },
  plataforma: {
    titulo: 'Plataforma',
    descricao:
      'Acessos, governança, dados e operação técnica. Board e Simulador de Fluxo ficam aqui e continuam com porta própria — o menu é a única entrada deles hoje.',
  },
};

export default async function EmBrevePage({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  const { area } = await searchParams;
  const conteudo = TEXTO[area ?? ''] ?? {
    titulo: 'Área do protótipo',
    descricao: 'Esta área segue o mesmo padrão das demais.',
  };

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[var(--navy-card)] px-6 py-14 text-center shadow-[0_8px_20px_rgba(0,0,0,0.18)]">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
        Ainda não detalhada no protótipo
      </span>
      <h2 className="mb-1.5 mt-2.5 text-base font-semibold">{conteudo.titulo}</h2>
      <p className="mx-auto max-w-[68ch] text-[13.5px] text-[var(--ink-dim)]">{conteudo.descricao}</p>
      <p className="mx-auto mt-4 max-w-[68ch] text-xs text-[var(--ink-faint)]">
        O protótipo detalha <b className="text-[var(--ink-dim)]">Meu trabalho</b> e o{' '}
        <b className="text-[var(--ink-dim)]">workspace do cliente</b>, que são o núcleo da mudança. As demais áreas
        herdam as mesmas regras: navegação local, uma ação primária por tela e preflight antes de IA, lote, envio ou
        exclusão.
      </p>
    </div>
  );
}
