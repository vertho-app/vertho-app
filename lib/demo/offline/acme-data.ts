import panelsSnapshot from './panels-snapshot.json';
// Only the declared fictional ACME roster. Guests and live report prose never
// enter this bundle; the numeric snapshot is explicitly keyed to that roster.
import fixture from "../acme-demo-fixture.json";
import extra from "../acme-demo-extra-artifacts.json";
import snapshot from "./acme-content.json";
import { PERSONAS } from "../rosters/comercial";
import {
  ACME_DEMO_CARGOS_SO_LIDERANCA,
  ACME_DEMO_REPORT_DIRECTORY,
  ACME_DEMO_WITHOUT_PROFILE_KEYS,
} from "../acme-rh-report-fixture";
import { pdiDaJornada, pick } from "./data";
import { offlineEnvironment } from "./environment";
import { leiturasDoElenco } from "./leituras";
import type { OfflineData } from "./types";
import uiSnapshot from './ui-snapshot.json';

export function acmeOfflineData(): OfflineData {
  const roster = [...PERSONAS, ...ACME_DEMO_REPORT_DIRECTORY];
  const artifacts = fixture.personaArtifacts as Record<string, any>;
  const additional = extra.personaArtifacts as Record<string, any>;
  const people: OfflineData['people'] = roster.map((person) => {
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
  });
  // Gestor e RH pelo construtor da sala online: a distribuição por nível vem das notas
  // das 30 pessoas, e o texto não cita nota decimal (R-136).
  const ambiente = offlineEnvironment('acme-demo');
  // Cargo que só lidera não faz mapeamento (decisão de 16/09): o retrato de 15/09 ainda
  // guarda notas do Marcelo, e o reset de hoje não as grava. O relatório segue o reset.
  const soLidera = (cargo: string) => (ACME_DEMO_CARGOS_SO_LIDERANCA as readonly string[]).includes(cargo);
  const leituras = leiturasDoElenco(
    ambiente.name,
    roster.map((p) => ({ key: p.key, email: p.email, nome_completo: p.nome_completo, cargo: p.cargo, role: p.role, gestor_email: p.gestor_email })),
    Object.fromEntries(people.map((p) => [p.key, soLidera(p.role) ? [] : p.assessments])),
    ambiente.managerKey,
  );
  return {
    panels: panelsSnapshot['acme-demo'] as OfflineData['panels'],
    tracks: uiSnapshot['acme-demo'].tracks,
    capturedAt: snapshot.capturedAt,
    totalWeeks: snapshot.totalWeeks,
    weeks: snapshot.weeks,
    people,
    pdi: pdiDaJornada(artifacts["bruna.demo@vertho.ai"].pdi.conteudo),
    coordination: leituras.coordination,
    direction: leituras.direction,
  };
}
