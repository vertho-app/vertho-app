'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase-browser';

const NAVY = '#0F2A4A';
const CYAN = '#00B4D8';
const TEAL = '#0D9488';

export default function RHView({ empresaId }) {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({
    totalColaboradores: 0,
    assessmentsCompletados: 0,
    notaMedia: 0,
  });
  const [competencias, setCompetencias] = useState([]);

  useEffect(() => {
    if (!empresaId) return;

    async function fetchData() {
      setLoading(true);
      const supabase = getSupabase();

      try {
        // Fetch colaboradores count
        const { count: totalColaboradores } = await supabase
          .from('colaboradores')
          .select('*', { count: 'exact', head: true })
          .eq('empresa_id', empresaId);

        // Fetch avaliacoes for this company
        const { data: avaliacoes } = await supabase
          .from('avaliacoes')
          .select('id, nota_final, status, colaborador_id')
          .eq('empresa_id', empresaId);

        const completadas = (avaliacoes || []).filter(
          (a) => a.status === 'concluida'
        );
        const assessmentsCompletados = completadas.length;

        const notaMedia =
          assessmentsCompletados > 0
            ? completadas.reduce((sum, a) => sum + (a.nota_final || 0), 0) /
              assessmentsCompletados
            : 0;

        setKpis({
          totalColaboradores: totalColaboradores || 0,
          assessmentsCompletados,
          notaMedia: Math.round(notaMedia * 10) / 10,
        });

        // Fetch competency distribution
        const { data: compData } = await supabase
          .from('resultados_competencia')
          .select('competencia_nome, nota')
          .in(
            'avaliacao_id',
            (avaliacoes || []).map((a) => a.id)
          );

        if (compData && compData.length > 0) {
          const grouped = {};
          compData.forEach((r) => {
            if (!grouped[r.competencia_nome]) {
              grouped[r.competencia_nome] = { total: 0, count: 0 };
            }
            grouped[r.competencia_nome].total += r.nota || 0;
            grouped[r.competencia_nome].count += 1;
          });

          const compList = Object.entries(grouped)
            .map(([nome, { total, count }]) => ({
              nome,
              media: Math.round((total / count) * 10) / 10,
              count,
            }))
            .sort((a, b) => b.media - a.media);

          setCompetencias(compList);
        }
      } catch (err) {
        console.error('RHView fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [empresaId]);

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <p style={styles.loadingText}>Carregando dados...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Painel RH / Diretoria</h2>

      {/* KPI Cards */}
      <div style={styles.kpiRow}>
        <KPICard
          label="Total Colaboradores"
          value={kpis.totalColaboradores}
          color={NAVY}
        />
        <KPICard
          label="Assessments Completados"
          value={kpis.assessmentsCompletados}
          color={TEAL}
        />
        <KPICard
          label="Nota Média"
          value={kpis.notaMedia.toFixed(1)}
          color={CYAN}
        />
      </div>

      {/* Competency Distribution */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Distribuição por Competência</h3>

        {competencias.length === 0 ? (
          <p style={styles.emptyText}>
            Nenhum dado de competência disponível ainda.
          </p>
        ) : (
          <div style={styles.chartContainer}>
            {competencias.map((comp) => (
              <div key={comp.nome} style={styles.barRow}>
                <span style={styles.barLabel}>{comp.nome}</span>
                <div style={styles.barTrack}>
                  <div
                    style={{
                      ...styles.barFill,
                      width: `${Math.min((comp.media / 5) * 100, 100)}%`,
                    }}
                  />
                </div>
                <span style={styles.barValue}>{comp.media}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KPICard({ label, value, color }) {
  return (
    <div style={{ ...styles.kpiCard, borderTopColor: color }}>
      <p style={styles.kpiValue}>{value}</p>
      <p style={styles.kpiLabel}>{label}</p>
    </div>
  );
}

const styles = {
  container: {
    padding: '24px',
    backgroundColor: '#f8fafc',
    minHeight: '100%',
  },
  title: {
    color: NAVY,
    fontSize: '24px',
    fontWeight: '700',
    marginBottom: '24px',
  },
  loadingContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '200px',
  },
  loadingText: {
    color: '#64748b',
    fontSize: '16px',
  },
  kpiRow: {
    display: 'flex',
    gap: '16px',
    marginBottom: '32px',
    flexWrap: 'wrap',
  },
  kpiCard: {
    flex: '1 1 200px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '20px',
    borderTop: '4px solid',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    textAlign: 'center',
  },
  kpiValue: {
    fontSize: '36px',
    fontWeight: '700',
    color: NAVY,
    margin: '0 0 4px',
  },
  kpiLabel: {
    fontSize: '14px',
    color: '#64748b',
    margin: '0',
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  sectionTitle: {
    color: NAVY,
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '16px',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: '14px',
  },
  chartContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  barRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  barLabel: {
    width: '200px',
    fontSize: '13px',
    color: NAVY,
    fontWeight: '500',
    flexShrink: 0,
  },
  barTrack: {
    flex: 1,
    height: '20px',
    backgroundColor: '#e2e8f0',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: CYAN,
    borderRadius: '4px',
    transition: 'width 0.5s ease',
  },
  barValue: {
    width: '40px',
    textAlign: 'right',
    fontSize: '14px',
    fontWeight: '600',
    color: NAVY,
    flexShrink: 0,
  },
};
