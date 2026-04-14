import { NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const BLOCOS = [
  { title: 'Perfil Organizacional', questions: [
    { label: 'Nome da empresa', key: 'nome' },
    { label: 'Setor (ex: saúde, educação, varejo, tecnologia)', key: 'setor' },
    { label: 'Segmento específico', key: 'segmento' },
    { label: 'Porte (nº aproximado de colaboradores, faturamento se quiser)', key: 'porte' },
    { label: 'Localização (sede e unidades)', key: 'localizacao' },
    { label: 'Modelo de atuação (presencial/híbrido/remoto/multi-site)', key: 'modelo_atuacao' },
  ]},
  { title: 'Mercado e Stakeholders', questions: [
    { label: 'Perfil dos clientes e mercado atendido (2-3 frases)', key: 'clientes', lines: 3 },
    { label: 'Posicionamento competitivo e diferenciais', key: 'concorrencia', lines: 3 },
    { label: 'Stakeholders-chave (acionistas, reguladores, parceiros, comunidade)', key: 'stakeholders' },
  ]},
  { title: 'Identidade e Cultura', questions: [
    { label: 'Missão', key: 'missao', lines: 2 },
    { label: 'Visão', key: 'visao', lines: 2 },
    { label: 'Valores (separar por vírgulas)', key: 'valores', lines: 2 },
    { label: 'Modelo de gestão / estilo de liderança', key: 'modelo_gestao', lines: 3 },
    { label: 'Cultura declarada (elementos culturais explícitos)', key: 'cultura', lines: 3 },
  ]},
  { title: 'Operação e Processos', questions: [
    { label: 'Principais áreas e funções (uma por linha)', key: 'areas', lines: 6 },
    { label: 'Processos-chave ou rotinas mencionadas', key: 'processos', lines: 3 },
  ]},
  { title: 'Modelo de Pessoas', questions: [
    { label: 'Programas de desenvolvimento, trilhas, mentorias', key: 'desenvolvimento', lines: 3 },
    { label: 'Modelo de avaliação de desempenho', key: 'avaliacao', lines: 2 },
    { label: 'Progressão e carreira', key: 'carreira', lines: 2 },
    { label: 'Políticas de diversidade e inclusão', key: 'di', lines: 2 },
  ]},
  { title: 'Governança e Decisão', questions: [
    { label: 'Estrutura (hierarquia, comitês, autonomia)', key: 'estrutura', lines: 3 },
    { label: 'Tomada de decisão (centralizada, colegiada, por nível)', key: 'decisao', lines: 2 },
    { label: 'Compliance (regulações, certificações, normas)', key: 'compliance', lines: 2 },
  ]},
  { title: 'Tecnologia e Recursos', questions: [
    { label: 'Ferramentas e sistemas (ERPs, plataformas)', key: 'ferramentas', lines: 2 },
    { label: 'Capacidades (labs, centros de inovação)', key: 'capacidades', lines: 2 },
    { label: 'Limitações ou gaps tecnológicos', key: 'limitacoes', lines: 2 },
  ]},
  { title: 'Desafios Estratégicos', questions: [
    { label: 'Top 3 desafios estratégicos atuais', key: 'desafios', lines: 4 },
    { label: 'Metas declaradas (curto e médio prazo)', key: 'metas', lines: 3 },
    { label: 'Transformações em curso (digital, cultural, expansão)', key: 'transformacoes', lines: 3 },
  ]},
  { title: 'Vocabulário Corporativo', questions: [
    { label: 'Siglas, jargões e termos internos (formato: SIGLA = significado, uma por linha)', key: 'vocabulario', lines: 6 },
  ]},
  { title: 'Tensões e Dilemas', questions: [
    { label: 'Conflitos ou dilemas recorrentes (ex: velocidade vs qualidade, autonomia vs controle)', key: 'tensoes', lines: 5 },
  ]},
  { title: 'Cadência de Rituais', questions: [
    { label: 'Rituais individuais (1:1, check-ins, freq)', key: 'rituais_ind', lines: 2 },
    { label: 'Rituais de time (dailies, retros, plannings, all-hands)', key: 'rituais_time', lines: 3 },
    { label: 'Ciclos estratégicos (OKRs trimestrais, budget, pulse)', key: 'ciclos', lines: 2 },
  ]},
  { title: 'Stakeholders por Área', questions: [
    { label: 'Para cada área principal: quem são seus clientes internos? (formato: Área → depende de X, Y)', key: 'stakeholders_area', lines: 6 },
  ]},
  { title: 'Casos Recentes (últimos 12 meses)', questions: [
    { label: 'Aquisições, incidentes, lançamentos, crises ou transformações (tipo + descrição + quando)', key: 'casos', lines: 5 },
  ]},
  { title: 'Perfil da Força de Trabalho', questions: [
    { label: 'Geração dominante (ex: millennials 30-40, gen X 40+, mix)', key: 'geracao' },
    { label: 'Seniority médio (junior, pleno, senior predominante)', key: 'seniority' },
    { label: 'Turnover (alto/médio/baixo, se souber)', key: 'turnover' },
    { label: 'Formação típica (graduação, pós, diversos)', key: 'formacao' },
  ]},
  { title: 'Reconhecimento e Não-Tolerância', questions: [
    { label: 'O que é celebrado aqui (comportamentos/resultados visivelmente reconhecidos)', key: 'celebrado', lines: 3 },
    { label: 'O que não é tolerado (comportamentos que levam a consequências)', key: 'nao_tolerado', lines: 3 },
    { label: 'Mecanismos (prêmio, reconhecimento público, feedback, promoção)', key: 'mecanismos', lines: 2 },
  ]},
  { title: 'Comunicação Interna', questions: [
    { label: 'Canais principais (Slack, email, Teams, WhatsApp, face-a-face)', key: 'canais' },
    { label: 'Padrão (síncrono, assíncrono, misto)', key: 'padrao' },
    { label: 'Formalidade (alta, média, informal)', key: 'formalidade' },
    { label: 'Transparência (all-hands, dados abertos, etc)', key: 'transparencia', lines: 2 },
  ]},
  { title: 'Maturidade Cultural', questions: [
    { label: 'Psychological safety (alta/média/baixa — evidências)', key: 'safety', lines: 2 },
    { label: 'Tratamento de erros (blameless post-mortem, culpabilização, aprendizado)', key: 'erros', lines: 2 },
    { label: 'Velocidade de decisão (rápida/média/lenta — por quê)', key: 'velocidade', lines: 2 },
    { label: 'Abertura à mudança (alta/média/baixa)', key: 'mudanca' },
  ]},
];

/**
 * GET /api/ppp/template
 * Baixa PDF com AcroForm (campos editáveis em qualquer leitor PDF).
 * Empresa preenche e sobe em /admin/ppp — extração LLM lê os valores.
 */
export async function GET() {
  try {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const form = pdfDoc.getForm();

    const PAGE_WIDTH = 595.28;  // A4 portrait
    const PAGE_HEIGHT = 841.89;
    const MARGIN = 40;
    const MAX_Y = PAGE_HEIGHT - MARGIN;
    const MIN_Y = MARGIN + 30;
    const LINE_HEIGHT = 12;

    let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = MAX_Y;

    // Capa
    page.drawText('Perfil Institucional — Formulário', {
      x: MARGIN, y, size: 18, font: fontBold, color: rgb(0.05, 0.12, 0.25),
    });
    y -= 24;
    page.drawText('Preencha cada campo. Seções vazias são ignoradas.', {
      x: MARGIN, y, size: 10, font, color: rgb(0.4, 0.45, 0.55),
    });
    y -= 14;
    page.drawText('Depois suba em /admin/ppp → a extração IA consolida automaticamente.', {
      x: MARGIN, y, size: 10, font, color: rgb(0.4, 0.45, 0.55),
    });
    y -= 24;

    let fieldIdx = 0;

    for (const bloco of BLOCOS) {
      // Calcula altura necessária do bloco (header + perguntas + campos)
      const alturaBloco = 22 + bloco.questions.reduce((acc, q) => {
        const labelLines = Math.ceil(q.label.length / 90);
        const inputHeight = (q.lines || 1) * 16;
        return acc + labelLines * LINE_HEIGHT + inputHeight + 10;
      }, 0);

      if (y - alturaBloco < MIN_Y) {
        page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = MAX_Y;
      }

      // Header do bloco
      page.drawRectangle({
        x: MARGIN - 4, y: y - 4, width: PAGE_WIDTH - 2 * MARGIN + 8, height: 20,
        color: rgb(0.05, 0.12, 0.25),
      });
      page.drawText(bloco.title.toUpperCase(), {
        x: MARGIN, y: y + 2, size: 10, font: fontBold, color: rgb(1, 1, 1),
      });
      y -= 24;

      for (const q of bloco.questions) {
        // Label (quebra em múltiplas linhas se precisar)
        const labelLines = quebrarTexto(q.label, font, 9, PAGE_WIDTH - 2 * MARGIN);
        for (const line of labelLines) {
          page.drawText(line, {
            x: MARGIN, y, size: 9, font, color: rgb(0.2, 0.25, 0.35),
          });
          y -= LINE_HEIGHT;
        }
        y -= 2;

        // Campo editável
        const linhas = q.lines || 1;
        const inputHeight = linhas * 16;
        fieldIdx++;
        const fieldName = `${bloco.title.replace(/\W+/g, '_')}__${q.key}`;

        const textField = form.createTextField(fieldName);
        textField.setText('');
        if (linhas > 1) textField.enableMultiline();
        textField.addToPage(page, {
          x: MARGIN, y: y - inputHeight + 2,
          width: PAGE_WIDTH - 2 * MARGIN, height: inputHeight,
          borderColor: rgb(0.8, 0.85, 0.9),
          backgroundColor: rgb(0.97, 0.98, 1),
          borderWidth: 0.5,
        });
        y -= inputHeight + 10;
      }
      y -= 6;
    }

    const pdfBytes = await pdfDoc.save();
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="vertho-perfil-institucional-template.pdf"',
      },
    });
  } catch (err) {
    console.error('[ppp/template]', err);
    return NextResponse.json({ error: err?.message || 'Erro' }, { status: 500 });
  }
}

function quebrarTexto(texto, font, size, maxWidth) {
  const words = texto.split(/\s+/);
  const lines = [];
  let atual = '';
  for (const w of words) {
    const teste = atual ? `${atual} ${w}` : w;
    const width = font.widthOfTextAtSize(teste, size);
    if (width > maxWidth && atual) {
      lines.push(atual);
      atual = w;
    } else {
      atual = teste;
    }
  }
  if (atual) lines.push(atual);
  return lines;
}
