import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { colors, pageStyles } from './styles';
import PdfReportCover, { ReportSectionTitle } from './PdfReportCover';
import { getReportCoverBgBase64 } from '@/lib/pdf-assets';
import { leituraDoCargo, nivelGeralDosIndicadores } from '@/lib/relatorios/niveis-do-rh';
import { rotuloNivel } from '@/lib/nivel-regua';
import { idiomaDoPdf, percentualNoPdf, tradutorDoPdf, type PdfT } from '@/lib/pdf-i18n';
// SectionTitle → ReportSectionTitle (Fraunces) e PageBackground → PageHeader fino, de PdfReportCover

const s = StyleSheet.create({
  section: { marginBottom: 14 },
  text: { fontFamily: 'NotoSans', fontSize: 10, color: colors.textPrimary, lineHeight: 1.6, marginBottom: 4 },
  textIt: { fontFamily: 'NotoSans', fontSize: 10, color: colors.textSecondary, fontStyle: 'italic', marginBottom: 4, lineHeight: 1.5 },
  h3: { fontFamily: 'NotoSans', fontSize: 11, fontWeight: 600, color: colors.navyLight, marginBottom: 4, marginTop: 8 },
  box: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.gray200, borderRadius: 8, padding: 14, marginBottom: 10 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.gray200, marginVertical: 12 },
  // KPIs
  kpiRow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  kpiRowAlt: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', backgroundColor: '#FAFAFA' },
  kpiLabel: { fontFamily: 'NotoSans', fontSize: 10, color: colors.textPrimary, flex: 1 },
  kpiValue: { fontFamily: 'NotoSans', fontSize: 10, color: colors.textPrimary, fontWeight: 700, width: 150 },
  // Level bars
  levelBar: { borderRadius: 4, paddingVertical: 6, paddingHorizontal: 12, marginBottom: 4 },
  levelText: { fontFamily: 'NotoSans', fontSize: 10, fontWeight: 600 },
  // Badge
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginLeft: 6 },
  badgeText: { fontFamily: 'NotoSans', fontSize: 8, fontWeight: 600 },
  // Competências críticas
  critCard: { borderRadius: 6, overflow: 'hidden', marginBottom: 8 },
  critHeader: { paddingVertical: 8, paddingHorizontal: 12 },
  critHeaderText: { fontFamily: 'NotoSans', fontSize: 10, fontWeight: 700, color: '#FFFFFF' },
  critContent: { paddingVertical: 8, paddingHorizontal: 14 },
  critImpacto: { fontFamily: 'NotoSans', fontSize: 9, color: colors.textSecondary, fontStyle: 'italic', marginTop: 4 },
  // Treinamentos
  trainCard: { borderRadius: 6, overflow: 'hidden', marginBottom: 8 },
  trainHeader: { paddingVertical: 8, paddingHorizontal: 12 },
  trainHeaderText: { fontFamily: 'NotoSans', fontSize: 10, fontWeight: 700, color: '#FFFFFF' },
  trainContent: { paddingVertical: 8, paddingHorizontal: 14 },
  trainMeta: { fontFamily: 'NotoSans', fontSize: 9, color: colors.textMuted, fontStyle: 'italic', marginBottom: 3 },
  // Decisões
  decCard: { borderRadius: 6, overflow: 'hidden', marginBottom: 8 },
  decHeader: { backgroundColor: '#1E1B4B', paddingVertical: 8, paddingHorizontal: 12 },
  decHeaderText: { fontFamily: 'NotoSans', fontSize: 10, fontWeight: 700, color: '#FFFFFF' },
  decRow: { paddingVertical: 6, paddingHorizontal: 14 },
  decLabel: { fontFamily: 'NotoSans', fontSize: 9, fontWeight: 600, color: colors.textMuted, marginBottom: 1 },
  // Ações horizonte
  acaoCard: { borderRadius: 6, marginBottom: 6, overflow: 'hidden' },
  acaoHeader: { paddingVertical: 8, paddingHorizontal: 12 },
  acaoHeaderText: { fontFamily: 'NotoSans', fontSize: 10, fontWeight: 700, color: '#FFFFFF' },
  acaoContent: { paddingVertical: 8, paddingHorizontal: 14 },
  acaoTitulo: { fontFamily: 'NotoSans', fontSize: 10, fontWeight: 600, color: colors.textPrimary, marginBottom: 3 },
  // Visão por cargo
  cargoCard: { borderWidth: 1, borderColor: colors.gray200, borderRadius: 6, padding: 10, marginBottom: 8 },
  cargoTitle: { fontFamily: 'NotoSans', fontSize: 11, fontWeight: 600, color: colors.navyLight, marginBottom: 4 },
  // Highlights
  hlPositive: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#D1FAE5', borderRadius: 6, padding: 8, marginBottom: 4 },
  hlAttention: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 6, padding: 8, marginBottom: 4 },
  hlText: { fontFamily: 'NotoSans', fontSize: 10 },
});

function PageFooter({ t }: { t: PdfT }) {
  return (
    <View style={pageStyles.footer} fixed>
      <Text style={pageStyles.footerText}>{t('common.footerMentor')}</Text>
      <Text style={pageStyles.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

// Header fino unificado (mesmo padrão do PDI) \u2014 substitui o antigo fundo de
// página inteira (template-fundo-relatorios.png), unificando o look e cortando
// o PDF de ~1,7MB para ~200KB.
function PageHeader({ logoBase64, label }: { logoBase64?: string; label: string }) {
  return (
    <View style={pageStyles.header} fixed>
      {logoBase64 ? <Image src={logoBase64} style={pageStyles.headerLogo} /> : <View />}
      <Text style={pageStyles.headerLabel}>{label}</Text>
    </View>
  );
}

const critColors = {
  CRITICA: { bg: '#B91C1C', contentBg: '#FEF2F2' },
  ATENCAO: { bg: '#D97706', contentBg: '#FFFBEB' },
  ESTAVEL: { bg: '#16A34A', contentBg: '#F0FDF4' },
};
const prioColors = {
  URGENTE: { bg: '#B91C1C', contentBg: '#FEF2F2' },
  IMPORTANTE: { bg: '#2563EB', contentBg: '#EFF6FF' },
  DESEJAVEL: { bg: '#16A34A', contentBg: '#F0FDF4' },
};
const acaoHorizontesDoPlano = (t: PdfT) => [
  { key: 'curto_prazo', label: t('rh.shortTerm'), bg: '#B91C1C', contentBg: '#FEF2F2' },
  { key: 'medio_prazo', label: t('rh.midTerm'), bg: '#2563EB', contentBg: '#EFF6FF' },
  { key: 'longo_prazo', label: t('rh.longTerm'), bg: '#16A34A', contentBg: '#F0FDF4' },
];

/**
 * Os códigos de criticidade e de prioridade que o relatório carrega (`CRITICA`,
 * `URGENTE`...) viram o rótulo do idioma de quem lê. Código que o catálogo não
 * conhece segue como veio: é texto do relatório, não do papel.
 */
export const CODIGOS_CRITICIDADE = ['CRITICA', 'ATENCAO', 'ESTAVEL'];
export const CODIGOS_PRIORIDADE = ['URGENTE', 'IMPORTANTE', 'DESEJAVEL'];
export function rotuloDoCodigo(t: PdfT, familia: 'criticality' | 'priority', codigo: unknown): string {
  const bruto = String(codigo ?? '');
  const conhecidos = familia === 'criticality' ? CODIGOS_CRITICIDADE : CODIGOS_PRIORIDADE;
  return conhecidos.includes(bruto) ? t(`rh.${familia}.${bruto}`) : bruto;
}

function textOf(v: any): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}

function parseJsonLike(v: any): any {
  if (v == null || typeof v !== 'string') return v;
  const trimmed = v.trim();
  if ((!trimmed.startsWith('{') || !trimmed.endsWith('}')) && (!trimmed.startsWith('[') || !trimmed.endsWith(']'))) {
    return v;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return v;
  }
}

function getResumoExecutivo(v: any) {
  const parsed = typeof v === 'object' && v !== null ? v : parseJsonLike(v);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return {
    leitura: parsed.leitura_geral || parsed.leitura || '',
    principalForca: parsed.principal_forca_organizacional || parsed.principal_avanco || '',
    principalRisco: parsed.principal_risco_organizacional || parsed.principal_ponto_de_atencao || '',
  };
}

export default function RelatorioRHPDF({ data, empresaNome, logoBase64, locale }: {
  data: any;
  empresaNome?: string;
  logoBase64?: string;
  /** Idioma do texto fixo do papel: o de quem lê (`lib/pdf-locale.ts`). Sem ele, pt-BR. O texto da IA segue como foi gerado. */
  locale?: string | null;
}) {
  const t = tradutorDoPdf(locale);
  const idioma = idiomaDoPdf(locale);
  const acaoHorizontes = acaoHorizontesDoPlano(t);
  // Percentual com no máximo uma casa, pelo `Intl` do idioma (15,83 + 4,17 em ponto flutuante vira 20,000000000000004).
  const pct = (n: number) => percentualNoPdf(n, idioma);
  const c = data.conteudo;
  // Opção A: "Onde Investir" funde Competências Críticas + Formações — cada
  // competência crítica mostra a formação que a resolve (casada por nome).
  const normComp = (x: any) => String(x || '').trim().toLowerCase();
  const treinoByComp = new Map<string, any>();
  (c?.treinamentos_sugeridos || []).forEach((tr: any) => { const k = normComp(tr.competencia); if (k && !treinoByComp.has(k)) treinoByComp.set(k, tr); });
  const treinosCasados = new Set((c?.competencias_criticas || []).map((x: any) => normComp(x.competencia)).filter((k: string) => treinoByComp.has(k)));
  // "Talentos a Potencializar" = só destaques POSITIVOS. O prompt novo já gera
  // assim, mas relatórios legados misturam casos de atenção — filtramos aqui
  // (corta nível 1 / abaixo da média; mantém referências/nível 3+).
  const ehTalento = (d: any) => {
    const txt = `${d?.situacao || ''} ${d?.acao || ''}`.toLowerCase();
    const positivo = /n[íi]vel\s*[34]|refer[êe]ncia|destac|mentor|multiplicad|destoa positiv/.test(txt);
    const atencao = /n[íi]vel\s*1|abaixo da m[eé]dia|barreira|incluir.*treinamento|acompanhar evolu|fragilidad/.test(txt);
    return positivo || !atencao;
  };
  const talentos = (c?.decisoes_chave || []).filter(ehTalento);
  if (!c) return null;
  const resumoExecutivo = getResumoExecutivo(c.resumo_executivo);
  const nivelGeral = nivelGeralDosIndicadores(c.indicadores);

  return (
    <Document>
      {/* Capa */}
      <PdfReportCover
        bgBase64={getReportCoverBgBase64()}
        logoBase64={logoBase64}
        overline={t('rh.coverOverline')}
        titulo={[t('rh.coverTitle1'), t('rh.coverTitle2')]}
        nome={empresaNome}
        tagline={t('rh.tagline')}
        locale={idioma}
      />

      {/* Resumo + Indicadores */}
      <Page size="A4" style={pageStyles.page} wrap>
        <PageHeader logoBase64={logoBase64} label={t('rh.reportLabel')} />

        {c.resumo_executivo && (
          <View style={s.section} wrap={false}>
            <ReportSectionTitle>{t('rh.executiveSummary')}</ReportSectionTitle>
            <View style={s.box}>
              <Text style={s.text}>{textOf(resumoExecutivo?.leitura || c.resumo_executivo)}</Text>
              {(resumoExecutivo?.principalForca || c.resumo_executivo?.principal_forca_organizacional) && (
                <Text style={{ ...s.text, color: '#2E7D32', marginTop: 4 }}>{t('rh.strength', { text: textOf(resumoExecutivo?.principalForca || c.resumo_executivo?.principal_forca_organizacional) })}</Text>
              )}
              {(resumoExecutivo?.principalRisco || c.resumo_executivo?.principal_risco_organizacional) && (
                <Text style={{ ...s.text, color: '#B91C1C', marginTop: 2 }}>{t('rh.risk', { text: textOf(resumoExecutivo?.principalRisco || c.resumo_executivo?.principal_risco_organizacional) })}</Text>
              )}
            </View>
          </View>
        )}

        {c.indicadores && (
          <View style={s.section} wrap={false}>
            <ReportSectionTitle>{t('rh.quantitativeIndicators')}</ReportSectionTitle>
            <View style={{ borderWidth: 1, borderColor: colors.gray200, borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
              {/* Sem a "Média geral" (lote 5b, 04/10/2026): o nível mais frequente sai dos
                  percentuais por nível, que existem nos relatórios novos e nos antigos. */}
              {[[t('rh.evaluatedPeople'), c.indicadores.total_avaliados],
                [t('rh.assessmentsDone'), c.indicadores.total_avaliacoes],
                [t('rh.mostFrequentLevel'), nivelGeral != null ? rotuloNivel(nivelGeral, { forma: 'curto' }) : '\u2014'],
              ].map(([label, val]: [any, any], i: number) => (
                <View key={i} style={i % 2 === 0 ? s.kpiRow : s.kpiRowAlt}>
                  <Text style={s.kpiLabel}>{label}</Text>
                  <Text style={s.kpiValue}>{val || 0}</Text>
                </View>
              ))}
            </View>
            <View>
              <View style={{ ...s.levelBar, backgroundColor: '#F0FDF4' }}>
                <Text style={{ ...s.levelText, color: '#166534' }}>{t('rh.levelPair', { a: rotuloNivel(3, { idioma }), b: rotuloNivel(4, { idioma }), pct: pct((c.indicadores.pct_nivel_3 || 0) + (c.indicadores.pct_nivel_4 || 0)) })}</Text>
              </View>
              <View style={{ ...s.levelBar, backgroundColor: '#FFFBEB' }}>
                <Text style={{ ...s.levelText, color: '#92400E' }}>{t('rh.levelSingle', { level: rotuloNivel(2, { idioma }), pct: pct(c.indicadores.pct_nivel_2 || 0) })}</Text>
              </View>
              <View style={{ ...s.levelBar, backgroundColor: '#FEF2F2' }}>
                <Text style={{ ...s.levelText, color: '#991B1B' }}>{t('rh.levelSingle', { level: rotuloNivel(1, { idioma }), pct: pct(c.indicadores.pct_nivel_1 || 0) })}</Text>
              </View>
            </View>
          </View>
        )}

        {c.comparativo_f1_f3 && (
          <View style={s.section} wrap={false}>
            <ReportSectionTitle>{t('rh.comparative')}</ReportSectionTitle>
            <View style={s.box}><Text style={s.text}>{c.comparativo_f1_f3.analise}</Text></View>
            {c.comparativo_f1_f3.destaque_positivo && (
              <View style={s.hlPositive}><Text style={{ ...s.hlText, color: '#166534' }}>+ {c.comparativo_f1_f3.destaque_positivo}</Text></View>
            )}
            {c.comparativo_f1_f3.destaque_atencao && (
              <View style={s.hlAttention}><Text style={{ ...s.hlText, color: '#92400E' }}>! {c.comparativo_f1_f3.destaque_atencao}</Text></View>
            )}
          </View>
        )}

        {c.visao_por_cargo?.length > 0 && (
          <View style={s.section}>
            <ReportSectionTitle>{t('rh.roleView')}</ReportSectionTitle>
            {c.visao_por_cargo.map((v: any, i: number) => {
              // O nível do cargo, sem a média (lote 5b, 04/10/2026): o relatório novo traz a
              // distribuição de avaliações por nível e o nível mais frequente; o antigo só trazia
              // `media_nivel` ou `media`, e dela sai apenas o nível. A IA também renomeou os
              // campos (leitura/principais_forcas/principais_riscos); mantemos fallback pros antigos.
              const leituraCargo = leituraDoCargo(v);
              const dist = leituraCargo.distribuicao;
              const rotuloLeitura = leituraCargo.origem === 'media' ? t('rh.overallLevel') : t('rh.mostFrequentLevel');
              const forte = v.ponto_forte || (Array.isArray(v.principais_forcas) ? v.principais_forcas.join(' · ') : v.principais_forcas);
              const critico = v.ponto_critico || (Array.isArray(v.principais_riscos) ? v.principais_riscos.join(' · ') : v.principais_riscos);
              return (
              <View key={i} style={s.cargoCard} wrap={false}>
                <Text style={s.cargoTitle}>{v.cargo}{leituraCargo.nivel != null ? ` · ${rotuloLeitura}: ${rotuloNivel(leituraCargo.nivel, { forma: 'curto' })}` : ''}</Text>
                {dist && <Text style={s.textIt}>{t('rh.assessmentsByLevel')}: {rotuloNivel(1, { forma: 'curto' })}:{dist.n1} | {rotuloNivel(2, { forma: 'curto' })}:{dist.n2} | {rotuloNivel(3, { forma: 'curto' })}:{dist.n3} | {rotuloNivel(4, { forma: 'curto' })}:{dist.n4}</Text>}
                <Text style={s.text}>{v.leitura || v.analise}</Text>
                {forte && <View style={s.hlPositive}><Text style={{ ...s.hlText, color: '#166534' }}>+ {forte}</Text></View>}
                {critico && <View style={s.hlAttention}><Text style={{ ...s.hlText, color: '#92400E' }}>! {critico}</Text></View>}
              </View>
              );
            })}
          </View>
        )}

        <PageFooter t={t} />
      </Page>

      {/* Competências Críticas + Treinamentos */}
      <Page size="A4" style={pageStyles.page} wrap>
        <PageHeader logoBase64={logoBase64} label={t('rh.reportLabel')} />

        {c.competencia_foco_por_cargo?.length > 0 && (
          <View style={s.section}>
            <ReportSectionTitle>{t('rh.focusByRole')}</ReportSectionTitle>
            {c.competencia_foco_por_cargo.map((f: any, i: number) => (
              <View key={i} style={{ ...s.critCard, marginBottom: 8 }} wrap={false}>
                <View style={{ ...s.critHeader, backgroundColor: '#0D9488' }}>
                  <Text style={s.critHeaderText}>{f.cargo} · {f.competencia_recomendada} {f.horizonte_sugerido ? `[${f.horizonte_sugerido}]` : ''}</Text>
                </View>
                <View style={{ ...s.critContent, backgroundColor: '#ECFDF5' }}>
                  <Text style={s.text}>{f.justificativa}</Text>
                  {f.expectativa_impacto && <Text style={s.critImpacto}>{t('rh.expectedImpact', { text: textOf(f.expectativa_impacto) })}</Text>}
                </View>
              </View>
            ))}
          </View>
        )}

        {c.competencias_criticas?.length > 0 && (
          <View style={s.section}>
            <ReportSectionTitle>{t('rh.whereToInvest')}</ReportSectionTitle>
            {c.competencias_criticas.map((comp: any, i: number) => {
              const cc = (critColors as any)[comp.criticidade] || critColors.ESTAVEL;
              return (
                <View key={i} style={s.critCard} wrap={false}>
                  <View style={{ ...s.critHeader, backgroundColor: cc.bg }}>
                    <Text style={s.critHeaderText}>{comp.competencia}: {rotuloDoCodigo(t, 'criticality', comp.criticidade)}</Text>
                  </View>
                  <View style={{ ...s.critContent, backgroundColor: cc.contentBg }}>
                    <Text style={s.text}>{comp.justificativa || comp.motivo}</Text>
                    {(comp.impacto_organizacional || comp.impacto || comp.impacto_alunos) && <Text style={s.critImpacto}>{comp.impacto_organizacional || comp.impacto || comp.impacto_alunos}</Text>}
                    {treinoByComp.get(normComp(comp.competencia)) && (() => { const tr = treinoByComp.get(normComp(comp.competencia)); return (
                      <View style={{ marginTop: 8, borderTopWidth: 0.5, borderTopColor: 'rgba(0,0,0,0.10)', paddingTop: 6 }}>
                        <Text style={{ fontFamily: 'NotoSans', fontSize: 7.5, fontWeight: 700, color: '#0D9488', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{t('rh.recommendedTraining')}</Text>
                        <Text style={{ ...s.text, fontWeight: 600 }}>{tr.titulo}{tr.prioridade ? ` [${rotuloDoCodigo(t, 'priority', tr.prioridade)}]` : ''}</Text>
                        <Text style={s.trainMeta}>{t('rh.trainingMeta', { audience: textOf(tr.publico), format: textOf(tr.formato), cost: textOf(tr.custo || tr.custo_relativo) })}</Text>
                      </View>
                    ); })()}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {(c.treinamentos_sugeridos || []).filter((x: any) => !treinosCasados.has(normComp(x.competencia))).length > 0 && (
          <View style={s.section}>
            <ReportSectionTitle>{t('rh.otherTrainings')}</ReportSectionTitle>
            {(c.treinamentos_sugeridos || []).filter((x: any) => !treinosCasados.has(normComp(x.competencia))).map((treino: any, i: number) => {
              const pc = (prioColors as any)[treino.prioridade] || prioColors.DESEJAVEL;
              return (
                <View key={i} style={s.trainCard} wrap={false}>
                  <View style={{ ...s.trainHeader, backgroundColor: pc.bg }}>
                    <Text style={s.trainHeaderText}>{i + 1}. {treino.titulo} [{rotuloDoCodigo(t, 'priority', treino.prioridade)}]</Text>
                  </View>
                  <View style={{ ...s.trainContent, backgroundColor: pc.contentBg }}>
                    <Text style={s.trainMeta}>{t('rh.trainingMeta', { audience: textOf(treino.publico), format: textOf(treino.formato), cost: textOf(treino.custo || treino.custo_relativo) })}</Text>
                    {treino.justificativa && <Text style={s.text}>{treino.justificativa}</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {c.perfil_disc_organizacional && (
          <View style={s.section} wrap={false}>
            <ReportSectionTitle>{t('rh.orgBehavioralMapping')}</ReportSectionTitle>
            <View style={s.box}><Text style={s.text}>{c.perfil_disc_organizacional.descricao}</Text></View>
            {c.perfil_disc_organizacional.forca_coletiva && (
              <View style={{ backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 6, padding: 10 }}>
                <Text style={{ fontFamily: 'NotoSans', fontSize: 9, fontWeight: 600, color: '#166534', marginBottom: 3 }}>{t('rh.collectiveStrength')}</Text>
                <Text style={s.text}>{c.perfil_disc_organizacional.forca_coletiva}</Text>
                {c.perfil_disc_organizacional.risco_coletivo && (
                  <>
                    <Text style={{ fontFamily: 'NotoSans', fontSize: 9, fontWeight: 600, color: '#92400E', marginBottom: 3, marginTop: 6 }}>{t('rh.collectiveRisk')}</Text>
                    <Text style={s.text}>{c.perfil_disc_organizacional.risco_coletivo}</Text>
                  </>
                )}
              </View>
            )}
          </View>
        )}

        <PageFooter t={t} />
      </Page>

      {/* Decisões + Plano */}
      <Page size="A4" style={pageStyles.page} wrap>
        <PageHeader logoBase64={logoBase64} label={t('rh.reportLabel')} />

        {talentos.length > 0 && (
          <View style={s.section}>
            <ReportSectionTitle>{t('rh.talents')}</ReportSectionTitle>
            <Text style={{ ...s.textIt, marginBottom: 8 }}>{t('rh.talentsIntro')}</Text>
            {talentos.map((d: any, i: number) => (
              <View key={i} style={s.decCard} wrap={false}>
                <View style={s.decHeader}><Text style={s.decHeaderText}>{d.colaborador}</Text></View>
                <View style={{ ...s.decRow, backgroundColor: '#F5F3FF' }}>
                  <Text style={s.decLabel}>{t('rh.situation')}</Text>
                  <Text style={s.text}>{d.situacao}</Text>
                </View>
                <View style={{ ...s.decRow, backgroundColor: '#FEF2F2' }}>
                  <Text style={{ ...s.decLabel, color: '#B91C1C' }}>{t('rh.action')}</Text>
                  <Text style={{ fontFamily: 'NotoSans', fontSize: 10, fontWeight: 600, color: '#B91C1C' }}>{d.acao || d.acao_imediata}</Text>
                </View>
                {d.criterio_reavaliacao && (
                  <View style={{ ...s.decRow, backgroundColor: '#EFF6FF' }}>
                    <Text style={s.decLabel}>{t('rh.reassessment')}</Text>
                    <Text style={s.text}>{d.criterio_reavaliacao}</Text>
                  </View>
                )}
                {d.consequencia && (
                  <View style={{ ...s.decRow, backgroundColor: '#FFFBEB' }}>
                    <Text style={{ ...s.decLabel, color: '#92400E' }}>{t('rh.ifNoProgress')}</Text>
                    <Text style={{ fontFamily: 'NotoSans', fontSize: 10, color: '#92400E' }}>{d.consequencia}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {c.plano_acao && (
          <View style={s.section}>
            <ReportSectionTitle>{t('rh.actionPlan')}</ReportSectionTitle>
            {acaoHorizontes.map(({ key, label, bg, contentBg }) => {
              const a = c.plano_acao[key];
              if (!a) return null;
              return (
                <View key={key} style={s.acaoCard} wrap={false}>
                  <View style={{ ...s.acaoHeader, backgroundColor: bg }}>
                    <Text style={s.acaoHeaderText}>{label}</Text>
                  </View>
                  <View style={{ ...s.acaoContent, backgroundColor: contentBg }}>
                    {Array.isArray(a) ? (
                      a.map((item: any, index: number) => (
                        <Text key={index} style={s.text}>{`\u2022 ${textOf(item)}`}</Text>
                      ))
                    ) : (
                      <>
                        {a.titulo && <Text style={s.acaoTitulo}>{textOf(a.titulo)}</Text>}
                        {a.descricao && <Text style={s.text}>{textOf(a.descricao)}</Text>}
                        {a.impacto && <Text style={{ fontFamily: 'NotoSans', fontSize: 9, color: colors.textSecondary, fontStyle: 'italic', marginTop: 2 }}>{textOf(a.impacto)}</Text>}
                      </>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {c.mensagem_final && (
          <View wrap={false}><View style={s.divider} /><Text style={s.textIt}>{c.mensagem_final}</Text></View>
        )}

        <PageFooter t={t} />
      </Page>
    </Document>
  );
}
