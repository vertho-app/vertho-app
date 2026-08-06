import { temVinculoDeclarado, type CensoDocentes, type DocentesAgregado } from '@/lib/radar/docentes';

const CIANO = '#34c5cc';

/** Shape comum entre escola (1 linha do Censo) e agregado (MV por município/UF). */
type PerfilDocente = {
  ano: number | null;
  total: number;
  infantil: number;
  fundamental: number;
  medio: number;
  superior: number;
  licenciatura: number;
  especializacao: number;
  mestrado: number;
  doutorado: number;
  concursados: number;
  contrato: number;
  terceirizados: number;
  clt: number;
  ate29: number;
  cinquentaMais: number;
  fem: number;
  masc: number;
  matriculas: number | null;
};

const n = (v: number | null | undefined) => Number(v || 0);

function perfilDaEscola(d: CensoDocentes, matriculas: number | null): PerfilDocente {
  return {
    ano: d.ano,
    total: n(d.qt_doc_bas),
    infantil: n(d.qt_doc_inf),
    fundamental: n(d.qt_doc_fund),
    medio: n(d.qt_doc_med),
    superior: n(d.qt_doc_bas_esco_sup_grad),
    licenciatura: n(d.qt_doc_bas_esco_sup_grad_licen),
    especializacao: n(d.qt_doc_bas_esco_sup_pos_espec),
    mestrado: n(d.qt_doc_bas_esco_sup_pos_mestra),
    doutorado: n(d.qt_doc_bas_esco_sup_pos_douto),
    concursados: n(d.qt_doc_bas_vinculo_concur),
    contrato: n(d.qt_doc_bas_vinculo_contra),
    terceirizados: n(d.qt_doc_bas_vinculo_terceir),
    clt: n(d.qt_doc_bas_vinculo_clt),
    ate29: n(d.qt_doc_bas_0_24) + n(d.qt_doc_bas_25_29),
    cinquentaMais: n(d.qt_doc_bas_50_54) + n(d.qt_doc_bas_55_59) + n(d.qt_doc_bas_60_mais),
    fem: n(d.qt_doc_bas_fem),
    masc: n(d.qt_doc_bas_masc),
    matriculas,
  };
}

function perfilDoAgregado(a: DocentesAgregado): PerfilDocente {
  return {
    ano: a.ano,
    total: a.total,
    infantil: a.infantil,
    fundamental: a.fundamental,
    medio: a.medio,
    superior: a.superior,
    licenciatura: a.licenciatura,
    especializacao: a.especializacao,
    mestrado: a.mestrado,
    doutorado: a.doutorado,
    concursados: a.concursados,
    contrato: a.contrato,
    terceirizados: a.terceirizados,
    clt: a.clt,
    ate29: a.ate29,
    cinquentaMais: a.cinquentaMais,
    fem: a.fem,
    masc: a.masc,
    matriculas: a.matriculas || null,
  };
}

function Bar({ label, value, base, color = CIANO }: {
  label: string;
  value: number;
  base: number;
  color?: string;
}) {
  const pct = base > 0 ? Math.min(100, (value / base) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <span className="text-[13px] text-white/70">{label}</span>
        <span className="font-mono text-[12px] text-white/55">
          {value.toLocaleString('pt-BR')}
          <span className="text-white/35"> · {pct.toFixed(0)}%</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function Card({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5 border border-white/[0.08]" style={{ background: 'rgba(255,255,255,0.04)' }}>
      <p className="text-[10px] tracking-[0.18em] uppercase font-bold text-white/55 mb-4">{titulo}</p>
      <div className="space-y-3.5">{children}</div>
      {nota && <p className="text-[11px] text-white/35 mt-4 leading-relaxed">{nota}</p>}
    </div>
  );
}

function Corpo({ p, agregado }: { p: PerfilDocente; agregado: boolean }) {
  const somaVinculos = p.concursados + p.contrato + p.terceirizados + p.clt;
  const temVinculo = temVinculoDeclarado({
    concursados: p.concursados,
    contrato: p.contrato,
    terceirizados: p.terceirizados,
    clt: p.clt,
  });
  const alunosPorDocente = p.matriculas && p.total > 0 ? p.matriculas / p.total : null;
  // Etapa zerada não é informação: uma ETEC mostraria "infantil 0%" e "fundamental
  // 0%" só porque atende ensino médio e educação profissional.
  const etapas = [
    { label: 'Educação infantil', valor: p.infantil },
    { label: 'Ensino fundamental', valor: p.fundamental },
    { label: 'Ensino médio', valor: p.medio },
  ].filter((e) => e.valor > 0);
  // Num escopo com rede privada, a base do percentual é MENOR que o total —
  // sem dizer isso, "72% concursados" seria lido como 72% de todos os docentes
  // do município, e não da parcela pública.
  const foraDaBase = Math.max(0, p.total - somaVinculos);
  const notaVinculo = foraDaBase > 0
    ? `Percentual sobre os ${somaVinculos.toLocaleString('pt-BR')} vínculos com contratação declarada. `
      + `O Censo publica tipo de contratação apenas da rede pública, então ${foraDaBase.toLocaleString('pt-BR')} `
      + `docentes (rede privada) ficam fora desta conta.`
    : 'Percentual sobre os vínculos declarados. O Censo publica tipo de contratação apenas para a rede pública.';
  const rotuloTotal = agregado ? 'vínculos docentes' : 'professores';

  return (
    <>
      <div className="flex flex-wrap items-center gap-6 rounded-2xl px-6 py-5 mb-6 border border-white/[0.08]"
        style={{ background: 'rgba(52,197,204,0.08)' }}>
        <div className="flex items-center gap-4">
          <p className="text-white shrink-0"
            style={{
              fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
              fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 600, lineHeight: 1,
            }}>
            {p.total.toLocaleString('pt-BR')}
          </p>
          <p className="text-white/65 leading-snug" style={{ fontSize: 14 }}>
            {rotuloTotal}
            <span className="text-white/40"> · declarados no Censo Escolar {p.ano ?? ''}</span>
          </p>
        </div>
        {alunosPorDocente != null && (
          <div className="flex items-center gap-4 md:border-l md:border-white/10 md:pl-6">
            <p className="text-white shrink-0"
              style={{
                fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
                fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 600, lineHeight: 1,
              }}>
              {alunosPorDocente.toFixed(1)}
            </p>
            <p className="text-white/65 leading-snug" style={{ fontSize: 14 }}>
              alunos por {agregado ? 'vínculo' : 'professor'}
              <span className="text-white/40"> · {(p.matriculas || 0).toLocaleString('pt-BR')} matrículas</span>
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card titulo="Formação"
          nota="Percentual sobre o total de docentes. Os níveis de pós não se somam — quem tem especialização e mestrado entra nos dois.">
          <Bar label="Ensino superior" value={p.superior} base={p.total} />
          <Bar label="Licenciatura" value={p.licenciatura} base={p.total} />
          <Bar label="Especialização" value={p.especializacao} base={p.total} color="#9ae2e6" />
          <Bar label="Mestrado" value={p.mestrado} base={p.total} color="#9ae2e6" />
          <Bar label="Doutorado" value={p.doutorado} base={p.total} color="#9ae2e6" />
        </Card>

        {temVinculo ? (
          <Card titulo="Vínculo" nota={notaVinculo}>
            <Bar label="Concursado / efetivo" value={p.concursados} base={somaVinculos} color="#86efac" />
            <Bar label="Contrato temporário" value={p.contrato} base={somaVinculos} color="#fbbf24" />
            <Bar label="CLT" value={p.clt} base={somaVinculos} />
            <Bar label="Terceirizado" value={p.terceirizados} base={somaVinculos} color="#fca5a5" />
          </Card>
        ) : (
          <Card titulo="Vínculo">
            <p className="text-[13px] text-white/45 leading-relaxed">
              O Censo Escolar não publica tipo de contratação da rede privada — por isso não há
              percentual de concursados ou contratos temporários {agregado ? 'neste recorte' : 'para esta escola'}.
            </p>
          </Card>
        )}

        {etapas.length > 0 && (
          <Card titulo="Etapa de atuação"
            nota="Um mesmo docente pode atuar em mais de uma etapa, então estes números não somam o total. Educação profissional e EJA não entram neste recorte.">
            {etapas.map(({ label, valor }) => (
              <Bar key={label} label={label} value={valor} base={p.total} />
            ))}
          </Card>
        )}

        <Card titulo="Faixa etária">
          <Bar label="Até 29 anos" value={p.ate29} base={p.total} color="#86efac" />
          <Bar label="50 anos ou mais" value={p.cinquentaMais} base={p.total} color="#fbbf24" />
        </Card>

        <Card titulo="Composição">
          <Bar label="Mulheres" value={p.fem} base={p.total} />
          <Bar label="Homens" value={p.masc} base={p.total} color="#9ae2e6" />
        </Card>
      </div>
    </>
  );
}

function Cabecalho({ kicker, titulo, texto }: { kicker: string; titulo: string; texto: React.ReactNode }) {
  return (
    <>
      <p className="text-[11px] tracking-[0.15em] uppercase font-bold mb-3" style={{ color: CIANO }}>
        {kicker}
      </p>
      <h2 className="text-white mb-3"
        style={{
          fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
          fontSize: 'clamp(24px, 3vw, 32px)',
          fontWeight: 600,
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
        }}>
        {titulo}
      </h2>
      <p className="text-white/60 mb-6 leading-relaxed" style={{ fontSize: 15, maxWidth: 760 }}>
        {texto}
      </p>
    </>
  );
}

/** Corpo docente de UMA escola — o número é exato, sem risco de dupla contagem. */
export function DocentesEscolaSection({ docentes, matriculas }: {
  docentes: CensoDocentes;
  matriculas: number | null;
}) {
  const p = perfilDaEscola(docentes, matriculas);
  if (p.total <= 0) return null;

  return (
    <section className="mb-12">
      <Cabecalho
        kicker={`Censo Escolar ${docentes.ano} · corpo docente`}
        titulo="Quem ensina nesta escola"
        texto="Professores declarados no Censo Escolar, com formação, vínculo e etapa de atuação. É o quadro sobre o qual qualquer plano de desenvolvimento vai operar."
      />
      <Corpo p={p} agregado={false} />
    </section>
  );
}

/**
 * Corpo docente de município ou UF. Rótulo é VÍNCULOS: um professor que atua em
 * duas escolas é contado nas duas (o próprio INEP alerta para isso).
 */
export function DocentesAgregadoSection({ agg, escopo, nome, apenasRedeMunicipal = false }: {
  agg: DocentesAgregado;
  escopo: 'municipio' | 'estado';
  nome: string;
  apenasRedeMunicipal?: boolean;
}) {
  const p = perfilDoAgregado(agg);
  if (p.total <= 0) return null;

  return (
    <section className="mb-12">
      <Cabecalho
        kicker={`Censo Escolar ${agg.ano ?? ''} · corpo docente ${escopo === 'municipio' ? 'do município' : 'do estado'}`}
        titulo={`Quem ensina em ${nome}`}
        texto={
          <>
            Soma dos docentes declarados por {agg.escolasComDado.toLocaleString('pt-BR')} escolas
            {apenasRedeMunicipal ? ' da rede municipal' : ''} de {nome}. O Censo conta o docente
            <strong className="text-white/75"> em cada escola onde ele atua</strong>, então quem dá aula
            em duas escolas entra duas vezes — por isso o número é de <strong className="text-white/75">vínculos</strong>,
            não de pessoas.
          </>
        }
      />
      <Corpo p={p} agregado />

      {agg.porRede.length > 1 && (
        <div className="rounded-2xl p-5 mt-4 border border-white/[0.08]" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <p className="text-[10px] tracking-[0.18em] uppercase font-bold text-white/55 mb-4">Por rede</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {agg.porRede.map((r) => (
              <div key={r.rede} className="rounded-xl border border-white/[0.06] p-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <p className="text-[10px] tracking-[0.14em] uppercase font-bold text-white/40 mb-2">{r.rede}</p>
                <p className="text-white font-mono text-xl">{r.docentes.toLocaleString('pt-BR')}</p>
                <p className="text-[11px] text-white/40 font-mono mt-1">
                  {r.escolas.toLocaleString('pt-BR')} {r.escolas === 1 ? 'escola' : 'escolas'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
