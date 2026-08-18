import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    // MEDIDO em 11/08/2026, com a máquina livre: os 6 testes mais lentos da suíte
    // levam 8.4s, 5.8s, 5.0s, 4.6s, 4.5s e 4.4s — três deles a menos de 600ms do
    // teto default de 5s do vitest. Não era "um arquivo lento": o teto estava
    // calibrado abaixo do perfil real da suíte (render de PDF com @react-pdf,
    // mocks encadeados de Supabase, backoff). O sintoma era vermelho INTERMITENTE
    // no CI, com testes DIFERENTES a cada rodada e sempre "Test timed out in
    // 5000ms" — nunca uma asserção. Vermelho que muda de lugar treina a ignorar
    // o CI, que é o custo real.
    // 20s = 2,4× o mais lento, e ainda derruba rápido um teste que travou de
    // verdade (o motivo de existir um teto). Se algum teste passar a encostar
    // aqui, o conserto é o teste, não este número.
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // `server-only` é resolvido pelo próprio Next (alias interno do webpack) e
      // não existe em node_modules. Sem este stub, todo núcleo headless que se
      // marca com ele fica fora da suíte — a marca custaria cobertura.
      'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts'),
    },
  },
});
