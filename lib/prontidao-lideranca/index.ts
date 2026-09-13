/**
 * Módulo Prontidão para Liderança — núcleo PURO (sem I/O, sem IA).
 *
 * Duas camadas cruzadas por pessoa: POSIÇÃO (competência demonstrada, das notas
 * por descritor) × ESTILO (aderência do perfil ao gabarito do cargo-alvo). A
 * agregação com banco vive em `./agregar.ts`; a leitura pela web em
 * `actions/prontidao-lideranca.ts`; o gate de módulo em `lib/access-gates/modulos.ts`.
 */
export * from './config';
export * from './posicao';
export * from './estilo';
export * from './matriz';
export * from './calibragem';
export * from './aferir';
