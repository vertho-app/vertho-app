import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { rotuloNivel } from '@/lib/nivel-regua';
import { emailPilula, emailEvidencia, emailAvaliacaoFinal, emailMissao, emailPilulaPendente, emailSemanaPendente } from '@/lib/notifications/pilula-envio';
import { magicLinkEmail, signupEmail, magicLinkWhatsapp, signupWhatsapp, otpWhatsapp } from '@/lib/i18n-auth-templates';
import ptBR from '@/messages/pt-BR.json';
import ptPT from '@/messages/pt-PT.json';
import esES from '@/messages/es-ES.json';
import enUS from '@/messages/en-US.json';

/**
 * Vocabulário canônico do produto (R-50 a R-56, R-107, R-120, R-121, R-123),
 * registrado em docs/DESIGN-SYSTEM.md. Estes testes travam as decisões que o
 * código e o catálogo precisam cumprir juntos, nos quatro idiomas.
 */
const CATALOGOS: Record<string, any> = { 'pt-BR': ptBR, 'pt-PT': ptPT, 'es-ES': esES, 'en-US': enUS };

/** Todas as folhas de texto do catálogo, com o caminho, fora do /admin (que é a operação da Vertho). */
function folhasDoCliente(cat: any): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const andar = (o: any, p: string) => {
    if (typeof o === 'string') out.push([p, o]);
    else if (Array.isArray(o)) o.forEach((v, i) => andar(v, `${p}[${i}]`));
    else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) andar(v, p ? `${p}.${k}` : k);
  };
  andar(cat, '');
  return out.filter(([p]) => !p.startsWith('Admin'));
}

describe('rótulo de nível: o catálogo e o helper escrevem igual (R-53)', () => {
  it('"Nível {n}" do catálogo é o rotuloNivel longo, nos quatro idiomas', () => {
    for (const [idioma, cat] of Object.entries(CATALOGOS)) {
      for (const n of [1, 2, 3, 4]) {
        const doCatalogo = String(cat.Pdi.levelValue).replace('{n}', String(n));
        expect(rotuloNivel(n, { idioma }), `${idioma} nível ${n}`).toBe(doCatalogo);
      }
    }
  });

  it('nenhum catálogo rotula o nível por público ("Gap", "Meta" como nome de nível, "Bom", "Atenção")', () => {
    for (const [idioma, cat] of Object.entries(CATALOGOS)) {
      const colunas = Object.values(cat.RhReports.dashboard.roles.descriptors.levels) as string[];
      for (const rotulo of colunas) {
        expect(rotulo, `${idioma}: ${rotulo}`).toMatch(/^N[1-4]( \((meta|goal)\))?$/);
      }
    }
  });
});

describe('fases da jornada: um nome por etapa, no i18n (R-50, R-51)', () => {
  it('cada fase tem título no catálogo da home e da jornada, nos quatro idiomas', () => {
    for (const [idioma, cat] of Object.entries(CATALOGOS)) {
      for (const ns of ['DashboardHome', 'DashboardJourney']) {
        const titulos = cat[ns].phaseTitles;
        expect(Object.keys(titulos).sort(), `${idioma} ${ns}`).toEqual(['1', '2', '3', '4', '5']);
        for (const t of Object.values(titulos)) expect(String(t).length).toBeGreaterThan(1);
      }
    }
  });

  it('a fase 1 é o Perfil e a fase 2 é o Mapeamento: "Diagnóstico" e "Avaliação" saem do nome das etapas', () => {
    expect(ptBR.DashboardHome.phaseTitles['1']).toBe('Perfil');
    expect(ptBR.DashboardHome.phaseTitles['2']).toBe('Mapeamento');
    expect(ptBR.DashboardHome.phaseLabels.assessment).toBe('Mapeamento');
    expect(ptBR.DashboardHome.fallbackPhaseTitle).toBe('Perfil');
    const loaders = readFileSync('lib/home/loaders.ts', 'utf8');
    expect(loaders).not.toMatch(/titulo: 'Diagnóstico'/);
    expect(loaders).not.toMatch(/titulo: 'Avaliação'/);
    expect(loaders).not.toMatch(/titulo: 'Temporada'/);
  });

  it('a sigla "OPQ" não aparece na faixa de fases (R-56)', () => {
    const home = readFileSync('app/dashboard/page.tsx', 'utf8');
    expect(home).not.toContain("'OPQ'");
  });

  it('os botões do mapeamento não dizem "avaliação" (R-50)', () => {
    expect(ptBR.Assessment.intro.start).toBe('Iniciar mapeamento');
    expect(ptBR.Assessment.representativity.submit).toBe('Enviar respostas');
    for (const [idioma, cat] of Object.entries(CATALOGOS)) {
      expect(cat.Assessment.intro.start, idioma).not.toMatch(/avalia|evalua|assess|review|▶/i);
      expect(cat.Assessment.representativity.submit, idioma).not.toMatch(/avalia|evalua|assess|review|✓/i);
    }
  });

  it('os avisos de bloqueio do mapeamento não chamam a etapa de "Diagnóstico" (R-51)', () => {
    for (const [idioma, cat] of Object.entries(CATALOGOS)) {
      const textos = Object.values(cat.Assessment.bloqueio).map((b: any) => b.text).join(' ');
      expect(textos, idioma).not.toMatch(/diagn[oó]stic|diagnosis/i);
    }
    const gate = readFileSync('lib/access-gates/diagnostico-ordem.ts', 'utf8');
    expect(gate).not.toContain('antes do Diagnóstico');
  });
});

describe('a unidade de 7 semanas se chama Jornada (R-52)', () => {
  it('"Temporada" e "Season" saem do texto do colaborador, do gestor e do RH', () => {
    const proibidos: Record<string, RegExp> = {
      'pt-BR': /temporada/i,
      'pt-PT': /temporada/i,
      'es-ES': /temporada/i,
      'en-US': /\bseasons?\b/i,
    };
    for (const [idioma, cat] of Object.entries(CATALOGOS)) {
      const achados = folhasDoCliente(cat).filter(([, v]) => proibidos[idioma].test(v)).map(([p]) => p);
      expect(achados, `${idioma}: ainda diz temporada`).toEqual([]);
    }
  });

  it('o menu separa Jornada (as fases) de Semanas (a página das semanas)', () => {
    expect(ptBR.DashboardShell.nav.journey).toBe('Jornada');
    expect(ptBR.DashboardShell.nav.season).toBe('Semanas');
    expect(esES.DashboardShell.nav.journey).toBe('Recorrido');
    expect(enUS.DashboardShell.nav.season).toBe('Weeks');
  });

  it('o gestor lê "jornada" onde dizia "trilha" (pt-BR e pt-PT)', () => {
    for (const cat of [ptBR, ptPT]) {
      const gestor = folhasDoCliente((cat as any).ManagerDashboard).map(([, v]) => v).join(' ');
      expect(gestor).not.toMatch(/trilha/i);
    }
  });
});

describe('desafio e evidências (R-120)', () => {
  it('a tarefa da semana é "Desafio": "Missão" e "Episódio" saem do texto da semana (pt-BR)', () => {
    const semana = folhasDoCliente({ a: ptBR.SeasonWeek, b: ptBR.Season, c: ptBR.SeasonDone, d: ptBR.JourneyHistory })
      .map(([, v]) => v).join(' | ');
    expect(semana).not.toMatch(/miss(ão|ões)/i);
    expect(semana).not.toMatch(/episódio/i);
  });

  it('o registro da semana é "Evidências": sem "Feedback (Evidências)" nem "Relato da Missão"', () => {
    for (const [idioma, cat] of Object.entries(CATALOGOS)) {
      const t = cat.SeasonWeek.evidence;
      expect(t.feedback, idioma).not.toMatch(/feedback/i);
      expect(t.missionReport, idioma).not.toMatch(/relato|report|mission|misi/i);
    }
  });
});

describe('o travessão não aparece na copy fixa do cliente (R-122)', () => {
  it('nenhuma chave de cliente, em nenhum idioma, tem travessão', () => {
    for (const [idioma, cat] of Object.entries(CATALOGOS)) {
      const achados = folhasDoCliente(cat).filter(([, v]) => /[\u2014\u2013]/.test(v)).map(([p]) => p);
      expect(achados, `${idioma}: travessão em`).toEqual([]);
    }
  });
});

describe('jargão de rótulo (R-123)', () => {
  it('"Magic Link", "dashboard", "Checklist Tático", "Insight do dia" e "gap" saem da copy do cliente (pt-BR)', () => {
    const texto = folhasDoCliente(ptBR).map(([, v]) => v).join(' | ');
    expect(texto).not.toMatch(/magic link/i);
    expect(texto).not.toMatch(/dashboard/i);
    expect(texto).not.toMatch(/checklist/i);
    expect(texto).not.toMatch(/insight do dia/i);
    expect(texto).not.toMatch(/\bgaps?\b/i);
  });

  it('nenhum emoji no chrome do cliente, nos quatro idiomas', () => {
    const emoji = /\p{Extended_Pictographic}/u;
    for (const [idioma, cat] of Object.entries(CATALOGOS)) {
      const achados = folhasDoCliente(cat).filter(([, v]) => emoji.test(v)).map(([p]) => p);
      expect(achados, idioma).toEqual([]);
    }
    // os formatos de aprendizagem usam ícone Lucide, não emoji
    expect(readFileSync('components/preferencias-aprendizagem-form.tsx', 'utf8')).not.toMatch(emoji);
  });

  it('R-121: es-ES abre a exclamação, o inglês chama o colaborador de Employee e o seletor usa o nome de cada idioma', () => {
    const faltando = folhasDoCliente(esES).filter(([, v]) => /!/.test(v) && !/\u00a1/.test(v)).map(([p]) => p);
    expect(faltando).toEqual([]);
    expect(enUS.Profile.roles.colaborador).toBe('Employee');
    // o seletor de idioma escreve cada idioma pelo próprio nome, igual em todos os catálogos
    for (const cat of Object.values(CATALOGOS)) {
      expect(cat.Common.locales).toEqual({
        'pt-BR': 'Português (Brasil)', 'pt-PT': 'Português (Portugal)', 'es-ES': 'Español', 'en-US': 'English',
      });
    }
    // pt-PT diz devolutiva, como o pt-BR (não "feedback" no simulador de vendas)
    const valores = (o: any) => folhasDoCliente(o).map(([, v]) => v).join(' | ');
    expect(valores(ptPT.SimuladorVendas)).not.toMatch(/feedback/i);
    // a degustação não vira "demo" em inglês nem "demostración" em espanhol
    expect(valores(enUS.DashboardJourney)).not.toMatch(/\bdemo\b/i);
    expect(valores(esES.DashboardJourney)).not.toMatch(/demostraci/i);
  });
});


/** Linhas de código com texto visível: sem comentário (que é do time, não do cliente). */
const visivel = (arquivo: string): string =>
  readFileSync(arquivo, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/\s.*$/gm, '')
    .split(/\r?\n/)
    .join('\n');

const TRAVESSAO = /[\u2014\u2013]/;

describe('e-mails da semana e de acesso (R-52, R-54, R-120, R-121, R-122)', () => {
  const BASE = 'https://acme.vertho.ai';
  const item = { competencia: 'Comunicação', descritor: 'Escuta ativa' };
  const emails: Array<[string, { subject: string; html: string }]> = [
    ['conteúdo da semana', emailPilula('Maria Souza', item, { semana: 3, baseUrl: BASE, formato: 'texto' })],
    ['evidências', emailEvidencia('Maria', { semana: 3, baseUrl: BASE })],
    ['avaliação final (abertura)', emailAvaliacaoFinal('Maria', { semana: 7, baseUrl: BASE, momento: 'abertura' })],
    ['avaliação final (cobrança)', emailAvaliacaoFinal('Maria', { semana: 7, baseUrl: BASE, momento: 'cobranca' })],
    ['desafio de aplicação', emailMissao('Maria', { semana: 4, baseUrl: BASE, acaoPrincipal: 'Aplicar a escuta ativa' })],
    ['conteúdo pendente', emailPilulaPendente('Maria', item, { semana: 3, baseUrl: BASE, formato: 'texto' })],
    ['semana pendente', emailSemanaPendente('Maria', { semana: 3, semanaPendente: 2, baseUrl: BASE })],
  ];

  it('nenhum e-mail da cadência tem travessão nem emoji', () => {
    for (const [nome, e] of emails) {
      expect(e.subject + e.html, nome).not.toMatch(TRAVESSAO);
      expect(e.subject + e.html, nome).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('o e-mail diz jornada, conteúdo e desafio: sem trilha, pílula, missão nem "Mentora IA"', () => {
    for (const [nome, e] of emails) {
      expect(e.subject + e.html, nome).not.toMatch(/trilha|pílula|miss(ão|ões)|mentora/i);
    }
    expect(emails[0][1].subject).toBe('Seu conteúdo da semana 3: Comunicação \u00b7 Escuta ativa');
    expect(emails[1][1].subject).toBe('Evidências da semana 3: pendente');
    expect(emails[1][1].html).toContain('da sua jornada');
    expect(emails[4][1].html).toContain('desafio');
    expect(emails[4][1].html).toContain('a conversa de evidências');
  });

  it('o e-mail de acesso, nos quatro idiomas, não tem travessão e o es-ES abre a exclamação', () => {
    for (const locale of ['pt-BR', 'pt-PT', 'es-ES', 'en-US'] as const) {
      const p = { nome: 'Ana', empresaNome: 'Acme', link: 'https://acme.vertho.ai/x' };
      const textos = [
        magicLinkEmail(locale, p).subject, magicLinkEmail(locale, p).html,
        signupEmail(locale, p).subject, signupEmail(locale, p).html,
        magicLinkWhatsapp(locale, p), signupWhatsapp(locale, p),
        otpWhatsapp(locale, { empresaNome: 'Acme', code: '123456' }),
      ];
      for (const t of textos) expect(t, locale).not.toMatch(TRAVESSAO);
      expect(magicLinkEmail(locale, p).subject, locale).toMatch(/^Acme: /);
    }
    expect(magicLinkEmail('es-ES', { nome: 'Ana', empresaNome: 'Acme', link: 'x' }).html).toContain('\u00a1Hola, Ana!');
    expect(magicLinkWhatsapp('es-ES', { nome: 'Ana', empresaNome: 'Acme', link: 'x' })).toContain('\u00a1Hola, Ana!');
  });
});

describe('PDFs, certificado e proposta (R-52, R-120, R-122)', () => {
  it('o PDF do PDI diz jornada, não ciclo, trilha nem "Sprint de 30 Dias"', () => {
    for (const arquivo of ['components/pdf/RelatorioIndividual.tsx', 'components/pdf/CompetencyBlock.tsx']) {
      const fonte = visivel(arquivo);
      expect(fonte, arquivo).not.toMatch(/Sprint de 30|Ciclo \$\{|Ciclo \d|ciclo a ciclo|Missão prática|do ciclo|cada ciclo/);
      expect(fonte, arquivo).not.toMatch(/Sua trilha|na trilha|sua trilha/);
    }
    expect(visivel('components/pdf/CompetencyBlock.tsx')).toContain("'Plano de 30 dias'");
  });

  it('o certificado diz Jornada, Recorrido e Journey (não Temporada nem Season)', () => {
    const fonte = visivel('lib/certificado-pdf.tsx');
    expect(fonte).not.toMatch(/Temporada \$\{|Season \$\{|Programa de Desarrollo/);
    expect(fonte).toContain('Jornada ${n}');
    expect(fonte).toContain('Recorrido ${n}');
    expect(fonte).toContain('Journey ${n}');
  });

  it('o PDF da jornada concluída e os relatórios não imprimem temporada, tutor nem travessão', () => {
    for (const arquivo of [
      'lib/temporada-concluida-pdf.tsx', 'components/pdf/RelatorioEngajamento.tsx', 'components/pdf/RelatorioGestor.tsx',
      'components/pdf/RelatorioRH.tsx', 'components/pdf/RelatorioEvolucao.tsx', 'components/pdf/PdfReportCover.tsx',
      'lib/dna-organizacional-pdf.tsx', 'lib/perfil-organizacional-pdf.tsx', 'lib/adequacao-cargo-pdf.tsx',
      'components/pdf/RelatorioIndividual.tsx', 'components/pdf/CompetencyBlock.tsx', 'lib/certificado-pdf.tsx',
    ]) {
      const fonte = visivel(arquivo)
        // o travessão como marca de "sem valor" numa célula é glifo, não frase
        .replace(/'\\u2014'/g, "''").replace(/'\u2014'/g, "''");
      expect(fonte, arquivo).not.toMatch(/Temporada [^P]|de temporada|tutor 10|Tutor/);
      const fraseComTravessao = fonte.split('\n').filter((l) => TRAVESSAO.test(l) || /\\u2014|\\u2013/.test(l));
      expect(fraseComTravessao, arquivo).toEqual([]);
    }
  });

  it('o DNA diz "Nível N" e "meta", sem GAP nem "Em Desenvolvimento" como rótulo de nível', () => {
    const dna = visivel('lib/dna-organizacional-pdf.tsx');
    expect(dna).not.toMatch(/GAP|Em Desenvolvimento|Referência'/);
    expect(dna).toContain('rotuloNivel(1)');
  });

  it('a proposta diz jornada onde dizia ciclo e trilha, e "Plano de Desenvolvimento Individual"', () => {
    for (const arquivo of ['lib/sales/proposal-document.ts', 'app/proposta/[token]/page.tsx', 'components/pdf/PropostaComercialPDF.tsx']) {
      const fonte = visivel(arquivo);
      // `pg.ciclos` é o nome do campo do orçamento; o travessão como marca de "sem valor" numa célula é glifo, não frase
      const texto = fonte.replace(/'[\u2014]'/g, "''");
      expect(texto, arquivo).not.toMatch(/(?<![.\w])ciclos?\b|Trilha|trilha e|Individualizado/);
      expect(texto, arquivo).not.toMatch(TRAVESSAO);
    }
    expect(visivel('lib/orcamento/cenario.ts')).not.toMatch(/'ciclo'|ao fim de cada ciclo/);
  });

  it('R-56: a visão do RH não imprime o estado da auditoria da segunda IA (PDF do parecer e porta do RH)', () => {
    const pdf = visivel('lib/prontidao-lideranca/parecer-pdf.tsx');
    expect(pdf).toContain('p.exibeNota === true && l.auditoriaPendente');
    expect(pdf).toContain("!ev.descritores.length ? 'sem avaliação' : p.exibeNota === true");
    const porta = visivel('lib/prontidao-lideranca/cliente.ts');
    expect(porta).toContain('auditoriaPendente: false');
    expect(porta).toContain('auditoria: null');
  });

  it('R-54: gestor e RH leem Tira-Dúvidas, não "Tutor", no engajamento', () => {
    for (const arquivo of [
      'app/dashboard/gestor/engajamento/team-engagement.tsx', 'components/engajamento/engagement-panel.tsx',
      'components/engajamento/engagement-report.tsx', 'components/engajamento/evolution-panel.tsx',
    ]) {
      const fonte = visivel(arquivo);
      expect(fonte, arquivo).not.toMatch(/label="Tutor"| Tutor\n|uso do tutor|tutor 10|com o tutor|Acionaram o tutor/);
    }
  });

  it('R-55: o gestor sem equipe não lê o nome da coluna nem é mandado ao /admin', () => {
    for (const cat of Object.values(CATALOGOS)) {
      const corpo = cat.ManagerDashboard.noReports.body as string;
      expect(corpo).not.toMatch(/gestor_email|<code>|Gerenciar colaboradores|Manage team members|Gestionar colaboradores|Gerir colaboradores/);
      expect(corpo).toMatch(/Vertho/);
    }
    // quem controla o envio do resumo do gestor é a Vertho (o RH não opera)
    expect(visivel('lib/notifications/ver-gestor.ts')).not.toContain('é o RH da sua empresa');
  });
});
