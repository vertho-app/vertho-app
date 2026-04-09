import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts, pageStyles } from './styles';

const C = { ...colors, subtitulo: '#2471A3', verde: '#27AE60', vermelho: '#C0392B', amarelo: '#F39C12', roxo: '#1a1548' };

const s = StyleSheet.create({
  section: { marginBottom: 14 },
  h2: { fontSize: 14, fontWeight: 'bold', color: C.navy, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.gray200, paddingBottom: 4 },
  h3: { fontSize: 12, fontWeight: 'bold', color: C.subtitulo, marginBottom: 4, marginTop: 8 },
  text: { fontSize: 10, color: C.navy, lineHeight: 1.6, marginBottom: 4 },
  textIt: { fontSize: 10, color: C.navy, fontStyle: 'italic', marginBottom: 4 },
  textSm: { fontSize: 9, color: C.navy, lineHeight: 1.4 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.gray200, marginVertical: 12 },
  coverTitle: { fontSize: 32, fontWeight: 'bold', color: C.navy, textAlign: 'center', letterSpacing: 4 },
  coverLine: { borderBottomWidth: 2, borderBottomColor: colors.cyan, width: 80, alignSelf: 'center', marginTop: 12 },
  // Indicadores
  kpiRow: { flexDirection: 'row', marginBottom: 4 },
  kpiPar: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#F7F9FC' },
  kpiImpar: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 10 },
  kpiLabel: { fontSize: 10, color: C.navy, flex: 1 },
  kpiValue: { fontSize: 10, color: C.navy, fontWeight: 'bold', width: 150 },
  // Evolução badges
  evolUp: { backgroundColor: '#E8F5E9', paddingVertical: 6, paddingHorizontal: 12, marginBottom: 2, borderRadius: 2 },
  evolKeep: { backgroundColor: '#FFFDE7', paddingVertical: 6, paddingHorizontal: 12, marginBottom: 2, borderRadius: 2 },
  evolDown: { backgroundColor: '#FEF5F5', paddingVertical: 6, paddingHorizontal: 12, marginBottom: 2, borderRadius: 2 },
  // Tabela cargos
  tblHeader: { flexDirection: 'row', backgroundColor: C.navy, paddingVertical: 6, paddingHorizontal: 6 },
  tblCell: { fontSize: 9, color: C.navy },
  tblCellBold: { fontSize: 9, color: C.navy, fontWeight: 'bold' },
  tblRow: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: colors.gray200 },
  // Competências críticas
  critHeader: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 2, marginBottom: 1 },
  critContent: { paddingVertical: 4, paddingHorizontal: 16, marginBottom: 1 },
  critImpacto: { backgroundColor: '#FFFDE7', paddingVertical: 2, paddingHorizontal: 16, marginBottom: 4 },
  // Treinamentos
  trainHeader: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 2, marginBottom: 1 },
  trainContent: { paddingVertical: 4, paddingHorizontal: 16, marginBottom: 1 },
  // Decisões
  decHeader: { backgroundColor: C.roxo, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 2, marginBottom: 1 },
  decSituacao: { backgroundColor: '#F5F3FF', paddingVertical: 6, paddingHorizontal: 16, marginBottom: 1 },
  decAcao: { backgroundColor: '#FEF5F5', paddingVertical: 4, paddingHorizontal: 16, marginBottom: 1 },
  decReav: { backgroundColor: '#F0F7FF', paddingVertical: 4, paddingHorizontal: 16, marginBottom: 1 },
  decConseq: { backgroundColor: '#FFF3E0', paddingVertical: 4, paddingHorizontal: 16, marginBottom: 4 },
});

const critColors = {
  CRITICA: { bg: C.vermelho, contentBg: '#FEF5F5' },
  ATENCAO: { bg: C.amarelo, contentBg: '#FFFBF0' },
  ESTAVEL: { bg: C.verde, contentBg: '#F0FFF5' },
};
const prioColors = {
  URGENTE: { bg: C.vermelho, contentBg: '#FEF5F5' },
  IMPORTANTE: { bg: C.subtitulo, contentBg: '#F0F7FF' },
  DESEJAVEL: { bg: '#1A7A4A', contentBg: '#F0FFF5' },
};
const acaoHorizontes = [
  { key: 'curto_prazo', label: ' Curto Prazo (2 semanas)', bg: C.vermelho, contentBg: '#FEF5F5' },
  { key: 'medio_prazo', label: ' Médio Prazo (1-2 meses)', bg: C.subtitulo, contentBg: '#F0F7FF' },
  { key: 'longo_prazo', label: ' Longo Prazo (próximo semestre)', bg: '#1A7A4A', contentBg: '#F0FFF5' },
];

export default function RelatorioRHPDF({ data, empresaNome }) {
  const c = data.conteudo;
  if (!c) return null;

  return (
    <Document>
      {/* Capa */}
      <Page size="A4" style={pageStyles.page}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={s.coverTitle}>VERTHO</Text>
          <View style={s.coverLine} />
          <Text style={{ fontSize: 14, color: colors.gray500, textAlign: 'center', marginTop: 8 }}>Relatório Consolidado — RH / T&D</Text>
          <Text style={{ fontSize: 16, color: colors.cyan, textAlign: 'center', marginTop: 30, fontWeight: 'bold' }}>{empresaNome}</Text>
          <Text style={{ fontSize: 10, color: colors.gray400, textAlign: 'center', marginTop: 30 }}>{new Date(data.gerado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</Text>
        </View>
        <View style={pageStyles.footer}><Text style={pageStyles.footerText}>Vertho Mentor IA — Confidencial</Text></View>
      </Page>

      {/* Resumo + Indicadores */}
      <Page size="A4" style={pageStyles.page}>
        <View style={pageStyles.header}><Text style={pageStyles.headerTitle}>VERTHO</Text><Text style={pageStyles.headerDate}>Relatório RH</Text></View>

        {c.resumo_executivo && (<View style={s.section}><Text style={s.h2}>Resumo Executivo</Text><Text style={s.text}>{c.resumo_executivo}</Text></View>)}

        {c.indicadores && (
          <View style={s.section}>
            <Text style={s.h2}> Indicadores Quantitativos</Text>
            {[['Colaboradores avaliados', c.indicadores.total_avaliados], ['Avaliações realizadas', c.indicadores.total_avaliacoes], ['Média geral', c.indicadores.media_geral]].map(([label, val], i) => (
              <View key={i} style={i % 2 === 0 ? s.kpiPar : s.kpiImpar}>
                <Text style={s.kpiLabel}>{label}</Text><Text style={s.kpiValue}>{val || 0}</Text>
              </View>
            ))}
            <View style={{ marginTop: 4 }}>
              <View style={s.evolUp}><Text style={{ fontSize: 10, fontWeight: 'bold', color: C.verde }}>N3-N4: {(c.indicadores.pct_nivel_3 || 0) + (c.indicadores.pct_nivel_4 || 0)}%</Text></View>
              <View style={s.evolKeep}><Text style={{ fontSize: 10, fontWeight: 'bold', color: C.amarelo }}>N2: {c.indicadores.pct_nivel_2 || 0}%</Text></View>
              <View style={s.evolDown}><Text style={{ fontSize: 10, fontWeight: 'bold', color: C.vermelho }}>N1: {c.indicadores.pct_nivel_1 || 0}%</Text></View>
            </View>
          </View>
        )}

        {c.comparativo_f1_f3 && (
          <View style={s.section}>
            <Text style={s.h2}> Comparativo</Text>
            <Text style={s.text}>{c.comparativo_f1_f3.analise}</Text>
            {c.comparativo_f1_f3.destaque_positivo && (<View style={{ backgroundColor: '#E8F5E9', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 2, marginBottom: 2 }}><Text style={{ fontSize: 10, color: C.verde }}>+ {c.comparativo_f1_f3.destaque_positivo}</Text></View>)}
            {c.comparativo_f1_f3.destaque_atencao && (<View style={{ backgroundColor: '#FFF3E0', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 2 }}><Text style={{ fontSize: 10, color: C.amarelo }}>! {c.comparativo_f1_f3.destaque_atencao}</Text></View>)}
          </View>
        )}

        {c.visao_por_cargo?.length > 0 && (
          <View style={s.section}>
            <Text style={s.h2}> Visão por Cargo</Text>
            {c.visao_por_cargo.map((v, i) => (
              <View key={i} wrap={false} style={{ marginBottom: 6 }}>
                <Text style={s.h3}>{v.cargo} — Média: {v.media || '—'}</Text>
                <Text style={s.text}>{v.analise}</Text>
                {v.ponto_forte && (<View style={{ backgroundColor: '#F1F8F0', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 2, marginBottom: 1 }}><Text style={{ fontSize: 10, color: C.verde }}>+ {v.ponto_forte}</Text></View>)}
                {v.ponto_critico && (<View style={{ backgroundColor: '#FFFBF5', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 2 }}><Text style={{ fontSize: 10, color: C.amarelo }}>! {v.ponto_critico}</Text></View>)}
              </View>
            ))}
          </View>
        )}

        <View style={pageStyles.footer}><Text style={pageStyles.footerText}>Vertho Mentor IA — Confidencial</Text></View>
      </Page>

      {/* Competências Críticas + Treinamentos */}
      <Page size="A4" style={pageStyles.page}>
        <View style={pageStyles.header}><Text style={pageStyles.headerTitle}>VERTHO</Text><Text style={pageStyles.headerDate}>Investimentos</Text></View>

        {c.competencias_criticas?.length > 0 && (
          <View style={s.section}>
            <Text style={s.h2}>> Competências Críticas — Onde Investir</Text>
            {c.competencias_criticas.map((comp, i) => {
              const cc = critColors[comp.criticidade] || critColors.ESTAVEL;
              return (
                <View key={i} wrap={false}>
                  <View style={{ ...s.critHeader, backgroundColor: cc.bg }}><Text style={{ fontSize: 10, fontWeight: 'bold', color: '#FFFFFF' }}>{comp.competencia} — {comp.criticidade}</Text></View>
                  <View style={{ ...s.critContent, backgroundColor: cc.contentBg }}><Text style={s.text}>{comp.motivo}</Text></View>
                  {(comp.impacto || comp.impacto_alunos) && (<View style={s.critImpacto}><Text style={{ fontSize: 10, color: C.navy }}>> {comp.impacto || comp.impacto_alunos}</Text></View>)}
                </View>
              );
            })}
          </View>
        )}

        {c.treinamentos_sugeridos?.length > 0 && (
          <View style={s.section}>
            <Text style={s.h2}> Formações e Treinamentos</Text>
            {c.treinamentos_sugeridos.map((t, i) => {
              const pc = prioColors[t.prioridade] || prioColors.DESEJAVEL;
              return (
                <View key={i} wrap={false} style={{ marginBottom: 4 }}>
                  <View style={{ ...s.trainHeader, backgroundColor: pc.bg }}><Text style={{ fontSize: 10, fontWeight: 'bold', color: '#FFFFFF' }}>{i + 1}. {t.titulo} [{t.prioridade}]</Text></View>
                  <View style={{ ...s.trainContent, backgroundColor: pc.contentBg }}>
                    <Text style={{ fontSize: 9, fontStyle: 'italic', color: C.navy }}>Público: {t.publico} | Formato: {t.formato} | Carga: {t.carga_horaria} | Custo: {t.custo || t.custo_relativo}</Text>
                    {t.justificativa && <Text style={{ fontSize: 10, color: C.navy, marginTop: 2 }}>{t.justificativa}</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {c.perfil_disc_organizacional && (
          <View style={s.section}>
            <Text style={s.h2}> Perfil DISC Organizacional</Text>
            <Text style={s.text}>{c.perfil_disc_organizacional.descricao}</Text>
            {(c.perfil_disc_organizacional.implicacao || c.perfil_disc_organizacional.implicacao_pedagogica) && (
              <View>
                <View style={{ backgroundColor: '#E3EEF9', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 2 }}><Text style={{ fontSize: 10, fontWeight: 'bold', color: C.navy }}>> Implicação</Text></View>
                <View style={{ backgroundColor: '#F7FBFF', paddingVertical: 4, paddingHorizontal: 16 }}><Text style={s.text}>{c.perfil_disc_organizacional.implicacao || c.perfil_disc_organizacional.implicacao_pedagogica}</Text></View>
              </View>
            )}
          </View>
        )}

        <View style={pageStyles.footer}><Text style={pageStyles.footerText}>Vertho Mentor IA — Confidencial</Text></View>
      </Page>

      {/* Decisões + Plano */}
      <Page size="A4" style={pageStyles.page}>
        <View style={pageStyles.header}><Text style={pageStyles.headerTitle}>VERTHO</Text><Text style={pageStyles.headerDate}>Decisões e Plano</Text></View>

        {c.decisoes_chave?.length > 0 && (
          <View style={s.section}>
            <Text style={s.h2}>> Decisões-Chave</Text>
            <Text style={s.textIt}>Estas decisões exigem ação imediata e critérios claros de reavaliação.</Text>
            {c.decisoes_chave.map((d, i) => (
              <View key={i} wrap={false} style={{ marginBottom: 4 }}>
                <View style={s.decHeader}><Text style={{ fontSize: 10, fontWeight: 'bold', color: '#FFFFFF' }}>> {d.colaborador}</Text></View>
                <View style={s.decSituacao}><Text style={s.text}>Situação: {d.situacao}</Text></View>
                <View style={s.decAcao}><Text style={{ fontSize: 10, fontWeight: 'bold', color: C.vermelho }}>* Ação: {d.acao || d.acao_imediata}</Text></View>
                {d.criterio_reavaliacao && <View style={s.decReav}><Text style={s.text}> Reavaliação: {d.criterio_reavaliacao}</Text></View>}
                {d.consequencia && <View style={s.decConseq}><Text style={{ fontSize: 10, color: C.amarelo }}>! Se não evoluir: {d.consequencia}</Text></View>}
              </View>
            ))}
          </View>
        )}

        {c.plano_acao && (
          <View style={s.section}>
            <Text style={s.h2}>> Plano de Ação — RH / T&D</Text>
            {acaoHorizontes.map(({ key, label, bg, contentBg }) => {
              const a = c.plano_acao[key];
              if (!a) return null;
              return (
                <View key={key} wrap={false} style={{ marginBottom: 4 }}>
                  <View style={{ backgroundColor: bg, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 2 }}>
                    <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#FFFFFF' }}>{label}: {a.titulo}</Text>
                  </View>
                  <View style={{ backgroundColor: contentBg, paddingVertical: 6, paddingHorizontal: 16 }}>
                    <Text style={s.text}>{a.descricao}</Text>
                    {a.impacto && <Text style={{ fontSize: 10, fontStyle: 'italic', color: C.navy }}> {a.impacto}</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {c.mensagem_final && (<View><View style={s.divider} /><Text style={s.textIt}>{c.mensagem_final}</Text></View>)}

        <View style={pageStyles.footer}><Text style={pageStyles.footerText}>Vertho Mentor IA — Confidencial</Text></View>
      </Page>
    </Document>
  );
}
