/**
 * One-off: gera os áudios (podcast) FALTANTES da semana 1 do Ibipeba.
 * Headless — passa `sb` (admin) p/ bypassar o gate de sessão do gerarConteudoIA.
 * Uso: npx tsx --env-file=.env.local scripts/_gerar-audio-gaps-ibipeba.ts [--um]
 */
import { gerarConteudoIA } from '@/actions/conteudos';
import { createSupabaseAdmin } from '@/lib/supabase';

const E = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const GAPS = [
  { cargo: 'Coordenação Pedagógica', competencia: 'Colaboração docente e cultura formativa', descritor: 'Segurança para aprender' },
  { cargo: 'Coordenação Pedagógica', competencia: 'Colaboração docente e cultura formativa', descritor: 'Aprendizagem entre pares' },
  { cargo: 'Coordenação Pedagógica', competencia: 'Colaboração docente e cultura formativa', descritor: 'Corresponsabilidade' },
  { cargo: 'Gestão Escolar', competencia: 'Planejamento e Organização', descritor: 'Gestão de riscos' },
  { cargo: 'Gestão Escolar', competencia: 'Planejamento e Organização', descritor: 'Entrega de resultados' },
  { cargo: 'Gestão Educacional', competencia: 'Avaliação e monitoramento de resultados', descritor: 'Devolutiva para escolas' },
];

async function main() {
  const sb = createSupabaseAdmin();
  const lista = process.argv.includes('--um') ? GAPS.slice(0, 1) : GAPS;
  console.log(`Gerando ${lista.length} áudio(s)...`);
  for (const g of lista) {
    process.stdout.write(`• ${g.cargo} | ${g.descritor} ... `);
    try {
      const r: any = await gerarConteudoIA({
        formato: 'audio', competencia: g.competencia, descritor: g.descritor,
        cargo: g.cargo, empresaId: E, podcastFormato: 'solo', sb, forcar: false,
      });
      console.log(r?.error ? `ERRO: ${r.error}` : `OK id=${r?.id || r?.conteudo?.id || '?'} mb=${r?.modulo_usado?.id ? 'sim' : (r?.moduloUsado?.id ? 'sim' : '?')}`);
    } catch (e: any) { console.log(`EXCEÇÃO: ${e?.message}`); }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
