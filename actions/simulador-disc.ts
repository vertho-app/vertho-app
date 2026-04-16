'use server';

import { tenantDb } from '@/lib/tenant-db';

/**
 * Simula o mapeamento comportamental DISC de colaboradores que ainda não fizeram.
 * Gera valores aleatórios coerentes (soma D+I+S+C ~= 100 para Natural e Adaptado)
 * + perfil dominante derivado + competências + liderança + preferências médias.
 *
 * Útil pra testes e demos — NÃO substitui o mapeamento real.
 */
export async function simularMapeamentoDISCLote(empresaId: string) {
  try {
    if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
    const tdb = tenantDb(empresaId);

    const { data: colabs } = await tdb.from('colaboradores')
      .select('id, nome_completo, perfil_dominante')
      .is('perfil_dominante', null);

    if (!colabs?.length) return { success: true, message: 'Todos já têm mapeamento DISC', simulados: 0 };

    let simulados = 0;
    for (const colab of colabs) {
      const payload = gerarMapeamentoRandomico();
      const { error } = await tdb.from('colaboradores').update(payload).eq('id', colab.id);
      if (!error) simulados++;
    }

    return { success: true, message: `${simulados} colaboradores com mapeamento DISC simulado`, simulados };
  } catch (err) {
    console.error('[VERTHO] simularMapeamentoDISCLote:', err);
    return { success: false, error: err?.message };
  }
}

function gerarMapeamentoRandomico() {
  // DISC Natural (soma ~100, uma dimensão dominante)
  const natural = gerarDISCComDominante();
  const adaptado = gerarDISCComDominante(natural);

  const perfil = derivarPerfilDominante(natural);

  // Liderança derivada do DISC (4 estilos, soma ~100)
  const lideranca = {
    executivo: Math.round(natural.D * 0.7 + natural.C * 0.3),
    motivador: Math.round(natural.I * 0.8 + natural.D * 0.2),
    metodico: Math.round(natural.S * 0.5 + natural.C * 0.5),
    sistematico: Math.round(natural.C * 0.7 + natural.S * 0.3),
  };

  // 16 competências com base nas dimensões DISC (0-100 variando)
  const comps = {
    comp_ousadia: biased(natural.D, 20),
    comp_comando: biased(natural.D, 15),
    comp_objetividade: biased(natural.D, 18),
    comp_assertividade: biased((natural.D + natural.I) / 2, 15),
    comp_persuasao: biased(natural.I, 18),
    comp_extroversao: biased(natural.I, 20),
    comp_entusiasmo: biased(natural.I, 15),
    comp_sociabilidade: biased((natural.I + natural.S) / 2, 15),
    comp_empatia: biased(natural.S, 18),
    comp_paciencia: biased(natural.S, 15),
    comp_persistencia: biased(natural.S, 20),
    comp_planejamento: biased((natural.S + natural.C) / 2, 15),
    comp_organizacao: biased(natural.C, 18),
    comp_detalhismo: biased(natural.C, 20),
    comp_prudencia: biased(natural.C, 15),
    comp_concentracao: biased(natural.C, 15),
  };

  // Preferências de aprendizagem (1-5, randomizadas)
  const prefs = {
    pref_video_curto: rand(2, 5),
    pref_video_longo: rand(1, 5),
    pref_texto: rand(1, 5),
    pref_audio: rand(1, 5),
    pref_infografico: rand(1, 5),
    pref_exercicio: rand(2, 5),
    pref_mentor: rand(2, 5),
    pref_estudo_caso: rand(1, 5),
  };

  return {
    perfil_dominante: perfil,
    d_natural: natural.D, i_natural: natural.I, s_natural: natural.S, c_natural: natural.C,
    d_adaptado: adaptado.D, i_adaptado: adaptado.I, s_adaptado: adaptado.S, c_adaptado: adaptado.C,
    lid_executivo: lideranca.executivo,
    lid_motivador: lideranca.motivador,
    lid_metodico: lideranca.metodico,
    lid_sistematico: lideranca.sistematico,
    ...comps,
    ...prefs,
    mapeamento_em: new Date().toISOString(),
    disc_resultados: JSON.stringify({ origem: 'simulado', natural, adaptado }),
    // Invalida caches de relatório
    comportamental_pdf_path: null,
    report_texts: null,
    report_generated_at: null,
    insights_executivos: null,
    insights_executivos_at: null,
  };
}

function gerarDISCComDominante(base: any = null): Record<string, number> {
  // Escolhe 1 dimensão dominante (40-55) e distribui o resto
  const dims = ['D', 'I', 'S', 'C'];
  const dominante = base
    ? dims[Math.floor(Math.random() * 4)]
    : dims[Math.floor(Math.random() * 4)];

  const valor: Record<string, number> = { D: 0, I: 0, S: 0, C: 0 };
  const alvoSoma = 100;
  const vDom = rand(40, 55);
  valor[dominante] = vDom;

  // Distribui 100 - vDom entre os 3 restantes
  const restantes = dims.filter(d => d !== dominante);
  let restante = alvoSoma - vDom;
  for (let i = 0; i < restantes.length; i++) {
    if (i === restantes.length - 1) {
      valor[restantes[i]] = restante;
    } else {
      const max = Math.min(restante, vDom - 5);
      const v = rand(5, Math.max(6, max));
      valor[restantes[i]] = v;
      restante -= v;
    }
  }
  return valor;
}

function derivarPerfilDominante(disc: Record<string, number>) {
  // Retorna letra da dimensão com maior valor
  const entries = Object.entries(disc).sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

function biased(center: number, spread: number) {
  const v = Math.round(center + (Math.random() * 2 - 1) * spread);
  return Math.max(0, Math.min(100, v));
}

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
