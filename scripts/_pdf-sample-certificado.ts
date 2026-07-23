/**
 * Gera amostras do Certificado de Conclusão pra conferência visual.
 * Uso: npx tsx scripts/_pdf-sample-certificado.ts
 * Saída: ~/Downloads/vertho-pdf-samples (ou PDF_OUT).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderCertificadoPDF } from '@/lib/certificado-pdf';

const OUT = (process.env.PDF_OUT || path.join(os.homedir(), 'Downloads', 'vertho-pdf-samples'));
fs.mkdirSync(OUT, { recursive: true });

async function save(nome: string, bytes: Uint8Array | Buffer) {
  const p = path.join(OUT, nome + '.pdf');
  fs.writeFileSync(p, Buffer.from(bytes));
  console.log('OK', p, (Buffer.from(bytes).length / 1024 | 0) + 'KB');
}

const participacao = { semanasComEntrega: 12, totalSemanas: 14, pct: 12 / 14, elegivel: true };

const base = {
  colab: { nome: 'Ana Beatriz Nogueira Santos', cargo: 'Professora' },
  trilha: {
    numeroTemporada: 2,
    competencias: ['Comunicação Assertiva', 'Gestão de Conflitos'],
    dataInicio: '2026-03-02T00:00:00.000Z',
    dataConclusao: '2026-06-14T18:22:00.000Z',
  },
  empresa: { nome: 'Colégio Acme', locale: 'pt-BR' },
  participacao,
};

async function main() {
  await save('certificado-ptbr', await renderCertificadoPDF(base));
  await save('certificado-enus', await renderCertificadoPDF({
    ...base,
    empresa: { nome: 'Acme School', locale: 'en-US' },
  }));
}

main().catch((e) => { console.error(e); process.exit(1); });
