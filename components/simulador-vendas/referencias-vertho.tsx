import {
  CONCORRENTES_VERTHO,
  CONCORRENTES_VERTHO_REVISADO_EM,
} from '@/lib/simulador-vendas/concorrentes-vertho';
export default function ReferenciasVertho() {
  return (
    <details className="my-4 rounded-xl border border-white/10 p-5 bg-white/5 text-sm">
      <summary className="cursor-pointer font-semibold">
        Base de mercado · referências para preparar a conversa
      </summary>
      <p className="text-gray-400 mt-3">
        Capacidades divulgadas pelos fornecedores, revisadas em{' '}
        {CONCORRENTES_VERTHO_REVISADO_EM}. Use perguntas para entender o
        processo do cliente e validar o que ele já possui.
      </p>
      <div className="grid gap-5 mt-5 md:grid-cols-2">
        {CONCORRENTES_VERTHO.map((c) => (
          <article key={c.id}>
            <h3 className="font-semibold text-cyan-200">{c.nome}</h3>
            <ul className="list-disc pl-5 mt-2 text-gray-300">
              {c.fatos.map((f) => (
                <li key={f.descricao}>{f.descricao}</li>
              ))}
            </ul>
            <p className="mt-2">{c.perguntaDeDiagnostico}</p>
            <div className="flex gap-3 flex-wrap mt-2">
              {c.fontes.map((f) => (
                <a
                  key={f.id}
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-300 underline"
                >
                  {f.titulo}
                </a>
              ))}
            </div>
          </article>
        ))}
      </div>
    </details>
  );
}
