/** Carrega .env.local ANTES de qualquer outro import (ESM roda imports em ordem).
 *  Importar este módulo PRIMEIRO garante que módulos que leem process.env no topo
 *  (render-helpers: SUPA/KEY; heygen: HEYGEN_API_KEY) vejam os valores. */
import { readFileSync } from 'node:fs';
try {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('='); if (i < 0) continue;
    const k = line.slice(0, i).trim(); if (!k || k.startsWith('#')) continue;
    if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^"|"$/g, '');
  }
} catch { /* sem .env.local — usa o ambiente atual */ }
