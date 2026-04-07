'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase-browser';

const NAVY = '#0F2A4A';
const CYAN = '#00B4D8';
const TEAL = '#0D9488';

export default function ManagerView({ empresaId, areaDepartamento }) {
  const [loading, setLoading] = useState(true);
  const [membros, setMembros] = useState([]);
  const [competenciaMedias, setCompetenciaMedias] = useState([]);

  useEffect(() => {
    if (!empresaId) return;

    async function fetchData() {
      setLoading(true);
      const supabase = getSupabase();

      try {
        // Fetch team members filtered by department
        let query = supabase
          .from('colaboradores')
          .select('id, nome, email, cargo')
          .eq('empresa_id', empresaId);

        if (areaDepartamento) {
          query = query.eq('area_departamento', areaDepartamento);
        }

        const { data: team } = await query;
        const teamIds = (team || []).map((m) => m.id);

        // Fetch avaliacoes for team members
        const { data: avaliacoes } = await supabase
          .from('avaliacoes')
          .select('id, colaborador_id, status, nota_final')
          .in('colaborador_id', teamIds.length > 0 ? teamIds : ['__none__']);

        // Map avaliacao data onto team members
        const avalMap = {};
        (avaliacoes || []).forEach((a) => {
          if (
            !avalMap[a.colaborador_id] ||
            a.status === 'concluida'
          ) {
            avalMap[a.colaborador_id] = a;
          }
        });

        const enrichedTeam = (team || []).map((m) => {
          const aval = avalMap[m.id];
          return {
            ...m,
            status: aval ? aval.status : 'pendente',
            nota: aval ? aval.nota_final : null,
            avaliacaoId: aval ? aval.id : null,
          };
        });

        setMembros(enrichedTeam);

        // Fetch competency averages for the team
        const avalIds = (avaliacoes || [])
          .filter((a) => a.status === 'concluida')
          .map((a) => a.id);

        if (avalIds.length > 0) {
          const { data: compData } = await supabase
            .from('resultados_competencia')
            .select('competencia_nome, nota')
            .in('avaliacao_id', avalIds);

          if (compData && compData.length > 0) {
            const grouped = {};
            compData.forEach((r) => {
              if (!grouped[r.competencia_nome]) {
                grouped[r.competencia_nome] = { total: 0, count: 0 };
              }
              grouped[r.competencia_nome].total += r.nota || 0;
              grouped[r.competencia_nome].count += 1;
            });

            const list = Object.entries(grouped)
              .map(([nome, { total, count }]) => ({
                nome,
                media: Math.round((total / count) * 10) / 10,
              }))
              .sort((a, b) => b.media - a.media);

            setCompetenciaMedias(list);
          }
        }
      } catch (err) {
        console.error('ManagerView fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [empresaId, areaDepartamento]);

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <p style={styles.loadingText}>Carregando equipe...</p>
      </div>
    );
  }

  const statusLabel = (status) => {
    const map = {
      concluida: { text: 'Concluída', bg: '#dcfce7', color: '#166534' },
      em_andamento: { text: 'Em Andamento', bg: '#fef3c7', color: '#92400e' },
      pendente: { text: 'Pendente', bg: '#f1f5f9', color: '#64748b' },
    };
    return map[status] || map.pendente;
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Painel do Gestor</h2>
      {areaDepartamento && (
        <p style={styles.subtitle}>Departamento: {areaDepartamento}</p>
      )}

      {/* Team Members */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>
          Membros da Equipe ({membros.length})
        </h3>

        {membros.length === 0 ? (
          <p style={styles.emptyText}>Nenhum colaborador encontrado.</p>
        ) : (
          <div style={styles.table}>
            <div style={styles.tableHeader}>
              <span style={{ ...styles.cell, flex: 2 }}>Nome</span>
              <span style={{ ...styles.cell, flex: 2 }}>Cargo</span>
              <span style={{ ...styles.cell, flex: 1 }}>Status</span>
              <span style={{ ...styles.cell, flex: 1, textAlign: 'center' }}>
                Nota
              </span>
            </div>
            {membros.map((m) => {
              const st = statusLabel(m.status);
              return (
                <div key={m.id} style={styles.tableRow}>
                  <span style={{ ...styles.cell, flex: 2, fontWeight: '500' }}>
                    {m.nome}
                  </span>
                  <span
                    style={{ ...styles.cell, flex: 2, color: '#64748b' }}
                  >
                    {m.cargo || '—'}
                  </span>
                  <span style={{ ...styles.cell, flex: 1 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 10px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: '600',
                        backgroundColor: st.bg,
                        color: st.color,
                      }}
                    >
                      {st.text}
                    </span>
                  </span>
                  <span
                    style={{
                      ...styles.cell,
                      flex: 1,
                      textAlign: 'center',
                      fontWeight: '700',
                      color: NAVY,
                    }}
                  >
                    {m.nota != null ? m.nota.toFixed(1) : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Competency Averages */}
      <div style={{ ...styles.section, marginTop: '24px' }}>
        <h3 style={styles.sectionTitle}>Média por Competência</h3>

        {competenciaMedias.length === 0 ? (
          <p style={styles.emptyText}>
            Nenhum resultado de competência disponível.
          </p>
        ) : (
          <div style={styles.chartContainer}>
            {competenciaMedias.map((comp) => (
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
    marginBottom: '4px',
  },
  subtitle: {
    color: '#64748b',
    fontSize: '14px',
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
  table: {
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  tableHeader: {
    display: 'flex',
    backgroundColor: NAVY,
    padding: '12px 16px',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  tableRow: {
    display: 'flex',
    padding: '12px 16px',
    borderBottom: '1px solid #f1f5f9',
    alignItems: 'center',
    fontSize: '14px',
    color: NAVY,
  },
  cell: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
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
    backgroundColor: TEAL,
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
