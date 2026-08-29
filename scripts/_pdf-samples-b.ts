import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { getLogoCoverBase64 } from '@/lib/pdf-assets';
import RelatorioPulsoExecutivoPDF from '@/components/pdf/RelatorioPulsoExecutivo';
import RelatorioPulsoNR1PDF from '@/components/pdf/RelatorioPulsoNR1';
import RelatorioComportamentalPDF from '@/components/pdf/RelatorioComportamental';
import { renderTemporadaConcluidaPDF } from '@/lib/temporada-concluida-pdf';

const OUT = (process.env.PDF_OUT || path.join(os.homedir(), 'Downloads', 'vertho-pdf-samples')); fs.mkdirSync(OUT, { recursive: true });
async function save(nome: string, bytes: Uint8Array | Buffer) {
  const p = path.join(OUT, nome + '.pdf'); fs.writeFileSync(p, Buffer.from(bytes));
  console.log('OK', nome, (Buffer.from(bytes).length / 1024 | 0) + 'KB');
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) PULSO — dados compartilhados pelos relatórios executivo e NR-1
// ─────────────────────────────────────────────────────────────────────────────
const pulseData = {
  ciclo: { nome: 'Ciclo 2026.1 — Desenvolvimento Contínuo', descricao: 'Pesquisa de pulso T0→T2' },
  empresa: { nome: 'Acme Educação' },
  generated_at: '2026-07-07T12:00:00.000Z',
  group_label: 'Empresa toda',
  n_t0: 148,
  n_t2: 132,
  indice_geral: { t0: 3.42, t2: 3.78, delta: 0.36 },
  classificacao: { band: 'saudavel', label: 'Ambiente saudável em evolução' },
  dimensions: [
    { dimension_name: 'Clareza de papel e prioridades', t0: 3.31, t2: 3.72, delta: 0.41 },
    { dimension_name: 'Condições e recursos de trabalho', t0: 3.05, t2: 3.24, delta: 0.19 },
    { dimension_name: 'Liderança e acompanhamento', t0: 3.58, t2: 4.01, delta: 0.43 },
    { dimension_name: 'Segurança para aprender', t0: 3.77, t2: 4.18, delta: 0.41 },
    { dimension_name: 'Aplicação prática e autonomia', t0: 3.29, t2: 3.55, delta: 0.26 },
    { dimension_name: 'Futuro e permanência', t0: 3.12, t2: 3.44, delta: 0.32 },
  ],
  signals: [
    { label: 'Engajamento com a MentorIA', score: 4, raw: {} },
    { label: 'Completude das trilhas', score: 4, raw: {} },
    { label: 'Consistência de resposta ao longo do ciclo', score: 3, raw: {} },
    { label: 'Iniciativa em missões práticas', score: 3, raw: {} },
    { label: 'Abertura em respostas abertas', score: 4, raw: {} },
  ],
  themes: [
    { theme_label: 'Reconhecimento da liderança', polarity: 'positive', count: 41, pct: 31 },
    { theme_label: 'Clareza de metas', polarity: 'positive', count: 33, pct: 25 },
    { theme_label: 'Autonomia para decidir', polarity: 'positive', count: 22, pct: 17 },
    { theme_label: 'Sobrecarga pontual', polarity: 'negative', count: 28, pct: 21 },
    { theme_label: 'Falta de tempo para estudo', polarity: 'negative', count: 19, pct: 14 },
    { theme_label: 'Comunicação entre áreas', polarity: 'negative', count: 15, pct: 11 },
    { theme_label: 'Rotina de reuniões', polarity: 'neutral', count: 12, pct: 9 },
    { theme_label: 'Ferramentas do dia a dia', polarity: 'neutral', count: 9, pct: 7 },
  ],
  triangulation: {
    summary:
      'O índice geral evoluiu de 3,42 para 3,78 (+0,36) entre T0 e T2, com destaque para Liderança e Segurança para aprender. ' +
      'A leitura declarada é coerente com os sinais comportamentais: alto engajamento com a MentorIA e boa completude das trilhas. ' +
      'O ponto de maior atenção segue sendo Condições e recursos, que avançou pouco e concentra os temas negativos de sobrecarga e falta de tempo. ' +
      'A confiança da leitura é alta, sustentada por 132 respondentes no T2 e convergência entre pulso, sinais e temas abertos.',
    accelerators: [
      { title: 'Liderança próxima e presente', detail: 'A dimensão Liderança subiu +0,43 e é o tema positivo mais citado. O acompanhamento dos gestores diretos está sendo percebido como diferencial e sustenta o ganho geral.' },
      { title: 'Cultura de aprendizado consolidando', detail: 'Segurança para aprender atingiu 4,18 — a maior média do ciclo. Pessoas relatam abertura para pedir ajuda e errar, o que acelera a adoção das trilhas.' },
      { title: 'Engajamento comportamental alto', detail: 'Os sinais de uso da MentorIA e completude estão em 4/5, confirmando que o movimento declarado tem lastro no comportamento observado.' },
    ],
    blockers: [
      { title: 'Condições e recursos travadas', detail: 'A dimensão avançou apenas +0,19 e ficou em 3,24, a menor do ciclo. É o gargalo que mais limita o teto do índice geral.' },
      { title: 'Sobrecarga pontual recorrente', detail: 'Presente em 21% das respostas abertas. Concentra-se em áreas específicas e coincide com o tema de falta de tempo para estudo.' },
      { title: 'Comunicação entre áreas', detail: 'Citada por 11% como fricção. Não é crítica, mas aparece de forma consistente e afeta a percepção de clareza em interfaces.' },
    ],
    alerts: [
      { title: 'Queda de respondentes T0→T2', detail: 'De 148 para 132 participantes (−11%). Monitorar para garantir que a saída não esteja concentrada em grupos insatisfeitos, o que enviesaria a leitura para cima.' },
      { title: 'Recursos abaixo do restante', detail: 'Condições e recursos é a única dimensão abaixo de 3,3. Se não endereçada, tende a puxar as demais no próximo ciclo.' },
    ],
    recommendations: [
      { title: 'Plano de capacidade por área', detail: 'Mapear as 2–3 áreas que concentram a sobrecarga e revisar distribuição de carga antes do próximo ciclo. Meta: subir Condições para ≥ 3,6.' },
      { title: 'Reservar tempo protegido de estudo', detail: 'Formalizar janelas semanais para trilhas nas áreas mais pressionadas, reduzindo o conflito entre entrega e desenvolvimento.' },
      { title: 'Ritual leve de interface entre áreas', detail: 'Instituir um checkpoint quinzenal curto entre áreas com mais atrito para reduzir o ruído de comunicação relatado.' },
      { title: 'Sustentar o que funciona na liderança', detail: 'Documentar e disseminar as práticas dos gestores mais bem avaliados como padrão de acompanhamento.' },
    ],
    divergences: [
      { title: 'Autonomia declarada x iniciativa observada', detail: 'Autonomia aparece como tema positivo (17%), mas o sinal de iniciativa em missões práticas ficou em 3/5. Há espaço percebido que ainda não vira ação — vale estímulo dirigido.' },
    ],
    confidence_level: 'alta',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3) RELATÓRIO COMPORTAMENTAL
// ─────────────────────────────────────────────────────────────────────────────
const compRaw = {
  nome: 'Mariana Albuquerque Costa',
  data_realizacao: '2026-06-18T00:00:00.000Z',
  perfil_dominante: 'DC',
  disc_natural: { D: 78, I: 44, S: 32, C: 71 },
  disc_adaptado: { D: 72, I: 51, S: 38, C: 66 },
  indices: { positividade: 0.72, estima: 0.68, flexibilidade: 0.55 },
  lideranca: { executivo: 42, motivador: 18, metodico: 12, sistematico: 28 },
  tipo_psicologico: { tipo: 'ENT', extroversao: 58, intuicao: 63, pensamento: 71 },
  competencias: [
    { nome: 'Ousadia', natural: 82, adaptado: 76 },
    { nome: 'Comando', natural: 79, adaptado: 74 },
    { nome: 'Objetividade', natural: 85, adaptado: 80 },
    { nome: 'Assertividade', natural: 74, adaptado: 70 },
    { nome: 'Persuasão', natural: 61, adaptado: 66 },
    { nome: 'Extroversão', natural: 48, adaptado: 55 },
    { nome: 'Entusiasmo', natural: 52, adaptado: 58 },
    { nome: 'Sociabilidade', natural: 45, adaptado: 50 },
    { nome: 'Empatia', natural: 38, adaptado: 44 },
    { nome: 'Paciência', natural: 34, adaptado: 40 },
    { nome: 'Persistência', natural: 72, adaptado: 70 },
    { nome: 'Planejamento', natural: 77, adaptado: 73 },
    { nome: 'Organização', natural: 81, adaptado: 78 },
    { nome: 'Detalhismo', natural: 76, adaptado: 71 },
    { nome: 'Prudência', natural: 69, adaptado: 64 },
    { nome: 'Concentração', natural: 73, adaptado: 70 },
  ],
};

const compTexts = {
  sintese_perfil:
    'Mariana combina foco em resultados com alto rigor de execução. Tende a assumir a direção quando há um objetivo claro, ' +
    'decide rápido e cobra padrão de qualidade de si e do time. É movida por desafios concretos e por entregar com excelência. ' +
    'Sua energia natural está mais no fazer acontecer do que no cultivar relações — o que a torna confiável na entrega, mas exige ' +
    'atenção deliberada ao lado humano para que a firmeza não seja lida como distância.',
  quadrante_D: {
    titulo_traco: 'Diretor',
    descricao: 'Encara desafios de frente e busca resultado com poucas voltas. Prefere agir a esperar e sente-se confortável assumindo o comando quando o cenário está indefinido.',
    adaptacao: 'O contexto pede um pouco menos de intensidade do que sua tendência natural, sinal de ajuste consciente.',
  },
  quadrante_I: {
    titulo_traco: 'Pesquisador',
    descricao: 'Comunica-se de forma objetiva e analítica, priorizando fatos sobre entusiasmo. Influencia mais pela consistência dos argumentos do que pelo carisma.',
    adaptacao: 'O ambiente parece exigir um pouco mais de articulação social do que sua zona de conforto.',
  },
  quadrante_S: {
    titulo_traco: 'Executor',
    descricao: 'Trabalha em ritmo intenso e lida bem com mudança e simultaneidade. Prefere variedade e velocidade a rotinas longas e previsíveis.',
    adaptacao: null,
  },
  quadrante_C: {
    titulo_traco: 'Analista',
    descricao: 'Valoriza precisão, método e qualidade. Organiza o trabalho com critério e tende a checar antes de concluir, reduzindo retrabalho.',
    adaptacao: 'Sob o contexto atual, flexibiliza levemente o rigor para ganhar velocidade.',
  },
  top5_forcas: [
    { competencia: 'Objetividade', frase: 'Vai direto ao ponto e mantém o time focado no que importa.' },
    { competencia: 'Ousadia', frase: 'Assume riscos calculados e destrava decisões que muitos adiam.' },
    { competencia: 'Organização', frase: 'Estrutura o trabalho de forma que reduz retrabalho e surpresas.' },
    { competencia: 'Comando', frase: 'Naturalmente toma a frente e dá direção em momentos de indefinição.' },
    { competencia: 'Planejamento', frase: 'Antecipa etapas e transforma metas amplas em passos executáveis.' },
  ],
  top5_desenvolver: [
    { competencia: 'Paciência', frase: 'Ganharia dando mais tempo ao ritmo dos outros antes de acelerar.' },
    { competencia: 'Empatia', frase: 'Espaço para ler o estado emocional do time além da tarefa.' },
    { competencia: 'Sociabilidade', frase: 'Investir em vínculos informais amplia sua influência.' },
    { competencia: 'Extroversão', frase: 'Compartilhar mais o raciocínio aproxima e alinha o grupo.' },
    { competencia: 'Entusiasmo', frase: 'Celebrar avanços em voz alta engaja quem precisa de energia.' },
  ],
  lideranca_sintese:
    'O estilo de liderança de Mariana é predominantemente executivo: define direção, estabelece metas claras e cobra entrega. ' +
    'Há um componente sistemático relevante, que traz método e consistência às decisões. Ela motiva mais pelo exemplo e pela ' +
    'clareza do que pela empolgação, e tende a inspirar confiança em contextos que exigem firmeza e padrão de qualidade.',
  lideranca_trabalhar:
    'Como líder, ganharia ao dedicar tempo deliberado ao acompanhamento individual e ao reconhecimento explícito. Modular a ' +
    'intensidade em momentos de pressão e abrir espaço para a voz do time reduz o risco de a firmeza soar como rigidez.',
  pontos_desenvolver_pressao: [
    'Pode acelerar decisões antes de ouvir todos os envolvidos',
    'Tende a elevar a cobrança e reduzir a tolerância a erros',
    'Corre o risco de assumir tarefas que poderiam ser delegadas',
    'Pode soar mais direta e cortante do que pretende',
    'Foca tanto na entrega que negligencia sinais emocionais do time',
    'Resiste a mudar o plano mesmo diante de novos dados',
  ],
  relacoes_e_comunicacao: 'Comunica-se de forma clara e franca, preferindo objetividade a rodeios. Constrói respeito pela consistência.',
  modo_de_trabalho: 'Funciona bem sob pressão e com múltiplas frentes, mantendo padrão de qualidade e ritmo elevado.',
  frases_chave: ['Entrega com padrão', 'Decide e destrava', 'Firmeza que inspira confiança'],
};

const compArquetipo = {
  nome: 'A Estrategista Executora',
  desc:
    'Perfis DC combinam a orientação a resultado da Dominância com o rigor de qualidade da Conformidade. São pessoas que ' +
    'transformam ambição em execução estruturada — ousam na direção e não abrem mão do padrão na entrega.',
};
const compTags = ['Orientada a resultado', 'Rigor de qualidade', 'Decisão rápida', 'Alto padrão', 'Autonomia', 'Foco em execução'];
const compInsights = [
  'Coloque Mariana à frente de metas ambíguas com prazo curto — é onde seu perfil DC gera mais valor.',
  'Combine-a com um par de perfil relacional (alto I/S) para equilibrar entrega e clima de time.',
  'O maior risco não é competência, e sim o excesso de cobrança sob pressão. Feedback sobre modulação é o alavancador.',
];

const compData = { raw: compRaw, texts: compTexts, arquetipo: compArquetipo, tags: compTags, insights: compInsights };

// ─────────────────────────────────────────────────────────────────────────────
// 4) TEMPORADA CONCLUÍDA (regular)
// ─────────────────────────────────────────────────────────────────────────────
const temporadaDados = {
  colab: { nome: 'Rafael Nunes de Almeida' },
  trilha: { competencia: 'Comunicação Assertiva', numeroTemporada: 3, totalSemanas: 14 },
  evolutionReport: {
    descritores: [
      { descritor: 'Expressa discordância com respeito', baseline: 1.5, nota_pre: 2, nota_pos: 4, convergencia: 'evolucao_confirmada', antes: 'Evitava expor divergências em reunião para não gerar atrito.', depois: 'Passou a apresentar pontos de vista contrários de forma estruturada e cordial.' },
      { descritor: 'Dá feedback direto e cuidadoso', baseline: 2.0, nota_pre: 2, nota_pos: 3, convergencia: 'evolucao_parcial', antes: 'Suavizava tanto o feedback que a mensagem se perdia.', depois: 'Já nomeia o comportamento com clareza, ainda buscando o timing ideal.' },
      { descritor: 'Escuta ativa em conversas difíceis', baseline: 2.5, nota_pre: 3, nota_pos: 4, convergencia: 'evolucao_confirmada', antes: 'Interrompia para responder antes de o outro concluir.', depois: 'Sustenta o silêncio, resume o que ouviu e só então responde.' },
      { descritor: 'Negocia prazos com transparência', baseline: 2.0, nota_pre: 3, nota_pos: 3, convergencia: 'estagnacao', antes: 'Aceitava prazos irreais para evitar conflito.', depois: 'Ainda tende a ceder, mas já sinaliza riscos com antecedência.' },
      { descritor: 'Mantém a calma sob provocação', baseline: 2.5, nota_pre: 3, nota_pos: 2, convergencia: 'regressao', antes: 'Respondia de forma equilibrada na maioria das situações.', depois: 'Sob pressão recente, voltou a reagir de forma mais defensiva.' },
    ],
    resumo: { confirmadas: 2, parciais: 1, estagnacoes: 1, regressoes: 1 },
    insight_geral: 'Rafael deu um salto claro em expor divergências e escutar — o núcleo da assertividade. O ponto de atenção é a regulação emocional sob pressão, que oscilou no fim da temporada.',
    proximo_passo: 'Na próxima temporada, focar em técnicas de autorregulação (pausa deliberada e reancoragem) para sustentar a assertividade mesmo em situações de provocação. Vale também consolidar a negociação de prazos, que ficou estável.',
  },
  momentos: [
    { semana: 2, descritor: 'Expressa discordância com respeito', insight: 'Percebi que discordar não é atacar — é oferecer outro ângulo.' },
    { semana: 5, descritor: 'Escuta ativa em conversas difíceis', insight: 'Quando parei de preparar a resposta na cabeça, comecei a ouvir de verdade.' },
    { semana: 9, descritor: 'Dá feedback direto e cuidadoso', insight: 'Cuidado não é rodeio. Dá para ser claro e gentil ao mesmo tempo.' },
    { semana: 12, descritor: 'Mantém a calma sob provocação', insight: 'Reconheci meu gatilho: quando questionam meu esforço, endureço.' },
  ],
  missoes: [
    { semana: 3, modo: 'pratica', compromisso: 'Levar uma discordância real para a reunião de equipe.', sintese: 'Apresentou objeção ao cronograma e propôs alternativa; foi ouvido e ajustaram o plano.' },
    { semana: 6, modo: 'cenario', compromisso: 'Responder a um cenário de conflito com um colega.', sintese: 'Estruturou a resposta em fato-impacto-pedido; evitou culpabilizar.' },
    { semana: 10, modo: 'pratica', compromisso: 'Dar um feedback difícil a um par.', sintese: 'Nomeou o comportamento com clareza; o par recebeu bem e agradeceu a franqueza.' },
    { semana: 13, modo: 'cenario', compromisso: 'Negociar um prazo apertado com um cliente interno.', sintese: 'Sinalizou o risco cedo, mas ainda aceitou parte do prazo sem contrapartida.' },
  ],
  sem14: {
    resumo_avaliacao: {
      mensagem_geral:
        'Rafael demonstrou evolução consistente no cenário de fechamento. Expôs divergência de forma clara e respeitosa e ' +
        'sustentou a escuta mesmo quando pressionado. O ponto a seguir trabalhando é a regulação emocional diante de ' +
        'provocação direta, onde a assertividade ainda cede lugar à defesa. No conjunto, a temporada consolidou a base da ' +
        'comunicação assertiva e deixou um alvo nítido para a próxima jornada.',
    },
    nota_media_pos: 3.2,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const logo = getLogoCoverBase64() || undefined;

  const b4 = await renderToBuffer(React.createElement(RelatorioPulsoExecutivoPDF, { data: pulseData, empresaNome: 'Acme Educação', logoBase64: logo }) as any);
  await save('04-relatorio-pulso-executivo', b4);

  const b5 = await renderToBuffer(React.createElement(RelatorioPulsoNR1PDF, { data: pulseData, empresaNome: 'Acme Educação', logoBase64: logo }) as any);
  await save('05-relatorio-pulso-nr1', b5);

  const b3 = await renderToBuffer(React.createElement(RelatorioComportamentalPDF, { data: compData }) as any);
  await save('03-relatorio-comportamental', b3);

  const b14 = await renderTemporadaConcluidaPDF(temporadaDados);
  await save('14-temporada-concluida', b14);

  console.log('\nTODOS OK →', OUT);
}

main().catch(e => { console.error(e); process.exit(1); });
