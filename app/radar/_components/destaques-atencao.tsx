import { Plus, AlertTriangle } from 'lucide-react';
import type {
  CensoInfra, EscolaBenchmarkRow, EscolaInfraSaeb, IdebSnapshot, SaebSnapshot,
} from '@/lib/radar/queries';

type Item = { tipo: 'destaque' | 'atencao'; titulo: string; texto: string; peso: number };

const ETAPA_LABEL: Record<string, string> = {
  '5_EF': '5º EF', '9_EF': '9º EF', '3_EM': '3º EM',
};

function classify(
  censo: CensoInfra | null,
  saeb: SaebSnapshot[],
  ideb: IdebSnapshot[],
  benchmarks: EscolaBenchmarkRow[],
  infraSaeb: EscolaInfraSaeb | null,
): Item[] {
  const out: Item[] = [];
  const micro = benchmarks.find((b) => b.scope === 'microrregiao');

  // --- INFRA (Censo) ---
  if (censo) {
    if ((censo.score_basica ?? 0) >= 75) {
      out.push({
        tipo: 'destaque', peso: 7,
        titulo: `Infra básica boa (${censo.score_basica!.toFixed(0)}/100)`,
        texto: 'Água, energia, esgoto, banheiros e destinação de lixo bem encaminhados.',
      });
    }
    if ((censo.score_basica ?? 100) < 30) {
      out.push({
        tipo: 'atencao', peso: 9,
        titulo: `Infra básica crítica (${censo.score_basica!.toFixed(0)}/100)`,
        texto: 'Lacunas em saneamento, energia ou banheiros. Pré-requisito para qualquer agenda pedagógica.',
      });
    }
    if ((censo.score_pedagogica ?? 100) < 25) {
      out.push({
        tipo: 'atencao', peso: 9,
        titulo: `Infra pedagógica crítica (${censo.score_pedagogica!.toFixed(0)}/100)`,
        texto: 'Faltam biblioteca funcional, laboratórios e área de leitura — impacta diretamente o ensino.',
      });
    } else if ((censo.score_pedagogica ?? 0) >= 70) {
      out.push({
        tipo: 'destaque', peso: 6,
        titulo: `Infra pedagógica forte (${censo.score_pedagogica!.toFixed(0)}/100)`,
        texto: 'Biblioteca, laboratórios e espaços de aprendizagem disponíveis.',
      });
    }
    if ((censo.score_acessibilidade ?? 100) < 25) {
      out.push({
        tipo: 'atencao', peso: 7,
        titulo: `Acessibilidade crítica (${censo.score_acessibilidade!.toFixed(0)}/100)`,
        texto: 'Rampas, corrimão e banheiros adaptados ausentes ou insuficientes.',
      });
    }
    if ((censo.score_conectividade ?? 0) >= 75) {
      out.push({
        tipo: 'destaque', peso: 5,
        titulo: `Conectividade sólida (${censo.score_conectividade!.toFixed(0)}/100)`,
        texto: 'Banda larga, internet pra alunos e infra de rede em padrão alto.',
      });
    } else if ((censo.score_conectividade ?? 100) < 25) {
      out.push({
        tipo: 'atencao', peso: 6,
        titulo: `Conectividade crítica (${censo.score_conectividade!.toFixed(0)}/100)`,
        texto: 'Sem internet relevante para uso pedagógico — limita acesso a conteúdos.',
      });
    }
  }

  // --- INFRA × SAEB QUADRANTE ---
  if (infraSaeb && infraSaeb.quadrante !== 'sem_dados') {
    if (infraSaeb.quadrante === 'q1_bem_servida_aprende') {
      out.push({
        tipo: 'destaque', peso: 8,
        titulo: 'Bem servida e bem-sucedida',
        texto: 'Infraestrutura acima da mediana nacional e nível 0 do Saeb abaixo — cenário virtuoso.',
      });
    } else if (infraSaeb.quadrante === 'q3_faz_mais_com_menos') {
      out.push({
        tipo: 'destaque', peso: 9,
        titulo: 'Faz mais com menos',
        texto: 'Apesar da infra abaixo da mediana, alunos no nível 0 abaixo da mediana — boas práticas a documentar.',
      });
    } else if (infraSaeb.quadrante === 'q4_dupla_vulnerabilidade') {
      out.push({
        tipo: 'atencao', peso: 10,
        titulo: 'Dupla vulnerabilidade',
        texto: 'Infra abaixo + nível 0 acima da mediana nacional. Demanda intervenção concomitante.',
      });
    } else if (infraSaeb.quadrante === 'q2_estrutura_resultado_baixo') {
      out.push({
        tipo: 'atencao', peso: 8,
        titulo: 'Estrutura ok, aprendizagem fraca',
        texto: 'Infra acima da mediana mas alunos no nível 0 acima — gargalo é pedagógico, não físico.',
      });
    }
  }

  // --- SAEB ---
  if (saeb.length && micro) {
    // Pega Saeb mais recente da etapa principal
    const counts: Record<string, number> = {};
    for (const s of saeb) counts[s.etapa] = (counts[s.etapa] || 0) + 1;
    const etapaPrincipal = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '5_EF';
    const etapaLow = etapaPrincipal.toLowerCase();
    const lpKey = `saeb_${etapaLow}_lp` as keyof EscolaBenchmarkRow;
    const matKey = `saeb_${etapaLow}_mat` as keyof EscolaBenchmarkRow;
    const microLp = micro[lpKey] as number | null;
    const microMat = micro[matKey] as number | null;

    const lpRecent = saeb.filter((s) => s.etapa === etapaPrincipal && s.disciplina === 'LP' && s.media_proficiencia != null)
      .sort((a, b) => b.ano - a.ano)[0];
    const matRecent = saeb.filter((s) => s.etapa === etapaPrincipal && s.disciplina === 'MAT' && s.media_proficiencia != null)
      .sort((a, b) => b.ano - a.ano)[0];

    if (lpRecent && microLp != null) {
      const diff = lpRecent.media_proficiencia! - microLp;
      if (diff >= 15) {
        out.push({
          tipo: 'destaque', peso: 8,
          titulo: `Saeb LP ${ETAPA_LABEL[etapaPrincipal]} acima da microrregião`,
          texto: `${lpRecent.media_proficiencia!.toFixed(0)} pts vs micro ${microLp.toFixed(0)} (+${diff.toFixed(0)} pts).`,
        });
      } else if (diff <= -15) {
        out.push({
          tipo: 'atencao', peso: 8,
          titulo: `Saeb LP ${ETAPA_LABEL[etapaPrincipal]} abaixo da microrregião`,
          texto: `${lpRecent.media_proficiencia!.toFixed(0)} pts vs micro ${microLp.toFixed(0)} (${diff.toFixed(0)} pts).`,
        });
      }
    }
    if (matRecent && microMat != null) {
      const diff = matRecent.media_proficiencia! - microMat;
      if (diff >= 15) {
        out.push({
          tipo: 'destaque', peso: 8,
          titulo: `Saeb Matemática ${ETAPA_LABEL[etapaPrincipal]} acima da microrregião`,
          texto: `${matRecent.media_proficiencia!.toFixed(0)} pts vs micro ${microMat.toFixed(0)} (+${diff.toFixed(0)} pts).`,
        });
      } else if (diff <= -15) {
        out.push({
          tipo: 'atencao', peso: 8,
          titulo: `Saeb Matemática ${ETAPA_LABEL[etapaPrincipal]} abaixo da microrregião`,
          texto: `${matRecent.media_proficiencia!.toFixed(0)} pts vs micro ${microMat.toFixed(0)} (${diff.toFixed(0)} pts).`,
        });
      }
    }

    // Concentração N0 LP
    if (lpRecent && lpRecent.distribuicao) {
      const n0 = Number(lpRecent.distribuicao['0']) || 0;
      if (n0 >= 50) {
        out.push({
          tipo: 'atencao', peso: 9,
          titulo: `${n0.toFixed(0)}% dos alunos no nível 0 em LP`,
          texto: `Mais da metade saindo do ${ETAPA_LABEL[etapaPrincipal]} sem domínio mínimo da disciplina.`,
        });
      }
    }

    // Participação Saeb
    if (lpRecent && lpRecent.taxa_participacao != null && lpRecent.taxa_participacao >= 90) {
      out.push({
        tipo: 'destaque', peso: 4,
        titulo: `Alta participação no Saeb (${lpRecent.taxa_participacao.toFixed(0)}%)`,
        texto: 'Engajamento dos estudantes na avaliação está acima da média nacional.',
      });
    }

    // Formação docente
    if (lpRecent && lpRecent.formacao_docente != null && lpRecent.formacao_docente < 50) {
      out.push({
        tipo: 'atencao', peso: 7,
        titulo: `Formação docente em ${lpRecent.formacao_docente.toFixed(0)}%`,
        texto: 'Pouco mais de 1 em cada 3 professores tem formação adequada à disciplina que leciona.',
      });
    }
  }

  // --- IDEB trend ---
  if (ideb.length >= 2) {
    const counts: Record<string, number> = {};
    for (const r of ideb) counts[r.etapa] = (counts[r.etapa] || 0) + 1;
    const etapa = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const series = ideb.filter((r) => r.etapa === etapa && r.ideb != null).sort((a, b) => a.ano - b.ano);
    if (series.length >= 2) {
      const first = series[0].ideb!;
      const last = series[series.length - 1].ideb!;
      const delta = last - first;
      if (delta <= -1) {
        out.push({
          tipo: 'atencao', peso: 9,
          titulo: `Queda de ${Math.abs(delta).toFixed(1)} pts no Ideb (${first.toFixed(1)} → ${last.toFixed(1)})`,
          texto: `Reversão de tendência entre ${series[0].ano} e ${series[series.length - 1].ano} — diagnóstico pedagógico imediato.`,
        });
      } else if (delta >= 0.5) {
        out.push({
          tipo: 'destaque', peso: 7,
          titulo: `Alta de ${delta.toFixed(1)} pts no Ideb (${first.toFixed(1)} → ${last.toFixed(1)})`,
          texto: `Crescimento entre ${series[0].ano} e ${series[series.length - 1].ano} — boas práticas confirmadas.`,
        });
      }
    }
  }

  return out.sort((a, b) => b.peso - a.peso);
}

export function DestaquesAtencao({
  censo, saeb, ideb, benchmarks, infraSaeb,
}: {
  censo: CensoInfra | null;
  saeb: SaebSnapshot[];
  ideb: IdebSnapshot[];
  benchmarks: EscolaBenchmarkRow[];
  infraSaeb: EscolaInfraSaeb | null;
}) {
  const items = classify(censo, saeb, ideb, benchmarks, infraSaeb);
  const destaques = items.filter((i) => i.tipo === 'destaque').slice(0, 4);
  const atencoes = items.filter((i) => i.tipo === 'atencao').slice(0, 4);

  if (destaques.length === 0 && atencoes.length === 0) return null;

  return (
    <section className="mb-12">
      <p className="text-[11px] tracking-[0.15em] uppercase font-bold mb-3" style={{ color: '#34c5cc' }}>
        Diagnóstico Rápido
      </p>
      <h2 className="text-white mb-3"
        style={{
          fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
          fontSize: 'clamp(24px, 3vw, 32px)',
          fontWeight: 600,
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
        }}>
        O que merece celebração — e o que precisa de ação
      </h2>
      <p className="text-white/60 mb-6 leading-relaxed" style={{ fontSize: 15, maxWidth: 720 }}>
        Sinais extraídos automaticamente dos indicadores oficiais, ordenados por relevância.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {destaques.length > 0 && (
          <div className="rounded-2xl p-7 border"
            style={{ background: 'rgba(22,163,74,0.08)', borderColor: 'rgba(22,163,74,0.25)' }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(22,163,74,0.2)', color: '#86efac' }}>
                <Plus size={18} strokeWidth={3} />
              </div>
              <div>
                <p className="text-[11px] tracking-[0.12em] uppercase font-bold" style={{ color: '#86efac' }}>
                  Destaques
                </p>
                <p className="text-[15px] font-bold text-white">Forças identificadas</p>
              </div>
            </div>
            <ul className="flex flex-col gap-3.5">
              {destaques.map((it, i) => (
                <li key={i} className="text-[14px] text-white/85 leading-relaxed pl-5 relative">
                  <span className="absolute left-0 font-bold" style={{ color: '#86efac' }}>+</span>
                  <strong className="text-white">{it.titulo}</strong> — {it.texto}
                </li>
              ))}
            </ul>
          </div>
        )}

        {atencoes.length > 0 && (
          <div className="rounded-2xl p-7 border"
            style={{ background: 'rgba(220,38,38,0.08)', borderColor: 'rgba(220,38,38,0.3)' }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(220,38,38,0.2)', color: '#fca5a5' }}>
                <AlertTriangle size={16} />
              </div>
              <div>
                <p className="text-[11px] tracking-[0.12em] uppercase font-bold" style={{ color: '#fca5a5' }}>
                  Pontos de Atenção
                </p>
                <p className="text-[15px] font-bold text-white">Prioridades para o gestor</p>
              </div>
            </div>
            <ul className="flex flex-col gap-3.5">
              {atencoes.map((it, i) => (
                <li key={i} className="text-[14px] text-white/85 leading-relaxed pl-5 relative">
                  <span className="absolute left-0 font-bold" style={{ color: '#fca5a5' }}>!</span>
                  <strong className="text-white">{it.titulo}</strong> — {it.texto}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
