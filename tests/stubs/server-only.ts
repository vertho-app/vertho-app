/**
 * Stub de `server-only` para o vitest.
 *
 * `import 'server-only'` é um marcador que o Next resolve internamente (alias no
 * webpack): ele existe para o BUILD recusar o módulo se algum componente cliente
 * o importar. Fora do Next não há o que resolver, e o vitest quebra no import.
 *
 * Sem este stub, todo núcleo headless de `lib/` que se protege com a marca fica
 * fora da suíte — e a marca passaria a custar cobertura, que é o oposto do que
 * ela existe para fazer.
 */
export {};
