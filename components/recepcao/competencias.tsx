import { competenciasAtendimento } from '@/lib/recepcao/matriz';
import { DOMINIO_PADRAO, dominioExiste } from '@/lib/recepcao/dominio';
import {
  NIVEIS_COMPORTAMENTO,
  rotuloClassificacao,
} from '@/lib/recepcao/schema';
import styles from './treino.module.css';
/**
 * Matriz de competências do atendimento, no SEGMENTO da empresa (27/09/2026). Até
 * então a aba mostrava sempre a matriz médica (a constante do segmento padrão), com
 * "orientação clínica" até para loja e escola.
 */
export default function CompetenciasRecepcao({
  dominio,
}: {
  empresaId: string;
  admin: boolean;
  dominio?: string;
}) {
  const competencias = competenciasAtendimento(dominioExiste(dominio) ? dominio : DOMINIO_PADRAO);
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
        {competencias.map((c) => (
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
