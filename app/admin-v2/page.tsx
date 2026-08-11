import { FILAS, type Severidade } from './_dados/prototipo';

export const metadata = { title: 'Meu trabalho · protótipo' };

const BORDA: Record<Severidade, string> = {
  critica: 'border-l-[var(--danger)]',
  atencao: 'border-l-[var(--warning)]',
  informativa: 'border-l-[var(--cyan)]',
};

const NUMERO: Record<Severidade, string> = {
  critica: 'text-[var(--danger)]',
  atencao: 'text-[var(--warning)]',
  informativa: 'text-[var(--cyan)]',
};

export default function MeuTrabalhoPage() {
  return (
    <>
      <p className="max-w-[76ch] text-[13.5px] text-[var(--ink-dim)]">
        A home deixa de ser vitrine de KPI e passa a listar exceção e pendência. Cada linha diz{' '}
        <b className="text-[var(--ink)]">o que travou</b>, <b className="text-[var(--ink)]">quem é afetado</b> e{' '}
        <b className="text-[var(--ink)]">qual a próxima ação</b> — com denominador explícito, nunca um número solto.
      </p>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(310px,1fr))] gap-3.5">
        {FILAS.map((fila) => (
          <section
            key={fila.id}
            className={`flex flex-col gap-3 rounded-2xl border border-l-2 border-white/[0.08] bg-[var(--navy-card)] p-4 shadow-[0_8px_20px_rgba(0,0,0,0.18)] ${BORDA[fila.severidade]}`}
          >
            <header className="flex items-center gap-2.5">
              <span className={`font-[family-name:var(--font-serif)] text-[27px] leading-none ${NUMERO[fila.severidade]}`}>
                {fila.contagem}
              </span>
              <span>
                <span className="block text-[13.5px] font-semibold">{fila.titulo}</span>
                <span className="mt-0.5 block font-mono text-[11.5px] text-[var(--ink-faint)]">{fila.periodo}</span>
              </span>
            </header>

            <ul className="flex flex-col gap-1.5">
              {fila.itens.map((item) => (
                <li
                  key={item.rotulo + item.onde}
                  className="flex items-baseline gap-2 border-t border-white/[0.08] pt-1.5 text-[12.5px] text-[var(--ink-dim)]"
                >
                  <b className="font-medium text-[var(--ink)]">{item.rotulo}</b>
                  <span>{item.detalhe}</span>
                  <span className="ml-auto whitespace-nowrap font-mono text-[10.5px] text-[var(--ink-faint)]">{item.onde}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              className="self-start text-xs font-medium text-[var(--cyan)] transition-colors hover:underline"
            >
              {fila.acao} →
            </button>
          </section>
        ))}
      </div>

      <div className="rounded-[10px] border border-dashed border-red-400/40 bg-red-400/5 px-3.5 py-3 text-xs text-[var(--ink-dim)]">
        <b className="font-semibold text-red-300">Hoje esta tela mostra:</b> “Avaliações” e “PDIs ativos” com o mesmo
        número, “Empresas N / N ativas” repetindo o total, um painel de atividade que é placeholder fixo e um cartão de
        conexão estático. Nenhum deles diz o que fazer.
      </div>
    </>
  );
}
