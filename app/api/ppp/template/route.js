import { NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BLOCOS = [
  { title: 'Identificação (o resto a IA puxa do site)', questions: [
    { label: 'Nome da empresa', key: 'nome' },
    { label: 'URL do site institucional (pra IA enriquecer missão, valores, perfil público)', key: 'url_site' },
    { label: 'Em 1 frase: o que a empresa faz e pra quem', key: 'oneliner', lines: 2 },
  ]},
  { title: 'Desafios estratégicos atuais', questions: [
    { label: 'Top 3 desafios atuais (1 por linha)', key: 'desafios', lines: 4 },
    { label: 'Transformações em curso: digital, cultural, expansão (opcional)', key: 'transformacoes', lines: 3 },
  ]},
  { title: 'Tensões e dilemas recorrentes', questions: [
    { label: 'Conflitos típicos do dia a dia. Ex: velocidade vs qualidade, autonomia vs controle, áreas que se chocam', key: 'tensoes', lines: 5 },
  ]},
  { title: 'Cultura real: reconhecimento e não-tolerância', questions: [
    { label: 'O que é celebrado aqui? (comportamentos/resultados visivelmente reconhecidos)', key: 'celebrado', lines: 3 },
    { label: 'O que NÃO é tolerado? (comportamentos que levam a consequências)', key: 'nao_tolerado', lines: 3 },
  ]},
  { title: 'Cadência de rituais', questions: [
    { label: 'Rituais regulares e frequência: 1:1, dailies, retros, OKRs trimestrais, all-hands, etc', key: 'rituais', lines: 5 },
  ]},
  { title: 'Comunicação e decisão', questions: [
    { label: 'Canais principais de comunicação (Slack, email, Teams, WhatsApp, face-a-face)', key: 'canais' },
    { label: 'Tomada de decisão: centralizada, colegiada, por nível? Rápida ou lenta?', key: 'decisao', lines: 3 },
  ]},
  { title: 'Maturidade cultural', questions: [
    { label: 'Como erros são tratados? (blameless post-mortem, culpabilização, aprendizado)', key: 'erros', lines: 2 },
    { label: 'Psychological safety percebida (alta/média/baixa) - exemplos', key: 'safety', lines: 2 },
  ]},
  { title: 'Casos recentes (últimos 12 meses)', questions: [
    { label: 'Eventos marcantes: aquisições, crises, lançamentos, reestruturações (tipo + quando + 1 frase)', key: 'casos', lines: 5 },
  ]},
];

/**
 * GET /api/ppp/template
 * Baixa PDF com AcroForm (campos editáveis em qualquer leitor PDF).
 * Empresa preenche e sobe em /admin/ppp -extração LLM lê os valores.
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
    page.drawText(sanitize('Perfil Institucional - Formulário'), {
      x: MARGIN, y, size: 18, font: fontBold, color: rgb(0.05, 0.12, 0.25),
    });
    y -= 24;
    page.drawText(sanitize('Preencha cada campo. Seções vazias são ignoradas.'), {
      x: MARGIN, y, size: 10, font, color: rgb(0.4, 0.45, 0.55),
    });
    y -= 14;
    page.drawText(sanitize('Depois suba em /admin/ppp - a extração IA consolida automaticamente.'), {
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
      page.drawText(sanitize(bloco.title.toUpperCase()), {
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

// Remove chars fora do range WinAnsi (fontes standard do pdf-lib).
// Trocar por helper ASCII quando aparecer Unicode problemático (→, emoji, etc).
function sanitize(s) {
  return String(s || '').replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '');
}

function quebrarTexto(texto, font, size, maxWidth) {
  texto = sanitize(texto);
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
