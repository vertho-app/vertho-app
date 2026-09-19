// Opt-in pago (~US$ 0,05 por segmento): o rascunho de caso por IA com o provedor real.
// A fixture do teste unitário prova o código; só a chamada real prova que o PROMPT devolve
// algo que o schema aceita. Não grava nada: o rascunho só existe em memória.
//
// RECEPCAO_RASCUNHO_LIVE=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/unit/recepcao-rascunho-live.test.ts
import { test, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { gerarRascunho } from '@/lib/recepcao/rascunho';

const ATIVO = process.env.RECEPCAO_RASCUNHO_LIVE === '1';
const PEDIDOS: Record<string, string> = {
  atendimento_loja: 'Cliente quer trocar um fone comprado há 40 dias, fora do prazo de troca direta, e diz que foi mal atendido na compra.',
  secretaria_escolar: 'Responsável quer a segunda via do histórico escolar para amanhã, mas o prazo de emissão é de cinco dias úteis.',
};
const carimbo = new Date().toISOString().replace(/[:.]/g, '-');

test.runIf(ATIVO).concurrent.each(Object.keys(PEDIDOS))('%s: o rascunho real passa no schema do caso', async (dominio) => {
  const inicio = Date.now();
  const caso = await gerarRascunho({ empresaId: null, dominio } as any, PEDIDOS[dominio]);
  const segundos = Math.round((Date.now() - inicio) / 1000);
  expect(caso.dominio).toBe(dominio);
  expect(caso.statusEditorial).toBe('rascunho_ia');
  mkdirSync('backups', { recursive: true });
  writeFileSync(`backups/recepcao-rascunho-${carimbo}-${dominio}.json`, JSON.stringify({ segundos, caso }, null, 2));
  console.log(`${dominio}: ${segundos} s · "${caso.publico.titulo}" · ${caso.publico.procedimentos.length} procedimentos · pessoa ${caso.paciente.nome}`);
}, 180000);
