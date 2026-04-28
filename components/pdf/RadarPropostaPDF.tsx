import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts, pageStyles } from './styles';
import PdfCover, { PdfBackCover } from './PdfCover';
import { SectionTitle } from './SectionTitle';
import type { PropostaPayload } from '@/lib/radar/proposta-pdf-data';

const ETAPA_LABEL: Record<string, string> = {
  '5_EF': '5º ano EF',
  '9_EF': '9º ano EF',
  '3_EM': '3º ano EM',
};
const DISC_LABEL: Record<string, string> = {
  LP: 'Língua Portuguesa',
  MAT: 'Matemática',
};

const s = StyleSheet.create({
  text: { fontSize: fonts.body, color: colors.textSecondary, lineHeight: 1.65, marginBottom: 6 },
  italic: { fontSize: fonts.body, color: colors.textMuted, fontStyle: 'italic', lineHeight: 1.6, marginBottom: 8 },
  section: { marginBottom: 14 },
  // Resumo / leitura
  destaque: {
    backgroundColor: colors.perfilBg,
    borderWidth: 0.5,
    borderColor: colors.perfilBorder,
    borderRadius: 3,
    padding: 12,
    marginBottom: 10,
  },
  destaqueText: { fontSize: 9.5, color: colors.blueText, lineHeight: 1.7 },
  // Tabela Saeb
  table: { width: '100%', marginBottom: 12 },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: colors.navy,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  tableHeadCell: {
    color: colors.white, fontSize: 7.5, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  tableRow: {
    flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8,
    borderBottomWidth: 0.3, borderBottomColor: colors.borderLight,
  },
  tableRowAlt: {
    flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8,
    borderBottomWidth: 0.3, borderBottomColor: colors.borderLight,
    backgroundColor: colors.gray100,
  },
  tableCell: { fontSize: 8.5, color: colors.textPrimary },
  // Lista com prefixo colorido
  listItem: { flexDirection: 'row', marginBottom: 3 },
  listPrefix: { fontSize: 9, fontWeight: 700, width: 12 },
  listText: { fontSize: 8.5, color: colors.textPrimary, flex: 1, lineHeight: 1.55 },
  // Bloco navy (CTA Vertho)
  navyBlock: {
    backgroundColor: colors.navy,
    borderRadius: 4,
    padding: 16,
    marginBottom: 12,
  },
  navyLabel: {
    fontSize: 7.5, fontWeight: 700, color: colors.cyan,
    textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6,
  },
  navyTitle: {
    fontSize: 12, fontWeight: 700, color: colors.white,
    marginBottom: 8, lineHeight: 1.35,
  },
  navyText: {
    fontSize: 9, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6,
  },
});

function PageHeader({ logoBase64, label }: { logoBase64?: string; label: string }) {
  return (
    <View style={pageStyles.header} fixed>
      {logoBase64 ? <Image src={logoBase64} style={pageStyles.headerLogo} /> : <View />}
      <Text style={pageStyles.headerLabel}>{label}</Text>
    </View>
  );
}

function PageFooter() {
  return (
    <View style={pageStyles.footer} fixed>
      <Text style={pageStyles.footerText}>Vertho Mentor IA — radar.vertho.ai</Text>
      <Text style={pageStyles.footerText}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

export default function RadarPropostaPDF({
  payload,
  logoBase64,
  destinatario,
}: {
  payload: PropostaPayload;
  logoBase64?: string;
  destinatario?: { nome?: string; organizacao?: string; cargo?: string };
}) {
  const { conteudo, scopeLabel, scopeType, municipio, uf, escola, saeb, ica } = payload;
  const headerLabel = `${scopeType === 'escola' ? 'Diagnóstico Escola' : 'Diagnóstico Município'} · ${scopeLabel}`;
  const dataHoje = new Date(payload.geradoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  // Reduz para mostrar até 8 linhas Saeb (último ano disponível primeiro)
  const saebTop = (saeb || []).slice(0, 8);

  return (
    <Document title={`Diagnóstico Vertho — ${scopeLabel}`}>
      {/* CAPA */}
      <PdfCover
        logoBase64={logoBase64}
        nome={scopeLabel}
        cargo={scopeType === 'escola' ? `${municipio}/${uf}${escola?.rede ? ' · ' + escola.rede : ''}` : `Município · ${uf}`}
        empresa=""
        data={payload.geradoEm}
        tipo="Diagnóstico Educacional Vertho Radar"
      />

      {/* PÁGINA 2 — RESUMO + LEITURA SAEB */}
      <Page size="A4" style={pageStyles.page} wrap>
        <PageHeader logoBase64={logoBase64} label={headerLabel} />

        <View style={s.section} wrap={false}>
          <SectionTitle>Resumo Executivo</SectionTitle>
          <View style={s.destaque}>
            <Text style={s.destaqueText}>{conteudo.resumo_executivo}</Text>
          </View>
          {destinatario?.nome && (
            <Text style={s.italic}>Preparado para {destinatario.nome}{destinatario.organizacao ? `, ${destinatario.organizacao}` : ''}, em {dataHoje}.</Text>
          )}
        </View>

        <View style={s.section} wrap={false}>
          <SectionTitle>Leitura Saeb</SectionTitle>
          <Text style={s.text}>{conteudo.leitura_saeb}</Text>
        </View>

        {/* Tabela Saeb (escola) */}
        {scopeType === 'escola' && saebTop.length > 0 && (
          <View style={s.section} wrap={false}>
            <View style={s.table}>
              <View style={s.tableHead}>
                <Text style={{ ...s.tableHeadCell, flex: 0.6 }}>Ano</Text>
                <Text style={{ ...s.tableHeadCell, flex: 1 }}>Etapa</Text>
                <Text style={{ ...s.tableHeadCell, flex: 1.2 }}>Disciplina</Text>
                <Text style={{ ...s.tableHeadCell, flex: 1, textAlign: 'right' }}>% N0–1 escola</Text>
                <Text style={{ ...s.tableHeadCell, flex: 1, textAlign: 'right' }}>% N0–1 similares</Text>
              </View>
              {saebTop.map((sn, i) => {
                const dist = sn.distribuicao || {};
                const sim = sn.similares || {};
                const pctEsc = (Number(dist['0'] || 0) + Number(dist['1'] || 0));
                const pctSim = (Number(sim['0'] || 0) + Number(sim['1'] || 0));
                const rowStyle = i % 2 === 0 ? s.tableRow : s.tableRowAlt;
                return (
                  <View key={i} style={rowStyle}>
                    <Text style={{ ...s.tableCell, flex: 0.6 }}>{sn.ano}</Text>
                    <Text style={{ ...s.tableCell, flex: 1 }}>{ETAPA_LABEL[sn.etapa] || sn.etapa}</Text>
                    <Text style={{ ...s.tableCell, flex: 1.2 }}>{DISC_LABEL[sn.disciplina] || sn.disciplina}</Text>
                    <Text style={{ ...s.tableCell, flex: 1, textAlign: 'right', fontWeight: 700, color: colors.navy }}>{pctEsc.toFixed(1)}%</Text>
                    <Text style={{ ...s.tableCell, flex: 1, textAlign: 'right', color: colors.gray500 }}>{sn.similares ? `${pctSim.toFixed(1)}%` : '—'}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <PageFooter />
      </Page>

      {/* PÁGINA 3 — CONTEXTO MUNICIPAL (ICA) */}
      <Page size="A4" style={pageStyles.page} wrap>
        <PageHeader logoBase64={logoBase64} label={headerLabel} />

        <View style={s.section} wrap={false}>
          <SectionTitle>Contexto Municipal</SectionTitle>
          <View style={s.destaque}>
            <Text style={s.destaqueText}>{conteudo.contexto_municipal}</Text>
          </View>
        </View>

        {ica && ica.length > 0 && (
          <View style={s.section} wrap={false}>
            <View style={s.table}>
              <View style={s.tableHead}>
                <Text style={{ ...s.tableHeadCell, flex: 0.6 }}>Ano</Text>
                <Text style={{ ...s.tableHeadCell, flex: 1 }}>Rede</Text>
                <Text style={{ ...s.tableHeadCell, flex: 1, textAlign: 'right' }}>Município</Text>
                <Text style={{ ...s.tableHeadCell, flex: 1, textAlign: 'right' }}>UF</Text>
                <Text style={{ ...s.tableHeadCell, flex: 1, textAlign: 'right' }}>Brasil</Text>
              </View>
              {ica.slice(0, 8).map((i, idx) => {
                const rowStyle = idx % 2 === 0 ? s.tableRow : s.tableRowAlt;
                return (
                  <View key={`${i.rede}-${i.ano}`} style={rowStyle}>
                    <Text style={{ ...s.tableCell, flex: 0.6 }}>{i.ano}</Text>
                    <Text style={{ ...s.tableCell, flex: 1 }}>{i.rede}</Text>
                    <Text style={{ ...s.tableCell, flex: 1, textAlign: 'right', fontWeight: 700, color: colors.navy }}>{i.taxa != null ? `${i.taxa.toFixed(1)}%` : '—'}</Text>
                    <Text style={{ ...s.tableCell, flex: 1, textAlign: 'right', color: colors.gray500 }}>{i.total_estado != null ? `${i.total_estado.toFixed(1)}%` : '—'}</Text>
                    <Text style={{ ...s.tableCell, flex: 1, textAlign: 'right', color: colors.gray500 }}>{i.total_brasil != null ? `${i.total_brasil.toFixed(1)}%` : '—'}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <PageFooter />
      </Page>

      {/* PÁGINA 4 — PONTOS DE ATENÇÃO + PERGUNTAS */}
      <Page size="A4" style={pageStyles.page} wrap>
        <PageHeader logoBase64={logoBase64} label={headerLabel} />

        {conteudo.pontos_atencao.length > 0 && (
          <View style={s.section} wrap={false}>
            <SectionTitle>Pontos de Atenção</SectionTitle>
            {conteudo.pontos_atencao.map((p, i) => (
              <View key={i} style={s.listItem}>
                <Text style={{ ...s.listPrefix, color: colors.orange }}>!</Text>
                <Text style={{ ...s.listText, color: colors.orangeText }}>{p}</Text>
              </View>
            ))}
          </View>
        )}

        {conteudo.perguntas_pedagogicas.length > 0 && (
          <View style={s.section}>
            <SectionTitle>Perguntas Pedagógicas para Discussão</SectionTitle>
            {conteudo.perguntas_pedagogicas.map((q, i) => (
              <View key={i} style={s.listItem}>
                <Text style={{ ...s.listPrefix, color: colors.cyan }}>→</Text>
                <Text style={{ ...s.listText, color: colors.blueText }}>{q}</Text>
              </View>
            ))}
          </View>
        )}

        <PageFooter />
      </Page>

      {/* PÁGINA 5 — COMO A VERTHO PODE AJUDAR + PRÓXIMOS PASSOS */}
      <Page size="A4" style={pageStyles.page} wrap>
        <PageHeader logoBase64={logoBase64} label={headerLabel} />

        <View style={s.navyBlock}>
          <Text style={s.navyLabel}>Como a Vertho pode ajudar</Text>
          <Text style={s.navyTitle}>Mentor IA: diagnóstico individual + trilha de desenvolvimento contextualizada</Text>
          <Text style={s.navyText}>
            A Vertho transforma os diagnósticos públicos em ações pedagógicas concretas: mapeia
            competências docentes, gera trilhas individuais e fornece relatórios para a secretaria
            acompanhar evolução real dos profissionais.
          </Text>
        </View>

        {conteudo.como_vertho_ajuda.length > 0 && (
          <View style={s.section} wrap={false}>
            {conteudo.como_vertho_ajuda.map((item, i) => (
              <View key={i} style={s.listItem}>
                <Text style={{ ...s.listPrefix, color: colors.cyan }}>+</Text>
                <Text style={s.listText}>{item}</Text>
              </View>
            ))}
          </View>
        )}

        {conteudo.proximos_passos.length > 0 && (
          <View style={s.section}>
            <SectionTitle>Próximos Passos</SectionTitle>
            {conteudo.proximos_passos.map((p, i) => (
              <View key={i} style={s.listItem}>
                <Text style={{ ...s.listPrefix, color: colors.green }}>{i + 1}.</Text>
                <Text style={{ ...s.listText, color: colors.greenText }}>{p}</Text>
              </View>
            ))}
          </View>
        )}

        <PageFooter />
      </Page>

      {/* PÁGINA 6 — METODOLOGIA / FONTES */}
      <Page size="A4" style={pageStyles.page} wrap>
        <PageHeader logoBase64={logoBase64} label={headerLabel} />

        <View style={s.section}>
          <SectionTitle>Metodologia e Fontes</SectionTitle>
          <Text style={s.text}>
            Este diagnóstico foi gerado a partir de dados públicos do INEP (Instituto Nacional de
            Estudos e Pesquisas Educacionais Anísio Teixeira) — Saeb e Indicador Criança Alfabetizada
            (ICA) — agregados pelo Vertho Radar (radar.vertho.ai).
          </Text>
          <Text style={s.text}>
            <Text style={{ fontWeight: 700, color: colors.navy }}>Comparativo "escolas similares":</Text>{' '}
            agrupamento INEP por microrregião + zona (urbana/rural) + INSE próximo. É a comparação
            mais justa pra avaliar gestão pedagógica controlando por contexto socioeconômico.
          </Text>
          <Text style={s.text}>
            <Text style={{ fontWeight: 700, color: colors.navy }}>Escala de níveis:</Text> cumulativa.
            Estudante no nível N domina também as habilidades dos níveis 0 a N−1. % alto nos níveis
            0-1 indica aprendizagem aquém do esperado.
          </Text>
          <Text style={s.text}>
            <Text style={{ fontWeight: 700, color: colors.navy }}>INSE:</Text> Indicador de Nível
            Socioeconômico do INEP. Grupo 1 = NSE mais alto. Grupo 6 = NSE mais baixo (escala invertida).
          </Text>
          <Text style={s.italic}>
            Análise textual gerada por IA usando exclusivamente os dados estruturados desta página.
            Valores oficiais devem ser consultados em portais governamentais
            (gov.br/inep). Vertho Mentor IA não se responsabiliza por decisões tomadas
            unicamente com base neste documento.
          </Text>
        </View>

        <View style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 8, color: colors.textMuted }}>
            Para conhecer o Mentor IA na íntegra ou agendar conversa, escreva para{' '}
            <Text style={{ color: colors.navy, fontWeight: 700 }}>radar@vertho.ai</Text> ou visite{' '}
            <Text style={{ color: colors.navy, fontWeight: 700 }}>vertho.ai</Text>.
          </Text>
        </View>

        <PageFooter />
      </Page>

      {/* CONTRACAPA */}
      <PdfBackCover logoBase64={logoBase64} />
    </Document>
  );
}
