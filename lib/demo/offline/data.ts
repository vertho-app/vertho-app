import panelsSnapshot from './panels-snapshot.json';
// Build-time only. Explicit projection of the public, fictional school fixture.
// Never export users, credentials, production queries or assessment conversations.
import fixture from "../escolas-demo-fixture.json";
import { PERSONAS_ESCOLARES, DIRETORIO_ESCOLAR } from "../rosters/escolar";
import type { OfflineData, ReportValue } from "./types";
import snapshot from './ui-snapshot.json';
import { tirarTravessaoDeValor } from '@/lib/ai-saida-sem-travessao';
import { adaptarPdiFixtureAoModo } from '../pdi-ao-modo';
import { offlineEnvironment } from './environment';
import { leiturasDoElenco } from './leituras';

export const pick = (value: any, keys: string[]): Record<string, ReportValue> =>
  Object.fromEntries(
    keys.filter((key) => value?.[key] != null).map((key) => [key, value[key]]),
  );

/** Tira a `nota_decimal` de onde ela estiver (`competencias[]` e `resumo_desempenho[]`): só o admin da Vertho a lê. */
function semNotaDecimal<T>(valor: T): T {
  if (Array.isArray(valor)) return valor.map(semNotaDecimal) as unknown as T;
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor).filter(([chave]) => chave !== 'nota_decimal').map(([chave, v]) => [chave, semNotaDecimal(v)]),
    ) as T;
  }
  return valor;
}

/**
 * O PDI do pacote: o conteúdo congelado da persona, ajustado à Jornada de 7 semanas
 * (o reset da sala online faz o mesmo antes de gravar), sem a nota decimal que o
 * fixture guarda ao lado do nível e sem o travessão que a IA usava como pausa. O
 * cliente só vê nível (decisão 1 da revisão de 02/10); o fixture foi capturado
 * quando o programa ainda tinha 14 semanas e antes da regra "sem travessão" (R-136,
 * R-57). O sanitizador é o mesmo que o produto aplica à saída da IA.
 */
export function pdiDaJornada(conteudo: any): Record<string, ReportValue> {
  const base = pick(conteudo, [
    "acolhimento",
    "resumo_geral",
    "competencias",
    "blueprint_objetivos",
    "mensagem_final",
    "perfil_comportamental",
    "resumo_desempenho",
    "trilha_mapa",
    "blueprint_conteudos",
  ]);
  return tirarTravessaoDeValor(adaptarPdiFixtureAoModo(semNotaDecimal(base), 'jornada'));
}

export function schoolOfflineData(): OfflineData {
  const artifacts = fixture.personaArtifacts as Record<string, any>;
  const marina = artifacts["marina.demo@vertho.ai"];
  const elenco = [...PERSONAS_ESCOLARES, ...DIRETORIO_ESCOLAR];
  const people: OfflineData['people'] = elenco.map((person) => {
      const a = artifacts[person.email];
      return {
        key: person.key,
        name: person.nome_completo,
        role: person.cargo,
        unit: person.area_depto,
        manager: person.gestor_nome || null,
        details: Object.fromEntries(Object.entries(person).filter(([key, value]) => key.startsWith('comp_') && typeof value === 'number')) as Record<string, number>,
        disc: [
          person.d_natural,
          person.i_natural,
          person.s_natural,
          person.c_natural,
        ],
        profile: ("perfil_dominante" in person
          ? person.perfil_dominante
          : "") as string,
        report: pick(a?.report?.report_texts, [
          "sintese_perfil",
          "quadrante_D",
          "quadrante_I",
          "quadrante_S",
          "quadrante_C",
          "top5_forcas",
          "top5_desenvolver",
          "modo_de_trabalho",
          "relacoes_e_comunicacao",
        ]),
        assessments: (a?.descriptor_assessments || []).map((item: any) => ({
          competency: item.competencia,
          descriptor: item.descritor,
          score: item.nota,
        })),
      };
  });
  // Gestor e RH pelo construtor da sala online, não pela prosa congelada do fixture (R-136).
  const ambiente = offlineEnvironment('escolas-acme');
  const leituras = leiturasDoElenco(
    ambiente.name,
    elenco.map((p) => ({ key: p.key, email: p.email, nome_completo: p.nome_completo, cargo: p.cargo, role: p.role, gestor_email: p.gestor_email })),
    Object.fromEntries(people.map((p) => [p.key, p.assessments])),
    ambiente.managerKey,
  );
  return {
    panels: panelsSnapshot['escolas-acme'] as OfflineData['panels'],
    tracks: {
      ...snapshot['escolas-acme'].tracks,
      marina: {
        status: marina.trilha.row.status,
        competencia_foco: marina.trilha.row.competencia_foco,
        programa_modo: marina.trilha.row.programa_modo,
        programa_config: marina.trilha.row.programa_config,
        data_inicio: marina.trilha.row.data_inicio,
        temporada_plano: marina.trilha.row.temporada_plano.map((week: any) => ({ semana: week.semana, tipo: week.tipo, competencia: week.competencia || null, descritor: week.descritor || null })),
        progresso: [],
      },
    },
    capturedAt: fixture._meta.capturedAt,
    totalWeeks: marina.trilha.row.temporada_plano.length,
    people,
    weeks: marina.trilha.row.temporada_plano.slice(0, 2).map((week: any) => ({
      number: week.semana,
      title: week.descritor,
      competency: week.competencia,
      challenge: week.conteudo.desafio_texto,
      evidence: week.conteudo.criterio_de_execucao,
      formats: [
        {
          key: "video",
          title: week.descritor,
          path: `media/semana-${week.semana}-video.mp4`,
        },
        ...Object.entries(week.conteudo.formatos_disponiveis).map(
          ([key, format]: [string, any]) => ({
            key,
            title: format.titulo.replace(/^🎧\s*/, ""),
            path: `media/semana-${week.semana}-${key}.${key === "audio" ? "mp3" : "pdf"}`,
          }),
        ),
      ],
    })),
    pdi: pdiDaJornada(marina.pdi.conteudo),
    coordination: leituras.coordination,
    direction: leituras.direction,
  };
}
