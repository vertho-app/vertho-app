/**
 * Avisos de spec clínica (T6 — FLAG-E-PARE). NÃO altera nada: apenas sinaliza
 * configurações de gabarito que merecem revisão de psicólogo. Decisão de mudar
 * direção/limiar é humana, por traço.
 *
 * Dois padrões hoje:
 *  (1) S/C como `target` em cargo COMERCIAL — o arquétipo hunter costuma ser
 *      baixo-S/baixo-C (urgência + flexibilidade = virtude). `target` penaliza
 *      o lado baixo → pode penalizar o melhor caçador. Talvez devesse ser `ceiling`.
 *  (2) Traço de risco no extremo (Assertividade, Dominância/Comando, Ousadia) como
 *      `floor` ("mais é melhor") — assume que o extremo alto é sempre bom, mas pode
 *      virar agressividade/imprudência. Talvez devesse ser `target` com teto.
 *
 * Puro (só lê o gabarito JSON) — seguro em client e server.
 */
const norm = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export interface AvisoSpec { tipo: 'sc_target_comercial' | 'floor_risco'; traco: string; mensagem: string }

const TERMOS_COMERCIAIS = ['comercial', 'vendas', 'vendedor', 'representante', 'consultor de vendas', 'executivo de contas', 'account', 'sdr', 'closer', 'hunter', 'pré-venda', 'pre-venda'];
// Traços tipicamente de risco no extremo alto (nomes de competência + fatores DISC).
const TRACOS_RISCO = new Set(['assertividade', 'ousadia', 'comando', 'dominancia', 'd']);

function ehComercial(cargoNome: string): boolean {
  const n = norm(cargoNome);
  return TERMOS_COMERCIAIS.some((t) => n.includes(norm(t)));
}

function faixaNums(minStr: any, maxStr: any): { lo: number; hi: number } {
  const re = /(\d{1,3})\s*[-–a]\s*(\d{1,3})/;
  const lo = (String(minStr || '').match(re) || [])[1];
  const hi = (String(maxStr || '').match(re) || [])[2];
  return { lo: lo != null ? Number(lo) : 0, hi: hi != null ? Number(hi) : 100 };
}
function inferDir(lo: number, hi: number): string {
  const touchesTop = hi >= 99, touchesBottom = lo <= 1, centro = (lo + hi) / 2;
  if (touchesTop && !touchesBottom) return 'floor';
  if (touchesBottom && centro <= 45) return 'ceiling';
  return 'target';
}

export function avisosSpecClinica(gabarito: any, cargoNome: string): AvisoSpec[] {
  const g = typeof gabarito === 'string' ? (() => { try { return JSON.parse(gabarito); } catch { return null; } })() : gabarito;
  if (!g) return [];
  const avisos: AvisoSpec[] = [];
  const comercial = ehComercial(cargoNome);

  // (1) S/C como target em cargo comercial
  if (comercial) {
    for (const f of ['S', 'C'] as const) {
      const fx = g.tela4?.[f];
      if (!fx) continue;
      const { lo, hi } = faixaNums(fx.min, fx.max);
      const dir = fx.direcao || inferDir(lo, hi);
      if (dir === 'target') {
        const nome = f === 'S' ? 'Estabilidade (S)' : 'Conformidade (C)';
        avisos.push({ tipo: 'sc_target_comercial', traco: nome,
          mensagem: `${nome} está como "faixa-alvo" (${lo}-${hi}) num cargo comercial. O arquétipo hunter costuma ser baixo-${f} (virtude comercial); "faixa-alvo" penaliza o lado baixo. Avaliar se deveria ser "manter moderado" (ceiling).` });
      }
    }
  }

  // (2) Traço de risco como floor (competências da tela2 + DISC da tela4)
  for (const c of (g.tela2?.subcompetencias || [])) {
    if (!TRACOS_RISCO.has(norm(c.nome))) continue;
    const { lo, hi } = faixaNums(c.faixa_min, c.faixa_max);
    const dir = c.direcao || inferDir(lo, hi);
    if (dir === 'floor') {
      avisos.push({ tipo: 'floor_risco', traco: c.nome,
        mensagem: `${c.nome} está como "mais é melhor" (floor). Extremo alto pode virar agressividade/imprudência. Avaliar se deveria ser "faixa-alvo" com teto.` });
    }
  }
  for (const f of ['D'] as const) {
    const fx = g.tela4?.[f];
    if (!fx) continue;
    const { lo, hi } = faixaNums(fx.min, fx.max);
    const dir = fx.direcao || inferDir(lo, hi);
    if (dir === 'floor') {
      avisos.push({ tipo: 'floor_risco', traco: 'Dominância (D)',
        mensagem: `Dominância (D) está como "mais é melhor" (floor). D no extremo alto pode gerar conflito/autoritarismo. Avaliar "faixa-alvo" com teto.` });
    }
  }

  return avisos;
}
