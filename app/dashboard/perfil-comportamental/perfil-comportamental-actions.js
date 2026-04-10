'use server';

import { findColabByEmail } from '@/lib/authz';

/**
 * Carrega todos os dados do perfil comportamental do colaborador:
 * DISC natural + adaptado, liderança, 16 competências e perfil dominante.
 */
export async function loadPerfilCIS(email) {
  if (!email) return { error: 'Nao autenticado' };

  const cols = [
    'id', 'nome_completo', 'perfil_dominante',
    // DISC Natural
    'd_natural', 'i_natural', 's_natural', 'c_natural',
    // DISC Adaptado
    'd_adaptado', 'i_adaptado', 's_adaptado', 'c_adaptado',
    // Liderança
    'lid_executivo', 'lid_motivador', 'lid_metodico', 'lid_sistematico',
    // 16 Competências
    'comp_ousadia', 'comp_comando', 'comp_objetividade', 'comp_assertividade',
    'comp_persuasao', 'comp_extroversao', 'comp_entusiasmo', 'comp_sociabilidade',
    'comp_empatia', 'comp_paciencia', 'comp_persistencia', 'comp_planejamento',
    'comp_organizacao', 'comp_detalhismo', 'comp_prudencia', 'comp_concentracao',
  ].join(', ');

  const colab = await findColabByEmail(email, cols);
  if (!colab) return { error: 'Colaborador nao encontrado' };
  return { colaborador: colab };
}
