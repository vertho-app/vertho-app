// Personas dos Ambientes de Demonstração que o RC pode "assumir" para
// apresentar/treinar. Espelham o elenco semeado pelo reset
// (lib/demo/reset-acme-demo.ts e lib/demo/rosters/).
//
// Módulo puro (sem 'use server') — a action demo-access.ts é 'use server' e só
// pode exportar funções async, então a lista vive aqui.
//
// 🔑 **O elenco é POR AMBIENTE.** Cada tenant demo tem o seu; uma lista única
// mandaria o vendedor entrar como uma persona que não existe naquele tenant, e
// o erro só apareceria depois do login ("Personas do demo não encontradas").
//
// A lista é escrita à mão, e não importada do roster: o roster escolar carrega
// a régua inteira de descritores. Quem segura a coerência (e-mail existe no
// elenco, casa de cada papel) é `tests/unit/sales-demo-personas-ambientes.test.ts`.

/**
 * Persona que o RC assume. `nextPath` é a casa do PAPEL no produto (gestor abre
 * a visão de equipe); ele não pode ser deduzido do rótulo, que muda por
 * ambiente ("Gestora" na empresa, "Coordenação" na escola).
 */
export type DemoPersona = {
  readonly key: string;
  readonly email: string;
  readonly nome: string;
  readonly papel: string;
  readonly cenario: string;
  readonly disc: string | null;
  readonly hint: string;
  readonly nextPath: '/dashboard' | '/dashboard/gestor';
};

const ACME_DEMO_PERSONAS: readonly DemoPersona[] = [
  { key: 'bruna', email: 'bruna.demo@vertho.ai', nome: 'Bruna Costa',    papel: 'Colaboradora', cenario: 'Jornada completa', disc: 'CS', nextPath: '/dashboard', hint: 'Mostra a experiência completa do colaborador — trilha, Mentor IA, relatório e evolução.' },
  { key: 'ana',   email: 'ana.demo@vertho.ai',   nome: 'Ana Martins',    papel: 'Colaboradora', cenario: 'Início da jornada', disc: 'I',  nextPath: '/dashboard', hint: 'Ideal para mostrar o onboarding e os primeiros passos.' },
  { key: 'paulo', email: 'paulo.demo@vertho.ai', nome: 'Paulo Demo',     papel: 'Colaborador',  cenario: 'Jornada parcial',  disc: 'ID', nextPath: '/dashboard', hint: 'Meio da jornada — bom para mostrar progresso e diagnóstico.' },
  { key: 'carla', email: 'carla.demo@vertho.ai', nome: 'Carla Menezes',  papel: 'Gestora',      cenario: 'Visão de equipe',  disc: 'D',  nextPath: '/dashboard/gestor', hint: 'Visão de gestão — dashboards de equipe, ranking e adequação.' },
  { key: 'helena', email: 'helena.demo@vertho.ai', nome: 'Helena Duarte', papel: 'RH', cenario: 'Visão da empresa', disc: null, nextPath: '/dashboard', hint: 'Visão do RH — funil de participação, pontos de atenção, colaboradores, ranking e relatórios.' },
  { key: 'mariana', email: 'mariana.demo@vertho.ai', nome: 'Mariana Lopes', papel: 'Colaboradora', cenario: 'Início da jornada', disc: 'CS', nextPath: '/dashboard', hint: 'Cargo Financeiro — mostra que a plataforma vai além do comercial (diagnóstico e jornada em outra área).' },
  { key: 'renato',  email: 'renato.demo@vertho.ai',  nome: 'Renato Alves',  papel: 'Colaborador',  cenario: 'Início da jornada', disc: 'DS', nextPath: '/dashboard', hint: 'Cargo de Operações (liderança) — amplia a demo para RH/gestão fora de vendas.' },
];

/**
 * Elenco da Rede de Escolas ACME (roster escolar). Os papéis usam o vocabulário
 * da sala de apresentação (Professor(a), Coordenação, Direção): ninguém numa
 * escola se reconhece como "gestor" ou "RH". A jornada completa é do professor;
 * coordenação e direção veem a equipe e administram o programa.
 */
const ESCOLAS_ACME_PERSONAS: readonly DemoPersona[] = [
  { key: 'marina', email: 'marina.demo@vertho.ai', nome: 'Marina Rocha', papel: 'Professor(a)', cenario: 'Jornada completa', disc: 'SI', nextPath: '/dashboard', hint: 'A experiência completa de quem dá aula: avaliação, trilha com conteúdo em vários formatos, prática e evolução.' },
  { key: 'paula', email: 'paula.demo@vertho.ai', nome: 'Paula Nakamura', papel: 'Professor(a)', cenario: 'Jornada parcial', disc: 'SC', nextPath: '/dashboard', hint: 'Meio da jornada: bom para mostrar diagnóstico e progresso.' },
  { key: 'tiago', email: 'tiago.demo@vertho.ai', nome: 'Tiago Andrade', papel: 'Professor(a)', cenario: 'Início da jornada', disc: 'D', nextPath: '/dashboard', hint: 'Ainda no começo: ideal para mostrar os primeiros passos do professor.' },
  { key: 'renata', email: 'renata.demo@vertho.ai', nome: 'Renata Coelho', papel: 'Coordenação', cenario: 'Visão de equipe', disc: 'SC', nextPath: '/dashboard/gestor', hint: 'A coordenação acompanha os professores da escola: engajamento, evolução de cada um e o desenvolvimento da Marina.' },
  { key: 'sergio', email: 'sergio.demo@vertho.ai', nome: 'Sérgio Bastos', papel: 'Coordenação', cenario: 'Visão de equipe', disc: 'IC', nextPath: '/dashboard/gestor', hint: 'Coordenação de outra unidade da rede. No ranking de aderência ele aparece como "Não recomendado" por uma premissa do cargo, mesmo com aderência alta: explique a régua antes de mostrar.' },
  { key: 'claudia', email: 'claudia.demo@vertho.ai', nome: 'Cláudia Amorim', papel: 'Direção', cenario: 'Visão da rede', disc: null, nextPath: '/dashboard', hint: 'A direção administra o programa: engajamento dos professores, evolução, aderência a cada função e a cultura da rede.' },
];

/**
 * Elenco por tenant demo. O Grupo Sinal recebe o MESMO roster do ACME (o reset
 * replica personas e artefatos; o que muda é a identidade da empresa), então
 * ele aponta para a mesma lista em vez de duplicá-la.
 */
export const DEMO_PERSONAS_POR_TENANT = {
  'acme-demo': ACME_DEMO_PERSONAS,
  gruposinal: ACME_DEMO_PERSONAS,
  'escolas-acme': ESCOLAS_ACME_PERSONAS,
} as const;

export type DemoPersonaTenantSlug = keyof typeof DEMO_PERSONAS_POR_TENANT;

/**
 * Ambientes que o portal do RC oferece, na ordem do seletor. O Grupo Sinal
 * fica de fora: é a mesma demonstração do ACME com outra identidade.
 */
export const AMBIENTES_DEMO_DO_RC = [
  { slug: 'acme-demo', rotulo: 'Empresa', descricao: 'ACME Demo: RH, gestores e colaboradores de uma empresa.' },
  { slug: 'escolas-acme', rotulo: 'Escolas', descricao: 'Rede de Escolas ACME: direção, coordenação e professores.' },
] as const satisfies ReadonlyArray<{ slug: DemoPersonaTenantSlug; rotulo: string; descricao: string }>;

/** Elenco do ACME Demo — o ambiente neutro, padrão do portal. */
export const DEMO_PERSONAS = ACME_DEMO_PERSONAS;

/**
 * Elenco do ambiente pedido. O slug chega do cliente (a action é um endpoint
 * HTTP), então a consulta é por allowlist explícita com `hasOwnProperty` —
 * `in` alcançaria `constructor`/`toString` e devolveria algo que não é elenco.
 */
export function personasDemoDoTenant(slug: string): readonly DemoPersona[] | null {
  if (!Object.prototype.hasOwnProperty.call(DEMO_PERSONAS_POR_TENANT, slug)) return null;
  return DEMO_PERSONAS_POR_TENANT[slug as DemoPersonaTenantSlug];
}
