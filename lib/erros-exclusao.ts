export function erroExclusao(error: { code?: string | null }): { status: number; message: string } {
  return error.code === '23503'
    ? { status:409,message:'Este cadastro ainda possui registros vinculados que precisam ser tratados antes da exclusão. Nenhum dado foi excluído.' }
    : { status:503,message:'Não foi possível excluir o cadastro. Tente novamente; se persistir, contate o suporte.' };
}
