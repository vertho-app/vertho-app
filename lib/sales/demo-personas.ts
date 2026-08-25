// Personas do Ambiente de Demonstração (acme-demo) que o RC pode "assumir"
// para apresentar/treinar. Espelham o fixture (lib/demo/reset-acme-demo.ts).
//
// Módulo puro (sem 'use server') — a action demo-access.ts é 'use server' e só
// pode exportar funções async, então a lista vive aqui.

export const DEMO_PERSONAS = [
  { key: 'bruna', email: 'bruna.demo@vertho.ai', nome: 'Bruna Costa',    papel: 'Colaboradora', cenario: 'Jornada completa', disc: 'CS', hint: 'Mostra a experiência completa do colaborador — trilha, Mentor IA, relatório e evolução.' },
  { key: 'ana',   email: 'ana.demo@vertho.ai',   nome: 'Ana Martins',    papel: 'Colaboradora', cenario: 'Início da jornada', disc: 'I',  hint: 'Ideal para mostrar o onboarding e os primeiros passos.' },
  { key: 'paulo', email: 'paulo.demo@vertho.ai', nome: 'Paulo Demo',     papel: 'Colaborador',  cenario: 'Jornada parcial',  disc: 'ID', hint: 'Meio da jornada — bom para mostrar progresso e diagnóstico.' },
  { key: 'carla', email: 'carla.demo@vertho.ai', nome: 'Carla Menezes',  papel: 'Gestora',      cenario: 'Visão de equipe',  disc: 'D',  hint: 'Visão de gestão — dashboards de equipe, ranking e adequação.' },
  { key: 'helena', email: 'helena.demo@vertho.ai', nome: 'Helena Duarte', papel: 'RH', cenario: 'Visão da empresa', disc: null, hint: 'Visão do RH — funil de participação, pontos de atenção, colaboradores, ranking e relatórios.' },
  { key: 'mariana', email: 'mariana.demo@vertho.ai', nome: 'Mariana Lopes', papel: 'Colaboradora', cenario: 'Início da jornada', disc: 'CS', hint: 'Cargo Financeiro — mostra que a plataforma vai além do comercial (diagnóstico e jornada em outra área).' },
  { key: 'renato',  email: 'renato.demo@vertho.ai',  nome: 'Renato Alves',  papel: 'Colaborador',  cenario: 'Início da jornada', disc: 'DS', hint: 'Cargo de Operações (liderança) — amplia a demo para RH/gestão fora de vendas.' },
] as const;

export type DemoPersona = typeof DEMO_PERSONAS[number];
