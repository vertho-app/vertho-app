/* eslint-disable */
// Cria os DESCRITORES das duas competências foco do cargo Diretor(a) Escolar
// (Macaé), a partir da matriz oficial "Matriz de Competências - Gestores
// escolares.xlsx".
//
// POR QUE (medido 13/08): as competências dos diretores vieram do GAS em 14/05
// no formato antigo — UMA linha por competência, `cod_desc` NULL, sem
// descritores. Sem régua de descritor, cada avaliação da IA4 inventou os seus:
// `descriptor_assessments` tem 100+ descritores distintos para GERENCIAMENTO DE
// CONFLITOS, quase todos com UM colaborador cada ("Decisão proporcional com
// custo nomeado", "Decisão proporcional com consciência do custo", "Decisão com
// critério proporcional e custo reconhecido"…). Efeitos: comparação entre
// diretores impossível (cada um medido numa régua própria), Retrato de
// Competências com 100 linhas, e — o que trava a trilha — nenhuma célula
// (competência × descritor × DISC) com população para casar kit e módulo-base.
//
// A linha ANTIGA (cod_desc NULL) é PRESERVADA: `respostas.competencia_id`
// aponta para ela. As queries de régua filtram `cod_desc IS NOT NULL`, então
// passam a enxergar os descritores novos sem quebrar o vínculo histórico.
//
// Uso: npx tsx scripts/_seed-descritores-diretores.ts [--aplicar]
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';

const SLUG = 'macae';
const CARGO = 'Diretor(a) Escolar';
const APLICAR = process.argv.includes('--aplicar');

type Desc = { nome_curto: string; descritor_completo: string; n1: string; n2: string; n3: string; n4: string };
type Comp = { cod_comp: string; nome: string; pilar: string; descritores: Desc[] };

const MATRIZ: Comp[] = [
  {
    cod_comp: 'C007',
    nome: 'GERENCIAMENTO DE CONFLITOS',
    pilar: 'Socioemocional',
    descritores: [
      { nome_curto: 'Postura diante do conflito', descritor_completo: 'Aborda o conflito com objetividade e método, em vez de evitar ou impor.',
        n1: 'Evita ou reage de forma autoritária.', n2: 'Intervém sem método claro.', n3: 'Atua com objetividade e estrutura.', n4: 'Atua com excelência em conflitos complexos.' },
      { nome_curto: 'Neutralidade', descritor_completo: 'Mantém imparcialidade ativa entre as partes envolvidas.',
        n1: 'Toma partido.', n2: 'Neutralidade parcial.', n3: 'Neutralidade ativa.', n4: 'Referência em imparcialidade.' },
      { nome_curto: 'Escuta das partes', descritor_completo: 'Escuta todos os envolvidos de forma equilibrada antes de decidir.',
        n1: 'Escuta apenas um lado.', n2: 'Escuta ambos superficialmente.', n3: 'Escuta ativa e equilibrada.', n4: 'Escuta mediadora e restaurativa.' },
      { nome_curto: 'Identificação de causas', descritor_completo: 'Investiga o que originou o conflito em vez de tratar só o sintoma.',
        n1: 'Trata apenas o sintoma.', n2: 'Identifica causas imediatas.', n3: 'Investiga causas subjacentes.', n4: 'Atua preventivamente sobre padrões recorrentes.' },
      { nome_curto: 'Uso de CNV/mediação', descritor_completo: 'Emprega comunicação não violenta e técnicas de mediação na condução.',
        n1: 'Linguagem agressiva ou punitiva.', n2: 'Uso irregular de mediação.', n3: 'Mediação e CNV consistentes.', n4: 'Domínio avançado de práticas restaurativas.' },
      { nome_curto: 'Construção de soluções', descritor_completo: 'Constrói saídas com participação das partes, em vez de impor decisão.',
        n1: 'Impõe decisões.', n2: 'Soluções parcialmente negociadas.', n3: 'Soluções colaborativas.', n4: 'Soluções com impacto sistêmico.' },
      { nome_curto: 'Acompanhamento', descritor_completo: 'Acompanha o cumprimento dos acordos após o desfecho.',
        n1: 'Não acompanha acordos.', n2: 'Acompanhamento informal.', n3: 'Acompanhamento estruturado.', n4: 'Monitoramento contínuo e preventivo.' },
      { nome_curto: 'Aprendizado institucional', descritor_completo: 'Converte o conflito em aprendizado para a escola.',
        n1: 'Conflito gera desgaste.', n2: 'Aprendizado pontual.', n3: 'Conflito vira aprendizado.', n4: 'Conflito fortalece cultura escolar.' },
    ],
  },
  {
    cod_comp: 'C014',
    nome: 'CONSCIÊNCIA ORGANIZACIONAL E JURÍDICA',
    pilar: 'Excelência em Gestão',
    descritores: [
      { nome_curto: 'Conhecimento das normas', descritor_completo: 'Conhece e aplica as normas que regem a escola e a rede.',
        n1: 'Desconhece normas básicas.', n2: 'Conhecimento parcial.', n3: 'Conhece e aplica normas.', n4: 'Referência normativa.' },
      { nome_curto: 'Cumprimento legal', descritor_completo: 'Garante conformidade legal de forma consistente nos processos.',
        n1: 'Risco de não conformidade.', n2: 'Cumpre parcialmente.', n3: 'Cumpre normas de forma consistente.', n4: 'Antecipação e prevenção de riscos.' },
      { nome_curto: 'Direitos da criança e adolescente', descritor_completo: 'Assegura os direitos de crianças e adolescentes nas decisões.',
        n1: 'Desconsidera direitos.', n2: 'Considera parcialmente.', n3: 'Garante direitos.', n4: 'Promove cultura de proteção integral.' },
      { nome_curto: 'Tomada de decisão jurídica', descritor_completo: 'Fundamenta decisões em base legal, consultando quando necessário.',
        n1: 'Decisões sem base legal.', n2: 'Consulta pontual.', n3: 'Decisões fundamentadas.', n4: 'Decisões estratégicas e preventivas.' },
      { nome_curto: 'Gestão de riscos', descritor_completo: 'Identifica e gerencia riscos institucionais antes que se concretizem.',
        n1: 'Ignora riscos.', n2: 'Identifica riscos pontuais.', n3: 'Gerencia riscos.', n4: 'Gestão sistêmica de riscos.' },
      { nome_curto: 'Ética institucional', descritor_completo: 'Sustenta padrão ético consistente nas práticas da escola.',
        n1: 'Ética inconsistente.', n2: 'Ética situacional.', n3: 'Ética sólida.', n4: 'Cultura ética institucional.' },
      { nome_curto: 'Privacidade e segurança', descritor_completo: 'Protege dados e informações sensíveis da comunidade escolar.',
        n1: 'Falhas recorrentes.', n2: 'Atenção parcial.', n3: 'Garante segurança e privacidade.', n4: 'Excelência em proteção de dados.' },
      { nome_curto: 'Comunicação legal', descritor_completo: 'Comunica normas e decisões legais com clareza e responsabilidade.',
        n1: 'Comunicação confusa.', n2: 'Comunicação básica.', n3: 'Comunicação clara e responsável.', n4: 'Comunicação jurídica educativa.' },
    ],
  },
];

async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('id').eq('slug', SLUG).single();
  if (!emp) throw new Error('empresa não encontrada: ' + SLUG);
  const empresaId = (emp as any).id;

  for (const comp of MATRIZ) {
    const { data: existentes } = await sb.from('competencias')
      .select('id, cod_desc, nome_curto')
      .eq('empresa_id', empresaId).eq('cod_comp', comp.cod_comp);
    const jaTem = (existentes || []).filter((r: any) => r.cod_desc);
    console.log(`\n${comp.cod_comp} ${comp.nome}: ${existentes?.length || 0} linha(s), ${jaTem.length} com descritor`);

    const rows = comp.descritores.map((d, i) => ({
      empresa_id: empresaId,
      cargo: CARGO,
      nome: comp.nome,
      cod_comp: comp.cod_comp,
      cod_desc: `${comp.cod_comp}_D${i + 1}`,
      nome_curto: d.nome_curto,
      descritor_completo: d.descritor_completo,
      pilar: comp.pilar,
      n1_gap: d.n1,
      n2_desenvolvimento: d.n2,
      n3_meta: d.n3,
      n4_referencia: d.n4,
    }));

    for (const r of rows) console.log(`   ${r.cod_desc}  ${r.nome_curto}`);
    if (!APLICAR) continue;

    // Idempotente: já existe descritor com este cod_desc → atualiza; senão insere.
    for (const r of rows) {
      const achado = (existentes || []).find((e: any) => e.cod_desc === r.cod_desc);
      const q = achado
        ? await sb.from('competencias').update(r).eq('empresa_id', empresaId).eq('id', achado.id).select('id')
        : await sb.from('competencias').insert(r).select('id');
      if (q.error) console.error(`   ❌ ${r.cod_desc}: ${q.error.message}`);
    }
    console.log(`   ✅ ${rows.length} descritores gravados`);
  }

  if (!APLICAR) console.log('\n(dry-run — rode com --aplicar)');
}

main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
