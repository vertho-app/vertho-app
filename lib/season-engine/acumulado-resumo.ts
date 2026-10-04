/**
 * Resumo de UMA avaliação acumulada gravada em `feedback.acumulado`, para o
 * painel interno da Vertho (R-127, 04/10/2026).
 *
 * O painel só listava a semana 13 (`.eq('semana', 13)`), que é onde a acumulada
 * mora no formato de 14 semanas. Nos outros formatos ela mora na última semana
 * de conteúdo (Jornada: 6; Personalizado: a última de conteúdo; Onboarding: a
 * missão final, mais as parciais nas anteriores), então 98 trilhas de Jornada em
 * curso e 32 concluídas nunca apareciam. A lista agora filtra pelo CONTEÚDO
 * (`feedback.acumulado` existe), e este resumo lê as três formas do payload:
 *
 *   - simples   `{ primaria, auditoria }`                  (Jornada, single, piloto)
 *   - multi     `{ multi, por_competencia: [...] }`        (DUO)
 *   - parcial   `{ parcial, por_competencia: [...] }`      (missões do Onboarding)
 *
 * Só a forma simples traz o veredito de UMA auditoria. Na multi vale o PIOR
 * entre as competências (uma "revisar" basta para o painel mostrar revisar), e a
 * parcial não passa pela 2ª IA por desenho, então é "sem auditoria".
 */

export type TipoAcumulado = 'simples' | 'multi' | 'parcial';

export interface ResumoAcumulado {
  tipo: TipoAcumulado;
  geradoEm: string | null;
  notaMedia: number | null;
  auditoriaNota: number | null;
  auditoriaStatus: 'aprovado' | 'aprovado_com_ajustes' | 'revisar' | 'sem_auditoria' | 'nao_gerado' | string;
  alertas: any[];
}

/** Do pior para o melhor: a multi mostra o pior. */
const ORDEM_STATUS = ['revisar', 'aprovado_com_ajustes', 'aprovado'];

const media = (nums: Array<number | null | undefined>): number | null => {
  const validos = nums.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  return validos.length ? Math.round((validos.reduce((a, b) => a + b, 0) / validos.length) * 10) / 10 : null;
};

export function resumirAcumulado(acum: any): ResumoAcumulado {
  if (!acum || typeof acum !== 'object') {
    return { tipo: 'simples', geradoEm: null, notaMedia: null, auditoriaNota: null, auditoriaStatus: 'nao_gerado', alertas: [] };
  }

  const porCompetencia: any[] = Array.isArray(acum.por_competencia) ? acum.por_competencia : [];
  if (porCompetencia.length > 0 || acum.multi || acum.parcial) {
    const tipo: TipoAcumulado = acum.parcial ? 'parcial' : 'multi';
    const comLeitura = porCompetencia.filter((c) => c && !c.error);
    const status = comLeitura
      .map((c) => c.auditoria?.status)
      .filter((s): s is string => typeof s === 'string' && ORDEM_STATUS.includes(s));
    // Competência lida SEM auditoria (a 2ª IA falhou, ou a parcial) puxa o
    // conjunto para "sem auditoria": o painel não deve mostrar "aprovado" por
    // uma parte do que foi lido.
    const completa = comLeitura.length > 0 && status.length === comLeitura.length;
    const pior = status.sort((a, b) => ORDEM_STATUS.indexOf(a) - ORDEM_STATUS.indexOf(b))[0];
    return {
      tipo,
      geradoEm: acum.gerado_em || null,
      notaMedia: media(comLeitura.map((c) => c.primaria?.nota_media_acumulada)),
      auditoriaNota: media(comLeitura.map((c) => c.auditoria?.nota_auditoria)),
      auditoriaStatus: completa ? pior : 'sem_auditoria',
      alertas: comLeitura.flatMap((c) => (Array.isArray(c.auditoria?.alertas) ? c.auditoria.alertas : [])),
    };
  }

  return {
    tipo: 'simples',
    geradoEm: acum.gerado_em || null,
    notaMedia: acum.primaria?.nota_media_acumulada ?? null,
    auditoriaNota: acum.auditoria?.nota_auditoria ?? null,
    auditoriaStatus: acum.auditoria?.status || 'sem_auditoria',
    alertas: acum.auditoria?.alertas || [],
  };
}
