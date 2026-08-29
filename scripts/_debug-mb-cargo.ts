/* eslint-disable */
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { resolverModuloBaseParaConteudo } from '@/lib/season-engine/modulo-base-integration';
const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
async function main() {
  const sb = createSupabaseAdmin();
  const COMP = 'Autocuidado e resiliência emocional';
  // 1) O que o brief do Kit resolve (SEM cargo)
  const semCargo = await resolverModuloBaseParaConteudo(sb, { competenciaNome: COMP, nivelMin: 1.0, empresaId: EMP });
  console.log('BRIEF DO KIT (sem cargo) →', semCargo?.modulo?.id, '| cargo do MB:', semCargo?.modulo?.cargo, '|', String(semCargo?.modulo?.titulo || '').slice(0, 60));
  // 2) O que resolveria COM cargo (como o conteúdo faz desde 4faa0130)
  for (const cargo of ['Coordenação Pedagógica', 'Gestão Escolar']) {
    const comCargo = await resolverModuloBaseParaConteudo(sb, { competenciaNome: COMP, nivelMin: 1.0, empresaId: EMP, cargo });
    console.log(`COM cargo="${cargo}" →`, comCargo?.modulo?.id, '| cargo do MB:', comCargo?.modulo?.cargo, '|', String(comCargo?.modulo?.titulo || '').slice(0, 60));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
