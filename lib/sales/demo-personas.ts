// Personas dos Ambientes de Demonstração que o RC pode "assumir" para
// apresentar/treinar. Espelham o elenco semeado pelo reset
// (lib/demo/reset-acme-demo.ts).
//
// Módulo puro (sem 'use server') — a action demo-access.ts é 'use server' e só
// pode exportar funções async, então a lista vive aqui.
//
// 🔑 **O elenco é POR AMBIENTE.** Cada tenant demo tem o seu; uma lista única
// mandaria o vendedor entrar como uma persona que não existe naquele tenant, e
// o erro só apareceria depois do login ("Personas do demo não encontradas").

const ACME_DEMO_PERSONAS = [
  { key: 'bruna', email: 'bruna.demo@vertho.ai', nome: 'Bruna Costa',    papel: 'Colaboradora', cenario: 'Jornada completa', disc: 'CS', hint: 'Mostra a experiência completa do colaborador — trilha, Mentor IA, relatório e evolução.' },
  { key: 'ana',   email: 'ana.demo@vertho.ai',   nome: 'Ana Martins',    papel: 'Colaboradora', cenario: 'Início da jornada', disc: 'I',  hint: 'Ideal para mostrar o onboarding e os primeiros passos.' },
  { key: 'paulo', email: 'paulo.demo@vertho.ai', nome: 'Paulo Demo',     papel: 'Colaborador',  cenario: 'Jornada parcial',  disc: 'ID', hint: 'Meio da jornada — bom para mostrar progresso e diagnóstico.' },
  { key: 'carla', email: 'carla.demo@vertho.ai', nome: 'Carla Menezes',  papel: 'Gestora',      cenario: 'Visão de equipe',  disc: 'D',  hint: 'Visão de gestão — dashboards de equipe, ranking e adequação.' },
  { key: 'helena', email: 'helena.demo@vertho.ai', nome: 'Helena Duarte', papel: 'RH', cenario: 'Visão da empresa', disc: null, hint: 'Visão do RH — funil de participação, pontos de atenção, colaboradores, ranking e relatórios.' },
  { key: 'mariana', email: 'mariana.demo@vertho.ai', nome: 'Mariana Lopes', papel: 'Colaboradora', cenario: 'Início da jornada', disc: 'CS', hint: 'Cargo Financeiro — mostra que a plataforma vai além do comercial (diagnóstico e jornada em outra área).' },
  { key: 'renato',  email: 'renato.demo@vertho.ai',  nome: 'Renato Alves',  papel: 'Colaborador',  cenario: 'Início da jornada', disc: 'DS', hint: 'Cargo de Operações (liderança) — amplia a demo para RH/gestão fora de vendas.' },
] as const;

/**
 * Elenco por tenant demo. O Grupo Sinal recebe o MESMO roster do ACME (o reset
 * replica personas e artefatos; o que muda é a identidade da empresa), então
 * ele aponta para a mesma lista em vez de duplicá-la.
 */
export const DEMO_PERSONAS_POR_TENANT = {
  'acme-demo': ACME_DEMO_PERSONAS,
  gruposinal: ACME_DEMO_PERSONAS,
} as const;

export type DemoPersonaTenantSlug = keyof typeof DEMO_PERSONAS_POR_TENANT;

/** Elenco do ACME Demo — o ambiente neutro, padrão do portal. */
export const DEMO_PERSONAS = ACME_DEMO_PERSONAS;

export type DemoPersona = typeof ACME_DEMO_PERSONAS[number];

/**
 * Elenco do ambiente pedido. O slug chega do cliente (a action é um endpoint
 * HTTP), então a consulta é por allowlist explícita com `hasOwnProperty` —
 * `in` alcançaria `constructor`/`toString` e devolveria algo que não é elenco.
 */
export function personasDemoDoTenant(slug: string): readonly DemoPersona[] | null {
  if (!Object.prototype.hasOwnProperty.call(DEMO_PERSONAS_POR_TENANT, slug)) return null;
  return DEMO_PERSONAS_POR_TENANT[slug as DemoPersonaTenantSlug];
}
