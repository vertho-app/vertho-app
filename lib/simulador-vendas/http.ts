import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SimuladorError } from './core';
export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export function falha(error: unknown) {
  if (error instanceof SimuladorError) return json({ error: error.message }, error.status);
  if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: 'Dados inválidos. Confira os campos e tente novamente.' }, 400);
  console.error('[sim-vendas] erro interno', error instanceof Error ? error.name : 'erro');
  return json({ error: 'O simulador está temporariamente indisponível.' }, 500);
}
