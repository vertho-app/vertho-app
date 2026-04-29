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
const QUADRANTE_LABEL: Record<string, string> = {
  q1_bem_servida_aprende: 'Q1 — Bem servida e aprendendo',
  q2_estrutura_resultado_baixo: 'Q2 — Tem estrutura, resultado abaixo',
  q3_faz_mais_com_menos: 'Q3 — Faz mais com menos',
  q4_dupla_vulnerabilidade: 'Q4 — Dupla vulnerabilidade',
  sem_dados: 'Sem dados suficientes',
};

const s = StyleSheet.create({
  text: { fontSize: fonts.body, color: colors.textSecondary, lineHeight: 1.65, marginBottom: 6 },
  italic: { fontSize: fonts.body, color: colors.textMuted, fontStyle: 'italic', lineHeight: 1.6, marginBottom: 8 },
  section: { marginBottom: 14 },
  destaque: {
    backgroundColor: colors.perfilBg,
    borderWidth: 0.5,
    borderColor: colors.perfilBorder,
    borderRadius: 3,
    padding: 12,
    marginBottom: 10,
  },
  destaqueText: { fontSize: 9.5, color: colors.blueText, lineHeight: 1.7 },
  // Tabela
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
  tableRowTarget: {
    flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8,
    borderBottomWidth: 0.3, borderBottomColor: colors.borderLight,
    backgroundColor: colors.perfilBg,
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
  // Score bar (Censo)
  scoreBarRow: { marginBottom: 8 },
  scoreBarHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  scoreBarLabel: { fontSize: 8.5, color: colors.textPrimary, fontWeight: 600 },
  scoreBarValue: { fontSize: 8.5, color: colors.navy, fontWeight: 700 },
  scoreBarTrack: {
    height: 6, backgroundColor: colors.gray200, borderRadius: 3, overflow: 'hidden',
  },
  scoreBarFill: { height: 6, borderRadius: 3 },
  // Card neutro
  card: {
    backgroundColor: colors.gray100,
    borderWidth: 0.5,
    borderColor: colors.borderLight,
    borderRadius: 3,
    padding: 10,
    marginBottom: 8,
  },
  cardLabel: {
    fontSize: 7, fontWeight: 700, color: colors.gray500,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3,
  },
  cardValue: { fontSize: 11, fontWeight: 700, color: colors.navy, lineHeight: 1.3 },
  cardSub: { fontSize: 8, color: colors.textMuted, marginTop: 2 },
  // Quadrante highlight
  quadranteBlock: {
    backgroundColor: colors.descritorBg,
    borderWidth: 0.5,
    borderColor: colors.descritorBorder,
    borderRadius: 3,
    padding: 10,
    marginBottom: 10,
  },
  quadranteLabel: {
    fontSize: 7.5, fontWeight: 700, color: colors.descritorTitle,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4,
  },
  quadranteValue: { fontSize: 10.5, fontWeight: 700, color: colors.yellowText, marginBottom: 4 },
  quadranteText: { fontSize: 9, color: colors.yellowText, lineHeight: 1.55 },
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

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  const color = value >= 70 ? colors.green : value >= 50 ? colors.yellow : colors.orange;
  const width = `${Math.max(0, Math.min(100, value))}%`;
  return (
    <View style={s.scoreBarRow}>
      <View style={s.scoreBarHeader}>
        <Text style={s.scoreBarLabel}>{label}</Text>
        <Text style={s.scoreBarValue}>{value.toFixed(1)}</Text>
      </View>
      <View style={s.scoreBarTrack}>
        <View style={[s.scoreBarFill, { width: width as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const fmtBRL = (v: number | null | undefined) =>
  v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : '—';

export default function RadarPropostaPDF({
  payload,
  logoBase64,
  destinatario,
}: {
  payload: PropostaPayload;
  logoBase64?: string;
  destinatario?: { nome?: string; organizacao?: string; cargo?: string };
}) {
  const {
    conteudo, scopeLabel, scopeType, municipio, uf, escola,
    saeb, ica, enemEscola, enemMunicipio,
    ideb, idebMunicipio, censo, saresp, pdde, pddeMunicipal,
    fundeb, vaar, receitaPrevista,
    infraSaeb, paresInse, variabilidade,
  } = payload;
  const headerLabel = `${scopeType === 'escola' ? 'Diagnóstico Escola' : 'Diagnóstico Município'} · ${scopeLabel}`;
  const dataHoje = new Date(payload.geradoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  const saebTop = (saeb || []).slice(0, 8);
  const enemEscolaTop = (enemEscola || []).slice(0, 4);
  const enemMunicipioTop = (enemMunicipio || []).slice(0, 4);
  const idebTop = (ideb || []).slice(0, 9);
  const idebMunTop = (idebMunicipio || []).slice(0, 9);
  const sarespTop = (saresp || []).slice(0, 8);
  const pddeTop = (pdde || []).slice(0, 4);
  const pddeMunTop = (pddeMunicipal || []).slice(0, 4);
  const fundebTop = (fundeb || []).slice(0, 4);
  const paresTop = (paresInse || []).slice(0, 8);

  const temIdeb = idebTop.length > 0 || idebMunTop.length > 0;
  const temCenso = censo && (censo.score_basica != null || censo.score_pedagogica != null
    || censo.score_acessibilidade != null || censo.score_conectividade != null);
  const temSaresp = sarespTop.length > 0;
  const temPares = paresTop.length > 0;
  const temRecursos = fundebTop.length > 0 || vaar != null || pddeTop.length > 0 || pddeMunTop.length > 0;
  const temVariabilidade = variabilidade && variabilidade.qtd_escolas > 0;
  const temPdde = pddeTop.length > 0;

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

        {scopeType === 'escola' && enemEscolaTop.length > 0 && (
          <View style={s.section} wrap={false}>
            <SectionTitle>ENEM Comparável</SectionTitle>
            <Text style={s.italic}>
              Microdados do Enem com corte público de 10 ou mais participantes por escola.
            </Text>
            <View style={s.table}>
              <View style={s.tableHead}>
                <Text style={{ ...s.tableHeadCell, flex: 0.7 }}>Ano</Text>
                <Text style={{ ...s.tableHeadCell, flex: 1, textAlign: 'right' }}>Participantes</Text>
                <Text style={{ ...s.tableHeadCell, flex: 1, textAlign: 'right' }}>Média geral</Text>
                <Text style={{ ...s.tableHeadCell, flex: 1, textAlign: 'right' }}>Objetiva</Text>
                <Text style={{ ...s.tableHeadCell, flex: 1, textAlign: 'right' }}>Redação</Text>
              </View>
              {enemEscolaTop.map((row, i) => {
                const rowStyle = i % 2 === 0 ? s.tableRow : s.tableRowAlt;
                return (
                  <View key={row.ano} style={rowStyle}>
                    <Text style={{ ...s.tableCell, flex: 0.7 }}>{row.ano}</Text>
                    <Text style={{ ...s.tableCell, flex: 1, textAlign: 'right' }}>{row.participantes_total.toLocaleString('pt-BR')}</Text>
                    <Text style={{ ...s.tableCell, flex: 1, textAlign: 'right', fontWeight: 700, color: colors.navy }}>{row.media_geral != null ? row.media_geral.toFixed(1) : '—'}</Text>
                    <Text style={{ ...s.tableCell, flex: 1, textAlign: 'right' }}>{row.media_objetiva != null ? row.media_objetiva.toFixed(1) : '—'}</Text>
                    <Text style={{ ...s.tableCell, flex: 1, textAlign: 'right' }}>{row.media_redacao != null ? row.media_redacao.toFixed(1) : '—'}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <PageFooter />
      </Page>

      {/* PÁGINA 3 — IDEB (escola ou município) */}
      {temIdeb && (
        <Page size="A4" style={pageStyles.page} wrap>
          <PageHeader logoBase64={logoBase64} label={headerLabel} />

          <View style={s.section} wrap={false}>
            <SectionTitle>Ideb · meta vs realizado</SectionTitle>
            <Text style={s.italic}>
              Indicador de Desenvolvimento da Educação Básica (Ideb/INEP). Combina aprendizado (Saeb)
              com fluxo escolar. Metas oficiais publicadas pelo INEP.
            </Text>

            {scopeType === 'escola' && idebTop.length > 0 && (
              <View style={s.table}>
                <View style={s.tableHead}>
                  <Text style={{ ...s.tableHeadCell, flex: 0.6 }}>Ano</Text>
                  <Text style={{ ...s.tableHeadCell, flex: 1 }}>Etapa</Text>
                  <Text style={{ ...s.tableHeadCell, flex: 0.9, textAlign: 'right' }}>Ideb</Text>
                  <Text style={{ ...s.tableHeadCell, flex: 0.9, textAlign: 'right' }}>Meta</Text>
                  <Text style={{ ...s.tableHeadCell, flex: 0.9, textAlign: 'right' }}>Status</Text>
                </View>
                {idebTop.map((row, i) => {
                  const rowStyle = i % 2 === 0 ? s.tableRow : s.tableRowAlt;
                  const status = row.ideb != null && row.meta != null
                    ? (row.ideb >= row.meta ? 'Atingiu' : 'Abaixo')
                    : '—';
                  const statusColor = status === 'Atingiu' ? colors.green : status === 'Abaixo' ? colors.orange : colors.gray500;
                  return (
                    <View key={`${row.ano}-${row.etapa}`} style={rowStyle}>
                      <Text style={{ ...s.tableCell, flex: 0.6 }}>{row.ano}</Text>
                      <Text style={{ ...s.tableCell, flex: 1 }}>{ETAPA_LABEL[row.etapa] || row.etapa}</Text>
                      <Text style={{ ...s.tableCell, flex: 0.9, textAlign: 'right', fontWeight: 700, color: colors.navy }}>{row.ideb != null ? row.ideb.toFixed(1) : '—'}</Text>
                      <Text style={{ ...s.tableCell, flex: 0.9, textAlign: 'right' }}>{row.meta != null ? row.meta.toFixed(1) : '—'}</Text>
                      <Text style={{ ...s.tableCell, flex: 0.9, textAlign: 'right', fontWeight: 700, color: statusColor }}>{status}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {scopeType === 'municipio' && idebMunTop.length > 0 && (
              <View style={s.table}>
                <View style={s.tableHead}>
                  <Text style={{ ...s.tableHeadCell, flex: 0.6 }}>Ano</Text>
                  <Text style={{ ...s.tableHeadCell, flex: 1 }}>Etapa</Text>
                  <Text style={{ ...s.tableHeadCell, flex: 1, textAlign: 'right' }}>Ideb médio</Text>
                  <Text style={{ ...s.tableHeadCell, flex: 1, textAlign: 'right' }}>Rendimento</Text>
                  <Text style={{ ...s.tableHeadCell, flex: 0.7, textAlign: 'right' }}>Escolas</Text>
                </View>
                {idebMunTop.map((row, i) => {
                  const rowStyle = i % 2 === 0 ? s.tableRow : s.tableRowAlt;
                  return (
                    <View key={`${row.ano}-${row.etapa}`} style={rowStyle}>
                      <Text style={{ ...s.tableCell, flex: 0.6 }}>{row.ano}</Text>
                      <Text style={{ ...s.tableCell, flex: 1 }}>{ETAPA_LABEL[row.etapa] || row.etapa}</Text>
                      <Text style={{ ...s.tableCell, flex: 1, textAlign: 'right', fontWeight: 700, color: colors.navy }}>{row.idebAvg != null ? row.idebAvg.toFixed(2) : '—'}</Text>
                      <Text style={{ ...s.tableCell, flex: 1, textAlign: 'right' }}>{row.rendimentoAvg != null ? row.rendimentoAvg.toFixed(2) : '—'}</Text>
                      <Text style={{ ...s.tableCell, flex: 0.7, textAlign: 'right' }}>{row.totalEscolas}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {scopeType === 'municipio' && temVariabilidade && (
            <View style={s.section} wrap={false}>
              <SectionTitle>Variabilidade entre escolas da rede</SectionTitle>
              <Text style={s.italic}>
                Dispersão dos resultados Saeb e Ideb entre as {variabilidade!.qtd_escolas} escolas da rede municipal
                — etapa {ETAPA_LABEL[variabilidade!.etapa] || variabilidade!.etapa}. Baixo desvio = uniformidade;
                alto desvio = heterogeneidade que merece atenção.
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                <View style={{ ...s.card, flex: 1 }}>
                  <Text style={s.cardLabel}>Saeb LP — média ± desvio</Text>
                  <Text style={s.cardValue}>
                    {variabilidade!.saeb_lp_avg != null ? variabilidade!.saeb_lp_avg.toFixed(0) : '—'}
                    {variabilidade!.saeb_lp_stddev != null ? ` ± ${variabilidade!.saeb_lp_stddev.toFixed(0)}` : ''}
                  </Text>
                  <Text style={s.cardSub}>
                    min {variabilidade!.saeb_lp_min != null ? variabilidade!.saeb_lp_min.toFixed(0) : '—'} ·
                    máx {variabilidade!.saeb_lp_max != null ? variabilidade!.saeb_lp_max.toFixed(0) : '—'}
                  </Text>
                </View>
                <View style={{ ...s.card, flex: 1 }}>
                  <Text style={s.cardLabel}>Saeb MAT — média ± desvio</Text>
                  <Text style={s.cardValue}>
                    {variabilidade!.saeb_mat_avg != null ? variabilidade!.saeb_mat_avg.toFixed(0) : '—'}
                    {variabilidade!.saeb_mat_stddev != null ? ` ± ${variabilidade!.saeb_mat_stddev.toFixed(0)}` : ''}
                  </Text>
                  <Text style={s.cardSub}>
                    min {variabilidade!.saeb_mat_min != null ? variabilidade!.saeb_mat_min.toFixed(0) : '—'} ·
                    máx {variabilidade!.saeb_mat_max != null ? variabilidade!.saeb_mat_max.toFixed(0) : '—'}
                  </Text>
                </View>
                <View style={{ ...s.card, flex: 1 }}>
                  <Text style={s.cardLabel}>Ideb — média ± desvio</Text>
                  <Text style={s.cardValue}>
                    {variabilidade!.ideb_avg != null ? variabilidade!.ideb_avg.toFixed(2) : '—'}
                    {variabilidade!.ideb_stddev != null ? ` ± ${variabilidade!.ideb_stddev.toFixed(2)}` : ''}
                  </Text>
                </View>
              </View>
            </View>
          )}

          <PageFooter />
        </Page>
      )}

      {/* PÁGINA — INFRAESTRUTURA (escola, Censo Escolar) */}
      {scopeType === 'escola' && (temCenso || infraSaeb) && (
        <Page size="A4" style={pageStyles.page} wrap>
          <PageHeader logoBase64={logoBase64} label={headerLabel} />

          <View style={s.section} wrap={false}>
            <SectionTitle>Infraestrutura · Censo Escolar</SectionTitle>
            {conteudo.leitura_infra ? (
              <Text style={s.text}>{conteudo.leitura_infra}</Text>
            ) : (
              <Text style={s.italic}>
                Scores 0–100 calculados a partir do Censo Escolar (INEP). Cada dimensão agrega famílias
                de itens equivalentes; uma família pontua se qualquer item dela está presente.
              </Text>
            )}

            {temCenso && censo && (
              <View style={{ marginTop: 6, marginBottom: 10 }}>
                <ScoreBar label="Básica (água, energia, esgoto, banheiros, lixo)" value={censo.score_basica} />
                <ScoreBar label="Pedagógica (biblioteca, laboratórios, quadra, refeitório)" value={censo.score_pedagogica} />
                <ScoreBar label="Acessibilidade (rampas, sinais, banheiros adaptados)" value={censo.score_acessibilidade} />
                <ScoreBar label="Conectividade (internet, banda larga, uso pedagógico)" value={censo.score_conectividade} />
              </View>
            )}

            {infraSaeb && infraSaeb.quadrante !== 'sem_dados' && (
              <View style={s.quadranteBlock}>
                <Text style={s.quadranteLabel}>Cruzamento Infra × Saeb</Text>
                <Text style={s.quadranteValue}>{QUADRANTE_LABEL[infraSaeb.quadrante] || infraSaeb.quadrante}</Text>
                <Text style={s.quadranteText}>
                  Score geral de infra: {infraSaeb.score_geral != null ? infraSaeb.score_geral.toFixed(1) : '—'} ·
                  % N0–1 médio: {infraSaeb.pct_n0_avg_simples != null ? `${infraSaeb.pct_n0_avg_simples.toFixed(1)}%` : '—'}
                  {infraSaeb.n0_diff_mediana != null && (
                    <> · diferença vs mediana Brasil: {infraSaeb.n0_diff_mediana > 0 ? '+' : ''}{infraSaeb.n0_diff_mediana.toFixed(1)}pp</>
                  )}
                </Text>
              </View>
            )}
          </View>

          <PageFooter />
        </Page>
      )}

      {/* PÁGINA — SARESP (escola SP) */}
      {scopeType === 'escola' && temSaresp && (
        <Page size="A4" style={pageStyles.page} wrap>
          <PageHeader logoBase64={logoBase64} label={headerLabel} />

          <View style={s.section} wrap={false}>
            <SectionTitle>SARESP · avaliação estadual SP</SectionTitle>
            <Text style={s.italic}>
              Sistema de Avaliação de Rendimento Escolar do Estado de São Paulo (Seduc-SP).
              Aplicado anualmente, complementa o Saeb com leitura mais frequente.
            </Text>
            <View style={s.table}>
              <View style={s.tableHead}>
                <Text style={{ ...s.tableHeadCell, flex: 0.6 }}>Ano</Text>
                <Text style={{ ...s.tableHeadCell, flex: 0.8 }}>Série</Text>
                <Text style={{ ...s.tableHeadCell, flex: 1.2 }}>Disciplina</Text>
                <Text style={{ ...s.tableHeadCell, flex: 1, textAlign: 'right' }}>Proficiência</Text>
                <Text style={{ ...s.tableHeadCell, flex: 1, textAlign: 'right' }}>Participantes</Text>
              </View>
              {sarespTop.map((row, i) => {
                const rowStyle = i % 2 === 0 ? s.tableRow : s.tableRowAlt;
                return (
                  <View key={`${row.ano}-${row.serie}-${row.disciplina}`} style={rowStyle}>
                    <Text style={{ ...s.tableCell, flex: 0.6 }}>{row.ano}</Text>
                    <Text style={{ ...s.tableCell, flex: 0.8 }}>{row.serie}</Text>
                    <Text style={{ ...s.tableCell, flex: 1.2 }}>{row.disciplina}</Text>
                    <Text style={{ ...s.tableCell, flex: 1, textAlign: 'right', fontWeight: 700, color: colors.navy }}>
                      {row.proficiencia_media != null ? row.proficiencia_media.toFixed(0) : '—'}
                    </Text>
                    <Text style={{ ...s.tableCell, flex: 1, textAlign: 'right' }}>
                      {row.total_alunos != null ? row.total_alunos.toLocaleString('pt-BR') : '—'}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          <PageFooter />
        </Page>
      )}

      {/* PÁGINA — PARES INSE DA CIDADE (escola) */}
      {scopeType === 'escola' && temPares && (
        <Page size="A4" style={pageStyles.page} wrap>
          <PageHeader logoBase64={logoBase64} label={headerLabel} />

          <View style={s.section} wrap={false}>
            <SectionTitle>Pares INSE na mesma cidade</SectionTitle>
            <Text style={s.italic}>
              Escolas com Indicador de Nível Socioeconômico (INSE/INEP) similar ao desta unidade,
              dentro do mesmo município. A comparação mais justa para avaliar gestão pedagógica
              controlando por contexto socioeconômico.
            </Text>
            <View style={s.table}>
              <View style={s.tableHead}>
                <Text style={{ ...s.tableHeadCell, flex: 0.5, textAlign: 'right' }}>#</Text>
                <Text style={{ ...s.tableHeadCell, flex: 3 }}>Escola</Text>
                <Text style={{ ...s.tableHeadCell, flex: 1, textAlign: 'right' }}>Saeb LP</Text>
                <Text style={{ ...s.tableHeadCell, flex: 1, textAlign: 'right' }}>Saeb MAT</Text>
                <Text style={{ ...s.tableHeadCell, flex: 1, textAlign: 'right' }}>Ideb</Text>
              </View>
              {paresTop.map((p) => {
                const rowStyle = p.is_target ? s.tableRowTarget : (p.rank_geral % 2 === 0 ? s.tableRow : s.tableRowAlt);
                const cellStyle = p.is_target
                  ? { ...s.tableCell, fontWeight: 700, color: colors.navy }
                  : s.tableCell;
                return (
                  <View key={p.codigo_inep} style={rowStyle}>
                    <Text style={{ ...cellStyle, flex: 0.5, textAlign: 'right' }}>{p.rank_geral}</Text>
                    <Text style={{ ...cellStyle, flex: 3 }}>
                      {p.is_target ? '★ ' : ''}{p.nome}{p.rede ? ` · ${p.rede}` : ''}
                    </Text>
                    <Text style={{ ...cellStyle, flex: 1, textAlign: 'right' }}>{p.saeb_lp != null ? p.saeb_lp.toFixed(0) : '—'}</Text>
                    <Text style={{ ...cellStyle, flex: 1, textAlign: 'right' }}>{p.saeb_mat != null ? p.saeb_mat.toFixed(0) : '—'}</Text>
                    <Text style={{ ...cellStyle, flex: 1, textAlign: 'right' }}>{p.ideb_principal != null ? p.ideb_principal.toFixed(1) : '—'}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={{ ...s.italic, marginTop: 4 }}>
              ★ esta escola · ranqueamento entre {paresTop[0]?.total_pares ?? paresTop.length} pares INSE da cidade.
            </Text>
          </View>

          <PageFooter />
        </Page>
      )}

      {/* PÁGINA 3 — CONTEXTO MUNICIPAL (município) */}
      {scopeType === 'municipio' && (
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

          {scopeType === 'municipio' && enemMunicipioTop.length > 0 && (
            <View style={s.section} wrap={false}>
              <SectionTitle>ENEM Comparável do Município</SectionTitle>
              <Text style={s.italic}>
                Médias ponderadas do Enem usando apenas escolas com 10 ou mais participantes.
              </Text>
              <View style={s.table}>
                <View style={s.tableHead}>
                  <Text style={{ ...s.tableHeadCell, flex: 0.7 }}>Ano</Text>
                  <Text style={{ ...s.tableHeadCell, flex: 1 }}>Escolas 10+</Text>
                  <Text style={{ ...s.tableHeadCell, flex: 1, textAlign: 'right' }}>Participantes</Text>
                  <Text style={{ ...s.tableHeadCell, flex: 1, textAlign: 'right' }}>Média geral</Text>
                  <Text style={{ ...s.tableHeadCell, flex: 1, textAlign: 'right' }}>Redação</Text>
                </View>
                {enemMunicipioTop.map((row, idx) => {
                  const rowStyle = idx % 2 === 0 ? s.tableRow : s.tableRowAlt;
                  return (
                    <View key={row.ano} style={rowStyle}>
                      <Text style={{ ...s.tableCell, flex: 0.7 }}>{row.ano}</Text>
                      <Text style={{ ...s.tableCell, flex: 1 }}>{row.escolasCom10.toLocaleString('pt-BR')}</Text>
                      <Text style={{ ...s.tableCell, flex: 1, textAlign: 'right' }}>{row.participantesTotalCom10.toLocaleString('pt-BR')}</Text>
                      <Text style={{ ...s.tableCell, flex: 1, textAlign: 'right', fontWeight: 700, color: colors.navy }}>{row.mediaGeralPonderada != null ? row.mediaGeralPonderada.toFixed(1) : '—'}</Text>
                      <Text style={{ ...s.tableCell, flex: 1, textAlign: 'right' }}>{row.mediaRedacaoPonderada != null ? row.mediaRedacaoPonderada.toFixed(1) : '—'}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          <PageFooter />
        </Page>
      )}

      {/* PÁGINA — RECURSOS (FUNDEB / VAAR / PDDE) */}
      {temRecursos && (
        <Page size="A4" style={pageStyles.page} wrap>
          <PageHeader logoBase64={logoBase64} label={headerLabel} />

          <View style={s.section} wrap={false}>
            <SectionTitle>Recursos Disponíveis</SectionTitle>
            {conteudo.leitura_recursos ? (
              <Text style={s.text}>{conteudo.leitura_recursos}</Text>
            ) : (
              <Text style={s.italic}>
                Recursos federais e municipais disponíveis. FUNDEB e VAAR (Tesouro/FNDE) compõem
                o financiamento estrutural; PDDE (FNDE) é o repasse direto à unidade escolar.
              </Text>
            )}
          </View>

          {scopeType === 'municipio' && fundebTop.length > 0 && (
            <View style={s.section} wrap={false}>
              <Text style={{ ...s.cardLabel, marginBottom: 6 }}>FUNDEB · repasses anuais (rede municipal)</Text>
              <View style={s.table}>
                <View style={s.tableHead}>
                  <Text style={{ ...s.tableHeadCell, flex: 0.7 }}>Ano</Text>
                  <Text style={{ ...s.tableHeadCell, flex: 1.5, textAlign: 'right' }}>Valor recebido</Text>
                  <Text style={{ ...s.tableHeadCell, flex: 1.2, textAlign: 'right' }}>Por aluno</Text>
                </View>
                {fundebTop.map((row, i) => {
                  const rowStyle = i % 2 === 0 ? s.tableRow : s.tableRowAlt;
                  return (
                    <View key={row.ano} style={rowStyle}>
                      <Text style={{ ...s.tableCell, flex: 0.7 }}>{row.ano}</Text>
                      <Text style={{ ...s.tableCell, flex: 1.5, textAlign: 'right', fontWeight: 700, color: colors.navy }}>
                        {fmtBRL(row.total_repasse_bruto)}
                      </Text>
                      <Text style={{ ...s.tableCell, flex: 1.2, textAlign: 'right' }}>
                        {row.valor_aluno_ano != null ? fmtBRL(row.valor_aluno_ano) : '—'}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {scopeType === 'municipio' && vaar && (
            <View style={s.quadranteBlock}>
              <Text style={s.quadranteLabel}>VAAR · complementação por resultado</Text>
              <Text style={s.quadranteValue}>
                {vaar.habilitado ? `Habilitado em ${vaar.ano}` : `Não habilitado em ${vaar.ano}`}
              </Text>
              <Text style={s.quadranteText}>
                {vaar.habilitado
                  ? 'A rede atende aos critérios da União para receber a parcela do FUNDEB vinculada a resultados pedagógicos.'
                  : 'A rede ainda não atende aos critérios para a parcela vinculada a resultados; oportunidade de mobilização pedagógica.'}
                {receitaPrevista?.total_receita_prevista != null && (
                  <> Receita FUNDEB prevista para {receitaPrevista.ano}: {fmtBRL(receitaPrevista.total_receita_prevista)}.</>
                )}
              </Text>
            </View>
          )}

          {scopeType === 'escola' && pddeTop.length > 0 && (
            <View style={s.section} wrap={false}>
              <Text style={{ ...s.cardLabel, marginBottom: 6 }}>PDDE · repasses diretos à escola</Text>
              <View style={s.table}>
                <View style={s.tableHead}>
                  <Text style={{ ...s.tableHeadCell, flex: 0.7 }}>Ano</Text>
                  <Text style={{ ...s.tableHeadCell, flex: 1.5, textAlign: 'right' }}>Valor</Text>
                  <Text style={{ ...s.tableHeadCell, flex: 1.5, textAlign: 'right' }}>Saldo</Text>
                </View>
                {pddeTop.map((row, i) => {
                  const rowStyle = i % 2 === 0 ? s.tableRow : s.tableRowAlt;
                  return (
                    <View key={row.ano} style={rowStyle}>
                      <Text style={{ ...s.tableCell, flex: 0.7 }}>{row.ano}</Text>
                      <Text style={{ ...s.tableCell, flex: 1.5, textAlign: 'right', fontWeight: 700, color: colors.navy }}>
                        {fmtBRL(row.valor_recebido)}
                      </Text>
                      <Text style={{ ...s.tableCell, flex: 1.5, textAlign: 'right' }}>
                        {fmtBRL(row.saldo_atual)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {scopeType === 'municipio' && pddeMunTop.length > 0 && (
            <View style={s.section} wrap={false}>
              <Text style={{ ...s.cardLabel, marginBottom: 6 }}>PDDE municipal · agregado da rede</Text>
              <View style={s.table}>
                <View style={s.tableHead}>
                  <Text style={{ ...s.tableHeadCell, flex: 0.7 }}>Ano</Text>
                  <Text style={{ ...s.tableHeadCell, flex: 1.5, textAlign: 'right' }}>Total recebido</Text>
                  <Text style={{ ...s.tableHeadCell, flex: 1.5, textAlign: 'right' }}>Escolas atendidas</Text>
                </View>
                {pddeMunTop.map((row, i) => {
                  const rowStyle = i % 2 === 0 ? s.tableRow : s.tableRowAlt;
                  return (
                    <View key={row.ano} style={rowStyle}>
                      <Text style={{ ...s.tableCell, flex: 0.7 }}>{row.ano}</Text>
                      <Text style={{ ...s.tableCell, flex: 1.5, textAlign: 'right', fontWeight: 700, color: colors.navy }}>
                        {fmtBRL(row.total_repasse)}
                      </Text>
                      <Text style={{ ...s.tableCell, flex: 1.5, textAlign: 'right' }}>
                        {row.total_escolas_atendidas != null ? row.total_escolas_atendidas.toLocaleString('pt-BR') : '—'}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          <PageFooter />
        </Page>
      )}

      {/* PÁGINA — PONTOS DE ATENÇÃO + PERGUNTAS */}
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

      {/* PÁGINA — COMO A VERTHO PODE AJUDAR + PRÓXIMOS PASSOS */}
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

      {/* PÁGINA — METODOLOGIA / FONTES */}
      <Page size="A4" style={pageStyles.page} wrap>
        <PageHeader logoBase64={logoBase64} label={headerLabel} />

        <View style={s.section}>
          <SectionTitle>Metodologia e Fontes</SectionTitle>
          <Text style={s.text}>
            Este diagnóstico foi gerado a partir de fontes públicas, principalmente do INEP
            (Saeb, Ideb, ICA, Censo Escolar e microdados do Enem), com complementos do
            Tesouro Nacional/FNDE (FUNDEB, VAAR, PDDE) e da Seduc-SP (SARESP, quando aplicável).
            Tudo é agregado pelo Vertho Radar (radar.vertho.ai).
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
          <Text style={s.text}>
            <Text style={{ fontWeight: 700, color: colors.navy }}>Censo Escolar (scores 0–100):</Text>{' '}
            cada dimensão (básica, pedagógica, acessibilidade, conectividade) agrupa famílias de itens
            equivalentes; uma família pontua quando qualquer item dela está presente. Famílias sem
            registro não entram no denominador.
          </Text>
          <Text style={s.text}>
            <Text style={{ fontWeight: 700, color: colors.navy }}>Cruzamento Infra × Saeb:</Text> classifica
            a escola em quadrantes (bem servida e aprendendo, tem estrutura mas resultado abaixo,
            faz mais com menos, dupla vulnerabilidade) cruzando o score geral de infra com o % nos
            níveis 0–1 do Saeb mais recente.
          </Text>
          <Text style={s.text}>
            <Text style={{ fontWeight: 700, color: colors.navy }}>Ideb:</Text> combina aprendizado
            (Saeb) com fluxo (rendimento). Status "atingiu" considera Ideb realizado ≥ meta oficial INEP.
          </Text>
          <Text style={s.text}>
            <Text style={{ fontWeight: 700, color: colors.navy }}>VAAR:</Text> parcela do FUNDEB
            vinculada a resultados (Tesouro Nacional). Indicador binário de habilitação por ano.
          </Text>
          <Text style={s.text}>
            <Text style={{ fontWeight: 700, color: colors.navy }}>ENEM comparável:</Text>{' '}
            quando usado neste documento, considera apenas escolas com 10 ou mais participantes no ano,
            evitando leituras públicas instáveis por amostra pequena.
          </Text>
          <Text style={s.italic}>
            Análise textual gerada por IA usando exclusivamente os dados estruturados deste documento.
            Valores oficiais devem ser consultados em portais governamentais
            (gov.br/inep, gov.br/fnde, educacao.sp.gov.br). Vertho Mentor IA não se responsabiliza
            por decisões tomadas unicamente com base neste documento.
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
