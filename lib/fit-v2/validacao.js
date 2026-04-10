// ── Validação do perfil ideal do cargo (schema Fit v2) ──────────────────────

export function validarPerfilIdeal(perfil) {
  const erros = [];

  if (!perfil) return ['Perfil ideal não fornecido'];

  // Pesos dos blocos devem somar 1.00
  const pesos = perfil.pesos_blocos || {};
  const somaPesos = Object.values(pesos).reduce((a, b) => a + b, 0);
  if (Math.abs(somaPesos - 1.0) > 0.01) {
    erros.push(`Pesos dos blocos somam ${somaPesos.toFixed(2)}, devem somar 1.00`);
  }

  // Blocos válidos
  const blocosValidos = ['mapeamento', 'competencias', 'lideranca', 'disc'];
  for (const key of Object.keys(pesos)) {
    if (!blocosValidos.includes(key)) erros.push(`Bloco inválido: ${key}`);
  }

  // Blocos críticos: máximo 2
  const criticos = perfil.blocos_criticos || [];
  if (criticos.length > 2) erros.push(`Máximo 2 blocos críticos, recebeu ${criticos.length}`);
  for (const c of criticos) {
    if (!blocosValidos.includes(c)) erros.push(`Bloco crítico inválido: ${c}`);
  }

  // Limiar crítico
  if (perfil.limiar_critico !== undefined) {
    if (perfil.limiar_critico < 0 || perfil.limiar_critico > 100) {
      erros.push(`Limiar crítico deve estar entre 0 e 100`);
    }
  }

  // Mapeamento
  if (perfil.mapeamento?.tags_ideais) {
    for (const tag of perfil.mapeamento.tags_ideais) {
      if (!['critica', 'complementar'].includes(tag.peso)) {
        erros.push(`Tag "${tag.nome}": peso deve ser "critica" ou "complementar"`);
      }
    }
  }

  // Competências
  if (perfil.competencias) {
    for (const comp of perfil.competencias) {
      if (!comp.nome) erros.push('Competência sem nome');
      if (comp.faixa_min !== undefined && comp.faixa_max !== undefined) {
        if (comp.faixa_min > comp.faixa_max) erros.push(`Competência "${comp.nome}": faixa_min > faixa_max`);
      }
      if (comp.peso && !['critica', 'importante', 'complementar'].includes(comp.peso)) {
        erros.push(`Competência "${comp.nome}": peso deve ser critica/importante/complementar`);
      }
    }
  }

  // Liderança ideal deve somar 100 (spec 2.2 usa "executivo"; aceitamos "executor" como fallback)
  if (perfil.lideranca_ideal) {
    const lid = perfil.lideranca_ideal;
    const exec = lid.executivo ?? lid.executor ?? 0;
    const somaLid = exec + (lid.motivador || 0) + (lid.metodico || 0) + (lid.sistematico || 0);
    if (Math.abs(somaLid - 100) > 1) erros.push(`Liderança ideal soma ${somaLid}, deve somar 100`);
  }

  // DISC ideal: min < max
  if (perfil.disc_ideal) {
    for (const dim of ['D', 'I', 'S', 'C']) {
      const d = perfil.disc_ideal[dim];
      if (d && d.min > d.max) erros.push(`DISC ${dim}: min (${d.min}) > max (${d.max})`);
    }
  }

  return erros;
}
