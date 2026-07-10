import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts, tableStyles, pageStyles, nivelColor, nivelBgColor, nivelLabel } from './styles';
import { PdfBackCover } from './PdfCover';
import PdfReportCover, { ReportSectionTitle } from './PdfReportCover';
import { getReportCoverBgBase64 } from '@/lib/pdf-assets';
import { LevelDots } from './StatusBadge';
import CompetencyBlock from './CompetencyBlock';

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
  // Status pills
  statusPillAtencao: {
    backgroundColor: '#FEE2E2', alignSelf: 'flex-start',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2,
  },
  statusPillAtencaoText: { fontSize: 7, fontWeight: 600, color: '#B91C1C' },
  statusPillDev: {
    backgroundColor: '#FEF9C3', alignSelf: 'flex-start',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2,
  },
  statusPillDevText: { fontSize: 7, fontWeight: 600, color: '#A16207' },
  statusPillBom: {
    backgroundColor: '#D1FAE5', alignSelf: 'flex-start',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2,
  },
  statusPillBomText: { fontSize: 7, fontWeight: 600, color: '#065F46' },
  // Progress bar
  progWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  progBar: { width: 60, height: 5, backgroundColor: '#E2E8F0', borderRadius: 2.5, overflow: 'hidden' },
  progFill: { height: '100%' },
  progLabel: { fontSize: 7, color: colors.gray500, fontWeight: 600 },
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
function PageFooter() {
  return (
    <View style={pageStyles.footer} fixed>
      <Text style={pageStyles.footerText}>Vertho Mentor IA — Confidencial</Text>
      <Text style={pageStyles.footerText}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

// ── Status pill helper ──────────────────────────────────────────────────────
function StatusPill({ nivel }: { nivel: number }) {
  if (nivel <= 1) return (
    <View style={s.statusPillAtencao}><Text style={s.statusPillAtencaoText}>Atenção</Text></View>
  );
  if (nivel === 2) return (
    <View style={s.statusPillDev}><Text style={s.statusPillDevText}>Em Desenvolvimento</Text></View>
  );
  return <View style={s.statusPillBom}><Text style={s.statusPillBomText}>{nivelLabel(nivel)}</Text></View>;
}

function ProgressBar({ nivel }: { nivel: number }) {
  const pct = Math.min(100, Math.max(0, (nivel / 4) * 100));
  const fillColor = nivel <= 1 ? '#EF4444' : nivel === 2 ? '#F59E0B' : nivel === 3 ? '#06B6D4' : '#10B981';
  return (
    <View style={s.progWrap}>
      <View style={s.progBar}>
        <View style={{ ...s.progFill, width: `${pct}%`, backgroundColor: fillColor }} />
      </View>
      <Text style={s.progLabel}>{Math.round(pct)}%</Text>
    </View>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function RelatorioIndividualPDF({ data, empresaNome, logoBase64 }: { data: any; empresaNome?: string; logoBase64?: string }) {
  const c = data.conteudo;
  if (!c) return null;

  const competencias = c.competencias || [];
  const nome = data.colaborador_nome || '';
  const headerLabel = `Plano de Desenvolvimento Individual${nome ? ` · ${(nome.split(' ')[0]) || nome}` : ''}`;

  // Competências que já têm sprint (novo modelo) — dirige o one-pager.
  const sprintComps = competencias.filter((comp: any) => comp && comp.sprint);

  // ── Timeline "vira trilha" (COMPUTADA no render, determinística) ──
  // Base: Regular DUO (14 semanas, missões 4/8/12, avaliação 13/14). Se houver
  // 1 competência, adapta. Deriva a ação de cada fase do sprint da competência.
  const acaoDe = (comp: any): string =>
    (comp?.sprint?.acao_principal || comp?.melhorar?.[0] || 'mapear e praticar os descritores prioritários');
  const trilhaFases: { fase: string; titulo: string; detalhe: string }[] = [];
  if (competencias.length >= 2) {
    trilhaFases.push(
      { fase: 'Semanas 1–4', titulo: competencias[0].nome, detalhe: `Mapear e praticar: ${acaoDe(competencias[0])}` },
      { fase: 'Semanas 5–8', titulo: competencias[1].nome, detalhe: `Mapear e praticar: ${acaoDe(competencias[1])}` },
      { fase: 'Semanas 9–12', titulo: 'Integração + missão prática', detalhe: 'Aplicar as duas competências juntas em uma missão prática de complexidade crescente.' },
      { fase: 'Semanas 13–14', titulo: 'Avaliação', detalhe: 'Reflexão qualitativa e cenário final para consolidar a evolução.' },
    );
  } else if (competencias.length === 1) {
    trilhaFases.push(
      { fase: 'Semanas 1–8', titulo: competencias[0].nome, detalhe: `Mapear e praticar: ${acaoDe(competencias[0])}` },
      { fase: 'Semanas 9–12', titulo: 'Aprofundamento', detalhe: 'Aprofundar a prática em situações mais complexas do dia a dia.' },
      { fase: 'Semanas 13–14', titulo: 'Avaliação', detalhe: 'Reflexão qualitativa e cenário final para consolidar a evolução.' },
    );
  }

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
    return cw ? `Semanas ${cw.min}–${cw.max}` : null;
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
      const faseLabel = g.nums.length > 1 ? `Semanas ${min}–${max}` : `Semana ${min}`;
      const titulo = g.comps.length ? g.comps.join(' + ') : (g.temAvaliacao ? 'Avaliação' : 'Prática integrada');
      // Teoria: temas de conteúdo das competências do bloco (o que a pessoa APRENDE).
      const temas: string[] = [];
      for (const cp of g.comps) for (const t of (blueprintConteudos[cp] || [])) if (t.tema && !temas.includes(t.tema)) temas.push(t.tema);
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
        nome={nome}
        cargo={data.colaborador_cargo}
        empresa={empresaNome}
      />

      {/* ═══════════════════ PERFIL + RESUMO DE DESEMPENHO ═══════════════════ */}
      <Page size="A4" style={pageStyles.page} wrap>
        <PageHeader logoBase64={logoBase64} label={headerLabel} />

        {/* Acolhimento (texto de abertura) */}
        {c.acolhimento && <Text style={s.italic}>{c.acolhimento}</Text>}

        {/* Perfil Comportamental — texto introdutório em azul claro */}
        {c.perfil_comportamental && (
          <View style={s.section} wrap={false}>
            <ReportSectionTitle>Perfil Comportamental</ReportSectionTitle>
            <Text style={s.perfilText}>{c.perfil_comportamental.descricao}</Text>
          </View>
        )}

        {/* Pontos Fortes / Pontos de Atenção */}
        {c.perfil_comportamental && (
          <View style={s.pontosRow} wrap={false}>
            <View style={{ ...s.pontosCol, backgroundColor: colors.fezBemBg, borderColor: colors.fezBemBorder }}>
              <Text style={{ ...s.pontosLabel, color: colors.green }}>Pontos Fortes</Text>
              {c.perfil_comportamental.pontos_forca?.map((p: any, i: number) => (
                <View key={i} style={s.pontosItemRow}>
                  <Text style={{ ...s.pontosPrefix, color: colors.green }}>+</Text>
                  <Text style={{ ...s.pontosItemText, color: colors.greenText }}>{p}</Text>
                </View>
              ))}
            </View>
            <View style={{ ...s.pontosCol, backgroundColor: colors.melhorarBg, borderColor: colors.melhorarBorder }}>
              <Text style={{ ...s.pontosLabel, color: colors.orange }}>Pontos de Atenção</Text>
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
            <ReportSectionTitle>Resumo de Desempenho</ReportSectionTitle>
            <View style={s.table}>
              <View style={s.tableHead}>
                <Text style={{ ...s.tableHeadCell, flex: 3 }}>Competência</Text>
                <Text style={{ ...s.tableHeadCell, flex: 0.8, textAlign: 'center' }}>Nível</Text>
                <Text style={{ ...s.tableHeadCell, flex: 1.4, textAlign: 'center' }}>Status</Text>
                <Text style={{ ...s.tableHeadCell, flex: 1.4, textAlign: 'center' }}>Desempenho</Text>
              </View>
              {(c.resumo_desempenho || competencias).map((comp: any, i: number) => {
                const nivel = comp.nivel || comp.nivel_atual || 0;
                const rowStyle = i % 2 === 0 ? s.tableRow : s.tableRowAlt;
                return (
                  <View key={i} style={rowStyle}>
                    <Text style={{ ...s.tableCellComp, flex: 3 }}>
                      {comp.competencia || comp.nome}
                    </Text>
                    <View style={{ flex: 0.8, alignItems: 'center' }}>
                      <View style={s.nivelTag}>
                        <Text style={s.nivelTagText}>N{nivel}</Text>
                      </View>
                    </View>
                    <View style={{ flex: 1.4, alignItems: 'center' }}>
                      <StatusPill nivel={nivel} />
                    </View>
                    <View style={{ flex: 1.4, alignItems: 'center' }}>
                      <ProgressBar nivel={nivel} />
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
            <ReportSectionTitle>Trilha de Desenvolvimento</ReportSectionTitle>
            <View style={s.trilhaBox}>
              <Text style={s.trilhaLabel}>Cursos Recomendados</Text>
              {c.trilha_cursos.map((curso: any, i: number) => (
                <Text key={i} style={s.trilhaItem}>
                  {i + 1}. {curso.nome}{curso.competencia ? ` (${curso.competencia})` : ''}
                </Text>
              ))}
            </View>
          </View>
        )}

        <PageFooter />
      </Page>

      {/* ═══ SPRINT ONE-PAGER (LEGADO — só sem blueprint; com blueprint, tudo vira
             a seção única "Sua jornada, ciclo a ciclo" abaixo) ═══ */}
      {!hasBinding && sprintComps.length > 0 && (
        <Page size="A4" style={pageStyles.page} wrap>
          <PageHeader logoBase64={logoBase64} label={headerLabel} />
          <ReportSectionTitle>Seu plano, ciclo a ciclo</ReportSectionTitle>
          <Text style={s.mapIntro}>
            {'Sua trilha tem 14 semanas e você trabalha uma competência por vez. Abaixo, o foco de cada ciclo — comece pelo primeiro; o segundo entra na sequência.'}
          </Text>
          {sprintComps.map((comp: any, i: number) => (
            <View key={i} style={s.mapCard} wrap={false}>
              <View style={s.mapCardHead}>
                <View style={s.mapCardNum}><Text style={s.mapCardNumText}>{i + 1}</Text></View>
                <Text style={s.mapCardName}>{comp.nome}</Text>
              </View>
              <Text style={{ fontSize: 8, color: colors.cyan, letterSpacing: 1, marginBottom: 5, textTransform: 'uppercase' }}>
                {`Ciclo ${i + 1}${cicloLabel(comp.nome) ? ` · ${cicloLabel(comp.nome)}` : ''}`}
              </Text>
              {comp.sprint?.foco_30_dias && <Text style={s.mapFoco}>{comp.sprint.foco_30_dias}</Text>}
              {comp.sprint?.acao_principal && (
                <View style={s.mapLine}>
                  <Text style={s.mapLineLabel}>Ação principal</Text>
                  <Text style={s.mapLineText}>{comp.sprint.acao_principal}</Text>
                </View>
              )}
              {comp.sprint?.evidencia_esperada && (
                <View style={s.mapLine}>
                  <Text style={s.mapLineLabel}>Evidência</Text>
                  <Text style={s.mapLineText}>{comp.sprint.evidencia_esperada}</Text>
                </View>
              )}
              {comp.sprint?.ritual && (
                <View style={s.mapLine}>
                  <Text style={s.mapLineLabel}>Ritual</Text>
                  <Text style={s.mapLineText}>{comp.sprint.ritual}</Text>
                </View>
              )}
            </View>
          ))}
          <PageFooter />
        </Page>
      )}

      {/* ═══════════════════ COMPETÊNCIAS — uma página por competência ═══════════════════ */}
      {/* A mensagem final flui logo após o último checklist (fim da última
          competência); só cai pra página seguinte, no topo, se não couber. */}
      {competencias.map((comp: any, idx: number) => (
        <Page key={idx} size="A4" style={pageStyles.page} wrap>
          <PageHeader logoBase64={logoBase64} label={`Competência ${idx + 1} de ${competencias.length}`} />
          <CompetencyBlock comp={comp} index={idx} total={competencias.length} />
          <PageFooter />
        </Page>
      ))}

      {/* ═══════════════════ COMO ESTE PDI VIRA TRILHA + MENSAGEM FINAL ═══════════════════ */}
      {competencias.length >= 1 && (
        <Page size="A4" style={pageStyles.page} wrap>
          <PageHeader logoBase64={logoBase64} label={headerLabel} />
          <ReportSectionTitle>{hasBinding ? 'Sua jornada, ciclo a ciclo' : 'Como este PDI vira trilha'}</ReportSectionTitle>
          <Text style={s.trilhaIntro}>
            {hasBinding
              ? 'Sua trilha tem 14 semanas, uma competência por vez. Cada ciclo tem um objetivo (o que muda no seu trabalho), o que você aprende e o que pratica. Comece pelo Ciclo 1 — o resto vem na sequência, e a trilha te guia semana a semana.'
              : 'O que está no seu PDI é exatamente o que você vai aprender e praticar na trilha. Cada ciclo tem conteúdo (o que você estuda) e prática (o que você aplica).'}
          </Text>
          {hasBinding ? (
            bindingBlocos.map((b, i) => (
              <View key={i} style={s.tlRow} wrap={false}>
                <View style={s.tlPhase}>
                  <Text style={s.tlPhaseText}>{b.faseLabel}</Text>
                  {b.focoAgora && (
                    <Text style={{ fontSize: 7, color: colors.cyan, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 3 }}>Foco agora</Text>
                  )}
                </View>
                <View style={s.tlBody}>
                  <Text style={s.tlTitle}>{b.titulo}</Text>
                  {b.objetivo && (
                    <Text style={[s.tlDetail, { fontStyle: 'italic', color: colors.navy, marginBottom: 4 }]}>{b.objetivo}</Text>
                  )}
                  {b.conteudos.length > 0 && !b.temAvaliacao && (
                    <View style={s.mapLine}>
                      <Text style={s.mapLineLabel}>Aprende</Text>
                      <View style={{ flex: 1 }}>
                        {b.conteudos.map((t, j) => (
                          <Text key={j} style={s.tlDetail}>{t}</Text>
                        ))}
                      </View>
                    </View>
                  )}
                  {b.acoes.length > 0 && (
                    <View style={s.mapLine}>
                      <Text style={s.mapLineLabel}>{b.temAvaliacao ? 'Avalia' : 'Prática'}</Text>
                      <View style={{ flex: 1 }}>
                        {b.acoes.map((a, j) => (
                          <Text key={j} style={s.tlDetail}>{a}</Text>
                        ))}
                      </View>
                    </View>
                  )}
                  {b.evidencia && (
                    <View style={s.mapLine}>
                      <Text style={s.mapLineLabel}>Evidência</Text>
                      <Text style={[s.tlDetail, { flex: 1 }]}>{b.evidencia}</Text>
                    </View>
                  )}
                  {b.ritual && (
                    <View style={s.mapLine}>
                      <Text style={s.mapLineLabel}>Ritual</Text>
                      <Text style={[s.tlDetail, { flex: 1 }]}>{b.ritual}</Text>
                    </View>
                  )}
                  {(b.temMissao || b.temAvaliacao) && (
                    <View style={s.tlMeta}>
                      {b.temMissao && <Text style={s.tlBadge}>Missão prática</Text>}
                      {b.temAvaliacao && <Text style={s.tlBadge}>Avaliação</Text>}
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
            {'Cada passo do PDI vira uma semana de prática — o plano e a trilha são o mesmo caminho.'}
          </Text>
          {c.mensagem_final && (
            <View style={[s.finalBox, { marginTop: 18 }]} wrap={false}>
              <Text style={s.finalLabel}>Mensagem Final</Text>
              <Text style={s.finalText}>{c.mensagem_final}</Text>
            </View>
          )}
          <PageFooter />
        </Page>
      )}

      {/* Fallback: sem competências, a mensagem final ganha página própria (topo). */}
      {c.mensagem_final && competencias.length === 0 && (
        <Page size="A4" style={pageStyles.page}>
          <PageHeader logoBase64={logoBase64} label={headerLabel} />
          <View style={s.finalBox}>
            <Text style={s.finalLabel}>Mensagem Final</Text>
            <Text style={s.finalText}>{c.mensagem_final}</Text>
          </View>
          <PageFooter />
        </Page>
      )}

      {/* ═══════════════════ CONTRACAPA NAVY ═══════════════════ */}
      <PdfBackCover logoBase64={logoBase64} />
    </Document>
  );
}
