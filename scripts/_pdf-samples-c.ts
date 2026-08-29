/**
 * INTERNO / não-versionar: gera 2 PDFs coletivos (DNA Retrato de Competências +
 * Perfil Organizacional DISC) com dados fictícios BEM populados, pra
 * padronização de look-and-feel. Salva em ~/Downloads/vertho-pdf-samples.
 * Rodar de nextjs-app:  DEBUG=1 npx --yes tsx scripts/_pdf-samples-c.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DnaAggregate, CompetenciaStat, Dist, NBucket } from '@/lib/dna-organizacional/aggregate';
import type { DnaNarrative } from '@/lib/dna-organizacional/narrative';
import type { PerfilOrg, DiscMedia, CompStat, PessoaDisc, Fator } from '@/lib/perfil-organizacional/aggregate';
import { COMP_LABEL, FATOR_NOME, FATOR_FOCO, destaquesBipolares } from '@/lib/perfil-organizacional/aggregate';

const OUT = (process.env.PDF_OUT || path.join(os.homedir(), 'Downloads', 'vertho-pdf-samples'));
fs.mkdirSync(OUT, { recursive: true });

async function save(nome: string, bytes: Uint8Array | Buffer) {
  const p = path.join(OUT, `${nome}.pdf`);
  fs.writeFileSync(p, Buffer.from(bytes));
  console.log('OK', nome, ((Buffer.from(bytes).length / 1024) | 0) + 'KB');
}

const pctOf = (d: Dist): Dist => {
  const t = d.n1 + d.n2 + d.n3 + d.n4 || 1;
  return { n1: Math.round((d.n1 / t) * 100), n2: Math.round((d.n2 / t) * 100), n3: Math.round((d.n3 / t) * 100), n4: Math.round((d.n4 / t) * 100) };
};

// ───────────────────────────── DNA (Retrato de Competências) ─────────────────
function buildDna(): DnaAggregate {
  // 6 competências; cada uma com descritores (pct N1-N4 somando 100) e média.
  const defs: { nome: string; media: number; descritores: { descritor: string; pct: Dist; media: number }[] }[] = [
    {
      nome: 'Comunicação Assertiva', media: 1.9,
      descritores: [
        { descritor: 'Dá feedback direto e respeitoso', pct: { n1: 46, n2: 30, n3: 18, n4: 6 }, media: 1.84 },
        { descritor: 'Escuta ativa em conversas difíceis', pct: { n1: 38, n2: 34, n3: 20, n4: 8 }, media: 1.98 },
        { descritor: 'Comunica decisões com clareza', pct: { n1: 30, n2: 32, n3: 28, n4: 10 }, media: 2.18 },
        { descritor: 'Adapta a mensagem ao público', pct: { n1: 52, n2: 26, n3: 16, n4: 6 }, media: 1.76 },
      ],
    },
    {
      nome: 'Gestão de Conflitos', media: 1.7,
      descritores: [
        { descritor: 'Media divergências entre pares', pct: { n1: 58, n2: 24, n3: 12, n4: 6 }, media: 1.66 },
        { descritor: 'Mantém a calma sob pressão', pct: { n1: 44, n2: 30, n3: 18, n4: 8 }, media: 1.90 },
        { descritor: 'Busca o interesse comum', pct: { n1: 50, n2: 30, n3: 14, n4: 6 }, media: 1.76 },
        { descritor: 'Aborda tensões cedo', pct: { n1: 62, n2: 22, n3: 12, n4: 4 }, media: 1.58 },
      ],
    },
    {
      nome: 'Pensamento Analítico', media: 2.4,
      descritores: [
        { descritor: 'Estrutura problemas complexos', pct: { n1: 24, n2: 34, n3: 30, n4: 12 }, media: 2.30 },
        { descritor: 'Decide com base em dados', pct: { n1: 18, n2: 30, n3: 34, n4: 18 }, media: 2.52 },
        { descritor: 'Identifica causas-raiz', pct: { n1: 26, n2: 32, n3: 28, n4: 14 }, media: 2.30 },
        { descritor: 'Antecipa riscos', pct: { n1: 22, n2: 30, n3: 32, n4: 16 }, media: 2.42 },
      ],
    },
    {
      nome: 'Orientação a Resultados', media: 2.6,
      descritores: [
        { descritor: 'Define metas claras', pct: { n1: 16, n2: 28, n3: 36, n4: 20 }, media: 2.60 },
        { descritor: 'Prioriza o que gera impacto', pct: { n1: 14, n2: 26, n3: 38, n4: 22 }, media: 2.68 },
        { descritor: 'Acompanha indicadores', pct: { n1: 20, n2: 30, n3: 32, n4: 18 }, media: 2.48 },
        { descritor: 'Corrige rota rapidamente', pct: { n1: 18, n2: 28, n3: 34, n4: 20 }, media: 2.56 },
      ],
    },
    {
      nome: 'Colaboração', media: 2.9,
      descritores: [
        { descritor: 'Compartilha conhecimento', pct: { n1: 10, n2: 24, n3: 40, n4: 26 }, media: 2.82 },
        { descritor: 'Apoia colegas espontaneamente', pct: { n1: 8, n2: 22, n3: 42, n4: 28 }, media: 2.90 },
        { descritor: 'Constrói acordos entre áreas', pct: { n1: 14, n2: 26, n3: 36, n4: 24 }, media: 2.70 },
        { descritor: 'Celebra conquistas do time', pct: { n1: 6, n2: 20, n3: 40, n4: 34 }, media: 3.02 },
      ],
    },
    {
      nome: 'Adaptabilidade', media: 2.2,
      descritores: [
        { descritor: 'Lida bem com mudanças de plano', pct: { n1: 30, n2: 32, n3: 26, n4: 12 }, media: 2.20 },
        { descritor: 'Aprende com o erro', pct: { n1: 24, n2: 30, n3: 30, n4: 16 }, media: 2.38 },
        { descritor: 'Experimenta novas abordagens', pct: { n1: 34, n2: 30, n3: 24, n4: 12 }, media: 2.14 },
        { descritor: 'Mantém foco na incerteza', pct: { n1: 38, n2: 30, n3: 22, n4: 10 }, media: 2.04 },
      ],
    },
  ];

  const competencias: CompetenciaStat[] = defs.map((cd) => {
    const descritores = [...cd.descritores]
      .sort((a, b) => b.pct.n1 - a.pct.n1)
      .map((d) => ({ descritor: d.descritor, media: d.media, totalColabs: 32, pct: d.pct }));
    // pct agregado da competência = média simples das distribuições dos descritores
    const agg: Dist = { n1: 0, n2: 0, n3: 0, n4: 0 };
    descritores.forEach((d) => { agg.n1 += d.pct.n1; agg.n2 += d.pct.n2; agg.n3 += d.pct.n3; agg.n4 += d.pct.n4; });
    const cnt = descritores.length;
    const cp: Dist = { n1: Math.round(agg.n1 / cnt), n2: Math.round(agg.n2 / cnt), n3: Math.round(agg.n3 / cnt), n4: Math.round(agg.n4 / cnt) };
    const oport = { descritor: descritores[0].descritor, n1pct: descritores[0].pct.n1 };
    const best = [...descritores].sort((a, b) => (b.pct.n3 + b.pct.n4) - (a.pct.n3 + a.pct.n4))[0];
    const forca = { descritor: best.descritor, nivelPct: best.pct.n3 + best.pct.n4, bucket: (best.pct.n4 >= best.pct.n3 ? 'n4' : 'n3') as NBucket };
    return { nome: cd.nome, media: cd.media, prioridade: cd.media < 2.0, pct: cp, descritores, forca, oportunidade: oport };
  }).sort((a, b) => a.media - b.media);

  // topGaps + forcas derivados
  const topGaps: DnaAggregate['topGaps'] = [];
  const forcas: DnaAggregate['forcas'] = [];
  for (const c of competencias) {
    for (const d of c.descritores) {
      topGaps.push({ competencia: c.nome, descritor: d.descritor, n1pct: d.pct.n1, media: d.media });
      if (d.pct.n3 + d.pct.n4 > 0) forcas.push({ competencia: c.nome, descritor: d.descritor, bucket: (d.pct.n4 >= d.pct.n3 ? 'n4' : 'n3'), pct: d.pct.n3 + d.pct.n4 });
    }
  }
  topGaps.sort((a, b) => b.n1pct - a.n1pct || a.media - b.media);
  forcas.sort((a, b) => b.pct - a.pct);

  const distGeralPct: Dist = { n1: 30, n2: 29, n3: 28, n4: 13 };
  const distGeral = { n1: 231, n2: 223, n3: 215, n4: 99, total: 768 };

  return {
    totalColaboradores: 38,
    avaliados: 32,
    participacaoPct: 84,
    totalAvaliacoes: 768,
    distGeral,
    distGeralPct,
    competencias,
    topGaps: topGaps.slice(0, 8),
    forcas: forcas.slice(0, 8),
    semDados: false,
  };
}

const dnaNarrativa: DnaNarrative = {
  intro:
    'Este Retrato de Competências consolida 768 avaliações de descritores realizadas por 32 dos 38 profissionais da equipe (84% de participação). O objetivo é oferecer uma leitura coletiva, anônima e honesta de onde estamos hoje — celebrando o que já é força e nomeando, sem culpar, os degraus que temos pela frente. Nenhuma pessoa é identificada; o retrato é do grupo.',
  forcas: [
    { titulo: 'Espírito de time consolidado', destaque: '66% em N3/N4', descricao: 'Colaboração é a competência mais madura do grupo, com dois terços da equipe atuando no nível meta ou de referência. O apoio espontâneo entre colegas e a celebração de conquistas já fazem parte da cultura.', reforco: 'Uma base sólida sobre a qual construir tudo o mais.' },
    { titulo: 'Foco no que importa', destaque: '60% em N3/N4', descricao: 'Orientação a Resultados aparece como segunda força: o grupo define metas claras e prioriza o que gera impacto. A disciplina de acompanhar indicadores está em ascensão.', reforco: 'Direcionamento que sustenta a entrega mesmo sob pressão.' },
    { titulo: 'Participação genuína', destaque: '84% de adesão', descricao: 'A alta taxa de participação no diagnóstico revela abertura para o autoconhecimento e disposição para evoluir. Diagnósticos assim só funcionam quando a equipe se engaja de verdade.', reforco: 'Engajamento é o combustível de qualquer plano de desenvolvimento.' },
  ],
  leituraGeral:
    'A distribuição geral (N1=30%, N2=29%, N3=28%, N4=13%) mostra um grupo em transição: quase 60% ainda está nos dois primeiros níveis, mas há um núcleo relevante já em prática consistente. A tensão central está nas competências relacionais sob pressão — comunicação e conflitos — que puxam a média para baixo justamente onde o impacto no dia a dia é mais sentido. O caminho é converter a energia colaborativa que já existe em conversas mais francas e diretas.',
  padroes: [
    { titulo: 'O silêncio antes do conflito', texto: 'Os maiores gaps se concentram em abordar tensões cedo (62% em N1) e mediar divergências (58% em N1). O padrão sugere que o grupo evita o desconforto da conversa difícil até que o problema cresça — um reflexo natural de uma cultura muito colaborativa, que precisa aprender que o confronto saudável também é um ato de cuidado.' },
    { titulo: 'Analítico forte, relacional a desenvolver', texto: 'Há um contraste claro entre competências técnicas (Pensamento Analítico e Resultados, mais maduras) e as relacionais sob pressão (Comunicação e Conflitos, mais frágeis). O grupo resolve bem o "o quê", mas hesita no "como dizer".' },
  ],
  prioridades: [
    { descritor: 'Aborda tensões cedo', competencia: 'Gestão de Conflitos', dado: '62% em N1', porque: 'Tensões não endereçadas viram retrabalho, ruído entre áreas e desgaste silencioso que corrói a confiança do time.', acao: 'Rodada mensal de "conversas corajosas" com roteiro guiado e um facilitador rotativo.' },
    { descritor: 'Adapta a mensagem ao público', competencia: 'Comunicação Assertiva', dado: '52% em N1', porque: 'Mensagens que não consideram o interlocutor geram mal-entendidos e decisões refeitas, custando tempo e credibilidade.', acao: 'Oficina prática de comunicação por perfil, com simulação de casos reais da equipe.' },
    { descritor: 'Media divergências entre pares', competencia: 'Gestão de Conflitos', dado: '58% em N1', porque: 'Sem mediação, divergências se personalizam e comprometem a colaboração que hoje é a maior força do grupo.', acao: 'Trilha de mediação com prática de casos e acordo de convivência revisado em time.' },
  ],
  acoes: [
    { titulo: 'Ritual de feedback quinzenal', quando: 'Reunião de time / 1:1', quem: 'Toda a equipe', resultado: 'Cada pessoa dá e recebe ao menos um feedback estruturado por quinzena.' },
    { titulo: 'Acordo de convivência revisado', quando: 'Workshop de meio-dia', quem: 'Grupo completo', resultado: 'Um pacto de como lidamos com divergências, escrito e assinado pelo time.' },
    { titulo: 'Duplas de mentoria cruzada', quando: 'Ao longo do mês', quem: 'Referências N3/N4 + quem está em N1', resultado: 'Seis duplas ativas trocando prática real de comunicação e mediação.' },
  ],
  profissionaisReferencia:
    'Uma parcela relevante do grupo já opera em N3/N4 em Colaboração e Resultados — essas pessoas são a ponte natural para o restante da equipe. Reconhecê-las anonimamente como referências internas acelera o desenvolvimento coletivo sem depender só de formação externa.',
  fecho:
    'Este diagnóstico não é um veredito — é um ponto de partida. O grupo tem uma base colaborativa rara e uma disposição genuína para crescer, comprovada pela alta participação. Os degraus que aparecem nas conversas difíceis não são fraquezas de caráter, são habilidades que ainda não foram treinadas. Com rituais simples e constantes, a força que já temos no "fazer junto" vai se estender para o "falar com franqueza". O próximo retrato pode ser bem diferente — e a construção começa agora.',
};

// ───────────────────────────── Perfil Organizacional (DISC) ──────────────────
function buildPerfilOrg(): PerfilOrg {
  const natural: DiscMedia = { d: 58, i: 64, s: 47, c: 41 };
  const adaptado: DiscMedia = { d: 62, i: 55, s: 52, c: 49 };
  const perfilDominante = 'ID';

  const fatoresOrdem = (['D', 'I', 'S', 'C'] as Fator[])
    .map((f) => ({ fator: f, nome: FATOR_NOME[f], foco: FATOR_FOCO[f], media: natural[f.toLowerCase() as keyof DiscMedia] }))
    .sort((a, b) => b.media - a.media);

  const valores: PerfilOrg['valores'] = [
    { key: 'val_social', nome: 'Social', motivacao: 'Contribuir com o Coletivo', media: 74, classe: 'significativo' },
    { key: 'val_politico', nome: 'Político', motivacao: 'Reconhecimento e Destaque', media: 68, classe: 'significativo' },
    { key: 'val_economico', nome: 'Econômico', motivacao: 'Recompensa pelo Esforço Empreendido', media: 55, classe: 'circunstancial' },
    { key: 'val_teorico', nome: 'Teórico', motivacao: 'Aprendizado Constante', media: 48, classe: 'circunstancial' },
    { key: 'val_estetico', nome: 'Estético', motivacao: 'Bem-estar e Qualidade de Vida', media: 39, classe: 'menor' },
    { key: 'val_religioso', nome: 'Religioso', motivacao: 'Conviver com Crenças e Opiniões Iguais', media: 31, classe: 'menor' },
  ];

  const lidDistRaw = [
    { nome: 'Executivo', media: 34 },
    { nome: 'Motivador', media: 41 },
    { nome: 'Metódico', media: 15 },
    { nome: 'Sistemático', media: 10 },
  ];
  const lidTotal = lidDistRaw.reduce((s, x) => s + x.media, 0);
  const lidDist = lidDistRaw.map((x) => ({ nome: x.nome, pct: Math.round((x.media / lidTotal) * 100) }));
  const lidTop = [...lidDistRaw].sort((a, b) => b.media - a.media)[0];
  const lideranca: PerfilOrg['lideranca'] = {
    nome: lidTop.nome, vinculo: 'Liderança com Inspiração',
    pct: Math.round((lidTop.media / lidTotal) * 100), dist: lidDist,
  };

  // 16 competências (natural + adaptado) — valores 0-100 variados
  const natVals: Record<string, number> = {
    comp_ousadia: 72, comp_comando: 66, comp_objetividade: 61, comp_assertividade: 48,
    comp_persuasao: 78, comp_extroversao: 81, comp_entusiasmo: 76, comp_sociabilidade: 74,
    comp_empatia: 69, comp_paciencia: 44, comp_persistencia: 52, comp_planejamento: 43,
    comp_organizacao: 46, comp_detalhismo: 38, comp_prudencia: 41, comp_concentracao: 49,
  };
  const competencias: CompStat[] = COMP_LABEL.map((c) => {
    const nat = natVals[c.key] ?? 50;
    const adp = Math.max(20, Math.min(95, nat + ((c.key.charCodeAt(5) % 7) - 3) * 4));
    return { key: c.key, nome: c.nome, desc: c.desc, natural: nat, adaptado: adp };
  });
  const byNat = [...competencias].sort((a, b) => b.natural - a.natural);
  const compMais = byNat.slice(0, 3);
  const compMenos = byNat.slice(-3).reverse();

  // 30 avaliados; fatores altos/baixos coerentes
  const N = 30;
  const fatoresAltoBaixo: PerfilOrg['fatoresAltoBaixo'] = ([
    { fator: 'D', nAlto: 19 }, { fator: 'I', nAlto: 22 }, { fator: 'S', nAlto: 13 }, { fator: 'C', nAlto: 10 },
  ] as { fator: Fator; nAlto: number }[]).map(({ fator, nAlto }) => {
    const nBaixo = N - nAlto;
    return {
      fator, nome: FATOR_NOME[fator], foco: FATOR_FOCO[fator],
      pctAlto: Math.round((nAlto / N) * 100), pctBaixo: Math.round((nBaixo / N) * 100), nAlto, nBaixo,
    };
  });

  const talentos: PerfilOrg['talentos'] = [
    { nome: 'Comunicação', foco: 'Influência', pct: 73 },
    { nome: 'Inspiração', foco: 'Dominância e Influência', pct: 60 },
    { nome: 'Relacionamento', foco: 'Influência e Estabilidade', pct: 50 },
    { nome: 'Direção', foco: 'Dominância', pct: 47 },
    { nome: 'Execução', foco: 'Conformidade e Dominância', pct: 37 },
    { nome: 'Planejamento', foco: 'Estabilidade', pct: 30 },
    { nome: 'Técnico', foco: 'Estabilidade e Conformidade', pct: 23 },
    { nome: 'Análise', foco: 'Conformidade', pct: 20 },
  ].sort((a, b) => b.pct - a.pct);

  const nomes = [
    'Ana Prado', 'Bruno Lima', 'Carla Mota', 'Diego Ramos', 'Elena Souza', 'Felipe Nunes',
    'Gabriela Reis', 'Henrique Alves', 'Isabela Costa', 'João Vitor Melo', 'Karina Duarte',
    'Lucas Ferreira', 'Marina Teixeira', 'Nathan Correia',
  ];
  const perfis = ['ID', 'DI', 'IS', 'SC', 'DC', 'SI', 'CD', 'IC', 'DS', 'CS', 'ID', 'DI', 'IS', 'SC'];
  const arqs = ['Comunicador', 'Realizador', 'Facilitador', 'Especialista', 'Empreendedor', 'Colaborador', 'Analista', 'Consultor', 'Persuasor', 'Organizador', 'Comunicador', 'Realizador', 'Facilitador', 'Especialista'];
  const pessoas: PessoaDisc[] = nomes.map((nome, i) => {
    const seed = (i * 37) % 50;
    const nat: DiscMedia = {
      d: 35 + ((i * 13) % 55), i: 40 + ((i * 17) % 50),
      s: 30 + ((i * 11) % 55), c: 25 + ((i * 19) % 55),
    };
    const adp: DiscMedia = {
      d: Math.min(95, nat.d + (seed % 12) - 4), i: Math.min(95, nat.i + (seed % 10) - 5),
      s: Math.min(95, nat.s + (seed % 8) - 3), c: Math.min(95, nat.c + (seed % 14) - 6),
    };
    return { numero: i + 1, nome, perfil: perfis[i], arquetipo: arqs[i], natural: nat, adaptado: adp };
  });

  return {
    avaliados: 30, natural, adaptado, perfilDominante,
    arquetipo: { nome: 'O Comunicador', desc: 'Perfil sociável e persuasivo, movido por relações e reconhecimento, com forte energia para mobilizar pessoas em torno de objetivos comuns.' },
    fatoresOrdem, valores, lideranca, competencias, compMais, compMenos,
    temCompAdapt: true, fatoresAltoBaixo, talentos,
    destaques: destaquesBipolares(natural), pessoas, semDados: false,
  };
}

// ───────────────────────────────── runner ────────────────────────────────────
// Registra a fonte NotoSans na MESMA instância do @react-pdf/renderer que o
// renderToBuffer usa (import dinâmico → ESM). O side-effect de components/pdf/styles
// registra na instância CJS do tsx, que NÃO é a que renderiza. Por isso registramos
// aqui, dinamicamente, replicando a config oficial de styles.ts.
async function registrarFonte() {
  const { Font } = await import('@react-pdf/renderer');
  const base = 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest';
  Font.register({
    family: 'NotoSans',
    fonts: [
      { src: `${base}/latin-400-normal.ttf`, fontWeight: 400 },
      { src: `${base}/latin-400-italic.ttf`, fontWeight: 400, fontStyle: 'italic' },
      { src: `${base}/latin-500-normal.ttf`, fontWeight: 500 },
      { src: `${base}/latin-600-normal.ttf`, fontWeight: 600 },
      { src: `${base}/latin-700-normal.ttf`, fontWeight: 700 },
    ],
  });
  // Fraunces (display) + Jakarta (UI) que a capa nova (PdfReportCover) usa — em
  // produção o bundle único já registra; sob tsx registramos na instância ESM.
  const cdn = 'https://cdn.jsdelivr.net/fontsource/fonts';
  Font.register({ family: 'Fraunces', fonts: [
    { src: `${cdn}/fraunces@latest/latin-400-normal.ttf`, fontWeight: 400 },
    { src: `${cdn}/fraunces@latest/latin-600-normal.ttf`, fontWeight: 600 },
    { src: `${cdn}/fraunces@latest/latin-400-italic.ttf`, fontWeight: 400, fontStyle: 'italic' },
  ] });
  Font.register({ family: 'Jakarta', fonts: [
    { src: `${cdn}/plus-jakarta-sans@latest/latin-500-normal.ttf`, fontWeight: 500 },
    { src: `${cdn}/plus-jakarta-sans@latest/latin-600-normal.ttf`, fontWeight: 600 },
  ] });
  Font.registerHyphenationCallback((word: string) => [word]);
}

(async () => {
  console.log(`Saida: ${OUT}\n`);
  await registrarFonte();
  try {
    const { renderDnaPDF } = await import('@/lib/dna-organizacional-pdf');
    const bytes = await renderDnaPDF({
      empresaNome: 'Colégio Horizonte (fictício)',
      dataRef: '07 de julho de 2026',
      segmento: 'educacao',
      dna: buildDna(),
      narrativa: dnaNarrativa,
    });
    await save('09-dna-retrato-competencias', bytes);
  } catch (e: any) {
    console.error('DNA falhou:', e?.message || e);
    if (process.env.DEBUG) console.error(e?.stack);
  }

  try {
    const { renderPerfilOrgPDF } = await import('@/lib/perfil-organizacional-pdf');
    const bytes = await renderPerfilOrgPDF({
      empresaNome: 'Grupo Meridiano (fictício)',
      dataRef: '07 de julho de 2026',
      solicitadoPor: 'Mariana Alves — RH',
      p: buildPerfilOrg(),
    });
    await save('10-perfil-organizacional-disc', bytes);
  } catch (e: any) {
    console.error('PerfilOrg falhou:', e?.message || e);
    if (process.env.DEBUG) console.error(e?.stack);
  }

  console.log('\nFeito.');
})();
