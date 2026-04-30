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

  // Leitura determinística pra usar no glimpse (sem IA, rápido, sempre disponível)
  const leitura = leituraSaebEscola(escola, saeb);

  // Computa hipóteses de "sinais" simples a partir dos dados
  const sinais = computarSinais({ saeb, ideb, censo });

  return (
    <EscolaResultadoClient
      escola={escola}
      sinais={sinais}
      leituraResumo={leitura.resumo}
      temIdeb={ideb.length > 0}
      temCenso={!!censo}
      saebSnapshots={saeb.length}
    />
  );
}

type Sinal = {
  tipo: 'aprendizagem' | 'contexto' | 'oportunidade';
  titulo: string;
  preview: string;
};

function computarSinais({ saeb, ideb, censo }: { saeb: any[]; ideb: any[]; censo: any }): Sinal[] {
  const sinais: Sinal[] = [];

  // Sinal de aprendizagem — % nos níveis 0-1 do Saeb mais recente
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

  // Sinal de contexto — Ideb meta vs realizado
  if (ideb.length > 0) {
    const idebRecente = [...ideb].sort((a, b) => b.ano - a.ano)[0];
    if (idebRecente?.ideb != null && idebRecente?.meta != null) {
      if (idebRecente.ideb < idebRecente.meta) {
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

  return sinais.slice(0, 4);
}
