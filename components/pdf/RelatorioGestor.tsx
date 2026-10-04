import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { colors, pageStyles } from './styles';
import PdfReportCover, { ReportSectionTitle } from './PdfReportCover';
import { getReportCoverBgBase64 } from '@/lib/pdf-assets';
import { nivelMaisFrequente } from '@/lib/nivel-frequente';
import { rotuloNivel } from '@/lib/nivel-regua';
import { compararNomes, idiomaDoPdf, tradutorDoPdf, type PdfT } from '@/lib/pdf-i18n';
// SectionTitle → ReportSectionTitle (Fraunces) e PageBackground → PageHeader fino, de PdfReportCover

const s = StyleSheet.create({
  section: { marginBottom: 14 },
  text: { fontFamily: 'NotoSans', fontSize: 10, color: colors.textPrimary, lineHeight: 1.6, marginBottom: 4 },
  textIt: { fontFamily: 'NotoSans', fontSize: 10, color: colors.textSecondary, fontStyle: 'italic', marginBottom: 4, lineHeight: 1.5 },
  h3: { fontFamily: 'NotoSans', fontSize: 11, fontWeight: 600, color: colors.navyLight, marginBottom: 4, marginTop: 8 },
  box: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.gray200, borderRadius: 8, padding: 14, marginBottom: 10 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.gray200, marginVertical: 12 },
  // Evolução
  evolBox: { backgroundColor: '#E8F5E9', padding: 10, borderRadius: 6, marginBottom: 3, borderLeftWidth: 3, borderLeftColor: '#2E7D32' },
  evolItem: { fontFamily: 'NotoSans', fontSize: 10, color: '#2E7D32', marginBottom: 2 },
  // Pontos de atenção (R-36, 04/10/2026): sem vermelho nem selo de alarme sobre
  // pessoas nomeadas. A prioridade da CONVERSA vai de âmbar a azul a verde.
  rankUrgente: { backgroundColor: '#FFFBEB', borderLeftWidth: 3, borderLeftColor: '#D97706' },
  rankImportante: { backgroundColor: '#EFF6FF', borderLeftWidth: 3, borderLeftColor: '#2563EB' },
  rankOutro: { backgroundColor: '#F0FDF4', borderLeftWidth: 3, borderLeftColor: '#16A34A' },
  rankCard: { borderRadius: 6, padding: 10, marginBottom: 6 },
  rankName: { fontFamily: 'NotoSans', fontSize: 10, fontWeight: 700, color: colors.textPrimary, marginBottom: 2 },
  rankMotivo: { fontFamily: 'NotoSans', fontSize: 9, color: colors.textSecondary, fontStyle: 'italic' },
  // Badge
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginLeft: 6 },
  badgeText: { fontFamily: 'NotoSans', fontSize: 8, fontWeight: 600 },
  // Ações por horizonte
  acaoCard: { borderRadius: 6, marginBottom: 6, overflow: 'hidden' },
  acaoHeader: { paddingVertical: 8, paddingHorizontal: 12 },
  acaoHeaderText: { fontFamily: 'NotoSans', fontSize: 10, fontWeight: 700, color: '#FFFFFF' },
  acaoContent: { paddingVertical: 8, paddingHorizontal: 14 },
  acaoTitulo: { fontFamily: 'NotoSans', fontSize: 10, fontWeight: 600, color: colors.textPrimary, marginBottom: 3 },
  // DISC
  discForce: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#D1FAE5', borderRadius: 6, padding: 10, marginBottom: 6 },
  discRisk: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 6, padding: 10, marginBottom: 6 },
  discLabel: { fontFamily: 'NotoSans', fontSize: 9, fontWeight: 600, marginBottom: 3 },
  // Papel gestor
  papelCard: { borderRadius: 6, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: colors.gray200 },
  papelLabel: { fontFamily: 'NotoSans', fontSize: 9, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  // Ação principal
  acaoPrincipal: { backgroundColor: colors.navy, borderRadius: 6, padding: 14, marginBottom: 10 },
  acaoPrincipalText: { fontFamily: 'NotoSans', fontSize: 11, fontWeight: 700, color: '#FFFFFF' },
  acaoPrincipalSub: { fontFamily: 'NotoSans', fontSize: 10, color: colors.textSecondary, fontStyle: 'italic', marginTop: 6 },
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

const acoesPorHorizonte = (t: PdfT) => [
  { key: 'esta_semana', label: t('gestor.thisWeek'), bg: '#B91C1C', contentBg: '#FEF2F2' },
  { key: 'proximas_semanas', label: t('gestor.nextWeeks'), bg: '#2563EB', contentBg: '#EFF6FF' },
  { key: 'medio_prazo', label: t('gestor.midTerm'), bg: '#16A34A', contentBg: '#F0FDF4' },
];

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
    principalAvanco: parsed.principal_avanco || parsed.principal_forca_organizacional || '',
    principalPontoAtencao: parsed.principal_ponto_de_atencao || parsed.principal_risco_organizacional || '',
  };
}

function getDestaque(v: any) {
  const parsed = typeof v === 'object' && v !== null ? v : parseJsonLike(v);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return {
    nome: parsed.nome || '',
    competencia: parsed.competencia || '',
    nivel: parsed.nivel,
    motivo: parsed.motivo_destaque || parsed.motivo || parsed.texto || '',
  };
}

/**
 * A prioridade da CONVERSA com a pessoa, em palavras que não alarmam (R-36,
 * 04/10/2026). O selo "URGENTE" sobre uma pessoa nomeada, em vermelho, lia como
 * uma nota de gravidade dela. O campo `urgencia` do relatório segue como veio
 * (relatórios gravados e o prompt usam `alta|media|baixa`); só o rótulo mudou, e
 * o legado `urgente|importante` cai nos mesmos três degraus.
 */
export type UrgenciaChave = 'conversa' | 'alta' | 'media' | 'baixa' | 'outra';

/** O degrau da prioridade, independente do idioma: o estilo do cartão decide por ele, não pelo rótulo traduzido. */
export function urgenciaChave(v: any): UrgenciaChave {
  const raw = String(v || '').trim().toLowerCase();
  if (!raw) return 'conversa';
  if (raw === 'urgente' || raw === 'alta') return 'alta';
  if (raw === 'importante' || raw === 'media' || raw === 'média') return 'media';
  if (raw === 'baixa' || raw === 'baixo') return 'baixa';
  return 'outra';
}

export function urgenciaLabel(v: any, t: PdfT = tradutorDoPdf()): string {
  const chave = urgenciaChave(v);
  return chave === 'outra' ? String(v).toUpperCase() : t(`gestor.urgency.${chave}`);
}

/** Em ordem alfabética pelo nome (no idioma de quem lê, sem acento nem caixa), nunca pela ordem do ranking antigo. */
export function emOrdemAlfabetica<T>(lista: T[], nomeDe: (x: T) => unknown, locale: string | null = 'pt-BR'): T[] {
  return [...lista].sort((a, b) => compararNomes(nomeDe(a), nomeDe(b), locale));
}

/** "N2", o nível em que mais pessoas estão, ou `null` sem distribuição. */
export function nivelMaisFrequenteDe(distribuicao: any): string | null {
  if (!distribuicao || typeof distribuicao !== 'object') return null;
  const nivel = nivelMaisFrequente([1, 2, 3, 4].map((level) => ({ level, peso: Number(distribuicao[`n${level}`]) || 0 })));
  return nivel != null ? rotuloNivel(nivel, { forma: 'curto' }) : null;
}

export default function RelatorioGestorPDF({ data, empresaNome, logoBase64, locale }: {
  data: any;
  empresaNome?: string;
  logoBase64?: string;
  /** Idioma do texto fixo do papel: o de quem lê (`lib/pdf-locale.ts`). Sem ele, pt-BR. O texto da IA segue como foi gerado. */
  locale?: string | null;
}) {
  const c = data.conteudo;
  if (!c) return null;
  const t = tradutorDoPdf(locale);
  const idioma = idiomaDoPdf(locale);
  const acoes = acoesPorHorizonte(t);
  const resumoExecutivo = getResumoExecutivo(c.resumo_executivo);

  return (
    <Document>
      {/* Capa */}
      <PdfReportCover
        bgBase64={getReportCoverBgBase64()}
        logoBase64={logoBase64}
        overline={t('gestor.coverOverline')}
        titulo={[t('gestor.coverTitle1'), t('gestor.coverTitle2')]}
        nome={data.gestor_nome}
        cargo={t('gestor.roleManager')}
        empresa={empresaNome}
        tagline={t('gestor.tagline')}
        locale={idioma}
      />

      {/* Resumo + Evolução + Ranking */}
      <Page size="A4" style={pageStyles.page} wrap>
        <PageHeader logoBase64={logoBase64} label={t('gestor.reportLabel')} />

        {c.resumo_executivo && (
          <View style={s.section} wrap={false}>
            <ReportSectionTitle>{t('gestor.executiveSummary')}</ReportSectionTitle>
            <View style={s.box}>
              <Text style={s.text}>{textOf(resumoExecutivo?.leitura || c.resumo_executivo)}</Text>
              {(resumoExecutivo?.principalAvanco || c.resumo_executivo?.principal_avanco) && (
                <Text style={{ ...s.text, color: '#2E7D32', marginTop: 4 }}>{t('gestor.strongPoint', { text: textOf(resumoExecutivo?.principalAvanco || c.resumo_executivo?.principal_avanco) })}</Text>
              )}
              {(resumoExecutivo?.principalPontoAtencao || c.resumo_executivo?.principal_ponto_de_atencao) && (
                <Text style={{ ...s.text, color: '#E65100', marginTop: 2 }}>{t('gestor.attentionLabel', { text: textOf(resumoExecutivo?.principalPontoAtencao || c.resumo_executivo?.principal_ponto_de_atencao) })}</Text>
              )}
            </View>
          </View>
        )}

        {c.destaques_evolucao?.length > 0 && (
          <View style={s.section} wrap={false}>
            {/* Sempre "Pontos fortes": o relatório recebe só o nível ATUAL, sem histórico, e
                "Destaques de Evolução" afirmava uma evolução que ninguém mediu (R-36). */}
            <ReportSectionTitle>{t('gestor.strengthsToRecognize')}</ReportSectionTitle>
            <View style={s.evolBox}>
              {emOrdemAlfabetica<any>(c.destaques_evolucao, (d) => getDestaque(d)?.nome, idioma).map((d: any, i: number) => (
                <View key={i} style={{ marginBottom: 4 }}>
                  <Text style={s.evolItem}>
                    + {(() => {
                      const item = getDestaque(d);
                      if (!item) return textOf(d);
                      return `${item.nome}${item.competencia ? `: ${item.competencia}` : ''}${item.nivel != null ? ` (N${item.nivel})` : ''}`;
                    })()}
                  </Text>
                  {getDestaque(d)?.motivo && <Text style={{ ...s.rankMotivo, color: '#166534' }}>{textOf(getDestaque(d)?.motivo)}</Text>}
                </View>
              ))}
            </View>
          </View>
        )}

        {(c.ranking_atencao || c.ranking_qualificado)?.length > 0 && (
          <View style={s.section}>
            {/* "Pontos de Atenção", em ordem alfabética (R-36, 04/10/2026). Era "Ranking de
                Atenção": pessoas nomeadas, selo "URGENTE" em vermelho. A decisão do dono é
                que o gestor vê nível e conversa a ter, sem ranking nem alarme. */}
            <ReportSectionTitle>{t('gestor.attentionPoints')}</ReportSectionTitle>
            {emOrdemAlfabetica<any>(c.ranking_atencao || c.ranking_qualificado, (r) => r?.nome, idioma).map((r: any, i: number) => {
              const urg = urgenciaLabel(r.urgencia, t);
              const grau = urgenciaChave(r.urgencia);
              const bgStyle = grau === 'alta' ? s.rankUrgente : grau === 'media' ? s.rankImportante : s.rankOutro;
              return (
                <View key={i} style={{ ...s.rankCard, ...bgStyle }} wrap={false}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={s.rankName}>{textOf(r.nome)}: {textOf(r.competencia)} ({rotuloNivel(Number(textOf(r.nivel || r.nivel_fase3)), { forma: 'curto' })})</Text>
                    <View style={{ ...s.badge, backgroundColor: grau === 'alta' ? '#FEF3C7' : grau === 'media' ? '#DBEAFE' : '#ECFDF3' }}>
                      <Text style={{ ...s.badgeText, color: grau === 'alta' ? '#92400E' : grau === 'media' ? '#1E40AF' : '#166534' }}>{urg}</Text>
                    </View>
                  </View>
                  {(r.motivo || r.motivo_curto) && <Text style={s.rankMotivo}>{textOf(r.motivo || r.motivo_curto)}</Text>}
                  {r.risco_se_nao_agir && <Text style={{ ...s.rankMotivo, color: '#92400E' }}>{t('gestor.risk', { text: textOf(r.risco_se_nao_agir) })}</Text>}
                </View>
              );
            })}
          </View>
        )}

        <PageFooter t={t} />
      </Page>

      {/* Análise + DISC + Ações */}
      <Page size="A4" style={pageStyles.page} wrap>
        <PageHeader logoBase64={logoBase64} label={t('gestor.reportLabel')} />

        {c.analise_por_competencia?.length > 0 && (
          <View style={s.section}>
            <ReportSectionTitle>{t('gestor.analysisByCompetency')}</ReportSectionTitle>
            {c.analise_por_competencia.map((a: any, i: number) => (
              <View key={i} wrap={false} style={{ marginBottom: 10 }}>
                {/* Sem a "Média" (R-36, 04/10/2026): o relatório mostrava "Média: 2.3" por
                    competência. Fica o nível mais frequente, da mesma distribuição de
                    pessoas que vem logo abaixo. */}
                <Text style={s.h3}>{nivelMaisFrequenteDe(a.distribuicao) ? t('gestor.competencyMostFrequent', { competency: String(a.competencia ?? ''), level: nivelMaisFrequenteDe(a.distribuicao) as string }) : a.competencia}</Text>
                {a.distribuicao && <Text style={s.textIt}>{t('gestor.peopleByLevel', { levels: [1, 2, 3, 4].map((nivel) => `${rotuloNivel(nivel, { forma: 'curto' })}: ${a.distribuicao[`n${nivel}`]}`).join(' | ') })}</Text>}
                <Text style={s.text}>{a.padrao_observado}</Text>
                {a.acao_gestor && (
                  <View style={{ backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 6, padding: 10, marginTop: 4 }}>
                    <Text style={{ fontFamily: 'NotoSans', fontSize: 9, fontWeight: 600, color: '#1E40AF', marginBottom: 3 }}>{t('gestor.managerAction')}</Text>
                    <Text style={s.text}>{a.acao_gestor}</Text>
                    {a.impacto_se_nao_agir && <Text style={{ fontFamily: 'NotoSans', fontSize: 8, color: '#991B1B', fontStyle: 'italic', marginTop: 3 }}>{t('gestor.risk', { text: textOf(a.impacto_se_nao_agir) })}</Text>}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {c.perfil_disc_equipe && (
          <View style={s.section} wrap={false}>
            <ReportSectionTitle>{t('gestor.teamBehavioralMapping')}</ReportSectionTitle>
            <View style={s.box}><Text style={s.text}>{c.perfil_disc_equipe.descricao}</Text></View>
            {c.perfil_disc_equipe.forca_coletiva && (
              <View style={s.discForce}>
                <Text style={{ ...s.discLabel, color: '#166534' }}>{t('gestor.collectiveStrength')}</Text>
                <Text style={s.text}>{c.perfil_disc_equipe.forca_coletiva}</Text>
              </View>
            )}
            {c.perfil_disc_equipe.risco_coletivo && (
              <View style={s.discRisk}>
                <Text style={{ ...s.discLabel, color: '#92400E' }}>{t('gestor.collectiveRisk')}</Text>
                <Text style={s.text}>{c.perfil_disc_equipe.risco_coletivo}</Text>
              </View>
            )}
          </View>
        )}

        {c.acoes && (
          <View style={s.section}>
            <ReportSectionTitle>{t('gestor.actionPlan')}</ReportSectionTitle>
            {c.acoes.acao_principal && (
              <View style={s.acaoPrincipal} wrap={false}>
                <Text style={s.acaoPrincipalText}>{t('gestor.startHere', { action: typeof c.acoes.acao_principal === 'string' ? c.acoes.acao_principal : textOf(c.acoes.acao_principal.titulo) })}</Text>
                <Text style={s.acaoPrincipalSub}>{t('gestor.startHereNote')}</Text>
              </View>
            )}
            {acoes.map(({ key, label, bg, contentBg }) => {
              const a = c.acoes[key];
              if (!a) return null;
              // Compatibilidade: formato novo (array de strings) ou legado (objeto {titulo,descricao,impacto})
              const isArr = Array.isArray(a);
              return (
                <View key={key} style={s.acaoCard} wrap={false}>
                  <View style={{ ...s.acaoHeader, backgroundColor: bg }}>
                    <Text style={s.acaoHeaderText}>{label}</Text>
                  </View>
                  <View style={{ ...s.acaoContent, backgroundColor: contentBg }}>
                    {isArr ? (
                      a.map((item: string, j: number) => (
                        <Text key={j} style={s.text}>{`\u2022 ${item}`}</Text>
                      ))
                    ) : (
                      <>
                        <Text style={s.acaoTitulo}>{a.titulo}</Text>
                        <Text style={s.text}>{a.descricao}</Text>
                        {a.impacto && <Text style={{ fontFamily: 'NotoSans', fontSize: 9, color: colors.textSecondary, fontStyle: 'italic', marginTop: 2 }}>{a.impacto}</Text>}
                      </>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {c.papel_do_gestor && (
          <View style={s.section}>
            <ReportSectionTitle>{t('gestor.managerRole')}</ReportSectionTitle>
            {[{ label: t('gestor.weekly'), val: c.papel_do_gestor.semanal },
              { label: t('gestor.biweekly'), val: c.papel_do_gestor.quinzenal },
              { label: t('gestor.nextJourney'), val: c.papel_do_gestor.proximo_ciclo },
            ].filter((p: any) => p.val).map((p: any, i: number) => (
              <View key={i} style={s.papelCard}>
                <Text style={s.papelLabel}>{p.label}</Text>
                <Text style={s.text}>{p.val}</Text>
              </View>
            ))}
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
