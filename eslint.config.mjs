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
    /**
     * ⚠️ Os quatro últimos entraram em 10/08/2026 e são o motivo de o lint
     * parecer inutilizável: `npx eslint .` reportava **326 errors, e 306 vinham
     * de artefato de build** — `build/`, `spike-bundle/`,
     * `worker-hetzner/spike-bundle/` e `.vercel/output/`. Lint que grita sobre
     * código gerado treina todo mundo a ignorá-lo, e aí o achado real (75
     * warnings de `react-hooks/set-state-in-effect`, 5 de `purity`) fica
     * enterrado. Dos 20 errors do nosso código, 16 eram
     * `jsx-no-comment-textnodes` na proposta comercial, onde
     * `<SectionLabel>// Contexto</SectionLabel>` é ELEMENTO DE MARCA, não
     * comentário vazado — ver o override abaixo.
     */
    ignores: [
      '.next/**', 'node_modules/**', 'migrations/**', 'scripts/**', 'public/**', 'next-env.d.ts',
      'build/**', 'spike-bundle/**', 'worker-hetzner/**', '.vercel/**',
      'video-spike/**', 'data-pipeline/**',
      // `.claude/worktrees/**` é resíduo de sessão do Claude Code: uma CÓPIA do
      // projeto, com `.next` gerado dentro. Sem esta linha o lint reporta cada
      // achado duas vezes e ainda adiciona os chunks do build da cópia — foi
      // metade dos 326 errors, e não estava no diagnóstico da auditoria.
      '.claude/**',
    ],
  },
  { ...next[0], rules: { ...next[0].rules, ...OVERRIDES } },
  {
    /**
     * `<SectionLabel>// Contexto</SectionLabel>` é ELEMENTO DE MARCA na proposta
     * comercial (o `//` é tipografia, imita marcador de código), não comentário
     * JSX vazado. São 16 dos 17 errors que sobravam no nosso código, todos aqui.
     * Desligar por ARQUIVO, não globalmente: em qualquer outra tela um `//`
     * dentro de JSX continua sendo bug de verdade.
     *
     * ⚠️ Este bloco vem DEPOIS do `next[0]`: no flat config o último a declarar
     * a regra vence. Colocado antes, ele não tem efeito nenhum — e o lint segue
     * com os mesmos 16 errors parecendo que a exceção foi aplicada.
     */
    files: ['components/pdf/PropostaComercialPDF.tsx', 'app/proposta/**/*.tsx'],
    rules: { 'react/jsx-no-comment-textnodes': 'off' },
  },
];
