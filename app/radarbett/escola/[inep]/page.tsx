import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getEscola } from '@/lib/radar/queries';
import { leituraSaebEscola } from '@/lib/radar/leitura-deterministica';
import { EscolaResultadoClient } from './client';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ inep: string }> }): Promise<Metadata> {
  const { inep } = await params;
  const r = await getEscola(inep);
  if (!r?.escola) return { title: 'Escola não encontrada' };
  const e = r.escola;
  const title = `${e.nome} — Leitura inicial · Radar Vertho`;
  const description = `Leitura inicial baseada em dados públicos do INEP para ${e.nome} (${e.municipio}/${e.uf}). Radar Vertho.`;
  return {
    title,
    description,
    alternates: { canonical: `https://radarbett.vertho.ai/escola/${inep}` },
    openGraph: { title, description, type: 'article' },
  };
}

export default async function EscolaResultadoPage({ params }: { params: Promise<{ inep: string }> }) {
  const { inep } = await params;
  const r = await getEscola(inep);
  if (!r?.escola) return notFound();
  const escola = r.escola;
  const saeb = r.saeb || [];
  const ideb = r.ideb || [];
  const censo = r.censo;
  const enem = r.enem || [];

  // Leitura determinística pra usar no glimpse (sem IA, rápido, sempre disponível)
  const leitura = leituraSaebEscola(escola, saeb);

  // Computa hipóteses de "sinais" simples a partir dos dados
  const sinais = computarSinais({ saeb, ideb, censo, enem });

  return (
    <EscolaResultadoClient
      escola={escola}
      sinais={sinais}
      leituraResumo={leitura.resumo}
      temIdeb={ideb.length > 0}
      temCenso={!!censo}
      temEnem={enem.length > 0}
      saebSnapshots={saeb.length}
    />
  );
}

type Sinal = {
  tipo: 'aprendizagem' | 'contexto' | 'oportunidade';
  titulo: string;
  preview: string;
};

function computarSinais({
  saeb, ideb, censo, enem,
}: { saeb: any[]; ideb: any[]; censo: any; enem: any[] }): Sinal[] {
  const sinais: Sinal[] = [];

  // === Aprendizagem (Saeb) — % nos níveis 0-1 do snapshot mais recente
  const saebRecente = [...saeb].sort((a, b) => b.ano - a.ano)[0];
  if (saebRecente?.distribuicao) {
    const pctN01 = (Number(saebRecente.distribuicao['0'] || 0) + Number(saebRecente.distribuicao['1'] || 0));
    if (pctN01 > 30) {
      sinais.push({
        tipo: 'aprendizagem',
        titulo: `Aprendizagem em ${saebRecente.disciplina === 'LP' ? 'Língua Portuguesa' : 'Matemática'} merece atenção`,
        preview: `Há um percentual relevante de estudantes nos níveis iniciais da escala Saeb ${saebRecente.ano}...`,
      });
    } else if (pctN01 < 15 && pctN01 > 0) {
      sinais.push({
        tipo: 'aprendizagem',
        titulo: `Aprendizagem em ritmo positivo`,
        preview: `Os indicadores mais recentes mostram concentração de estudantes nos níveis intermediários e altos...`,
      });
    }
  }

  // === ENEM — média geral do snapshot mais recente (3º EM)
  // Patamares aproximados das redes públicas: <500 baixo, 500-560 intermediário, ≥560 forte
  const enemRecente = [...(enem || [])].sort((a, b) => b.ano - a.ano)[0];
  if (enemRecente?.media_geral != null) {
    const m = Number(enemRecente.media_geral);
    if (m < 500) {
      sinais.push({
        tipo: 'aprendizagem',
        titulo: `Média ENEM ${enemRecente.ano} sinaliza gap em 3º EM`,
        preview: `Média geral abaixo do patamar de referência das redes públicas — preparação dos concluintes precisa de plano direcionado...`,
      });
    } else if (m >= 560) {
      sinais.push({
        tipo: 'aprendizagem',
        titulo: `Resultado forte no ENEM ${enemRecente.ano}`,
        preview: `Média geral acima da referência das redes públicas — boas práticas de preparação que valem ser documentadas...`,
      });
    } else {
      sinais.push({
        tipo: 'aprendizagem',
        titulo: `Desempenho ENEM ${enemRecente.ano} em patamar intermediário`,
        preview: `Média geral próxima da referência das redes públicas — espaço claro para fortalecer áreas específicas (ciências, redação, matemática)...`,
      });
    }
  }

  // === Contexto Ideb — prioridade: meta presente > tendência > patamar absoluto
  if (ideb.length > 0) {
    const ordenado = [...ideb].sort((a, b) => a.ano - b.ano);
    const idebRecente = ordenado[ordenado.length - 1];
    const idebMaisAntigo = ordenado[0];
    const v = idebRecente?.ideb != null ? Number(idebRecente.ideb) : null;

    if (v != null) {
      // P1: meta presente → comparar
      if (idebRecente?.meta != null) {
        if (v < Number(idebRecente.meta)) {
          sinais.push({
            tipo: 'contexto',
            titulo: 'Distância da meta oficial Ideb',
            preview: `O Ideb ${idebRecente.ano} ficou abaixo da meta INEP — há oportunidade de comparar evolução com escolas semelhantes...`,
          });
        } else {
          sinais.push({
            tipo: 'contexto',
            titulo: 'Meta Ideb atingida',
            preview: `O Ideb ${idebRecente.ano} atingiu ou superou a meta. A leitura completa cruza com pares socioeconomicamente similares...`,
          });
        }
      }
      // P2: 2+ snapshots de anos diferentes → tendência
      else if (
        idebMaisAntigo?.ideb != null &&
        ordenado.length >= 2 &&
        idebMaisAntigo.ano !== idebRecente.ano
      ) {
        const delta = v - Number(idebMaisAntigo.ideb);
        if (delta >= 0.5) {
          sinais.push({
            tipo: 'contexto',
            titulo: `Ideb em alta nos últimos anos`,
            preview: `Crescimento entre ${idebMaisAntigo.ano} e ${idebRecente.ano} — boas práticas a documentar e replicar...`,
          });
        } else if (delta <= -0.5) {
          sinais.push({
            tipo: 'contexto',
            titulo: `Queda no Ideb merece atenção`,
            preview: `Reversão de tendência entre ${idebMaisAntigo.ano} e ${idebRecente.ano} — diagnóstico pedagógico/gestor é prioridade...`,
          });
        } else {
          sinais.push({
            tipo: 'contexto',
            titulo: `Ideb estável em torno de ${v.toFixed(1)}`,
            preview: `Patamar mantido entre ${idebMaisAntigo.ano} e ${idebRecente.ano} — espaço para acelerar com formação contínua e MentorIA...`,
          });
        }
      }
      // P3: snapshot único sem meta → patamar absoluto
      else {
        if (v < 4) {
          sinais.push({
            tipo: 'contexto',
            titulo: `Ideb ${v.toFixed(1)} indica patamar baixo`,
            preview: `Ideb ${idebRecente.ano} abaixo de 4,0 — diagnóstico pedagógico/gestor é prioridade imediata...`,
          });
        } else if (v >= 5.5) {
          sinais.push({
            tipo: 'contexto',
            titulo: `Ideb ${v.toFixed(1)} é resultado forte`,
            preview: `Ideb ${idebRecente.ano} acima de 5,5 — boas práticas que merecem documentação e replicação...`,
          });
        } else {
          sinais.push({
            tipo: 'contexto',
            titulo: `Ideb ${v.toFixed(1)} em ${idebRecente.ano}`,
            preview: `Patamar intermediário — a leitura completa cruza com escolas semelhantes para apontar próximos passos...`,
          });
        }
      }
    }
  }

  // Sinal de contexto — Censo / infraestrutura
  if (censo) {
    const scores = [censo.score_basica, censo.score_pedagogica, censo.score_acessibilidade, censo.score_conectividade].filter((x) => x != null);
    const min = Math.min(...scores);
    if (min < 50 && scores.length >= 2) {
      sinais.push({
        tipo: 'contexto',
        titulo: 'Infraestrutura pedagógica abaixo do esperado',
        preview: `Pelo Censo Escolar mais recente, há dimensão de infraestrutura com score reduzido — leitura aprofundada explicita o gap...`,
      });
    }
  }

  // Oportunidade Vertho — sempre presente, varia conforme sinais detectados
  if (sinais.length > 0) {
    sinais.push({
      tipo: 'oportunidade',
      titulo: 'Onde a Vertho pode apoiar',
      preview: `Combinação de assessment de competências da equipe gestora, trilha de desenvolvimento docente e acompanhamento por MentorIA...`,
    });
  } else {
    sinais.push({
      tipo: 'oportunidade',
      titulo: 'Cenário positivo — fortalecimento de práticas',
      preview: `Há espaço pra consolidar boas práticas com PDIs estruturados, registro de evidências e formação contínua dos educadores...`,
    });
  }

  return sinais.slice(0, 5);
}
