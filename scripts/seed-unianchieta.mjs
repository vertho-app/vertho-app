/**
 * Seed do tenant UniAnchieta (demo comercial — slug `unianchieta`).
 *
 * Cria/atualiza: empresa (modo Personalizado: 1 semana, 1 comp, SEM fechamento)
 * + cargo "Diretor(a) Universitário(a)" + régua completa de Fluência Digital
 * (6 descritores N1–N4, adaptada de ibipeba TCH10/SED12 pra gestão universitária).
 * NÃO cria colaboradores (dependem de nome/e-mail/WhatsApp dos 3 diretores).
 *
 * Idempotente: UPSERT por slug / (empresa,nome); descritores via DELETE+INSERT
 * do cod_comp UNI01 no tenant.
 *
 * Uso: node --env-file=.env.local scripts/seed-unianchieta.mjs
 */
import pg from 'pg';

const SLUG = 'unianchieta';
const NOME = 'UniAnchieta';
const CARGO = 'Diretor(a) Universitário(a)';
const COMP = 'Fluência Digital';
const COD_COMP = 'UNI01';
const PILAR = 'Excelência Operacional';
const DESC_COMP = 'Usa sistemas, dados e inteligência artificial de forma estratégica, ética e segura na gestão universitária, liderando a transformação digital da sua unidade.';

const SYS_CONFIG = {
  allow_open_signup: false,
  programa_modo: 'custom',
  programa_custom: { semanas: 1, numCompetencias: 1, fechamento: false },
  ai: { modelo_padrao: 'claude-sonnet-4-6', modelos: {} },
  cadencia: { fase4_dia_pilula: 1, fase4_dia_pilula2: 2, fase4_dia_evidencia: 4, fase4_hora: 8, email_ativo: true, whatsapp_ativo: true },
  envios: {},
};

const UI_CONFIG = {
  primary_color: '#0D9488',
  primary_color_end: '#0F766E',
  accent_color: '#00B4D8',
  bg_gradient_start: '#091D35',
  bg_gradient_end: '#0F2A4A',
  font_color: '#FFFFFF',
  font_color_secondary: '#FFFFFF99',
  login_subtitle: 'Desenvolvimento de lideranças universitárias — uma experiência Vertho',
  labels: {},
  hidden_elements: [],
};

// Detalhe do cargo — insumo do IA3 (cenários ricos e situados). Calibrado ao
// perfil REAL da direção que participa do programa (direção geral/acadêmica
// com agenda de inovação pedagógica, formação docente e IA na educação —
// atuação do ensino básico ao superior), SEM citar pessoa (cenário situacional
// não nomeia gente real; o contexto é do PAPEL).
const CARGO_DETALHE = {
  area: 'Direção Geral / Acadêmica',
  descricao: 'Direção geral e acadêmica de instituição de ensino que atua do básico ao superior: responde pela qualidade acadêmica, pela formação continuada do corpo docente, pela agenda de inovação pedagógica (tecnologias digitais e IA na educação) e pela experiência do aluno, em articulação com a mantenedora e as coordenações.',
  principais_entregas: 'Indicadores acadêmicos (captação, permanência/evasão, desempenho, avaliação MEC); programa de formação docente em tecnologias digitais, IA na educação e metodologias ativas; agenda de inovação pedagógica traduzida em prática de sala; representação institucional em eventos e na comunidade educacional.',
  stakeholders: 'Mantenedora, coordenações de curso e de segmento, corpo docente do básico e do superior, alunos e famílias, MEC/avaliadores, comunidade e mercado de Jundiaí e região, redes e eventos de educação.',
  decisoes_recorrentes: 'Priorizar as frentes de formação docente do semestre; adotar (ou barrar) plataformas e ferramentas de IA com critério pedagógico e ético; equilibrar investimento entre inovação e operação; responder a captação/evasão; arbitrar ritmos diferentes de adoção entre coordenações e segmentos.',
  tensoes_comuns: 'Direção entusiasta da inovação vs. ritmo real de adoção do corpo docente; entusiasmo com IA vs. critério ético e proteção de dados; profundidade pedagógica vs. escala da formação; inovação vs. sustentação financeira; agenda externa (palestras, representação) vs. presença na gestão cotidiana.',
};

// Contexto institucional (PPP de rede) — o IA3 lê ppp_escolas.extracao
// (status 'extraido') pra situar os cenários. Seções = as chaves que
// buscarContextoPPP formata; valores alimentam a camada de ética.
const PPP_ESCOLA = 'UniAnchieta — contexto institucional';
const PPP_EXTRACAO = {
  perfil_instituicao: 'UniAnchieta (Centro Universitário Padre Anchieta), Jundiaí/SP — instituição de ensino com atuação do ensino básico ao ensino superior (colégio, graduação e pós-graduação), com forte presença na cidade e na região.',
  comunidade_contexto: 'Comunidade de Jundiaí/SP e região: alunos do básico ao superior, famílias e empregadores locais. A instituição é referência regional e dialoga com o mercado de trabalho e com a rede educacional da cidade.',
  identidade_cultura: 'Direção acadêmica orientada por uma educação conectada ao seu tempo — ética, crítica, humana e inovadora. Aposta na formação docente continuada como motor de transformação e trata tecnologia como meio para uma educação mais significativa, inclusiva e transformadora, nunca como fim.',
  praticas_descritas: 'Formação docente com foco em tecnologias digitais e inteligência artificial na educação; neuroeducação; metodologias ativas; cultura digital. Workshops, palestras e participação ativa em eventos e redes nacionais de educação.',
  desafios_metas: 'Escalar a adoção criteriosa de tecnologias e IA pelo corpo docente do básico e do superior; traduzir a agenda de inovação em prática cotidiana de sala de aula; equilibrar entusiasmo com critério ético e proteção de dados; consolidar uma cultura digital institucional que sobreviva à rotatividade e ao ritmo desigual de adesão.',
  vocabulario: 'Educação significativa, inclusiva e transformadora; cultura digital; metodologias ativas; IA na educação; neuroeducação; formação docente; escola conectada ao seu tempo.',
  modelo_pessoas: 'Docentes como protagonistas da transformação — a direção forma formadores. Desenvolvimento contínuo, abertura crítica ao novo e coerência entre discurso e prática pedagógica.',
};
const PPP_VALORES = ['Ética', 'Pensamento crítico', 'Humanização', 'Inovação', 'Inclusão'];

// 6 descritores — facetas distintas; fórmula verbo+comportamento+contexto+resultado;
// progressão reativo → intencional → autônomo → multiplicador.
const DESCRITORES = [
  {
    cod: 'UNI01_D1', curto: 'Uso estratégico de sistemas',
    completo: 'Utiliza sistemas acadêmicos e administrativos de forma funcional e estratégica na gestão da unidade.',
    n1: 'Usa os sistemas de forma limitada, dependendo de terceiros para consultas básicas ou mantendo controles paralelos em planilhas desconectadas.',
    n2: 'Opera os sistemas acadêmicos no dia a dia, mas explora pouco os recursos de gestão; conferências manuais e retrabalho ainda são frequentes.',
    n3: 'Utiliza os sistemas com autonomia e segurança para acompanhar matrículas, notas e indicadores da unidade, apoiando o trabalho cotidiano da equipe.',
    n4: 'Explora os sistemas de forma estratégica, integra fontes de informação e amplia a agilidade e a confiabilidade da gestão; é referência para outros diretores.',
    evid: 'Consulta e extrai informação dos sistemas sem depender de terceiros; decisões cotidianas apoiadas em dados do sistema (não em controle paralelo); equipe orientada a registrar na fonte oficial.',
    perg: 'Como você acompanha hoje matrículas e indicadores da sua unidade — direto no sistema ou por controles próprios? Conte uma situação em que o sistema mudou (ou atrasou) uma decisão sua.',
  },
  {
    cod: 'UNI01_D2', curto: 'Decisão orientada por dados',
    completo: 'Interpreta painéis e indicadores acadêmicos (evasão, desempenho, ocupação) para fundamentar decisões da unidade.',
    n1: 'Decide por intuição ou pressão do momento; consulta painéis sem compreender adequadamente o que mostram.',
    n2: 'Lê relatórios e painéis de forma descritiva, mas raramente transforma a leitura em decisão ou em acompanhamento sistemático.',
    n3: 'Interpreta indicadores com consistência, prioriza ações a partir deles e comunica as decisões com base explícita nos dados.',
    n4: 'Transforma dados em inteligência de gestão: antecipa tendências de evasão e demanda, define metas mensuráveis e multiplica a prática analítica na equipe.',
    evid: 'Cita indicadores concretos ao justificar prioridades; rotina periódica de leitura de painéis com a equipe; ações corretivas ligadas a metas mensuráveis.',
    perg: 'Qual indicador da sua unidade você acompanha mais de perto e o que fez a partir dele no último semestre? Como a equipe fica sabendo do porquê de uma prioridade?',
  },
  {
    cod: 'UNI01_D3', curto: 'IA aplicada à gestão e ao ensino',
    completo: 'Avalia e incorpora ferramentas de IA com critério, orientando o uso responsável por docentes e equipes.',
    n1: 'Ignora ou proíbe IA sem análise, ou adota ferramentas sem avaliar risco, custo e adequação acadêmica.',
    n2: 'Experimenta IA pontualmente no próprio trabalho, mas sem critério formal de avaliação nem orientação à equipe e aos docentes.',
    n3: 'Avalia ferramentas de IA por adequação e risco, define orientações claras de uso para docentes e equipe e acompanha os resultados.',
    n4: 'Lidera a adoção criteriosa de IA na unidade, com diretrizes vivas e casos de uso comprovados; é referência institucional no tema.',
    evid: 'Existe orientação escrita (ou pactuada) sobre uso de IA na unidade; exemplos de uso próprio com critério; resposta estruturada a casos de uso indevido (ex.: trabalhos gerados por IA).',
    perg: 'O que a sua unidade combinou sobre uso de IA por alunos e docentes — e como isso foi construído? Conte um caso em que você precisou decidir sobre adotar (ou barrar) uma ferramenta de IA.',
  },
  {
    cod: 'UNI01_D4', curto: 'Eficiência e automação de fluxos',
    completo: 'Usa recursos digitais para reduzir retrabalho em fluxos acadêmico-administrativos da unidade.',
    n1: 'Mantém rotinas manuais excessivas; processos dependem de troca informal de arquivos e conferências repetidas.',
    n2: 'Adota soluções digitais isoladas, mas com baixo impacto na eficiência do conjunto do fluxo.',
    n3: 'Mapeia gargalos e usa ferramentas digitais para tornar fluxos mais ágeis e confiáveis, liberando tempo da equipe.',
    n4: 'Promove ganhos consistentes de eficiência na unidade, padroniza as soluções que funcionam e libera a equipe para atividades de maior valor acadêmico.',
    evid: 'Identifica o gargalo mais caro do fluxo da unidade; automatizou (ou padronizou) ao menos um processo recorrente; mede o tempo/erro ganho.',
    perg: 'Qual processo da sua unidade mais consome tempo da equipe hoje? O que você já digitalizou ou automatizou — e o que mudou de fato?',
  },
  {
    cod: 'UNI01_D5', curto: 'Privacidade e segurança de dados',
    completo: 'Garante a proteção de dados de alunos e docentes (LGPD) no uso de plataformas e no compartilhamento de informações.',
    n1: 'Compartilha dados de alunos sem cuidado (grupos abertos, planilhas soltas) ou não percebe riscos de privacidade nas ferramentas usadas.',
    n2: 'Reconhece os cuidados necessários, mas as práticas ainda são irregulares; adota plataformas sem verificar termos, acessos e enquadramento legal.',
    n3: 'Segue e faz cumprir protocolos de privacidade na unidade; interrompe exposições, orienta a equipe e registra ocorrências quando necessário.',
    n4: 'Consolida cultura de proteção de dados na unidade; antecipa riscos ao avaliar novas ferramentas e é referência em conformidade (LGPD) na instituição.',
    evid: 'Sabe onde circulam dados sensíveis da unidade e quem tem acesso; já interrompeu/corrigiu uma prática de exposição; avalia privacidade ANTES de adotar ferramenta.',
    perg: 'Por onde circulam hoje os dados de alunos na sua unidade (grupos, planilhas, sistemas)? Conte uma situação em que você precisou intervir por privacidade ou acesso indevido.',
  },
  {
    cod: 'UNI01_D6', curto: 'Liderança da cultura digital',
    completo: 'Mobiliza docentes e equipes na adoção de práticas digitais, conduzindo a transformação da unidade com intencionalidade.',
    n1: 'Delega a transformação digital "à TI" ou a impõe sem preparo; resistências não são tratadas e as adoções não se sustentam.',
    n2: 'Incentiva o uso de tecnologia de forma genérica, sem plano, prioridade ou acompanhamento da adoção real.',
    n3: 'Conduz a adoção com intencionalidade: define prioridades, prepara as pessoas, acompanha o uso real e ajusta o plano pelo que observa.',
    n4: 'Constrói cultura digital sustentável na unidade; docentes se apropriam e multiplicam as práticas; a unidade torna-se vitrine institucional.',
    evid: 'Prioriza poucas frentes digitais por vez (não "tudo ao mesmo tempo"); prepara e acompanha os docentes na adoção; mede uso real, não só disponibilização.',
    perg: 'Qual foi a última prática digital que você tentou implantar com os docentes — e como lidou com quem resistiu? Como você sabe se uma adoção "pegou" de verdade?',
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('FALTA DATABASE_URL no .env.local'); process.exit(1); }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    // 1) Empresa (UPSERT por slug). sys_config MERGE preserva chaves futuras,
    //    mas programa_custom/programa_modo vêm DESTE seed (fonte da config demo).
    const up = await client.query(
      `INSERT INTO empresas (nome, slug, segmento, sys_config, ui_config, default_locale)
       VALUES ($1, $2, 'educacao', $3::jsonb, $4::jsonb, 'pt-BR')
       ON CONFLICT (slug) DO UPDATE
         SET nome = EXCLUDED.nome,
             segmento = EXCLUDED.segmento,
             sys_config = empresas.sys_config || EXCLUDED.sys_config,
             ui_config = empresas.ui_config || EXCLUDED.ui_config,
             updated_at = now()
       RETURNING id, slug, (sys_config->>'programa_modo') AS modo, (sys_config->'programa_custom') AS custom`,
      [NOME, SLUG, JSON.stringify(SYS_CONFIG), JSON.stringify(UI_CONFIG)],
    );
    const empresa = up.rows[0];
    console.log(`✅ empresa: ${SLUG} (id=${empresa.id}) · modo=${empresa.modo} · custom=${JSON.stringify(empresa.custom)}`);

    // 2) Cargo com detalhe rico (insumo do IA3) + Top 5 + competência foco
    await client.query(
      `INSERT INTO cargos_empresa (empresa_id, nome, area_depto, descricao, eh_lideranca,
         principais_entregas, stakeholders, decisoes_recorrentes, tensoes_comuns,
         top5_workshop, competencia_foco)
       VALUES ($1, $2, $3, $4, true, $5, $6, $7, $8, $9::jsonb, $10)
       ON CONFLICT (empresa_id, nome) DO UPDATE
         SET area_depto = EXCLUDED.area_depto, descricao = EXCLUDED.descricao,
             eh_lideranca = true,
             principais_entregas = EXCLUDED.principais_entregas,
             stakeholders = EXCLUDED.stakeholders,
             decisoes_recorrentes = EXCLUDED.decisoes_recorrentes,
             tensoes_comuns = EXCLUDED.tensoes_comuns,
             top5_workshop = EXCLUDED.top5_workshop,
             competencia_foco = EXCLUDED.competencia_foco,
             updated_at = now()`,
      [empresa.id, CARGO, CARGO_DETALHE.area, CARGO_DETALHE.descricao,
       CARGO_DETALHE.principais_entregas, CARGO_DETALHE.stakeholders,
       CARGO_DETALHE.decisoes_recorrentes, CARGO_DETALHE.tensoes_comuns,
       JSON.stringify([COMP]), COMP],
    );
    console.log(`✅ cargo: ${CARGO} (top5_workshop=[${COMP}], competencia_foco=${COMP})`);

    // 3) Régua: DELETE+INSERT do cod_comp no tenant (idempotente)
    await client.query('DELETE FROM competencias WHERE empresa_id = $1 AND cod_comp = $2', [empresa.id, COD_COMP]);
    for (const d of DESCRITORES) {
      await client.query(
        `INSERT INTO competencias (empresa_id, cargo, pilar, cod_comp, nome, descricao,
           cod_desc, nome_curto, descritor_completo,
           n1_gap, n2_desenvolvimento, n3_meta, n4_referencia,
           evidencias_esperadas, perguntas_alvo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [empresa.id, CARGO, PILAR, COD_COMP, COMP, DESC_COMP,
         d.cod, d.curto, d.completo, d.n1, d.n2, d.n3, d.n4, d.evid, d.perg],
      );
    }
    const cnt = await client.query(
      'SELECT count(*)::int AS n FROM competencias WHERE empresa_id = $1 AND cod_comp = $2', [empresa.id, COD_COMP]);
    console.log(`✅ régua: ${cnt.rows[0].n} descritores de "${COMP}" pro cargo ${CARGO}`);

    // 4) PPP institucional (rede) — insumo do IA3/IA2 (DELETE+INSERT idempotente)
    await client.query('DELETE FROM ppp_escolas WHERE empresa_id = $1 AND escola = $2', [empresa.id, PPP_ESCOLA]);
    await client.query(
      `INSERT INTO ppp_escolas (empresa_id, escola, fonte, url_site, status, extracao, valores, extracted_at)
       VALUES ($1, $2, 'json', 'https://anchieta.br', 'extraido', $3, $4::jsonb, now())`,
      [empresa.id, PPP_ESCOLA, JSON.stringify(PPP_EXTRACAO), JSON.stringify(PPP_VALORES)],
    );
    console.log(`✅ PPP institucional: "${PPP_ESCOLA}" (extraido, ${Object.keys(PPP_EXTRACAO).length} seções + ${PPP_VALORES.length} valores)`);
    console.log('\nPróximos: vincular domínio no Vercel (botão em Configurações→Branding) · IA3 (cenários) · criar os 3 diretores.');
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
