import { COMPETENCIAS_ATENDIMENTO } from '@/lib/recepcao/matriz';
import {
  NIVEIS_COMPORTAMENTO,
  rotuloClassificacao,
} from '@/lib/recepcao/schema';
import styles from './treino.module.css';
export default function CompetenciasRecepcao(_props: {
  empresaId: string;
  admin: boolean;
}) {
  return (
    <section
      className={styles.management}
      aria-label="Biblioteca de competências"
    >
      <header className={styles.sectionHead}>
        <div>
          <p className={styles.eyebrow}>Matriz Vertho de Atendimento</p>
          <h2>5 competências · 30 descritores</h2>
        </div>
      </header>
      <p>
        Cada competência tem seis descritores em N1–N4. N3 é a meta e N4 é
        referência. A avaliação usa evidências da conversa; sem oportunidade de
        observação, o descritor fica sem nota.
      </p>
      <div className={styles.caseGrid}>
        {COMPETENCIAS_ATENDIMENTO.map((c) => (
          <article key={c.codigo}>
            <h3>{c.nome}</h3>
            <p>{c.descricao}</p>
            {c.descritores.map((d) => (
              <details key={d.codigo}>
                <summary>{d.nome}</summary>
                <p>{d.descricao}</p>
                <dl className={styles.niveis}>
                  {NIVEIS_COMPORTAMENTO.map((n) => (
                    <div key={n}>
                      <dt>{rotuloClassificacao[n]}</dt>
                      <dd>{d.niveis[n]}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            ))}
          </article>
        ))}
      </div>
    </section>
  );
}
