import { computeDiscCompetenciesNatural } from '@/lib/disc-competencias';
import { computeDna, type DnaAggregate, type NBucket } from '@/lib/dna-organizacional/aggregate';
import type { DnaNarrative } from '@/lib/dna-organizacional/narrative';
import {
  COMP_LABEL,
  computePerfilOrg,
  type PerfilOrg,
  type PerfilPorCargo,
} from '@/lib/perfil-organizacional/aggregate';

type DemoOrganizationPerson = {
  id: string;
  nome_completo: string;
  email?: string | null;
  cargo?: string | null;
  perfil_dominante?: string | null;
  d_natural?: number | null;
  i_natural?: number | null;
  s_natural?: number | null;
  c_natural?: number | null;
  [key: string]: unknown;
};

const COMPETENCIAS_ORGANIZACIONAIS = [
  {
    nome: 'Colaboração entre Áreas',
    descritores: [
      'Compartilha contexto e dependências antes de iniciar a execução',
      'Constrói acordos claros entre áreas com responsáveis e prazos',
      'Resolve divergências preservando o objetivo comum',
    ],
  },
  {
    nome: 'Foco no Cliente',
    descritores: [
      'Traduz necessidades do cliente em prioridades observáveis',
      'Equilibra velocidade, qualidade e impacto para o cliente',
      'Usa feedback do cliente para ajustar decisões e processos',
    ],
  },
  {
    nome: 'Execução com Responsabilidade',
    descritores: [
      'Transforma decisões em próximos passos verificáveis',
      'Sinaliza riscos e impedimentos com antecedência',
      'Acompanha o resultado e registra o aprendizado do ciclo',
    ],
  },
  {
    nome: 'Adaptabilidade e Aprendizado',
    descritores: [
      'Ajusta a rota diante de novas evidências sem perder o objetivo',
      'Experimenta novas abordagens em situações de baixa previsibilidade',
      'Converte erros e acertos em melhoria para o time',
    ],
  },
  {
    nome: 'Comunicação para Decisão',
    descritores: [
      'Apresenta fatos, critérios e recomendação de forma objetiva',
      'Adapta a mensagem ao público sem perder precisão',
      'Confirma entendimento, decisão e próximo passo combinado',
    ],
  },
] as const;

function hashDeterministico(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function numeroOu(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function enriquecerPessoaComportamental(person: DemoOrganizationPerson, index: number) {
  const D = numeroOu(person.d_natural, 42 + (index % 5) * 6);
  const I = numeroOu(person.i_natural, 38 + (index % 4) * 7);
  const S = numeroOu(person.s_natural, 45 + (index % 3) * 8);
  const C = numeroOu(person.c_natural, 40 + (index % 6) * 6);
  const competencias = computeDiscCompetenciesNatural({ D, I, S, C });
  const fallbackComps = Object.fromEntries(
    COMP_LABEL.map((competencia) => [
      competencia.key,
      numeroOu(person[competencia.key], Number(competencias[competencia.nome as keyof typeof competencias])),
    ]),
  );

  return {
    ...person,
    d_natural: D,
    i_natural: I,
    s_natural: S,
    c_natural: C,
    lid_executivo: numeroOu(person.lid_executivo, D / 2),
    lid_motivador: numeroOu(person.lid_motivador, I / 2),
    lid_metodico: numeroOu(person.lid_metodico, S / 2),
    lid_sistematico: numeroOu(person.lid_sistematico, C / 2),
    val_teorico: numeroOu(person.val_teorico, (C + S) / 2),
    val_estetico: numeroOu(person.val_estetico, (I + S) / 2),
    val_social: numeroOu(person.val_social, (I + S + C) / 3),
    val_politico: numeroOu(person.val_politico, (D + I) / 2),
    val_economico: numeroOu(person.val_economico, (D + C) / 2),
    val_religioso: numeroOu(person.val_religioso, (S + C) / 2),
    ...fallbackComps,
  };
}

export function criarPerfilOrganizacionalAcmeDemo(
  people: DemoOrganizationPerson[],
): PerfilOrg {
  const mapped = people
    .filter((person) => person.perfil_dominante && person.d_natural != null)
    .map(enriquecerPessoaComportamental)
    .sort((a, b) => a.nome_completo.localeCompare(b.nome_completo, 'pt-BR'));
  const profile = computePerfilOrg(mapped);
  const byRole = new Map<string, typeof mapped>();
  for (const person of mapped) {
    const role = String(person.cargo || '').trim() || '(sem cargo)';
    const group = byRole.get(role) || [];
    group.push(person);
    byRole.set(role, group);
  }
  const porCargo: PerfilPorCargo[] = [...byRole.entries()]
    .filter(([, group]) => group.length >= 3)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([cargo, group]) => ({ cargo, n: group.length, perfil: computePerfilOrg(group) }));

  return { ...profile, porCargo };
}

function bucketDaFaixa(value: number): { bucket: NBucket; nota: number; nivel: string } {
  if (value < 12) return { bucket: 'n1', nota: 1.4, nivel: 'inicial' };
  if (value < 43) return { bucket: 'n2', nota: 2.2, nivel: 'em_desenvolvimento' };
  if (value < 82) return { bucket: 'n3', nota: 3.2, nivel: 'proficiente' };
  return { bucket: 'n4', nota: 3.9, nivel: 'avancado' };
}

export function criarDnaOrganizacionalAcmeDemo(
  people: DemoOrganizationPerson[],
  mappedPersonIds: Set<string>,
): DnaAggregate {
  const mapped = people.filter((person) => mappedPersonIds.has(person.id));
  const assessments: any[] = [];
  const referencePeople = new Map<string, Set<string>>();
  const referenceBucket = new Map<string, NBucket>();

  for (const person of mapped) {
    for (const competence of COMPETENCIAS_ORGANIZACIONAIS) {
      let reachedReference = false;
      let topBucket: NBucket = 'n3';
      for (const descriptor of competence.descritores) {
        const band = bucketDaFaixa(hashDeterministico(`${person.id}|${competence.nome}|${descriptor}`) % 100);
        assessments.push({
          colaborador_id: person.id,
          competencia: competence.nome,
          descritor: descriptor,
          nota: band.nota,
          nivel: band.nivel,
        });
        if (band.bucket === 'n3' || band.bucket === 'n4') reachedReference = true;
        if (band.bucket === 'n4') topBucket = 'n4';
      }
      if (reachedReference) {
        const role = String(person.cargo || '').trim() || '(sem cargo)';
        const key = `${role}|||${competence.nome}`;
        const ids = referencePeople.get(key) || new Set<string>();
        ids.add(person.id);
        referencePeople.set(key, ids);
        if (topBucket === 'n4' || referenceBucket.get(key) !== 'n4') referenceBucket.set(key, topBucket);
      }
    }
  }

  const dna = computeDna(assessments, people.length);
  const referencias = [...referencePeople.entries()]
    .map(([key, ids]) => {
      const [cargo, competencia] = key.split('|||');
      return {
        cargo,
        competencia,
        pessoas: ids.size,
        bucketTopo: referenceBucket.get(key) || ('n3' as NBucket),
      };
    })
    .sort((a, b) => b.pessoas - a.pessoas || a.cargo.localeCompare(b.cargo, 'pt-BR'))
    .slice(0, 8);

  return { ...dna, referencias };
}

export function criarNarrativaDnaAcmeDemo(dna: DnaAggregate): DnaNarrative {
  const strengths = dna.forcas.slice(0, 3);
  const gaps = dna.topGaps.slice(0, 3);
  const references = (dna.referencias || []).slice(0, 3);

  return {
    intro: `Este retrato consolida ${dna.totalAvaliacoes} evidências de ${dna.avaliados} profissionais da ACME Demo. A leitura é coletiva e anônima: mostra padrões que ajudam a organização a decidir onde preservar forças e onde concentrar desenvolvimento. Os dados simulam um ciclo real de demonstração e são coerentes com o panorama executivo do tenant.`,
    forcas: strengths.map((strength, index) => ({
      titulo: index === 0 ? 'Base consistente para evoluir' : index === 1 ? 'Comportamento já observável' : 'Referências internas disponíveis',
      destaque: `${strength.pct}% em N3/N4`,
      descricao: `${strength.descritor}, em ${strength.competencia}, aparece como uma prática presente no grupo e pode servir de ponto de apoio para o próximo ciclo.`,
      reforco: 'O avanço ganha escala quando a organização transforma essa força em exemplo, ritual e reconhecimento.',
    })),
    leituraGeral: `A distribuição combina ${dna.distGeralPct.n3 + dna.distGeralPct.n4}% das evidências em nível de meta ou referência com ${dna.distGeralPct.n1 + dna.distGeralPct.n2}% ainda em consolidação. O desafio não é começar do zero, e sim tornar os comportamentos desejados mais consistentes entre áreas e situações de pressão.`,
    padroes: [
      {
        titulo: 'Clareza acelera a execução',
        texto: 'Os melhores resultados aparecem quando decisão, responsável, prazo e evidência esperada ficam explícitos. Sem esse fechamento, a equipe tende a compensar ambiguidades com urgência e retrabalho.',
      },
      {
        titulo: 'A aprendizagem ainda depende da cadência',
        texto: 'Há repertório no grupo, mas a evolução varia conforme a frequência das conversas e dos registros. Uma rotina curta de revisão pode reduzir essa diferença entre áreas.',
      },
    ],
    prioridades: gaps.map((gap) => ({
      descritor: gap.descritor,
      competencia: gap.competencia,
      dado: `${gap.n1pct}% em N1`,
      porque: 'É um comportamento com impacto direto sobre previsibilidade, cooperação e qualidade das decisões.',
      acao: 'Praticar em uma situação real por semana e revisar a evidência com a liderança.',
    })),
    acoes: [
      {
        titulo: 'Fechar reuniões com acordos verificáveis',
        quando: 'Reuniões de time e entre áreas',
        quem: 'Lideranças e equipes',
        resultado: '100% das decisões prioritárias com responsável, prazo e evidência esperada.',
      },
      {
        titulo: 'Usar uma competência foco por área',
        quando: 'Conversas quinzenais de desenvolvimento',
        quem: 'Gestores e participantes',
        resultado: 'Cada pessoa com uma aplicação real registrada e um feedback objetivo.',
      },
      {
        titulo: 'Compartilhar práticas que já funcionam',
        quando: 'Ritual mensal de aprendizagem',
        quem: 'Profissionais referência',
        resultado: 'Três exemplos replicáveis documentados e testados por outras áreas.',
      },
    ],
    profissionaisReferencia: references.length
      ? `${references.map((reference) => `${reference.pessoas} profissionais de ${reference.cargo} em ${reference.competencia}`).join('; ')}. Esses grupos podem atuar como ponte para acelerar a prática, sempre preservando o caráter anônimo deste diagnóstico.`
      : 'O grupo ainda não apresenta referências consolidadas em N3/N4. Isso define um ponto de partida claro para o primeiro ciclo de prática e acompanhamento.',
    fecho: 'O diagnóstico não encerra a conversa; ele organiza o próximo passo. Com foco, evidência e uma cadência simples de acompanhamento, a ACME Demo pode transformar capacidade já existente em um padrão organizacional mais previsível e sustentável.',
  };
}

export const ACME_DEMO_ORGANIZATION_COMPETENCIES = COMPETENCIAS_ORGANIZACIONAIS;
