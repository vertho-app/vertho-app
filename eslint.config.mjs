import next from 'eslint-config-next';

/**
 * Flat config (ESLint 9 / Next 16 — o `next lint` foi removido). Roda com
 * `npx eslint .`. NÃO bloqueia o build (next.config: eslint.ignoreDuringBuilds)
 * — é rede de segurança MANUAL sobre código legado, não gate.
 *
 * Usa só o bloco React/hooks/jsx-a11y/@next do eslint-config-next (next[0]).
 * O bloco de TYPED-LINTING (@typescript-eslint com info de tipo: no-deprecated,
 * no-misused-promises, restrict-template-expressions…) fica DE FORA de propósito:
 * exige parserOptions com projeto TS pra cada arquivo (quebra em arquivos novos)
 * e é o grosso do ruído legado. O `tsc --noEmit` já cobre a checagem de tipos.
 *
 * Calibragem: ruído cosmético → `warn`; CORRETUDE (react-hooks/rules-of-hooks,
 * regras jsx-a11y) permanece `error`. `eslint . --quiet` mostra só o acionável.
 */
const OVERRIDES = {
  'react/no-unescaped-entities': 'off',
  '@next/next/no-img-element': 'warn',
  'react-hooks/exhaustive-deps': 'warn',
  // Regras de prontidão do React Compiler (react-hooks v6): disparam em massa
  // em código pré-Compiler; não são bug clássico → `warn`.
  'react-hooks/set-state-in-effect': 'warn',
  'react-hooks/purity': 'warn',
  'react-hooks/immutability': 'warn',
  'react-hooks/static-components': 'warn',
  'react-hooks/preserve-manual-memoization': 'warn',
  'react-hooks/refs': 'warn',
  // Mantidas ERROR: react-hooks/rules-of-hooks (bug real) + jsx-a11y/*.
};

export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'migrations/**', 'scripts/**', 'public/**', 'next-env.d.ts'],
  },
  { ...next[0], rules: { ...next[0].rules, ...OVERRIDES } },
];
