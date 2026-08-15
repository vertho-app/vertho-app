/**
 * Submete os templates de `lib/whatsapp/templates.ts` à Meta.
 *
 * O comentário do topo daquele arquivo citava este script desde 14/08/2026 — e
 * ele NÃO EXISTIA. Documentação que aponta para ferramenta inexistente é pior
 * que documentação nenhuma: quem lê acha que há um caminho pronto e descobre o
 * contrário no pior momento.
 *
 * USO
 *   npx tsx scripts/_sync-templates-whatsapp.ts                  # dry-run: mostra o payload
 *   npx tsx scripts/_sync-templates-whatsapp.ts --so=conteudo_semana_v2
 *   npx tsx scripts/_sync-templates-whatsapp.ts --so=… --executar # submete de verdade
 *
 * ⚠️ SUBMETER TEM CUSTO E É IRREVERSÍVEL NA PRÁTICA: o nome fica ocupado, e
 * apagar deixa o nome QUEIMADO enquanto a exclusão processa (medido 14/08). Por
 * isso o padrão é dry-run — `--executar` é escolha consciente.
 *
 * ⚠️ A CATEGORIA QUE VOLTA AQUI É PROVISÓRIA. Ela muda durante a revisão: em
 * 14/08, 4 de 8 submetidos como UTILITY viraram MARKETING (6× o custo). Só conte
 * a categoria depois de `APPROVED` — consulte com
 * `GET /{waba}/message_templates?fields=name,status,category`.
 */
process.loadEnvFile('.env.local');

import { TEMPLATES, payloadDaMeta, type TemplateDef } from '../lib/whatsapp/templates';

const BASE = (process.env.META_GRAPH_URL || 'https://graph.facebook.com/v22.0').replace(/\/+$/, '');
const TOKEN = process.env.META_WHATSAPPBUSINESS_API || '';
const WABA = process.env.WABA_ID || '';

const args = process.argv.slice(2);
const executar = args.includes('--executar');
const so = args.find((a) => a.startsWith('--so='))?.split('=')[1];

async function existentes(): Promise<Map<string, { status: string; category: string }>> {
  const r = await fetch(`${BASE}/${WABA}/message_templates?fields=name,status,category&limit=200`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const j: any = await r.json();
  const m = new Map<string, { status: string; category: string }>();
  for (const t of j?.data || []) m.set(t.name, { status: t.status, category: t.category });
  return m;
}

async function main() {
  if (!TOKEN || !WABA) throw new Error('META_WHATSAPPBUSINESS_API e WABA_ID são obrigatórios');

  const jaExiste = await existentes();
  const alvos = Object.entries(TEMPLATES as Record<string, TemplateDef>)
    .filter(([chave, def]) => (so ? chave === so || def.name === so : true));

  if (!alvos.length) {
    console.log(`Nenhum template casa com --so=${so}. Chaves: ${Object.keys(TEMPLATES).join(', ')}`);
    return;
  }

  for (const [chave, def] of alvos) {
    const atual = jaExiste.get(def.name);
    if (atual) {
      console.log(`• ${def.name}: JÁ EXISTE (${atual.status} / ${atual.category}) — pulando.`);
      console.log('  Para mudar o corpo, crie um nome novo (_v2). Editar exige nova revisão e apagar QUEIMA o nome.');
      continue;
    }

    const payload = payloadDaMeta(def);
    console.log(`\n• ${chave} → ${def.name} [${def.category}]`);
    console.log(JSON.stringify(payload, null, 2));

    if (!executar) {
      console.log('  (dry-run — use --executar para submeter)');
      continue;
    }

    const r = await fetch(`${BASE}/${WABA}/message_templates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const j: any = await r.json().catch(() => null);
    if (!r.ok) {
      console.error(`  ✗ HTTP ${r.status}: ${j?.error?.message || JSON.stringify(j)}`);
      continue;
    }
    // `category` aqui é o veredito PROVISÓRIO — ver o aviso do topo.
    console.log(`  ✓ submetido: id=${j?.id} status=${j?.status} categoria_provisoria=${j?.category}`);
  }
}

main().catch((e) => {
  console.error('ERRO:', e?.message || e);
  process.exit(1);
});
