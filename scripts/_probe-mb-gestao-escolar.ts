/* eslint-disable */
/**
 * READ-ONLY: para cada descritor de Autocuidado × Gestão Escolar, qual MODULO-BASE o
 * resolver realmente escolhe? Os MBs desse cargo têm TÍTULO EDITORIAL no campo
 * `descritor` ("A Calma que se Constrói"), não o nome da régua — então o match exato dá
 * 0 e a decisão fica por conta do embedding. Isto mede se ele acerta o par ou embaralha.
 *
 * Uso: npx tsx --env-file=.env.local scripts/_probe-mb-gestao-escolar.ts
 */
import { createSupabaseAdmin } from '@/lib/supabase';
import { resolverModuloBaseParaConteudo } from '@/lib/season-engine/modulo-base-integration';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const COMP = 'Autocuidado e resiliência emocional';
const CARGO = 'Gestão Escolar';
const DESCRITORES = [
  'Sustentabilidade pessoal', 'Consciência de limites', 'Busca de apoio e rede',
  'Regulação sob pressão', 'Limites profissionais', 'Protagonismo do bem-estar',
];

async function main() {
  const sb = createSupabaseAdmin();
  const escolhidos = new Map<string, string[]>();

  for (const descritor of DESCRITORES) {
    const r: any = await resolverModuloBaseParaConteudo(sb, {
      competenciaNome: COMP, descritor, cargo: CARGO, empresaId: EMP, nivelMin: 1.0,
    });
    const mb = r?.modulo || r;
    const titulo = mb?.titulo || mb?.descritor || '(nenhum)';
    const id = String(mb?.id || '—').slice(0, 8);
    console.log(`${descritor.padEnd(28)} → ${String(titulo).slice(0, 44).padEnd(44)} [${id}] ${r?.criterio || r?.criterio_match || ''}`);
    const k = String(mb?.id || 'nenhum');
    escolhidos.set(k, [...(escolhidos.get(k) || []), descritor]);
  }

  console.log('\n--- colisões (MB servindo mais de um descritor) ---');
  let colisao = false;
  for (const [id, descs] of escolhidos) {
    if (descs.length > 1) { colisao = true; console.log(`  ⚠️ ${id.slice(0, 8)} ← ${descs.join(' | ')}`); }
  }
  if (!colisao) console.log('  nenhuma — cada descritor ancorou num MB diferente');
}
main().then(() => process.exit(0)).catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
