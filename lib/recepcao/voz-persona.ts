/**
 * Voz da pessoa simulada pelo NOME (27/09/2026, A-14). Módulo puro.
 *
 * O caso não tem campo de gênero (`paciente` em `schema.ts` é nome, abertura,
 * comportamento, fatos e limites), e os textos de comportamento do degrau Limite
 * são neutros ("Paciente intransigente…"). O que distingue as pessoas do catálogo
 * é o primeiro nome: nos 15 casos publicados, Rafael e Bruno são homens; Marina,
 * Lívia, Paula, Renata, Camila e Fernanda, mulheres (o comportamento dos degraus
 * Introdução e Sob pressão concorda: "Ansioso", "Desconfiado" × "Frustrada").
 *
 * Régua: listas de nomes comuns do português primeiro; depois a terminação (-a e
 * -ane/-ine/-ise/-one/-ele/-ete feminino; o resto masculino). É heurística: nome
 * fora das listas e de terminação ambígua pode errar. Se um caso precisar de outra
 * voz, o caminho é um campo explícito no caso (editor), não mais uma exceção aqui.
 */
export type GeneroVoz = 'feminina' | 'masculina';

const FEMININOS = new Set([
  'alice', 'aline', 'beatriz', 'carmen', 'cristiane', 'daiane', 'daniele', 'denise', 'elaine', 'ellen',
  'ester', 'gabriele', 'helen', 'ines', 'ingrid', 'iris', 'isabel', 'ivone', 'jaqueline', 'josiane',
  'karen', 'lilian', 'liz', 'lourdes', 'mabel', 'michele', 'miriam', 'nicole', 'raquel', 'rute', 'ruth',
  'simone', 'suelen', 'tatiane', 'vivian', 'viviane', 'yasmin',
]);
// Terminam em -a e são masculinos.
const MASCULINOS = new Set(['joshua', 'luca']);

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function vozDaPersona(nome: string | null | undefined): GeneroVoz {
  const primeiro = semAcento(String(nome ?? '').trim().split(/\s+/)[0] || '');
  if (!primeiro) return 'feminina';
  if (FEMININOS.has(primeiro)) return 'feminina';
  if (MASCULINOS.has(primeiro)) return 'masculina';
  if (/a$/.test(primeiro) || /(ane|ine|ise|one|ele|ete)$/.test(primeiro)) return 'feminina';
  return 'masculina';
}
