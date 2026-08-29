/* eslint-disable */
/**
 * Prova de ponta a ponta do CANAL de alerta do health-check — a única parte do sistema
 * que nunca foi exercitada de verdade.
 *
 * Por que é preciso provar: `alertar()` só dispara em severidade `critico`, e os runs
 * reais de 28/07 saíram `aviso`/`ok`. Então o caminho `montarAlerta` → `enviarEmailPilula`
 * → Resend nunca rodou. Alarme com destinatário configurado mas canal não testado é a
 * mesma classe de risco do `ADMIN_EMAILS` vazio: parece coberto e não está.
 *
 * O run é SINTÉTICO e NÃO é persistido — nada entra em `pipeline_health_runs`, para não
 * sujar a série histórica com um achado que não existe no banco.
 *
 * Uso: npx tsx --env-file=.env.local scripts/_provar-alerta-health.ts [--enviar]
 */
import { montarAlerta, alertar } from '@/lib/pipeline-health/core';
import type { ResultadoCheck } from '@/lib/pipeline-health/types';

const ENVIAR = process.argv.includes('--enviar');

const runSintetico: ResultadoCheck = {
  modo: 'estrutural',
  empresaId: null,
  empresaSlug: 'PROVA-DE-CANAL',
  dataAlvo: null,
  severidade: 'critico',
  duracaoMs: 0,
  achados: [{
    id: 'prova-de-canal',
    severidade: 'critico',
    titulo: 'PROVA DE CANAL — ignore este alerta',
    contagem: 1,
    detalhe: 'Disparo manual de 28/07/2026 para verificar que o e-mail de alerta crítico realmente chega. Nenhum problema real foi detectado por este run.',
    acao: 'Nada a fazer. Se você recebeu isto, o canal Resend → ADMIN_EMAILS está funcionando.',
  }],
};

async function main() {
  const alerta = montarAlerta([runSintetico]);
  if (!alerta) throw new Error('montarAlerta devolveu null para um run crítico — o gatilho está quebrado');

  console.log(`assunto: ${alerta.assunto}`);
  console.log(`destinos (ADMIN_EMAILS): ${process.env.ADMIN_EMAILS || '(VAZIA — o alerta morreria aqui)'}`);
  console.log(`html: ${alerta.html.length} chars`);

  if (!ENVIAR) { console.log('\n→ rode com --enviar para disparar o e-mail de verdade'); return; }

  const ok = await alertar([runSintetico]);
  console.log(`\nalertar() → ${ok ? '✓ ENVIADO' : '✗ NÃO enviou (ver console.error acima)'}`);
  if (!ok) process.exitCode = 1;
}
main().then(() => process.exit(process.exitCode || 0)).catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
