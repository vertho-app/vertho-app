/**
 * One-off: gera os áudios (podcast) FALTANTES de "Autocuidado e resiliência emocional"
 * no Ibipeba — competência das semanas 5-11 para 25 dos 36 colaboradores
 * (Coordenação Pedagógica 10 + Gestão Escolar 15; Gestão Educacional não tem).
 *
 * Medido 27/07: os 12 pares (6 descritores × 2 cargos) têm `texto` e `case` ativos e
 * ZERO áudio core. O único áudio de autocuidado do tenant é de KIT (Gestão Escolar × D,
 * 1 descritor) — kit é DISC-específico e sai só pelo overlay, então não cobre os outros
 * 11 perfis. Molde: `_gerar-audio-gaps-ibipeba.ts` (mesmo fluxo validado na semana 1).
 *
 * Parâmetros espelham o texto/case que já existe para os mesmos pares: N1→N2, contexto
 * genérico. MB publicado existe para os 12 pares (3 níveis cada) — o conteúdo ancora
 * nele por embedding, não pelo nome (os MBs de Gestão Escolar têm título editorial).
 *
 * O áudio nasce `ativo=false` e SEM MP3: o TTS é sintetizado na leitura e cacheado.
 * Depois deste script: ativar + refrescar `formatos_disponiveis` dos planos (snapshot
 * congelado no build não vê conteúdo novo) + pré-aquecer o cache por colaborador.
 *
 * Uso: npx tsx --env-file=.env.local scripts/_gerar-audio-autocuidado-ibipeba.ts [--um]
 */
import { gerarConteudoIA } from '@/actions/conteudos';
import { createSupabaseAdmin } from '@/lib/supabase';

const E = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const COMP = 'Autocuidado e resiliência emocional';

// Os descritores NÃO são os mesmos nos dois cargos ("Busca de apoio" vs "Busca de apoio
// e rede") — copiados verbatim de micro_conteudos para o par casar com o texto/case.
const GAPS: Array<{ cargo: string; descritor: string }> = [
  { cargo: 'Coordenação Pedagógica', descritor: 'Busca de apoio' },
  { cargo: 'Coordenação Pedagógica', descritor: 'Consciência de limites' },
  { cargo: 'Coordenação Pedagógica', descritor: 'Limites profissionais' },
  { cargo: 'Coordenação Pedagógica', descritor: 'Protagonismo do bem-estar' },
  { cargo: 'Coordenação Pedagógica', descritor: 'Regulação sob pressão' },
  { cargo: 'Coordenação Pedagógica', descritor: 'Sustentabilidade pessoal' },
  { cargo: 'Gestão Escolar', descritor: 'Busca de apoio e rede' },
  { cargo: 'Gestão Escolar', descritor: 'Consciência de limites' },
  { cargo: 'Gestão Escolar', descritor: 'Limites profissionais' },
  { cargo: 'Gestão Escolar', descritor: 'Protagonismo do bem-estar' },
  { cargo: 'Gestão Escolar', descritor: 'Regulação sob pressão' },
  { cargo: 'Gestão Escolar', descritor: 'Sustentabilidade pessoal' },
];

async function main() {
  const sb = createSupabaseAdmin();
  const lista = process.argv.includes('--um') ? GAPS.slice(0, 1) : GAPS;
  console.log(`Gerando ${lista.length} áudio(s) de "${COMP}"...\n`);
  let ok = 0, pulados = 0, erros = 0;

  for (const g of lista) {
    process.stdout.write(`• ${g.cargo.padEnd(24)} | ${g.descritor.padEnd(28)} ... `);
    try {
      const r: any = await gerarConteudoIA({
        formato: 'audio', competencia: COMP, descritor: g.descritor,
        cargo: g.cargo, empresaId: E,
        nivelMin: 1.0, nivelMax: 2.0, contexto: 'generico',
        podcastFormato: 'solo',
        sb,
        forcar: false,   // idempotente: re-run não duplica
      });
      if (r?.error) { erros++; console.log(`ERRO: ${r.error}`); }
      else if (r?.pulado || r?.skipped) { pulados++; console.log('PULADO (já existia)'); }
      else {
        ok++;
        const id = r?.id || r?.conteudo?.id || '?';
        const mb = (r?.modulo_usado?.id || r?.moduloUsado?.id) ? 'MB✓' : 'MB✗';
        console.log(`OK id=${String(id).slice(0, 8)} ${mb}`);
      }
    } catch (e: any) {
      erros++;
      console.log(`EXCEÇÃO: ${e?.message}`);
    }
  }

  console.log(`\nGerados: ${ok} · pulados: ${pulados} · erros: ${erros}`);
  if (ok > 0) console.log('⚠️ Nascem ativo=false — rodar _ativar-refrescar-audio-autocuidado.ts');
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
