export type OfflineTenant = "escolas-acme" | "acme-demo";
export type OfflineRole = "participant" | "manager" | "organization";

/** Sibling scopes: school bookmarks and existing caches remain valid. */
export function offlineEnvironment(tenant: OfflineTenant) {
  const school = tenant === "escolas-acme";
  return {
    tenant,
    base: school ? "/apresentacao-offline/" : "/apresentacao-offline-acme/",
    cachePrefix: school
      ? "vertho-escolas-offline-v1-"
      : "vertho-acme-offline-v1-",
    name: school ? "Rede de Escolas ACME" : "ACME Demo",
    title: school
      ? "Apresentação offline escolar"
      : "Apresentação offline ACME",
    roles: {
      participant: school ? "Professor(a)" : "Colaborador(a)",
      manager: school ? "Coordenação" : "Gestor(a)",
      organization: school ? "Direção" : "RH",
    },
    names: {
      participant: school ? "Marina Rocha" : "Bruna Costa",
      manager: school ? "Renata Coelho" : "Carla Menezes",
      organization: school ? "Cláudia Amorim" : "Helena Duarte",
    },
    participantKey: school ? "marina" : "bruna",
    managerKey: school ? "renata" : "carla",
    organizationReport: school ? "Panorama da rede" : "Panorama da empresa",
    organizationReportButton: school
      ? "Relatório da rede"
      : "Relatório da empresa",
    managerTitle: school
      ? "Desenvolvimento da equipe docente"
      : "Desenvolvimento da equipe comercial",
    managerEyebrow: school ? "ESCOLA ACME VILA NOVA" : "EQUIPE COMERCIAL",
    organizationEyebrow: school
      ? "DESENVOLVIMENTO PEDAGÓGICO"
      : "DESENVOLVIMENTO DE PESSOAS",
    managerIntro: school
      ? "Conhecer a equipe para apoiar cada professor."
      : "Conhecer a equipe para desenvolver cada pessoa.",
    organizationIntro: school
      ? "Uma visão integrada do desenvolvimento da rede."
      : "Uma visão integrada do desenvolvimento da empresa.",
    journeyIntro: school
      ? "Do planejamento à participação de todos em sala de aula."
      : "Da preparação à decisão: negociações com valor e próximos passos claros.",
    packageIntro: school
      ? "As três visões da escola, relatórios e as semanas 1 e 2 em vídeo, áudio, texto e case."
      : "Colaborador, gestor e RH, relatórios e as semanas 1 e 2 em vídeo, áudio, texto e case.",
    unitLabel: school
      ? "Unidades com participantes"
      : "Áreas com participantes",
    reportIntro: school
      ? "Leitura das prioridades e ações recomendadas para a escola."
      : "Leitura das prioridades e ações recomendadas para a empresa.",
  };
}

declare const __OFFLINE_TENANT__: OfflineTenant | undefined;
// Default only for unit tests and compatibility with the first school build.
export const ENVIRONMENT = offlineEnvironment(
  typeof __OFFLINE_TENANT__ === "undefined"
    ? "escolas-acme"
    : __OFFLINE_TENANT__!,
);
