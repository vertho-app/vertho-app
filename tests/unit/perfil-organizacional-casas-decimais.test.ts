import { describe, expect, it } from 'vitest';
import { COMP_LABEL, LIDERANCA, computePerfilOrg, recortePorCargo } from '@/lib/perfil-organizacional/aggregate';
import { renderPerfilOrgPDF } from '@/lib/perfil-organizacional-pdf';

/** 14 pessoas em 2 cargos, com valores quebrados para as médias e os % saírem com várias casas. */
function linhas() {
  return Array.from({ length: 14 }, (_, k) => {
    const row: Record<string, any> = {
      nome_completo: `Pessoa ${k + 1}`,
      cargo: k < 8 ? 'Cargo A' : 'Cargo B',
      d_natural: 20 + ((k * 7) % 55) + 0.37,
      i_natural: 15 + ((k * 11) % 50) + 0.21,
      s_natural: 30 + ((k * 5) % 60) + 0.43,
      c_natural: 25 + ((k * 13) % 55) + 0.29,
    };
    COMP_LABEL.forEach((c, idx) => { row[c.key] = 30 + ((k * 13 + idx * 7) % 50) + 0.31; });
    Object.keys(LIDERANCA).forEach((key, idx) => { row[key] = 20 + ((k * 9 + idx * 17) % 40) + 0.17; });
    return row;
  });
}

async function textoDoPdf(): Promise<string> {
  const rows = linhas();
  // como `aggregatePerfilOrg` monta: o geral + o recorte por cargo (sem ele a página de cargos nem é renderizada)
  const p = { ...computePerfilOrg(rows), porCargo: recortePorCargo(rows) };
  const buf = await renderPerfilOrgPDF({ empresaNome: 'Empresa Teste', dataRef: '08/10/2026', p });
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

describe('Perfil Organizacional: números no PDF com 1 casa decimal', () => {
  it('nenhum número do PDF sai com 2 ou mais casas decimais (médias, %, competências, liderança, cargos)', async () => {
    const texto = await textoDoPdf();
    const com2 = texto.match(/\d+[.,]\d{2,}/g) ?? [];
    expect(com2).toEqual([]);
  }, 60000);

  it('e os números quebrados aparecem com exatamente 1 casa (o teste não passa por o PDF ter sumido com eles)', async () => {
    const texto = await textoDoPdf();
    expect(texto).toMatch(/Média: \d+\.\d(?!\d)/);       // média dos fatores
    expect(texto).toMatch(/\(\d+\.\d%\)/);                // % da liderança (cargo e panorama)
    expect(texto).toMatch(/Liderança: O \S+ \(\d+\.\d%\)/); // bloco de cada cargo (a página de cargos foi renderizada)
    expect(texto).toMatch(/\d+\.\d%/);                    // fatores altos/baixos e talentos
  }, 60000);
});
