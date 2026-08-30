import './_env';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  buildAcmeOrganizationReportArtifacts,
  uploadAcmeOrganizationReportArtifacts,
} from '../lib/demo/acme-organization-reports';

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: company, error } = await sb.from('empresas')
    .select('id,nome,slug')
    .eq('slug', 'acme-demo')
    .single();
  if (error) throw error;

  const artifacts = await buildAcmeOrganizationReportArtifacts(sb, company.id, company.nome);
  const outputDir = path.resolve('output/pdf');
  await mkdir(outputDir, { recursive: true });
  const profileOutput = path.join(outputDir, 'ACME-Demo-Perfil-Organizacional.pdf');
  const dnaOutput = path.join(outputDir, 'ACME-Demo-DNA-Organizacional.pdf');
  await Promise.all([
    writeFile(profileOutput, artifacts.profile.buffer),
    writeFile(dnaOutput, artifacts.dna.buffer),
  ]);

  if (process.argv.includes('--upload')) {
    await uploadAcmeOrganizationReportArtifacts(sb, artifacts);
  }

  const verified = process.argv.includes('--upload')
    ? await Promise.all([artifacts.profile, artifacts.dna].map(async (artifact) => {
        const { data, error: downloadError } = await sb.storage.from('conteudos').download(artifact.path);
        if (downloadError) throw downloadError;
        const bytes = Buffer.from(await data.arrayBuffer());
        if (bytes.subarray(0, 4).toString() !== '%PDF') {
          throw new Error(`arquivo inválido no storage: ${artifact.path}`);
        }
        return { path: artifact.path, bytes: bytes.length, signature: '%PDF' };
      }))
    : [];

  console.log(JSON.stringify({
    uploaded: process.argv.includes('--upload'),
    verified,
    companyId: company.id,
    profile: { output: profileOutput, storage: artifacts.profile.path, people: artifacts.profile.people },
    dna: { output: dnaOutput, storage: artifacts.dna.path, people: artifacts.dna.people },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
