import panelsSnapshot from './panels-snapshot.json';
// Only the declared fictional ACME roster. Guests and live report prose never
// enter this bundle; the numeric snapshot is explicitly keyed to that roster.
import fixture from "../acme-demo-fixture.json";
import extra from "../acme-demo-extra-artifacts.json";
import snapshot from "./acme-content.json";
import { PERSONAS } from "../rosters/comercial";
import {
  ACME_DEMO_REPORT_DIRECTORY,
  ACME_DEMO_WITHOUT_PROFILE_KEYS,
  criarRelatorioGestorAcmeDemo,
  criarRelatorioRhAcmeDemo,
} from "../acme-rh-report-fixture";
import { pick } from "./data";
import type { OfflineData } from "./types";
import uiSnapshot from './ui-snapshot.json';

export function acmeOfflineData(): OfflineData {
  const roster = [...PERSONAS, ...ACME_DEMO_REPORT_DIRECTORY];
  const artifacts = fixture.personaArtifacts as Record<string, any>;
  const additional = extra.personaArtifacts as Record<string, any>;
  const manager = PERSONAS.find((person) => person.key === "carla")!;
  return {
    panels: panelsSnapshot['acme-demo'] as OfflineData['panels'],
    tracks: uiSnapshot['acme-demo'].tracks,
    capturedAt: snapshot.capturedAt,
    totalWeeks: snapshot.totalWeeks,
    weeks: snapshot.weeks,
    people: roster.map((person) => {
      const artifact = {
        ...artifacts[person.email],
        ...additional[person.email],
      };
      const profileAvailable = !(
        ACME_DEMO_WITHOUT_PROFILE_KEYS as readonly string[]
      ).includes(person.key);
      return {
        key: person.key,
        name: person.nome_completo,
        role: person.cargo,
        unit: person.area_depto,
        manager: person.gestor_nome || null,
        details: Object.fromEntries(Object.entries(person).filter(([key, value]) => key.startsWith('comp_') && typeof value === 'number')) as Record<string, number>,
        profileAvailable,
        disc: [
          person.d_natural,
          person.i_natural,
          person.s_natural,
          person.c_natural,
        ],
        profile: ("perfil_dominante" in person
          ? person.perfil_dominante
          : "") as string,
        report: profileAvailable
          ? pick(artifact.report?.report_texts, [
              "sintese_perfil",
              "quadrante_D",
              "quadrante_I",
              "quadrante_S",
              "quadrante_C",
              "top5_forcas",
              "top5_desenvolver",
              "modo_de_trabalho",
              "relacoes_e_comunicacao",
            ])
          : {},
        assessments: snapshot.assessments[person.key] || [],
      };
    }),
    pdi: pick(artifacts["bruna.demo@vertho.ai"].pdi.conteudo, [
      "acolhimento",
      "resumo_geral",
      "competencias",
      "blueprint_objetivos",
      "mensagem_final",
      "perfil_comportamental",
      "resumo_desempenho",
      "trilha_mapa",
      "blueprint_conteudos",
    ]),
    coordination: pick(
      criarRelatorioGestorAcmeDemo(
        manager,
        roster.filter((person) => person.gestor_nome === manager.nome_completo),
      ),
      [
        "resumo_executivo",
        "ranking_atencao",
        "analise_por_competencia",
        "acoes",
        "mensagem_final",
      ],
    ),
    direction: pick(criarRelatorioRhAcmeDemo(), [
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
