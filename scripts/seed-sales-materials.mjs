// Seed dos materiais/playbook iniciais do Portal do Representante.
// Idempotente: só insere se sales_materials estiver vazia.
// Rodar: node scripts/seed-sales-materials.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { sslSupabase } from './_pg-ssl.mjs';
const require = createRequire(import.meta.url);
const { Client } = require('pg');

const ENV = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const url = ENV.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (!url) { console.error('DATABASE_URL ausente'); process.exit(1); }

const MATERIAIS = [
  // Biblioteca de materiais
  { title: 'Pitch Vertho — apresentação institucional', category: 'material', segment: 'geral', description: 'Apresentação padrão da Vertho para primeira conversa: proposta de valor, módulos (Onboarding, Mentor IA, Pulso) e diferenciais.' },
  { title: 'Proposta padrão (modelo)', category: 'material', segment: 'geral', description: 'Modelo de proposta comercial aprovado — use o simulador do portal para gerar os valores e submeta para aprovação Vertho.' },
  { title: 'One-pager Mentor IA', category: 'material', segment: 'geral', description: 'Resumo de uma página do Mentor IA: jornada de desenvolvimento por competências com tutor de IA via WhatsApp.' },
  // Playbook por segmento
  { title: 'Playbook — Redes de ensino e secretarias', category: 'playbook', segment: 'rede_ensino', description: 'Como abordar redes municipais: ciclo orçamentário, decisores (secretário, diretor pedagógico), casos por porte de rede e cadência típica de 60-120 dias.' },
  { title: 'Playbook — Escolas privadas', category: 'playbook', segment: 'escola', description: 'Abordagem para escolas privadas: dor de retenção de talentos docentes, janela de decisão (out-dez), quem decide e o papel do mantenedor.' },
  { title: 'Playbook — Empresas (RH/T&D)', category: 'playbook', segment: 'empresa', description: 'Venda para RH corporativo: diagnóstico de competências por cargo, PDI automatizado e pulso de desenvolvimento como diferencial frente a LMS tradicionais.' },
  // Perguntas de diagnóstico
  { title: 'Roteiro de diagnóstico — primeira reunião', category: 'diagnostico', segment: 'geral', description: 'Perguntas-chave: Como vocês desenvolvem as competências das equipes hoje? Como medem evolução? O que acontece depois do treinamento? Quanto custa a rotatividade atual?' },
  { title: 'Qualificação BANT adaptada', category: 'diagnostico', segment: 'geral', description: 'Budget (orçamento de T&D/ano), Authority (quem assina), Need (dor mapeada), Timing (janela de decisão) — preencha na oportunidade para elevar o score de qualidade.' },
  // Objeções e respostas
  { title: 'Objeção: "Já temos plataforma de treinamento"', category: 'objecoes', segment: 'geral', description: 'Resposta: LMS entrega CONTEÚDO; a Vertho entrega DESENVOLVIMENTO — diagnóstico por competência, trilha individual e tutor de IA que acompanha a aplicação prática.' },
  { title: 'Objeção: "Não temos orçamento agora"', category: 'objecoes', segment: 'geral', description: 'Resposta: dimensionar o custo da inação (rotatividade, retrabalho, tempo de gestor) e oferecer piloto com escopo reduzido dentro da vigência de 12 meses.' },
  { title: 'Objeção: "IA não funciona para a nossa realidade"', category: 'objecoes', segment: 'geral', description: 'Resposta: o Mentor IA opera no WhatsApp (zero fricção de adoção) e os cenários são gerados a partir do contexto REAL do cargo e da instituição — mostrar case.' },
  // Políticas comerciais
  { title: 'Política comercial vigente do canal', category: 'politica', segment: 'geral', description: 'Comissões: 9% aquisição · 12% recorrente na vigência inicial · 6% renovação · 9%+12% expansão. Proteção de oportunidade: 90 dias a partir do registro validado. Descontos acima de 15% exigem análise de margem na aprovação.' },
  { title: 'Regras de proteção de oportunidade', category: 'politica', segment: 'geral', description: 'O registro formal (conta + contato + necessidade + evidência de interação) garante 90 dias de proteção. Renovações de proteção são avaliadas pela Vertho caso a caso mediante avanço demonstrado.' },
  // Cases
  { title: 'Case — Rede municipal (100+ colaboradores)', category: 'case', segment: 'rede_ensino', description: 'Diagnóstico de competências de gestores escolares, trilhas de 14 semanas com tutor de IA e relatórios de evolução por escola.' },
];

const client = new Client({ connectionString: url, ssl: sslSupabase() });
await client.connect();
try {
  const { rows } = await client.query('SELECT count(*)::int AS n FROM sales_materials');
  if (rows[0].n > 0) {
    console.log(`sales_materials já tem ${rows[0].n} registros — seed pulado (idempotente).`);
  } else {
    for (const m of MATERIAIS) {
      await client.query(
        'INSERT INTO sales_materials (title, category, segment, description, is_active) VALUES ($1,$2,$3,$4,true)',
        [m.title, m.category, m.segment, m.description],
      );
    }
    console.log(`${MATERIAIS.length} materiais inseridos.`);
  }
} finally {
  await client.end();
}
