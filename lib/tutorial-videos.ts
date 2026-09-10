/** Catálogo dos tutoriais genéricos. Não contém vídeos curriculares/nominais. */
export const TUTORIAIS_PLATAFORMA = {
  discApp: { guid: '980f3ac2-d821-4869-87f0-6100e7ce8167', anteriores: ['89812149-0c2e-4299-b1ba-3f27013aba25'] as string[] },
  discAjuda: { guid: '95c94328-009e-47e9-9a18-7f60c3ef3d9b', anteriores: ['a352dbdf-4515-45ba-8797-72f62798402c'] as string[] },
  jornada: { guid: '64c4f43d-7c5d-4b1e-9433-725a1dddbf34', anteriores: [] as string[] },
  pdi: { guid: 'b8a4534e-326a-4ba4-b638-befc63294dda', anteriores: [] as string[] },
  aplicacao: { guid: '80f4da74-4384-419f-aab8-89ed346e7b5b', anteriores: [] as string[] },
  boasvindasUniAnchieta: { guid: '482e3eab-65bd-4e0d-98d6-1f2af6141071', anteriores: [] as string[] },
  boasvindasMacae: { guid: '747c65a8-1764-46c0-95d4-f9fb40873341', anteriores: [] as string[] },
} as const;

/** Mantém /v/<GUID antigo> funcional, sem conceder acesso público por si só. */
export function resolverVersaoTutorial(id: string): string {
  const value = (id || '').toLowerCase();
  const entry = Object.values(TUTORIAIS_PLATAFORMA).find(t => t.guid === value || t.anteriores.includes(value));
  return entry?.guid || id;
}
