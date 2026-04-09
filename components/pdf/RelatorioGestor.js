import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts, pageStyles } from './styles';

const C = { ...colors, subtitulo: '#2471A3', verde: '#27AE60', vermelho: '#C0392B', amarelo: '#F39C12' };

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
  coverSub: { fontSize: 14, color: colors.gray500, textAlign: 'center', marginTop: 8 },
  coverEmpresa: { fontSize: 16, color: colors.cyan, textAlign: 'center', marginTop: 30, fontWeight: 'bold' },
  coverDate: { fontSize: 10, color: colors.gray400, textAlign: 'center', marginTop: 30 },
  // Tabela evolução
  tblHeader: { flexDirection: 'row', backgroundColor: C.navy, paddingVertical: 6, paddingHorizontal: 6 },
  tblHeaderCell: { color: '#FFFFFF', fontSize: 9, fontWeight: 'bold' },
  tblRow: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: colors.gray200 },
  tblRowAlt: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: colors.gray200, backgroundColor: '#F7F9FC' },
  tblCell: { fontSize: 9, color: C.navy },
  tblCellBold: { fontSize: 9, color: C.navy, fontWeight: 'bold' },
  // Destaques evolução
  evolBox: { backgroundColor: '#E8F5E9', padding: 8, borderRadius: 3, marginBottom: 2 },
  evolItem: { backgroundColor: '#F1F8F0', paddingVertical: 4, paddingHorizontal: 16, marginBottom: 1 },
  evolText: { fontSize: 10, color: C.verde },
  // Ranking
  rankUrgente: { backgroundColor: '#FEF5F5' },
  rankImportante: { backgroundColor: '#FFFBF0' },
  rankOutro: { backgroundColor: '#F0FFF5' },
  // Ações por horizonte
  acaoVermelho: { backgroundColor: C.vermelho },
  acaoAzul: { backgroundColor: C.subtitulo },
  acaoVerde: { backgroundColor: '#1A7A4A' },
  acaoBgVerm: { backgroundColor: '#FEF5F5' },
  acaoBgAzul: { backgroundColor: '#F0F7FF' },
  acaoBgVerde: { backgroundColor: '#F0FFF5' },
  // DISC
  discForce: { backgroundColor: '#E8F5E9', padding: 8, borderRadius: 3, marginBottom: 2 },
  discRisk: { backgroundColor: '#FFF3E0', padding: 8, borderRadius: 3, marginBottom: 2 },
  discForceContent: { backgroundColor: '#F1F8F0', paddingVertical: 4, paddingHorizontal: 16 },
  discRiskContent: { backgroundColor: '#FFFBF5', paddingVertical: 4, paddingHorizontal: 16 },
  // Papel gestor
  papelBox: { padding: 8, borderRadius: 3, marginBottom: 2 },
  // Ação principal
  acaoPrincipal: { backgroundColor: C.navy, padding: 12, borderRadius: 3, marginBottom: 2 },
  acaoPrincipalText: { fontSize: 11, fontWeight: 'bold', color: '#FFFFFF' },
  acaoPrincipalSub: { backgroundColor: '#EEF3FB', paddingVertical: 6, paddingHorizontal: 16, marginBottom: 4 },
});

const evolEmoji = { subiu: '^', desceu: 'v', manteve: '>' };
const evolColor = { subiu: C.verde, desceu: C.vermelho, manteve: C.amarelo };

export default function RelatorioGestorPDF({ data, empresaNome }) {
  const c = data.conteudo;
  if (!c) return null;

  const acoes = [
    { key: 'esta_semana', label: ' Esta Semana', headerBg: s.acaoVermelho, contentBg: s.acaoBgVerm },
    { key: 'proximas_semanas', label: ' Próximas 2-4 Semanas', headerBg: s.acaoAzul, contentBg: s.acaoBgAzul },
    { key: 'medio_prazo', label: ' Médio Prazo (1-2 meses)', headerBg: s.acaoVerde, contentBg: s.acaoBgVerde },
  ];

  return (
    <Document>
      {/* Capa */}
      <Page size="A4" style={pageStyles.page}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={s.coverTitle}>VERTHO</Text>
          <View style={s.coverLine} />
          <Text style={s.coverSub}>Relatório do Gestor — Fase 3</Text>
          <Text style={s.coverEmpresa}>{empresaNome}</Text>
          <Text style={s.coverDate}>{new Date(data.gerado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</Text>
        </View>
        <View style={pageStyles.footer}><Text style={pageStyles.footerText}>Vertho Mentor IA — Confidencial</Text></View>
      </Page>

      {/* Resumo + Evolução + Ranking */}
      <Page size="A4" style={pageStyles.page}>
        <View style={pageStyles.header}><Text style={pageStyles.headerTitle}>VERTHO</Text><Text style={pageStyles.headerDate}>Relatório Gestor</Text></View>

        {c.resumo_executivo && (
          <View style={s.section}><Text style={s.h2}>Resumo Executivo</Text><Text style={s.text}>{c.resumo_executivo}</Text></View>
        )}

        {c.destaques_evolucao?.length > 0 && (
          <View style={s.section}>
            <Text style={s.h2}> Destaques de Evolução</Text>
            <View style={s.evolBox}><Text style={{ fontSize: 10, fontWeight: 'bold', color: C.navy }}>Conquistas da equipe</Text></View>
            {c.destaques_evolucao.map((d, i) => (
              <View key={i} style={s.evolItem}><Text style={s.evolText}>^ {d}</Text></View>
            ))}
          </View>
        )}

        {(c.ranking_atencao || c.ranking_qualificado)?.length > 0 && (
          <View style={s.section}>
            <Text style={s.h2}>* Ranking de Atenção</Text>
            {(c.ranking_atencao || c.ranking_qualificado).map((r, i) => {
              const bgStyle = r.urgencia === 'URGENTE' ? s.rankUrgente : r.urgencia === 'IMPORTANTE' ? s.rankImportante : s.rankOutro;
              const dots = r.urgencia === 'URGENTE' ? '***' : r.urgencia === 'IMPORTANTE' ? '**' : '*';
              return (
                <View key={i} wrap={false}>
                  <View style={{ ...bgStyle, paddingVertical: 6, paddingHorizontal: 10 }}>
                    <Text style={{ fontSize: 10, fontWeight: 'bold', color: C.navy }}>{dots} {r.nome} — {r.competencia} (N{r.nivel || r.nivel_fase3})</Text>
                  </View>
                  {(r.motivo || r.motivo_curto) && (
                    <View style={{ ...bgStyle, paddingVertical: 2, paddingHorizontal: 24, paddingBottom: 6 }}>
                      <Text style={{ fontSize: 9, fontStyle: 'italic', color: C.navy }}>{r.motivo || r.motivo_curto}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        <View style={pageStyles.footer}><Text style={pageStyles.footerText}>Vertho Mentor IA — Confidencial</Text></View>
      </Page>

      {/* Análise + DISC + Ações */}
      <Page size="A4" style={pageStyles.page}>
        <View style={pageStyles.header}><Text style={pageStyles.headerTitle}>VERTHO</Text><Text style={pageStyles.headerDate}>Análise e Ações</Text></View>

        {c.analise_por_competencia?.length > 0 && (
          <View style={s.section}>
            <Text style={s.h2}> Análise por Competência</Text>
            {c.analise_por_competencia.map((a, i) => (
              <View key={i} wrap={false} style={{ marginBottom: 8 }}>
                <Text style={s.h3}>{a.competencia} — Média: {a.media_nivel || a.media}</Text>
                {a.distribuicao && <Text style={s.textIt}>Distribuição: N1:{a.distribuicao.n1} | N2:{a.distribuicao.n2} | N3:{a.distribuicao.n3} | N4:{a.distribuicao.n4}</Text>}
                <Text style={s.text}>{a.padrao_observado}</Text>
                {a.acao_gestor && (
                  <View>
                    <View style={{ backgroundColor: '#E3EEF9', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 2 }}>
                      <Text style={{ fontSize: 10, fontWeight: 'bold', color: C.navy }}> Ação do Gestor</Text>
                    </View>
                    <View style={{ backgroundColor: '#F7FBFF', paddingVertical: 4, paddingHorizontal: 16 }}>
                      <Text style={s.text}>{a.acao_gestor}</Text>
                    </View>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {c.perfil_disc_equipe && (
          <View style={s.section}>
            <Text style={s.h2}> Perfil DISC da Equipe</Text>
            <Text style={s.text}>{c.perfil_disc_equipe.descricao}</Text>
            {c.perfil_disc_equipe.forca_coletiva && (
              <View><View style={s.discForce}><Text style={{ fontSize: 10, fontWeight: 'bold', color: C.navy }}>+ Força coletiva</Text></View><View style={s.discForceContent}><Text style={s.text}>{c.perfil_disc_equipe.forca_coletiva}</Text></View></View>
            )}
            {c.perfil_disc_equipe.risco_coletivo && (
              <View style={{ marginTop: 4 }}><View style={s.discRisk}><Text style={{ fontSize: 10, fontWeight: 'bold', color: C.navy }}>! Risco coletivo</Text></View><View style={s.discRiskContent}><Text style={s.text}>{c.perfil_disc_equipe.risco_coletivo}</Text></View></View>
            )}
          </View>
        )}

        {c.acoes && (
          <View style={s.section}>
            <Text style={s.h2}> Plano de Ação</Text>
            {c.acoes.acao_principal && (
              <View style={{ marginBottom: 6 }}>
                <View style={s.acaoPrincipal}><Text style={s.acaoPrincipalText}>* COMECE POR AQUI: {typeof c.acoes.acao_principal === 'string' ? c.acoes.acao_principal : c.acoes.acao_principal.titulo}</Text></View>
                <View style={s.acaoPrincipalSub}><Text style={s.textIt}>Você não precisa fazer tudo na segunda-feira. Comece por esta ação.</Text></View>
              </View>
            )}
            {acoes.map(({ key, label, headerBg, contentBg }) => {
              const a = c.acoes[key];
              if (!a) return null;
              return (
                <View key={key} wrap={false} style={{ marginBottom: 4 }}>
                  <View style={{ ...headerBg, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 2 }}>
                    <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#FFFFFF' }}>{label}</Text>
                  </View>
                  <View style={{ ...contentBg, paddingVertical: 6, paddingHorizontal: 16 }}>
                    <Text style={{ fontSize: 10, fontWeight: 'bold', color: C.navy }}>{a.titulo}</Text>
                    <Text style={s.text}>{a.descricao}</Text>
                    {a.impacto && <Text style={{ fontSize: 10, color: C.navy, backgroundColor: '#FFFDE7', paddingVertical: 2, paddingHorizontal: 4, borderRadius: 2 }}> {a.impacto}</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {c.papel_do_gestor && (
          <View style={s.section}>
            <Text style={s.h2}> Papel do Gestor</Text>
            {[{ icon: '', label: 'Semanal', bg: '#E3EEF9', val: c.papel_do_gestor.semanal },
              { icon: '', label: 'Quinzenal', bg: '#EEF3FB', val: c.papel_do_gestor.quinzenal },
              { icon: '>', label: 'Próximo ciclo', bg: '#F7F9FC', val: c.papel_do_gestor.proximo_ciclo },
            ].filter(p => p.val).map((p, i) => (
              <View key={i} style={{ marginBottom: 2 }}>
                <View style={{ ...s.papelBox, backgroundColor: p.bg }}><Text style={{ fontSize: 10, fontWeight: 'bold', color: C.navy }}>{p.icon} {p.label}</Text></View>
                <View style={{ backgroundColor: p.bg, paddingVertical: 2, paddingHorizontal: 16, paddingBottom: 6 }}><Text style={s.text}>{p.val}</Text></View>
              </View>
            ))}
          </View>
        )}

        {c.mensagem_final && (<View><View style={s.divider} /><Text style={s.textIt}>{c.mensagem_final}</Text></View>)}

        <View style={pageStyles.footer}><Text style={pageStyles.footerText}>Vertho Mentor IA — Confidencial</Text></View>
      </Page>
    </Document>
  );
}
