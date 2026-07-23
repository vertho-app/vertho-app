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

// Logo fake do tenant (PNG local do public/) pra validar a branding dupla
const fakeLogo = fs.readFileSync(path.join(process.cwd(), 'public', 'beto-avatar.jpg'));
const logoEmpresaBase64 = `data:image/jpeg;base64,${fakeLogo.toString('base64')}`;

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

// 1) pt-BR com logo do tenant (branding dupla completa)
async function main() {
  await save('certificado-ptbr-com-logo', await renderCertificadoPDF({ ...base, logoEmpresaBase64 }));
  // 2) pt-BR SEM logo (fallback: nome da empresa em texto)
  await save('certificado-ptbr-sem-logo', await renderCertificadoPDF({ ...base, logoEmpresaBase64: null }));
  // 3) en-US com logo
  await save('certificado-enus', await renderCertificadoPDF({
    ...base,
    empresa: { nome: 'Acme School', locale: 'en-US' },
    logoEmpresaBase64,
  }));
}

main().catch((e) => { console.error(e); process.exit(1); });
