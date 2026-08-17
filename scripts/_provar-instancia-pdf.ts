/* eslint-disable */
// Prova do bug de instância dupla do @react-pdf/renderer sob `tsx` e da correção
// em `renderConteudoFinalPDF`.
//
//   npx tsx scripts/_provar-instancia-pdf.ts
//
// 1) mostra que import estático × dinâmico são cópias diferentes do módulo (o
//    registro de fonte de uma não vale na outra);
// 2) renderiza um PDF pelo caminho REAL do produto — que é o que quebrava com
//    "Font family not registered: NotoSans".
import * as estatico from '@react-pdf/renderer';
import '@/components/pdf/styles'; // registra 'NotoSans' na instância estática
import { renderConteudoFinalPDF } from '@/lib/conteudo-final-pdf';

const MD = `## Verificação de fonte

Parágrafo com ligaduras (Perfil, oficial) e acentuação (ação, ética, órgão).

- item um
- item dois
`;

async function main() {
  const dinamico: any = await import('@react-pdf/renderer');
  const familias = (inst: any) => { try { return (inst.Font.getRegisteredFontFamilies?.() || []).length; } catch { return -1; } };
  console.log(`namespace idêntico: ${(dinamico as any) === (estatico as any)}`);
  console.log(`Font idêntico:      ${(dinamico as any).Font === (estatico as any).Font}`);
  console.log(`famílias registradas — estática: ${familias(estatico)} · dinâmica: ${familias(dinamico)}`);

  const buf = await renderConteudoFinalPDF({
    titulo: 'Teste de registro de fonte',
    conteudoMd: MD,
    competencia: 'CONSCIÊNCIA ORGANIZACIONAL E JURÍDICA',
    descritor: 'Conhecimento das normas',
    formato: 'texto',
    empresaNome: null, coverBase64: null, plan: null, sectionImageBase64: null,
  } as any);
  const pdf = Buffer.from(buf);
  const assinatura = pdf.subarray(0, 5).toString('latin1');
  console.log(`PDF: ${pdf.length} bytes · assinatura "${assinatura}"`);
  if (assinatura !== '%PDF-') throw new Error('saída não é um PDF válido');
  console.log('✅ render pelo caminho real do produto funcionou sob tsx');

  // ── Validação por mutação ────────────────────────────────────────────────
  // O MESMO componente, renderizado pela instância DINÂMICA (o código de antes),
  // tem de quebrar. Se passar, esta prova não prova nada.
  const { ConteudoFinalPDF } = await import('@/lib/conteudo-final-pdf');
  try {
    await dinamico.renderToBuffer(ConteudoFinalPDF({
      titulo: 'Teste', conteudoMd: MD, competencia: 'X', descritor: 'Y', formato: 'texto',
      empresaNome: null, coverBase64: null, plan: null, sectionImageBase64: null,
    } as any));
    console.log('⚠ o caminho ANTIGO também funcionou — a prova não discrimina, revisar.');
  } catch (e: any) {
    console.log(`✅ caminho antigo (import dinâmico) falha como esperado: ${String(e?.message).slice(0, 60)}`);
  }
}

main().catch((e) => { console.error(`❌ ${e?.message || e}`); process.exit(1); });
