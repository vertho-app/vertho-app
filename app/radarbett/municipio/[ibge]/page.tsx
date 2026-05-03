import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { getMunicipio, getMunicipioBenchmarksMunicipal, getDispersaoMunicipal } from '@/lib/radar/queries';
import { leituraIcaMunicipio } from '@/lib/radar/leitura-deterministica';
import {
  getNarrativaRadarbettMunicipio,
  isLikelyBotRadarbett,
} from '@/lib/radar/ia-narrativa-radarbett';
import { MunicipioResultadoClient } from './client';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ ibge: string }> }): Promise<Metadata> {
  const { ibge } = await params;
  const m = await getMunicipio(ibge);
  if (!m) return { title: 'Município não encontrado' };
  const title = `${m.nome}/${m.uf} — Leitura inicial · Radar Vertho`;
  const description = `Leitura inicial baseada em dados públicos do INEP para a rede municipal de ${m.nome}/${m.uf}. Radar Vertho.`;
  return {
    title,
    description,
    alternates: { canonical: `https://radarbett.vertho.ai/municipio/${ibge}` },
    openGraph: { title, description, type: 'article' },
  };
}

export default async function MunicipioResultadoPage({
  params,
  searchParams,
}: {
  params: Promise<{ ibge: string }>;
  searchParams: Promise<{ demo?: string }>;
}) {
  const { ibge } = await params;
  const sp = await searchParams;
  const isDemo = sp?.demo === '1';
  // No glimpse radarbett, todos os agregados são da rede municipal
  // (Ideb, ENEM, ICA filtrados por rede=MUNICIPAL).
  // Benchmarks comparam apenas redes municipais entre cidade, microrregião,
  // UF e Brasil (MV diag_mv_municipio_metricas_municipal, migration 083).
  // Dispersão Ideb entre as escolas municipais alimenta o card de variabilidade.
  const [m, municipioBenchmarks, dispersao] = await Promise.all([
    getMunicipio(ibge, { filtrarRedeMunicipal: true }),
    getMunicipioBenchmarksMunicipal(ibge),
    getDispersaoMunicipal(ibge),
  ]);
  if (!m) return notFound();

  const leituraDet = leituraIcaMunicipio(m, m.ica || []);
  const sinais = computarSinaisMun(m);

  // Narrativa IA (gpt-5.4-mini → fallback Claude). Bot-aware: crawlers só leem cache.
  const userAgent = (await headers()).get('user-agent');
  const isBot = isLikelyBotRadarbett(userAgent);
  const narrativa = await getNarrativaRadarbettMunicipio(
    {
      ibge,
      nome: m.nome,
      uf: m.uf,
      totalEscolas: m.totalEscolas,
      redes: m.redes,
    },
    m.ica || [],
    {
      generateIfMissing: !isBot,
      ideb: m.ideb || [],
      enem: m.enem || [],
      fundeb: m.fundeb || [],
      vaar: m.vaar,
      receitaPrevista: m.receitaPrevista,
      pddeMunicipal: m.pddeMunicipal || [],
    },
  );
  const leituraResumo = narrativa.resumo && narrativa.resumo.length >= 40
    ? narrativa.resumo
    : leituraDet.resumo;

  // Stats: ICA mais recente da rede municipal (preferência), com benchmarks
  const icaList = m.ica || [];
  const icaRecente = [...icaList]
    .filter((i: any) => i.rede === 'MUNICIPAL' && i.taxa != null)
    .sort((a: any, b: any) => b.ano - a.ano)[0]
    || [...icaList].filter((i: any) => i.taxa != null).sort((a: any, b: any) => b.ano - a.ano)[0]
    || null;

  return (
    <MunicipioResultadoClient
      municipio={{
        ibge,
        nome: m.nome,
        uf: m.uf,
        totalEscolas: m.totalEscolas,
        redes: m.redes,
      }}
      sinais={sinais}
      leituraResumo={leituraResumo}
      narrativaModelo={narrativa.modelo_usado}
      icaStat={icaRecente ? {
        ano: icaRecente.ano,
        taxa: Number(icaRecente.taxa),
        totalEstado: icaRecente.total_estado != null ? Number(icaRecente.total_estado) : null,
        totalBrasil: icaRecente.total_brasil != null ? Number(icaRecente.total_brasil) : null,
      } : null}
      temIca={(m.ica || []).length > 0}
      temIdeb={(m.ideb || []).length > 0}
      temFundeb={(m.fundeb || []).length > 0 || !!m.vaar || !!m.receitaPrevista}
      initialUnlocked={isDemo}
      panorama={{
        ica: m.ica || [],
        ideb: m.ideb || [],
        enem: m.enem || [],
        fundeb: m.fundeb || [],
        vaar: m.vaar,
        receitaPrevista: m.receitaPrevista,
        totalEscolas: m.totalEscolas,
        redes: m.redes,
        benchmarks: municipioBenchmarks,
        dispersao,
      }}
    />
  );
}

type Sinal = {
  tipo: 'aprendizagem' | 'contexto' | 'oportunidade';
  titulo: string;
  preview: string;
};

function computarSinaisMun(m: any): Sinal[] {
  const sinais: Sinal[] = [];
  const ica = m.ica || [];

  // Sinal de aprendizagem — ICA
  const icaRecente = ica.filter((i: any) => i.taxa != null).sort((a: any, b: any) => b.ano - a.ano)[0];
  if (icaRecente) {
    if (icaRecente.taxa < 60) {
      sinais.push({
        tipo: 'aprendizagem',
        titulo: 'Alfabetização aquém do esperado',
        preview: `O ICA ${icaRecente.ano} indica que parcela relevante das crianças do 2º ano EF ainda não atingiu fluência esperada...`,
      });
    } else if (icaRecente.taxa >= 80) {
      sinais.push({
        tipo: 'aprendizagem',
        titulo: 'Alfabetização em ritmo acelerado',
        preview: `Indicadores de alfabetização ${icaRecente.ano} acima da média — há contexto pra consolidar boas práticas e expandir...`,
      });
    } else {
      sinais.push({
        tipo: 'aprendizagem',
        titulo: 'Alfabetização em desenvolvimento',
        preview: `Há espaço pra elevar o ICA ${icaRecente.ano}, com foco em formação docente continuada e mediação de leitura...`,
      });
    }
  }

  // Sinal de contexto — total de escolas + variabilidade implícita
  if (m.totalEscolas >= 5) {
    sinais.push({
      tipo: 'contexto',
      titulo: 'Variabilidade entre escolas da rede',
      preview: `Com ${m.totalEscolas} escolas, é provável que algumas performem melhor que outras em contextos similares — oportunidade de aprender com as melhores...`,
    });
  }

  // Sinal de contexto — FUNDEB / VAAR
  if (m.fundeb?.length > 0 || m.vaar) {
    sinais.push({
      tipo: 'contexto',
      titulo: 'Recursos federais e prontidão pedagógica',
      preview: `A leitura cruza FUNDEB/VAAR com sinais de gestão pedagógica — útil pra organizar evidências de prontidão...`,
    });
  }

  // Oportunidade Vertho
  sinais.push({
    tipo: 'oportunidade',
    titulo: 'Onde a Vertho pode apoiar',
    preview: `Priorização por risco entre escolas, formação de coordenadores pedagógicos, MentorIA pra educadores e dossiê de evidências da rede...`,
  });

  return sinais.slice(0, 4);
}
