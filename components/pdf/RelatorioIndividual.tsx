import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts, tableStyles, pageStyles } from './styles';
import { PdfBackCover } from './PdfCover';
import PdfReportCover, { ReportSectionTitle } from './PdfReportCover';
import { getReportCoverBgBase64 } from '@/lib/pdf-assets';
import { LevelDots } from './StatusBadge';
import CompetencyBlock from './CompetencyBlock';
import { nivelOuNull, rotuloNivel } from '@/lib/nivel-regua';
import { idiomaDoPdf, tradutorDoPdf, type PdfT } from '@/lib/pdf-i18n';

const s = StyleSheet.create({
  text: { fontSize: fonts.body, color: colors.textSecondary, lineHeight: 1.65, marginBottom: 4 },
  italic: { fontSize: fonts.body, color: colors.textMuted, fontStyle: 'italic', lineHeight: 1.6, marginBottom: 10 },
  section: { marginBottom: 14 },
  // Perfil — texto introdutório (azul claro itálico)
  perfilText: {
    backgroundColor: colors.perfilBg,
    borderWidth: 0.5, borderColor: colors.perfilBorder,
    borderRadius: 3, padding: 12, marginBottom: 12,
    fontSize: 9, color: colors.blueText, lineHeight: 1.7, fontStyle: 'italic',
  },
  // Pontos fortes / atenção (mesmo padrão do CompetencyBlock)
  pontosRow: { flexDirection: 'row', marginBottom: 12, gap: 6 },
  pontosCol: {
    flex: 1, padding: 10, borderRadius: 3,
    borderWidth: 0.5,
  },
  pontosLabel: { fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  pontosItemRow: { flexDirection: 'row', marginBottom: 2 },
  pontosPrefix: { fontSize: 9, fontWeight: 700, width: 12 },
  pontosItemText: { fontSize: 8.5, flex: 1, lineHeight: 1.6 },
  // Tabela resumo de desempenho
  table: { width: '100%', marginBottom: 12 },
  tableHead: {
    flexDirection: 'row', backgroundColor: colors.navy,
    paddingVertical: 6, paddingHorizontal: 8,
    borderTopLeftRadius: 3, borderTopRightRadius: 3,
  },
  tableHeadCell: {
    color: colors.white, fontSize: 7.5, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  tableRow: {
    flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8,
    borderBottomWidth: 0.3, borderBottomColor: colors.borderLight, alignItems: 'center',
  },
  tableRowAlt: {
    flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8,
    borderBottomWidth: 0.3, borderBottomColor: colors.borderLight, alignItems: 'center',
    backgroundColor: colors.gray100,
  },
  tableCellComp: { fontSize: 8.5, fontWeight: 600, color: colors.navy },
  // Tag nivel da tabela
  nivelTag: {
    backgroundColor: colors.navy, alignSelf: 'flex-start',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2,
  },
  nivelTagText: { fontSize: 7, fontWeight: 700, color: colors.cyan },
  // Trilha
  trilhaBox: {
    backgroundColor: colors.fezBemBg,
    borderWidth: 0.5, borderColor: colors.fezBemBorder,
    borderRadius: 3, padding: 10, marginBottom: 12,
  },
  trilhaLabel: { fontSize: 8, fontWeight: 700, color: colors.green, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  trilhaItem: { fontSize: 8.5, color: colors.greenText, marginBottom: 2, lineHeight: 1.5 },
  // Competency divider
  compDivider: { borderBottomWidth: 0.5, borderBottomColor: colors.borderLight, marginTop: 14, marginBottom: 14 },
  // ── One-pager: Mapa de foco dos 30 dias ──────────────────────────────
  mapIntro: { fontSize: 9, color: colors.textSecondary, lineHeight: 1.6, marginBottom: 12 },
  mapCard: {
    borderWidth: 0.5, borderColor: colors.borderLight, borderRadius: 4,
    padding: 12, marginBottom: 10, backgroundColor: colors.summaryBg,
  },
  mapCardHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  mapCardNum: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: colors.navy,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  mapCardNumText: { fontSize: 8, fontWeight: 700, color: colors.white },
  mapCardName: { fontSize: 11, fontWeight: 700, color: colors.navy, flex: 1 },
  mapFoco: { fontSize: 9.5, color: colors.textPrimary, lineHeight: 1.5, marginBottom: 6, fontStyle: 'italic' },
  mapLine: { flexDirection: 'row', marginBottom: 3 },
  mapLineLabel: { fontSize: 7.5, fontWeight: 700, color: colors.gray600, textTransform: 'uppercase', letterSpacing: 0.5, width: 78, flexShrink: 0 },
  mapLineText: { fontSize: 8.5, color: colors.textSecondary, lineHeight: 1.5, flex: 1 },
  // ── Como este PDI vira trilha (timeline) ─────────────────────────────
  trilhaIntro: { fontSize: 9.5, color: colors.textPrimary, lineHeight: 1.6, marginBottom: 14, fontStyle: 'italic' },
  tlRow: { flexDirection: 'row', marginBottom: 8 },
  tlPhase: {
    width: 92, flexShrink: 0, backgroundColor: colors.navy, borderRadius: 3,
    paddingVertical: 8, paddingHorizontal: 8, marginRight: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  tlPhaseText: { fontSize: 8.5, fontWeight: 700, color: colors.cyan, textAlign: 'center', letterSpacing: 0.4 },
  tlBody: {
    flex: 1, borderWidth: 0.5, borderColor: colors.borderLight, borderRadius: 3,
    padding: 9, backgroundColor: colors.summaryBg, justifyContent: 'center',
  },
  tlTitle: { fontSize: 9.5, fontWeight: 700, color: colors.navy, marginBottom: 2 },
  tlDetail: { fontSize: 8.5, color: colors.textSecondary, lineHeight: 1.5 },
  trilhaFooterNote: {
    marginTop: 8, fontSize: 8.5, color: colors.gray600, fontStyle: 'italic',
    textAlign: 'center', lineHeight: 1.5,
  },
  // ── Binding real (blueprint) — badges de missão/avaliação ────────────
  tlMeta: { flexDirection: 'row', gap: 4, marginTop: 4 },
  tlBadge: {
    fontSize: 6.5, fontWeight: 700, color: colors.cyan, backgroundColor: colors.navy,
    paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 2,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  // Mensagem final
  finalBox: {
    backgroundColor: colors.navy, borderRadius: 4, padding: 22,
    marginTop: 24,
  },
  finalLabel: { fontSize: 8, fontWeight: 700, color: colors.cyan, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 },
  finalText: { fontSize: 10, color: colors.white, lineHeight: 1.8, fontStyle: 'italic', opacity: 0.9 },
});

// ── Fixed Header navy ───────────────────────────────────────────────────────
function PageHeader({ logoBase64, label }: { logoBase64?: string; label: string }) {
  return (
    <View style={pageStyles.header} fixed>
      {logoBase64 ? <Image src={logoBase64} style={pageStyles.headerLogo} /> : <View />}
      <Text style={pageStyles.headerLabel}>{label}</Text>
    </View>
  );
}

// ── Fixed Footer ────────────────────────────────────────────────────────────
function PageFooter({ mostrarVertho = true, t }: { mostrarVertho?: boolean; t: PdfT }) {
  return (
    <View style={pageStyles.footer} fixed>
      <Text style={pageStyles.footerText}>{mostrarVertho ? t('individual.footerBrand') : t('common.confidential')}</Text>
      <Text style={pageStyles.footerText}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

// ── Nível da competência: quatro pontos, sem veredito ────────────────────────
/**
 * Os quatro níveis como pontos preenchidos até o nível da pessoa (R-38, 04/10/2026).
 * Era uma pílula avaliativa ("Atenção" em vermelho no N1, "Em Desenvolvimento" no N2,
 * "Bom", "Excelente") e uma barra de PORCENTAGEM (Nível 3 = 75%), vermelha no N1. O
 * nível é o ponto de partida da pessoa: o papel diz "Nível N" e mostra os quatro
 * degraus, na mesma cor para todos.
 */
function NivelPontos({ nivel }: { nivel: number | null }) {
  if (nivel === null) return <Text style={s.nivelTagText}>{'\u2014'}</Text>;
  return <LevelDots nivel={nivel} color={colors.navy} />;
}

export type TrilhaFasePdi = { fase: string; titulo: string; detalhe: string };

/**
 * Timeline de fallback para PDIs sem o mapa detalhado do blueprint.
 *
 * `totalSemanas` é a duração do programa da pessoa (`conteudo.total_semanas`,
 * gravada na geração), ou `null` quando o PDI não a trouxe (15 dos 171, medido
 * 03/10/2026). Só a Jornada de 7 e o formato de 14 têm desenho de semanas aqui;
 * qualquer outra duração, ou nenhuma, vira ciclos sem número de semana: o
 * desenho de 14 semanas num programa de 7, 9 ou 10 afirma o que não existe (R-28).
 */
export function montarTrilhaFasesPdi(
  competencias: any[],
  totalSemanas: number | null,
  /** Tradutor do papel (padrão: pt-BR, como os testes e os chamadores antigos esperam). */
  t: PdfT = tradutorDoPdf(),
): TrilhaFasePdi[] {
  const acaoDe = (comp: any): string =>
    (comp?.sprint?.acao_principal || comp?.melhorar?.[0] || t('individual.defaultAction'));
  const semanas = (from: number, to: number) => t('individual.weeksRange', { from, to });

  if (totalSemanas !== 7 && totalSemanas !== 14) {
    return competencias.map((comp: any, i: number) => ({
      fase: t('individual.journeyN', { n: i + 1 }),
      titulo: comp.nome,
      detalhe: i === 0
        ? t('individual.learnPracticeRecord', { action: acaoDe(comp) })
        : t('individual.startsAfterPrevious'),
    }));
  }

  if (totalSemanas === 7 && competencias.length >= 1) {
    const fases: TrilhaFasePdi[] = [
      {
        fase: semanas(1, 6),
        titulo: competencias[0].nome,
        detalhe: t('individual.learnPracticeRecord', { action: acaoDe(competencias[0]) }),
      },
      {
        fase: t('individual.weekN', { n: 7 }),
        titulo: t('individual.finalAssessment'),
        detalhe: t('individual.finalAssessmentDetail'),
      },
    ];
    for (const proxima of competencias.slice(1)) {
      fases.push({
        fase: t('individual.nextJourney'),
        titulo: proxima.nome,
        detalhe: t('individual.nextJourneyDetail', { weeks: 7 }),
      });
    }
    return fases;
  }

  if (competencias.length >= 2) {
    return [
      { fase: semanas(1, 4), titulo: competencias[0].nome, detalhe: t('individual.mapAndPractice', { action: acaoDe(competencias[0]) }) },
      { fase: semanas(5, 8), titulo: competencias[1].nome, detalhe: t('individual.mapAndPractice', { action: acaoDe(competencias[1]) }) },
      { fase: semanas(9, 12), titulo: t('individual.integration'), detalhe: t('individual.integrationDetail') },
      { fase: semanas(13, 14), titulo: t('individual.finalAssessment'), detalhe: t('individual.finalReflectionDetail') },
    ];
  }
  if (competencias.length === 1) {
    return [
      { fase: semanas(1, 8), titulo: competencias[0].nome, detalhe: t('individual.mapAndPractice', { action: acaoDe(competencias[0]) }) },
      { fase: semanas(9, 12), titulo: t('individual.deepening'), detalhe: t('individual.deepeningDetail') },
      { fase: semanas(13, 14), titulo: t('individual.finalAssessment'), detalhe: t('individual.finalReflectionDetail') },
    ];
  }
  return [];
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function RelatorioIndividualPDF({ data, empresaNome, logoBase64, mostrarVertho = true, locale }: {
  data: any;
  empresaNome?: string;
  logoBase64?: string;
  /**
   * Idioma do texto FIXO do papel (rótulos, títulos, legendas): o da pessoa que lê
   * (`lib/pdf-locale.ts`). Sem ele, pt-BR. O que a IA escreveu no PDI (acolhimento,
   * análise, plano, mensagem final) segue no idioma em que foi gerado.
   */
  locale?: string | null;
  /**
   * false = tenant white-label (`sys_config.pdf_sem_marca`): nenhuma
   * identificação da Vertho no documento — capa, cabeçalho, rodapé e
   * contracapa. Resolvido em `lib/pdf-marca.ts`; o `logoBase64` que chega
   * junto é o do CLIENTE, ou nenhum.
   */
  mostrarVertho?: boolean;
}) {
  const c = data.conteudo;
  if (!c) return null;

  const t = tradutorDoPdf(locale);
  const idioma = idiomaDoPdf(locale);
  const competencias = c.competencias || [];
  const nome = data.colaborador_nome || '';
  // Duração REAL da trilha. Era "14 semanas" fixo na capa — desde a jornada de
  // 7 (05/08/2026), isso imprimia a duração de outro programa no PDF da pessoa.
  // Fonte: `conteudo.total_semanas`, gravada na geração pela fonte única de
  // duração (`duracaoDaTrilha`/`getProgramaConfigDaGeracao`); sem ela, o mapa
  // da trilha do blueprint; sem nenhum dos dois, NÃO há número: o `14` de
  // fallback imprimia "jornada de 14 semanas" para quem está na de 7 (R-28).
  const semanasDoMapa: number[] = (Array.isArray(c.trilha_mapa?.semanas) ? c.trilha_mapa.semanas : [])
    .map((s: any) => Number(s?.semana) || 0)
    .filter((n: number) => n > 0);
  const totalSemanas: number | null = Number(c.total_semanas) || (semanasDoMapa.length ? Math.max(...semanasDoMapa) : null);
  const duracaoEmTexto = totalSemanas ? t('individual.weeksCount', { n: totalSemanas }) : null;
  const headerLabel = `${t('individual.coverTitle')}${nome ? ` · ${(nome.split(' ')[0]) || nome}` : ''}`;

  // Competências que já têm sprint (novo modelo) — dirige o one-pager.
  const sprintComps = competencias.filter((comp: any) => comp && comp.sprint);

  // ── Timeline "vira trilha" (COMPUTADA no render, determinística) ──
  // Sem mapa detalhado, a timeline ainda precisa obedecer à duração real. A
  // jornada de 7 semanas desenvolve UMA competência; as demais vêm em ciclos
  // seguintes, não em blocos fictícios dentro das mesmas sete semanas.
  const trilhaFases = montarTrilhaFasesPdi(competencias, totalSemanas, t);

  // ── Binding REAL "vira trilha" (Estágio 2) ──────────────────────────────
  // Quando o PDI veio de um Development Blueprint, `conteudo.trilha_mapa` traz as
  // semanas com `conexao_com_pdi` (ids de objetivo) e `conteudo.blueprint_objetivos`
  // resolve id → ação do PDI. Agrupa semanas consecutivas por competência_foco e
  // mostra o vínculo real. Sem trilha_mapa, cai na timeline computada acima.
  const blueprintObjetivos: Record<string, any> = c.blueprint_objetivos || {};
  const blueprintConteudos: Record<string, { tema: string; formato?: string }[]> = c.blueprint_conteudos || {};
  const semanasMapa: any[] = Array.isArray(c.trilha_mapa?.semanas) ? c.trilha_mapa.semanas : [];
  const hasBinding = semanasMapa.length > 0;
  // Janela de cada competência na trilha (semanas de foco ÚNICO) — pro sprint mostrar
  // "Ciclo N · Semanas X–Y" em vez de um "30 dias" que conflita com a jornada de 14 sem.
  const cicloPorComp: Record<string, { min: number; max: number }> = {};
  for (const sem of semanasMapa) {
    const comps: string[] = Array.isArray(sem.competencia_foco) ? sem.competencia_foco.filter(Boolean) : [];
    // Só o BLOCO de desenvolvimento (foco único), excluindo a avaliação final
    // (sem 13/14 também têm foco único e inflavam a janela p/ "1–13").
    if (comps.length !== 1 || typeof sem.semana !== 'number' || sem.tipo === 'avaliacao') continue;
    const cp = comps[0]; const w = sem.semana;
    const cur = cicloPorComp[cp];
    if (!cur) cicloPorComp[cp] = { min: w, max: w };
    else { cur.min = Math.min(cur.min, w); cur.max = Math.max(cur.max, w); }
  }
  const cicloLabel = (nome: string): string | null => {
    const cw = cicloPorComp[nome];
    return cw ? t('individual.weeksRange', { from: cw.min, to: cw.max }) : null;
  };
  // Sprint (objetivo comportamental) por competência — pra fundir na jornada.
  const sprintPorComp: Record<string, any> = {};
  for (const cc of sprintComps) if (cc?.nome) sprintPorComp[cc.nome] = cc.sprint;
  type BindingBloco = { faseLabel: string; cicloWin: string | null; titulo: string; objetivo?: string; evidencia?: string; ritual?: string; acoes: string[]; conteudos: string[]; temMissao: boolean; temAvaliacao: boolean; focoAgora: boolean };
  const bindingBlocos: BindingBloco[] = [];
  let focoUsado = false;
  if (hasBinding) {
    type Acc = { nums: number[]; comps: string[]; acoes: Set<string>; temMissao: boolean; temAvaliacao: boolean };
    const grupos: Acc[] = [];
    let curSig: string | null = null;
    for (const sem of semanasMapa) {
      const comps: string[] = Array.isArray(sem.competencia_foco) ? sem.competencia_foco.filter(Boolean) : [];
      const sig = [...comps].sort().join('|');
      let g = grupos[grupos.length - 1];
      if (curSig === null || sig !== curSig || !g) {
        g = { nums: [], comps: [], acoes: new Set<string>(), temMissao: false, temAvaliacao: false };
        grupos.push(g);
        curSig = sig;
      }
      if (typeof sem.semana === 'number') g.nums.push(sem.semana);
      for (const cp of comps) if (!g.comps.includes(cp)) g.comps.push(cp);
      if (sem.tipo === 'missao') g.temMissao = true;
      if (sem.tipo === 'avaliacao') g.temAvaliacao = true;
      const conex: string[] = Array.isArray(sem.conexao_com_pdi) ? sem.conexao_com_pdi : [];
      for (const id of conex) {
        const acao = blueprintObjetivos[id]?.acao_principal;
        if (acao) g.acoes.add(acao);
      }
    }
    for (const g of grupos) {
      const min = g.nums.length ? Math.min(...g.nums) : 0;
      const max = g.nums.length ? Math.max(...g.nums) : 0;
      const faseLabel = g.nums.length > 1 ? t('individual.weeksRange', { from: min, to: max }) : t('individual.weekN', { n: min });
      const titulo = g.comps.length ? g.comps.join(' + ') : (g.temAvaliacao ? t('individual.finalAssessment') : t('individual.integratedChallenge'));
      // Teoria: temas de conteúdo das competências do bloco (o que a pessoa APRENDE).
      const temas: string[] = [];
      for (const cp of g.comps) for (const ct of (blueprintConteudos[cp] || [])) if (ct.tema && !temas.includes(ct.tema)) temas.push(ct.tema);
      // Objetivo do ciclo (sprint) quando o bloco é de UMA competência (não integração/avaliação).
      const spr = (g.comps.length === 1 && !g.temAvaliacao) ? sprintPorComp[g.comps[0]] : undefined;
      const objetivo = spr?.foco_30_dias || undefined;
      const cicloWin = g.comps.length === 1 ? cicloLabel(g.comps[0]) : null;
      // "Foco agora" = o PRIMEIRO ciclo de desenvolvimento (o resto é sequência/preview).
      const focoAgora = !!objetivo && !focoUsado;
      if (focoAgora) focoUsado = true;
      bindingBlocos.push({
        faseLabel, cicloWin, titulo, objetivo,
        // Detalhe extra (evidência/ritual) só no ciclo em foco — os demais ficam leves (preview).
        evidencia: focoAgora ? spr?.evidencia_esperada : undefined,
        ritual: focoAgora ? spr?.ritual : undefined,
        acoes: [...g.acoes], conteudos: temas, temMissao: g.temMissao, temAvaliacao: g.temAvaliacao, focoAgora,
      });
    }
  }

  return (
    <Document title={`PDI - ${nome}`}>
      {/* ═══════════════════ CAPA NAVY ═══════════════════ */}
      <PdfReportCover
        bgBase64={getReportCoverBgBase64()}
        logoBase64={logoBase64}
        mostrarVertho={mostrarVertho}
        titulo={[t('individual.coverTitle'), '(PDI)']}
        overline={null}
        mentorLabel={null}
        jornada={duracaoEmTexto ? t('individual.coverJourney', { duration: duracaoEmTexto }) : null}
        nome={nome}
        cargo={data.colaborador_cargo}
        empresa={empresaNome}
        locale={idioma}
      />

      {/* ═══════════════════ PERFIL + RESUMO DE DESEMPENHO ═══════════════════ */}
      <Page size="A4" style={pageStyles.page} wrap>
        <PageHeader logoBase64={logoBase64} label={headerLabel} />

        {/* Acolhimento (texto de abertura) */}
        {c.acolhimento && <Text style={s.italic}>{c.acolhimento}</Text>}

        {/* Perfil Comportamental — texto introdutório em azul claro */}
        {c.perfil_comportamental && (
          <View style={s.section} wrap={false}>
            <ReportSectionTitle>{t('individual.behavioralProfile')}</ReportSectionTitle>
            <Text style={s.perfilText}>{c.perfil_comportamental.descricao}</Text>
          </View>
        )}

        {/* Pontos Fortes / Pontos de Atenção */}
        {c.perfil_comportamental && (
          <View style={s.pontosRow} wrap={false}>
            <View style={{ ...s.pontosCol, backgroundColor: colors.fezBemBg, borderColor: colors.fezBemBorder }}>
              <Text style={{ ...s.pontosLabel, color: colors.green }}>{t('individual.strengths')}</Text>
              {c.perfil_comportamental.pontos_forca?.map((p: any, i: number) => (
                <View key={i} style={s.pontosItemRow}>
                  <Text style={{ ...s.pontosPrefix, color: colors.green }}>+</Text>
                  <Text style={{ ...s.pontosItemText, color: colors.greenText }}>{p}</Text>
                </View>
              ))}
            </View>
            <View style={{ ...s.pontosCol, backgroundColor: colors.melhorarBg, borderColor: colors.melhorarBorder }}>
              <Text style={{ ...s.pontosLabel, color: colors.orange }}>{t('individual.attentionPoints')}</Text>
              {c.perfil_comportamental.pontos_atencao?.map((p: any, i: number) => (
                <View key={i} style={s.pontosItemRow}>
                  <Text style={{ ...s.pontosPrefix, color: colors.orange }}>!</Text>
                  <Text style={{ ...s.pontosItemText, color: colors.orangeText }}>{p}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Resumo de Desempenho — tabela premium navy */}
        {(c.resumo_desempenho || competencias)?.length > 0 && (
          <View style={s.section} wrap={false}>
            <ReportSectionTitle>{t('individual.startingPoint')}</ReportSectionTitle>
            <View style={s.table}>
              <View style={s.tableHead}>
                <Text style={{ ...s.tableHeadCell, flex: 3 }}>{t('individual.competency')}</Text>
                <Text style={{ ...s.tableHeadCell, flex: 1.2, textAlign: 'center' }}>{t('individual.level')}</Text>
                <Text style={{ ...s.tableHeadCell, flex: 1.6, textAlign: 'center' }}>{t('individual.fourLevels')}</Text>
              </View>
              {(c.resumo_desempenho || competencias).map((comp: any, i: number) => {
                const nivel = nivelOuNull(comp.nivel ?? comp.nivel_atual);
                const rowStyle = i % 2 === 0 ? s.tableRow : s.tableRowAlt;
                return (
                  <View key={i} style={rowStyle}>
                    <Text style={{ ...s.tableCellComp, flex: 3 }}>
                      {comp.competencia || comp.nome}
                    </Text>
                    <View style={{ flex: 1.2, alignItems: 'center' }}>
                      <View style={s.nivelTag}>
                        <Text style={s.nivelTagText}>{nivel === null ? '\u2014' : rotuloNivel(nivel, { idioma })}</Text>
                      </View>
                    </View>
                    <View style={{ flex: 1.6, alignItems: 'center' }}>
                      <NivelPontos nivel={nivel} />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Trilha de Cursos */}
        {c.trilha_cursos?.length > 0 && (
          <View style={s.section} wrap={false}>
            <ReportSectionTitle>{t('individual.supportCourses')}</ReportSectionTitle>
            <View style={s.trilhaBox}>
              <Text style={s.trilhaLabel}>{t('individual.recommendedCourses')}</Text>
              {c.trilha_cursos.map((curso: any, i: number) => (
                <Text key={i} style={s.trilhaItem}>
                  {i + 1}. {curso.nome}{curso.competencia ? ` (${curso.competencia})` : ''}
                </Text>
              ))}
            </View>
          </View>
        )}

        <PageFooter mostrarVertho={mostrarVertho} t={t} />
      </Page>

      {/* ═══ SPRINT ONE-PAGER (LEGADO — só sem blueprint; com blueprint, tudo vira
             a seção única "Sua jornada, passo a passo" abaixo) ═══ */}
      {!hasBinding && sprintComps.length > 0 && (
        <Page size="A4" style={pageStyles.page} wrap>
          <PageHeader logoBase64={logoBase64} label={headerLabel} />
          <ReportSectionTitle>{t('individual.planByJourney')}</ReportSectionTitle>
          <Text style={s.mapIntro}>
            {duracaoEmTexto ? t('individual.planIntroWeeks', { duration: duracaoEmTexto }) : t('individual.planIntro')}
          </Text>
          {sprintComps.map((comp: any, i: number) => (
            <View key={i} style={s.mapCard} wrap={false}>
              <View style={s.mapCardHead}>
                <View style={s.mapCardNum}><Text style={s.mapCardNumText}>{i + 1}</Text></View>
                <Text style={s.mapCardName}>{comp.nome}</Text>
              </View>
              <Text style={{ fontSize: 8, color: colors.cyan, letterSpacing: 1, marginBottom: 5, textTransform: 'uppercase' }}>
                {`${t('individual.journeyN', { n: i + 1 })}${cicloLabel(comp.nome) ? ` · ${cicloLabel(comp.nome)}` : ''}`}
              </Text>
              {comp.sprint?.foco_30_dias && <Text style={s.mapFoco}>{comp.sprint.foco_30_dias}</Text>}
              {comp.sprint?.acao_principal && (
                <View style={s.mapLine}>
                  <Text style={s.mapLineLabel}>{t('individual.mainAction')}</Text>
                  <Text style={s.mapLineText}>{comp.sprint.acao_principal}</Text>
                </View>
              )}
              {comp.sprint?.evidencia_esperada && (
                <View style={s.mapLine}>
                  <Text style={s.mapLineLabel}>{t('individual.evidence')}</Text>
                  <Text style={s.mapLineText}>{comp.sprint.evidencia_esperada}</Text>
                </View>
              )}
              {comp.sprint?.ritual && (
                <View style={s.mapLine}>
                  <Text style={s.mapLineLabel}>{t('individual.ritual')}</Text>
                  <Text style={s.mapLineText}>{comp.sprint.ritual}</Text>
                </View>
              )}
            </View>
          ))}
          <PageFooter mostrarVertho={mostrarVertho} t={t} />
        </Page>
      )}

      {/* ═══════════════════ COMPETÊNCIAS — uma página por competência ═══════════════════ */}
      {/* A mensagem final flui logo após o último checklist (fim da última
          competência); só cai pra página seguinte, no topo, se não couber. */}
      {competencias.map((comp: any, idx: number) => {
        // Ciclo do sprint (quando há blueprint): deixa CLARO que a 2ª competência só
        // começa depois da 1ª (Semana X), não em paralelo.
        const cw = cicloPorComp[comp.nome];
        const ciclo = hasBinding && cw
          ? { numero: idx + 1, janela: cicloLabel(comp.nome), inicioSemana: cw.min, comecaAgora: idx === 0 }
          : undefined;
        return (
          <Page key={idx} size="A4" style={pageStyles.page} wrap>
            <PageHeader logoBase64={logoBase64} label={t('individual.competencyOf', { n: idx + 1, total: competencias.length })} />
            <CompetencyBlock comp={comp} index={idx} total={competencias.length} ciclo={ciclo} locale={idioma} />
            <PageFooter mostrarVertho={mostrarVertho} t={t} />
          </Page>
        );
      })}

      {/* ═══════════════════ COMO ESTE PDI VIRA TRILHA + MENSAGEM FINAL ═══════════════════ */}
      {competencias.length >= 1 && (
        <Page size="A4" style={pageStyles.page} wrap>
          <PageHeader logoBase64={logoBase64} label={headerLabel} />
          <ReportSectionTitle>{hasBinding ? t('individual.pathStepByStep') : t('individual.howPdiBecomesJourney')}</ReportSectionTitle>
          <Text style={s.trilhaIntro}>
            {hasBinding
              ? (duracaoEmTexto ? t('individual.pathIntroWeeks', { duration: duracaoEmTexto }) : t('individual.pathIntro'))
              : t('individual.howPdiBecomesJourneyIntro')}
          </Text>
          {hasBinding ? (
            bindingBlocos.map((b, i) => (
              <View key={i} style={s.tlRow} wrap={false}>
                <View style={s.tlPhase}>
                  <Text style={s.tlPhaseText}>{b.faseLabel}</Text>
                  {b.focoAgora && (
                    <Text style={{ fontSize: 7, color: colors.cyan, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 3 }}>{t('individual.focusNow')}</Text>
                  )}
                </View>
                <View style={s.tlBody}>
                  <Text style={s.tlTitle}>{b.titulo}</Text>
                  {b.objetivo && (
                    <Text style={[s.tlDetail, { fontStyle: 'italic', color: colors.navy, marginBottom: 4 }]}>{b.objetivo}</Text>
                  )}
                  {b.conteudos.length > 0 && !b.temAvaliacao && (
                    <View style={s.mapLine}>
                      <Text style={s.mapLineLabel}>{t('individual.learns')}</Text>
                      <View style={{ flex: 1 }}>
                        {b.conteudos.map((tema, j) => (
                          <Text key={j} style={s.tlDetail}>{tema}</Text>
                        ))}
                      </View>
                    </View>
                  )}
                  {b.acoes.length > 0 && (
                    <View style={s.mapLine}>
                      <Text style={s.mapLineLabel}>{b.temAvaliacao ? t('individual.assesses') : t('individual.challenge')}</Text>
                      <View style={{ flex: 1 }}>
                        {b.acoes.map((a, j) => (
                          <Text key={j} style={s.tlDetail}>{a}</Text>
                        ))}
                      </View>
                    </View>
                  )}
                  {b.evidencia && (
                    <View style={s.mapLine}>
                      <Text style={s.mapLineLabel}>{t('individual.evidence')}</Text>
                      <Text style={[s.tlDetail, { flex: 1 }]}>{b.evidencia}</Text>
                    </View>
                  )}
                  {b.ritual && (
                    <View style={s.mapLine}>
                      <Text style={s.mapLineLabel}>{t('individual.ritual')}</Text>
                      <Text style={[s.tlDetail, { flex: 1 }]}>{b.ritual}</Text>
                    </View>
                  )}
                  {(b.temMissao || b.temAvaliacao) && (
                    <View style={s.tlMeta}>
                      {b.temMissao && <Text style={s.tlBadge}>{t('individual.practicalChallenge')}</Text>}
                      {b.temAvaliacao && <Text style={s.tlBadge}>{t('individual.finalAssessment')}</Text>}
                    </View>
                  )}
                </View>
              </View>
            ))
          ) : (
            trilhaFases.map((f, i) => (
              <View key={i} style={s.tlRow} wrap={false}>
                <View style={s.tlPhase}><Text style={s.tlPhaseText}>{f.fase}</Text></View>
                <View style={s.tlBody}>
                  <Text style={s.tlTitle}>{f.titulo}</Text>
                  <Text style={s.tlDetail}>{f.detalhe}</Text>
                </View>
              </View>
            ))
          )}
          <Text style={s.trilhaFooterNote}>
            {t('individual.pathFootnote')}
          </Text>
          {c.mensagem_final && (
            <View style={[s.finalBox, { marginTop: 18 }]} wrap={false}>
              <Text style={s.finalLabel}>{t('individual.finalMessage')}</Text>
              <Text style={s.finalText}>{c.mensagem_final}</Text>
            </View>
          )}
          <PageFooter mostrarVertho={mostrarVertho} t={t} />
        </Page>
      )}

      {/* Fallback: sem competências, a mensagem final ganha página própria (topo). */}
      {c.mensagem_final && competencias.length === 0 && (
        <Page size="A4" style={pageStyles.page}>
          <PageHeader logoBase64={logoBase64} label={headerLabel} />
          <View style={s.finalBox}>
            <Text style={s.finalLabel}>{t('individual.finalMessage')}</Text>
            <Text style={s.finalText}>{c.mensagem_final}</Text>
          </View>
          <PageFooter mostrarVertho={mostrarVertho} t={t} />
        </Page>
      )}

      {/* ═══════════════════ CONTRACAPA NAVY ═══════════════════ */}
      {/* A contracapa é só o logo (a `linha` já vem null no PDI). Sem imagem
          nenhuma ela vira uma página navy VAZIA — pior que não existir —, então
          o tenant white-label sem logo próprio simplesmente não a recebe. */}
      {logoBase64 ? <PdfBackCover logoBase64={logoBase64} linha={null} /> : null}
    </Document>
  );
}
