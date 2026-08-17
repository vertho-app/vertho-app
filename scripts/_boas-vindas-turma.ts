/* eslint-disable */
/**
 * PRIMEIRO CONTATO de uma turma por WhatsApp (`boas_vindas_v2`, UTILITY).
 *
 * POR QUE UM SCRIPT, E NÃO UM GATILHO
 * ───────────────────────────────────
 * Boas-vindas é a ABERTURA de uma turma, e quem decide que a turma abriu é uma
 * pessoa — não o calendário. Na cadência, a primeira mensagem sairia para quem
 * entrasse no cadastro por qualquer motivo (import, correção, teste), e o
 * primeiro contato é o de maior risco de bloqueio. Aqui o disparo é deliberado,
 * com teto, espaçamento e idempotência.
 *
 * 🔴 O RISCO QUE ELE EXISTE PARA REDUZIR: a pílula chegando antes de qualquer
 * apresentação. Medido em 17/08/2026, nos 38 diretores de Macaé: **1 recebeu
 * magic link (por e-mail) e ZERO receberam qualquer WhatsApp** — a primeira
 * pílula seria a primeira mensagem, de um número desconhecido. Quem desconfia
 * bloqueia, e o bloqueio não cai sobre a mensagem: cai sobre o `quality_rating`
 * do número, que é o MESMO para todos os tenants (Ibipeba está na semana 5).
 *
 * IDEMPOTENTE: quem já tem entrega `kind='boas_vindas'` é pulado. Rodar duas
 * vezes não manda duas.
 *
 * Uso:
 *   npx tsx scripts/_boas-vindas-turma.ts --empresa=macae               → dry-run
 *   npx tsx scripts/_boas-vindas-turma.ts --empresa=macae --enviar
 *   ... --limite=5     (teto por execução; default 50)
 *   ... --template=boas_vindas_v2
 */
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { enviarTemplateCloud, cloudApiConfigurada } from '@/lib/whatsapp/cloud-api';
import { contratoDoTemplate } from '@/lib/notifications/pilula-template';
import { tenantUrl } from '@/lib/domain';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const SLUG = arg('empresa');
const TEMPLATE = arg('template') || 'boas_vindas_v2';
const LIMITE = Number(arg('limite')) || 50;
const ENVIAR = process.argv.includes('--enviar');

/** 6s entre mensagens. 155 a cada 2s derrubaram o número em 11/08/2026. */
const INTERVALO_MS = 6_000;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Primeiro nome apresentável.
 *
 * Parte do cadastro está em CAIXA ALTA ("JANAINA MORAES..."), e "Olá, JANAINA."
 * na mensagem de apresentação de um número desconhecido soa exatamente como o
 * disparo automático que a pessoa deve ignorar. Só normaliza o que está todo em
 * maiúsculas — nome já digitado com maiúsculas e minúsculas é preservado, porque
 * ali a grafia foi escolhida por alguém.
 */
function primeiroNome(completo: string | null): string {
  const bruto = String(completo || '').trim().split(/\s+/)[0] || '';
  if (!bruto) return 'Olá';
  if (bruto !== bruto.toUpperCase()) return bruto;
  return bruto.charAt(0) + bruto.slice(1).toLowerCase();
}

async function main() {
  if (!SLUG) throw new Error('--empresa=<slug> é obrigatório (disparo em massa não roda sem alvo explícito)');
  if (!cloudApiConfigurada()) throw new Error('Cloud API não configurada no .env.local');

  const montar = contratoDoTemplate(TEMPLATE);
  if (!montar) throw new Error(`template "${TEMPLATE}" não tem contrato em CONTRATOS — mandar parâmetros no formato errado entrega mensagem sem sentido`);

  const sb = createSupabaseAdmin();

  const { data: empresa, error: eE } = await sb.from('empresas')
    .select('id, slug, nome, is_demo').eq('slug', SLUG).maybeSingle();
  if (eE) throw new Error(`empresas: ${eE.message}`);
  if (!empresa) throw new Error(`empresa ${SLUG} não encontrada`);
  if ((empresa as any).is_demo) throw new Error('tenant de demonstração não envia comunicação real');

  const empresaId = (empresa as any).id as string;
  const baseUrl = tenantUrl((empresa as any).slug);

  // Alvo: quem tem TRILHA ATIVA — a turma que vai receber a cadência.
  const { data: trilhas, error: eT } = await sb.from('trilhas')
    .select('colaborador_id').eq('empresa_id', empresaId).eq('status', 'ativa');
  if (eT) throw new Error(`trilhas: ${eT.message}`);
  const ids = [...new Set((trilhas || []).map((t: any) => t.colaborador_id).filter(Boolean))];
  if (!ids.length) throw new Error('nenhuma trilha ativa nesta empresa');

  const { data: colabs, error: eC } = await sb.from('colaboradores')
    .select('id, nome_completo, whatsapp, telefone')
    .eq('empresa_id', empresaId).in('id', ids);
  if (eC) throw new Error(`colaboradores: ${eC.message}`);

  // Já receberam? A telemetria é a fonte — rodar de novo não pode mandar duas.
  const { data: jaForam, error: eJ } = await sb.from('notification_deliveries')
    .select('colaborador_id').eq('empresa_id', empresaId).eq('kind', 'boas_vindas').eq('channel', 'whatsapp');
  if (eJ) throw new Error(`telemetria: ${eJ.message}`);
  const recebidos = new Set((jaForam || []).map((d: any) => d.colaborador_id));

  const fila = (colabs || [])
    .map((c: any) => ({ ...c, fone: c.whatsapp || c.telefone }))
    .filter((c: any) => c.fone && !recebidos.has(c.id));

  console.log(`${empresa.nome}`);
  console.log(`  trilhas ativas: ${ids.length} · com telefone e sem boas-vindas: ${fila.length} · já receberam: ${recebidos.size}`);
  console.log(`  template: ${TEMPLATE} · instituição no {{2}}: "${empresa.nome}" · link: ${baseUrl}/entrar`);

  const lote = fila.slice(0, LIMITE);
  if (lote.length < fila.length) console.log(`  ⚠️ teto de ${LIMITE}: ${fila.length - lote.length} ficam para a próxima execução`);

  if (!ENVIAR) {
    console.log('\nPRÉVIA (5 primeiros):');
    for (const c of lote.slice(0, 5)) {
      const { params } = montar({ telefone: c.fone, nome: primeiroNome(c.nome_completo), semana: 1, tema: '', slug: empresa.slug, baseUrl, instituicao: empresa.nome } as any);
      console.log(`  ${c.nome_completo} · ${c.fone} → [${params.join(' | ')}]`);
    }
    console.log('\ndry-run — rode com --enviar para disparar.');
    return;
  }

  let ok = 0, falha = 0;
  for (const [i, c] of lote.entries()) {
    const nome = primeiroNome(c.nome_completo);
    const { params, botaoParam } = montar({
      telefone: c.fone, nome, semana: 1, tema: '', slug: empresa.slug, baseUrl,
      instituicao: empresa.nome,
    } as any);

    const r = await enviarTemplateCloud(
      { phone: c.fone, template: TEMPLATE, params, botaoParam },
      { motivo: 'boas_vindas', empresaId, colaboradorId: c.id, dedupeKey: `boas_vindas:${c.id}` },
    );
    if (r.ok) ok++; else falha++;
    console.log(`  ${i + 1}/${lote.length} ${c.nome_completo} · ${r.ok ? 'ok' : 'FALHOU: ' + r.reason}`);
    if (i < lote.length - 1) await dormir(INTERVALO_MS);
  }

  console.log(`\n✓ ${ok} enviada(s) · ${falha} falha(s)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
