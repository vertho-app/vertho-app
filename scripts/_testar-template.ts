/**
 * Dispara UMA mensagem de template, pelo caminho real da cadência.
 *
 * POR QUE ELE EXISTE
 * ──────────────────
 * Não havia como ver uma mensagem da cadência antes de ela sair para centenas de
 * pessoas: o único caminho de disparo é o trigger diário, que roda para a
 * empresa inteira. Testar copy, parâmetros e categoria exigia esperar o lote.
 *
 * E o mais importante: ele **imprime o nome do template que resolveu**. As
 * variáveis `WHATSAPP_TEMPLATE_*` estão marcadas como *Sensitive* na Vercel —
 * ilegíveis até pelo CLI — e um nome errado só aparece como `132001` no dia do
 * disparo. Aqui o valor observado vai para a tela antes de qualquer envio.
 *
 * ⚠️ O QUE ELE **NÃO** PROVA: o valor que está em PRODUÇÃO. Este script lê o
 * ambiente LOCAL. Para conferir produção, o caminho é a R13 do health
 * (`checarTemplatesLigados`), que roda lá dentro e grava em
 * `pipeline_health_runs`.
 *
 * Sem acesso ao banco de propósito: tudo vem de argumento, então ele não entra
 * na conta do `service-role-guard` e pode ser apontado para qualquer tenant sem
 * risco de ler dado de outro.
 *
 * USO
 *   npx tsx scripts/_testar-template.ts --papel=pilula --telefone=55119... \
 *     --nome=Rodrigo --semana=5 --tema="Escuta ativa" --slug=ibipeba \
 *     --empresa-id=<uuid> [--formato=video] [--executar]
 *
 * Sem `--executar` ele só mostra o que enviaria.
 */
process.loadEnvFile('.env.local');

import { enviarPorTemplate, templateAtivo, contratoDoTemplate, type PapelCadencia } from '../lib/notifications/pilula-template';
import { TEMPLATES, renderTemplate, type TemplateDef } from '../lib/whatsapp/templates';
import { tenantUrl } from '../lib/domain';

const args = process.argv.slice(2);
const arg = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const executar = args.includes('--executar');

const papel = (arg('papel') || 'pilula') as PapelCadencia;
const telefone = arg('telefone');
const slug = arg('slug');
const empresaId = arg('empresa-id') || null;

async function main() {
  if (!telefone) throw new Error('--telefone=<E.164> é obrigatório');
  if (!slug) throw new Error('--slug=<tenant> é obrigatório (define o domínio do link)');

  // O VALOR OBSERVADO, antes de qualquer envio — é o ponto deste script.
  const template = templateAtivo(papel);
  console.log(`papel      : ${papel}`);
  console.log(`template   : ${template ?? '(NENHUM — o papel está desligado neste ambiente)'}`);
  if (!template) {
    console.log('\nSem template ligado, o envio cairia no caminho legado. Abortando.');
    return;
  }

  const dados = {
    telefone,
    nome: arg('nome') || 'Rodrigo',
    semana: Number(arg('semana') || 5),
    tema: arg('tema') || 'Escuta ativa na sala de aula',
    slug,
    baseUrl: tenantUrl(slug),
    formato: arg('formato') || null,
    pilula: arg('pilula') ? Number(arg('pilula')) : null,
    empresaId,
    colaboradorId: arg('colab-id') || null,
    /**
     * Só o papel `pendencia`: a semana que precisa ser CONCLUÍDA para destravar.
     * Sem ela o envio é recusado pelo fail-closed de `enviarPorTemplate` — e é
     * justamente essa recusa que este script deixa visível antes do lote.
     */
    semanaPendente: arg('semana-pendente') ? Number(arg('semana-pendente')) : null,
    // Sem dedupe: um teste tem que poder ser repetido.
    dedupeKey: null,
  };

  console.log(`destino    : ${telefone}`);
  console.log(`link       : ${dados.baseUrl}/dashboard/temporada/semana/${dados.semana}`);
  console.log(`tema       : ${dados.tema}`);

  /**
   * O CORPO RENDERIZADO e o parâmetro do BOTÃO — o que a pessoa vai ler.
   *
   * O dry-run antigo imprimia `tema` e um link montado à mão, que não são o que
   * sai em template nenhum com botão (o link vive na Meta, e o script só manda
   * o sufixo). Imprimir o observado é o ponto: um `{{3}}` trocado, ou um botão
   * apontando para a semana errada, é typecheck-limpo e só apareceria na mão de
   * quem recebeu.
   */
  const montar = contratoDoTemplate(template);
  if (montar) {
    const { params, botaoParam } = montar(dados as any);
    // Cast como em `corpoDoTemplatePorNome`: `TEMPLATES` é `as const`, então
    // `Object.values` devolve um UNION de literais e só alguns membros têm
    // `botao` — sem isto o acesso não compila (pegou no build da Vercel).
    const def = Object.values(TEMPLATES).find((t) => t.name === template) as TemplateDef | undefined;
    console.log('\n─── o que a pessoa recebe ───');
    if (def) console.log(renderTemplate(def, params));
    if (botaoParam) console.log(`\n[botão "${def?.botao?.texto ?? '—'}"] https://app.vertho.ai/ir/${botaoParam}`);
    console.log('─────────────────────────────');
  }

  if (!executar) {
    console.log('\nDRY-RUN — nada foi enviado. Repita com --executar.');
    return;
  }

  const r = await enviarPorTemplate(papel, dados as any);
  console.log(`\ntentou=${r.tentou} ok=${r.ok}${r.reason ? ` reason=${r.reason}` : ''}`);
  if (!r.ok) process.exitCode = 1;
}

main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
