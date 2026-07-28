/**
 * Testa a conversão PDF/DOCX → texto usada no upload do /board.
 *
 *   npx tsx scripts/painel/_conversao.mjs
 *   (tsx, não node: importa lib/rag-ingest.ts direto)
 *
 * Os dois casos que importam:
 *  1. PDF/DOCX com texto → o conteúdo tem que sair legível;
 *  2. PDF SEM texto (escaneado) → tem que ser RECUSADO. Se passar, o painel lê
 *     uma página em branco e responde como se tivesse lido — dano silencioso.
 */
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { parsePdf, parseDocx } from '../../lib/rag-ingest.ts'

const SEGREDO = 'PERGAMINHO-4417'
let falhas = 0
const ok = (cond, msg) => {
  console.log(`${cond ? '  ok  ' : '  FALHOU  '} ${msg}`)
  if (!cond) falhas++
}

// ---------------------------------------------------------------- PDF com texto
{
  const pdf = await PDFDocument.create()
  const fonte = await pdf.embedFont(StandardFonts.Helvetica)
  const p = pdf.addPage([595, 842])
  p.drawText('Relatorio interno da campanha', { x: 50, y: 780, size: 16, font: fonte })
  p.drawText(`O codigo de operacao e ${SEGREDO}.`, { x: 50, y: 750, size: 12, font: fonte })
  p.drawText('A meta e 137 escolas ate 12 de novembro.', { x: 50, y: 730, size: 12, font: fonte })

  const doc = await parsePdf(Buffer.from(await pdf.save()))
  const texto = (doc.text || '').trim()
  console.log('1) PDF com texto')
  ok(texto.includes(SEGREDO), `extraiu o código (${texto.length} chars)`)
  ok(texto.includes('137'), 'extraiu a meta')
}

// ---------------------------------------------------------------- PDF sem texto
{
  const pdf = await PDFDocument.create()
  pdf.addPage([595, 842]) // página em branco = o que um scan vira sem OCR
  const doc = await parsePdf(Buffer.from(await pdf.save()))
  const texto = (doc.text || '').trim()
  console.log('\n2) PDF sem texto extraível (simula escaneado)')
  ok(texto.length < 40, `texto insuficiente detectável: ${texto.length} chars — a action recusa abaixo de 40`)
}

// ---------------------------------------------------------------- DOCX
{
  // DOCX mínimo válido: zip com o XML do documento
  const { default: JSZip } = await import('jszip').catch(() => ({ default: null }))
  console.log('\n3) DOCX')
  if (!JSZip) {
    console.log('  (pulado — jszip não está no projeto; o caminho DOCX usa mammoth em produção)')
  } else {
    const zip = new JSZip()
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    zip.folder('_rels').file('.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    zip.folder('word').file('document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>O codigo de operacao e ${SEGREDO}.</w:t></w:r></w:p></w:body></w:document>`)
    const buf = await zip.generateAsync({ type: 'nodebuffer' })
    const doc = await parseDocx(buf)
    ok((doc.text || '').includes(SEGREDO), 'extraiu o código do DOCX')
  }
}

console.log(`\n${falhas ? `${falhas} FALHA(S)` : 'tudo ok'}`)
process.exit(falhas ? 1 : 0)
