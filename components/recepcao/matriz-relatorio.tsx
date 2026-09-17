import type { Estado } from '@/lib/recepcao/model';
import { rotuloClassificacao } from '@/lib/recepcao/schema';
import styles from './treino.module.css';
const nota = (n: number | null) =>
  n === null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
export default function MatrizAtendimento({
  relatorio: r,
}: {
  relatorio: NonNullable<Estado['relatorio']>;
}) {
  return (
    <div className={styles.dimensions}>
      {r.competencias?.map((c) => (
        <article key={c.codigo}>
          <div>
            <h3>{c.nome}</h3>
            <span>
              {nota(c.nota)} / 4{c.nivel ? ` · N${c.nivel}` : ''}
            </span>
          </div>
          <p>
            {c.observados} de {c.total} descritores observados
          </p>
          <details>
            <summary>Ver descritores e evidências</summary>
            {c.descritores.map((id) => {
              const d = r.dimensoes.find((x) => x.id === id)!;
              return (
                <section className={styles.evidencias} key={id}>
                  <h4>
                    {d.nome} · {rotuloClassificacao[d.classificacao]}
                  </h4>
                  <p>{d.justificativa}</p>
                  {d.evidencias.map((e, i) => (
                    <blockquote key={i}>“{e.trecho}”</blockquote>
                  ))}
                  {!!d.oportunidades.length && (
                    <details>
                      <summary>Onde estava a oportunidade</summary>
                      {d.oportunidades.map((e, i) => (
                        <blockquote key={i}>“{e.trecho}”</blockquote>
                      ))}
                    </details>
                  )}
                </section>
              );
            })}
          </details>
        </article>
      ))}
    </div>
  );
}
