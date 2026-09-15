// Build-time only. Explicit projection of the public, fictional school fixture.
// Never export users, credentials, production queries or assessment conversations.
import fixture from "../escolas-demo-fixture.json";
import { PERSONAS_ESCOLARES, DIRETORIO_ESCOLAR } from "../rosters/escolar";
import type { OfflineData, ReportValue } from "./types";

export const pick = (value: any, keys: string[]): Record<string, ReportValue> =>
  Object.fromEntries(
    keys.filter((key) => value?.[key] != null).map((key) => [key, value[key]]),
  );

export function schoolOfflineData(): OfflineData {
  const artifacts = fixture.personaArtifacts as Record<string, any>;
  const marina = artifacts["marina.demo@vertho.ai"];
  return {
    capturedAt: fixture._meta.capturedAt,
    totalWeeks: marina.trilha.row.temporada_plano.length,
    people: [...PERSONAS_ESCOLARES, ...DIRETORIO_ESCOLAR].map((person) => {
      const a = artifacts[person.email];
      return {
        key: person.key,
        name: person.nome_completo,
        role: person.cargo,
        unit: person.area_depto,
        manager: person.gestor_nome || null,
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
    }),
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
    pdi: pick(marina.pdi.conteudo, [
      "acolhimento",
      "resumo_geral",
      "competencias",
      "blueprint_objetivos",
      "mensagem_final",
    ]),
    coordination: pick(
      artifacts["renata.demo@vertho.ai"].relatorioGestor.conteudo,
      [
        "resumo_executivo",
        "ranking_atencao",
        "analise_por_competencia",
        "acoes",
        "mensagem_final",
      ],
    ),
    direction: pick(fixture.relatorioRh.conteudo, [
      "resumo_executivo",
      "competencias_criticas",
      "visao_por_cargo",
      "treinamentos_sugeridos",
      "plano_acao",
      "decisoes_chave",
      "mensagem_final",
    ]),
  };
}
