/** Catálogo dos tutoriais genéricos. Não contém vídeos curriculares/nominais. */
export const TUTORIAIS_PLATAFORMA = {
  // Revisão de 10/09/2026: telas recapturadas (as antigas eram de 23/07 a 25/08 e o app
  // mudou) e narração regerada na voz atual do Beto. Os GUIDs anteriores continuam na
  // lista — `resolverVersaoTutorial` mantém `/v/<antigo>` funcionando para quem já
  // recebeu o link.
  discApp: { guid: 'e995bd4a-c620-460d-8628-94bdf8fc87b7', anteriores: ['980f3ac2-d821-4869-87f0-6100e7ce8167', '89812149-0c2e-4299-b1ba-3f27013aba25'] as string[] },
  discAjuda: { guid: '62e15c9e-fd34-419f-8297-e71c92dbb536', anteriores: ['95c94328-009e-47e9-9a18-7f60c3ef3d9b', 'a352dbdf-4515-45ba-8797-72f62798402c'] as string[] },
  jornada: { guid: '9e9178cc-ed79-49c6-a042-f505b33332b3', anteriores: ['64c4f43d-7c5d-4b1e-9433-725a1dddbf34'] as string[] },
  pdi: { guid: 'adcd3828-5b72-45a4-8f0d-5cc7a9812d58', anteriores: ['b8a4534e-326a-4ba4-b638-befc63294dda'] as string[] },
  aplicacao: { guid: '80f4da74-4384-419f-aab8-89ed346e7b5b', anteriores: [] as string[] },
  boasvindasUniAnchieta: { guid: '482e3eab-65bd-4e0d-98d6-1f2af6141071', anteriores: [] as string[] },
  boasvindasMacae: { guid: 'daeab47f-ffb7-4893-8ded-714b63b80c5a', anteriores: ['747c65a8-1764-46c0-95d4-f9fb40873341'] as string[] },
  /**
   * Boas-vindas GENÉRICO (10/09/2026) — o único sem nome de cliente, e por isso o
   * único que serve qualquer empresa nova. Os dois acima continuam porque já foram
   * enviados: os links estão em mensagens de WhatsApp que não dá para editar.
   */
  boasvindasGeral: { guid: '4f156a19-3517-40e1-86b4-4c170cf38899', anteriores: [] as string[] },
} as const;

/** Mantém /v/<GUID antigo> funcional, sem conceder acesso público por si só. */
export function resolverVersaoTutorial(id: string): string {
  const value = (id || '').toLowerCase();
  const entry = Object.values(TUTORIAIS_PLATAFORMA).find(t => t.guid === value || t.anteriores.includes(value));
  return entry?.guid || id;
}
