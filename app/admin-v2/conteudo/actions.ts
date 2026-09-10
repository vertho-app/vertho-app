'use server';

import { requireAdminAction } from '@/lib/auth/action-context';
import { requireAdminSupabase } from '@/lib/admin-supabase';

/**
 * Estúdio de Conteúdo — dados reais.
 *
 * O acervo é conteúdo MESTRE da Vertho (módulos-base, kits, KB), então a leitura
 * aqui é global por natureza; o recorte por empresa aparece onde o objeto é do
 * tenant (KB e módulos polimórficos). Nenhuma das tabelas lidas aqui está no
 * escopo do tenant-read-guard (que cobre colaboradores/respostas/relatorios/
 * sessoes_avaliacao) — o que não dispensa filtrar, apenas registra por que não
 * há `.eq('empresa_id')` nas consultas de acervo.
 */

export type Cartao = {
  rotulo: string;
  valor: number | string;
  detalhe: string;
  tom: 'ok' | 'atencao' | 'critico' | 'neutro';
};

export type Lacuna = {
  titulo: string;
  quantos: string;
  porque: string;
  href: string | null;
  tom: 'atencao' | 'critico';
};

// ⚠️ Nada de constante exportada daqui: num arquivo 'use server' todo export
// precisa ser função async (o build falha com "can only export async functions").
// As abas vivem em ./abas.ts, que é módulo comum.

export type Conteudo = {
  cartoes: Record<string, Cartao[]>;
  lacunas: Lacuna[];
  ultimoVideo: string | null;
  diasSemVideo: number | null;
};

const n = (r: { count: number | null }) => r.count || 0;

export async function carregarConteudo(): Promise<{ dados?: Conteudo; erro?: string }> {
  await requireAdminAction();
  const sb = await requireAdminSupabase();

  try {
    const [
      mbTotal, mbPublicado, mbRevisao, mbSemEmbedding, mbSemDescritor, mbDeEmpresa,
      microTotal, microAtivo, microSemMB, personalizadosOk,
      kitsPublicados, jobsDone, jobsErro,
      kbTotal, kbSemEmbedding,
      vidDone, vidErro, ultimoVid,
    ] = await Promise.all([
      sb.from('modulos_base_conteudo').select('id', { count: 'exact', head: true }),
      sb.from('modulos_base_conteudo').select('id', { count: 'exact', head: true }).eq('status', 'publicado'),
      sb.from('modulos_base_conteudo').select('id', { count: 'exact', head: true }).eq('status', 'revisao'),
      sb.from('modulos_base_conteudo').select('id', { count: 'exact', head: true }).is('descritor_embedding', null),
      sb.from('modulos_base_conteudo').select('id', { count: 'exact', head: true }).is('descritor', null),
      sb.from('modulos_base_conteudo').select('id', { count: 'exact', head: true }).not('empresa_id', 'is', null),

      sb.from('micro_conteudos').select('id', { count: 'exact', head: true }),
      sb.from('micro_conteudos').select('id', { count: 'exact', head: true }).eq('ativo', true),
      sb.from('micro_conteudos').select('id', { count: 'exact', head: true }).is('modulo_base_id', null),
      // ⚠️ NÃO medir vídeo por micro_conteudos.bunny_video_id: o que a pessoa
      // assiste é o personalizado (com o nome dela), resolvido na LEITURA. O
      // campo no micro-conteúdo mede outra coisa e daria um número menor e falso.
      sb.from('videos_personalizados').select('id', { count: 'exact', head: true }).eq('status', 'done'),

      sb.from('kits').select('id', { count: 'exact', head: true }).eq('status', 'published'),
      sb.from('kit_jobs').select('id', { count: 'exact', head: true }).eq('status', 'done'),
      sb.from('kit_jobs').select('id', { count: 'exact', head: true }).eq('status', 'error'),

      sb.from('knowledge_base').select('id', { count: 'exact', head: true }),
      sb.from('knowledge_base').select('id', { count: 'exact', head: true }).is('embedding', null),

      sb.from('videos_gerados').select('id', { count: 'exact', head: true }).eq('status', 'done'),
      sb.from('videos_gerados').select('id', { count: 'exact', head: true }).eq('status', 'error'),
      sb.from('videos_gerados').select('created_at').order('created_at', { ascending: false }).limit(1),
    ]);

    const ultimo = (ultimoVid.data as { created_at: string }[] | null)?.[0]?.created_at ?? null;
    const dias = ultimo ? Math.floor((Date.now() - new Date(ultimo).getTime()) / 86400000) : null;

    const itensSemCobertura = n(kbSemEmbedding) + n(mbSemEmbedding) + n(mbSemDescritor) + n(microSemMB);
    const modulosProntos = Math.max(0, n(mbTotal) - n(mbSemEmbedding) - n(mbSemDescritor));

    const cartoes: Record<string, Cartao[]> = {
      demandas: [
        { rotulo: 'Itens sem cobertura', valor: itensSemCobertura, detalhe: 'somatório de lacunas detectadas no acervo', tom: itensSemCobertura > 0 ? 'critico' : 'ok' },
        { rotulo: 'Fontes sem vetor', valor: n(kbSemEmbedding), detalhe: `de ${n(kbTotal)} documentos da knowledge base`, tom: n(kbSemEmbedding) > 0 ? 'critico' : 'ok' },
        { rotulo: 'Módulos sem descritor', valor: n(mbSemDescritor), detalhe: 'não entram no casamento de conteúdo', tom: n(mbSemDescritor) > 0 ? 'atencao' : 'ok' },
        { rotulo: 'Micro-conteúdos órfãos', valor: n(microSemMB), detalhe: 'sem vínculo com um módulo-base', tom: n(microSemMB) > 0 ? 'atencao' : 'ok' },
      ],
      producao: [
        { rotulo: 'Jobs de kit concluídos', valor: n(jobsDone), detalhe: 'histórico completo', tom: 'ok' },
        { rotulo: 'Jobs de kit com erro', valor: n(jobsErro), detalhe: 'precisam de reprocessamento', tom: n(jobsErro) > 0 ? 'critico' : 'ok' },
        { rotulo: 'Vídeos com erro', valor: n(vidErro), detalhe: `de ${n(vidDone) + n(vidErro)} tentativas`, tom: n(vidErro) > 0 ? 'critico' : 'ok' },
        { rotulo: 'Último vídeo gerado', valor: ultimo ? new Date(ultimo).toLocaleDateString('pt-BR') : '—', detalhe: dias === null ? 'nenhum registro' : `há ${dias} dias`, tom: dias !== null && dias > 7 ? 'critico' : 'ok' },
      ],
      revisao: [
        { rotulo: 'Módulos em revisão', valor: n(mbRevisao), detalhe: `de ${n(mbTotal)} módulos-base`, tom: n(mbRevisao) > 0 ? 'atencao' : 'ok' },
        { rotulo: 'Módulos sem embedding', valor: n(mbSemEmbedding), detalhe: 'o resolvedor não consegue escolhê-los', tom: n(mbSemEmbedding) > 0 ? 'critico' : 'ok' },
        { rotulo: 'Jobs de kit com erro', valor: n(jobsErro), detalhe: 'precisam voltar à produção', tom: n(jobsErro) > 0 ? 'critico' : 'ok' },
        { rotulo: 'Vídeos com erro', valor: n(vidErro), detalhe: 'renders que não chegaram à publicação', tom: n(vidErro) > 0 ? 'critico' : 'ok' },
      ],
      publicado: [
        { rotulo: 'Módulos-base publicados', valor: n(mbPublicado), detalhe: `de ${n(mbTotal)} no acervo mestre`, tom: 'ok' },
        { rotulo: 'Micro-conteúdos ativos', valor: n(microAtivo), detalhe: `de ${n(microTotal)} cadastrados`, tom: 'ok' },
        { rotulo: 'Kits publicados', valor: n(kitsPublicados), detalhe: 'na prateleira, por DISC', tom: 'ok' },
        { rotulo: 'Vídeos personalizados', valor: n(personalizadosOk), detalhe: 'entregas prontas com o nome da pessoa', tom: 'ok' },
      ],
      cobertura: [
        { rotulo: 'Documentos buscáveis', valor: Math.max(0, n(kbTotal) - n(kbSemEmbedding)), detalhe: `de ${n(kbTotal)} na knowledge base`, tom: n(kbSemEmbedding) > 0 ? 'atencao' : 'ok' },
        { rotulo: 'Módulos prontos para casar', valor: modulosProntos, detalhe: `de ${n(mbTotal)} módulos-base`, tom: modulosProntos < n(mbTotal) ? 'atencao' : 'ok' },
        { rotulo: 'Módulos de cliente', valor: n(mbDeEmpresa), detalhe: 'conteúdo específico vinculado a empresas', tom: 'neutro' },
        { rotulo: 'Vídeos prontos', valor: n(vidDone), detalhe: 'gerados e publicados', tom: 'ok' },
      ],
    };

    const lacunas: Lacuna[] = [];

    if (n(kbSemEmbedding) > 0) {
      lacunas.push({
        titulo: 'Knowledge base sem vetor',
        quantos: `${n(kbSemEmbedding)} de ${n(kbTotal)} documentos`,
        porque: 'Sem embedding, a busca da KB cai em casamento de palavra. O documento existe e não é encontrado pelo assunto.',
        href: '/admin/vertho/knowledge-base',
        tom: 'critico',
      });
    }

    if (n(mbSemEmbedding) > 0) {
      lacunas.push({
        titulo: 'Módulos-base sem embedding do descritor',
        quantos: `${n(mbSemEmbedding)} de ${n(mbTotal)}`,
        porque: 'O resolvedor casa conteúdo pelo vetor do descritor. Sem ele, o módulo não é escolhido — e a falha é silenciosa.',
        href: '/admin/vertho/modulos-base',
        tom: 'atencao',
      });
    }

    if (n(mbSemDescritor) > 0) {
      lacunas.push({
        titulo: 'Módulos-base sem descritor',
        quantos: `${n(mbSemDescritor)}`,
        porque: 'O campo descritor é a âncora do casamento. Vazio, o módulo fica órfão; com título no lugar do descritor, a IA escreve sobre o assunto vizinho.',
        href: '/admin/vertho/modulos-base',
        tom: 'atencao',
      });
    }

    if (dias !== null && dias > 7) {
      lacunas.push({
        titulo: 'Nenhum vídeo novo há mais de uma semana',
        quantos: `${dias} dias desde o último`,
        porque: 'Geração de vídeo falha sem alarme: o registro em videos_gerados vem depois do roteiro, então um erro no roteiro não deixa rastro.',
        href: '/admin/videos',
        tom: 'critico',
      });
    }

    if (n(jobsErro) > 0) {
      lacunas.push({
        titulo: 'Jobs de kit em erro',
        quantos: `${n(jobsErro)} de ${n(jobsDone) + n(jobsErro)}`,
        porque: 'Kit que não chega à prateleira faz a semana cair no conteúdo genérico, sem aviso na tela do colaborador.',
        href: '/admin/conteudos/kit',
        tom: 'atencao',
      });
    }

    if (n(microSemMB) > 0) {
      lacunas.push({
        titulo: 'Micro-conteúdos sem módulo-base',
        quantos: `${n(microSemMB)} de ${n(microTotal)}`,
        porque: 'Conteúdo solto não herda a régua do acervo mestre nem entra na conta de cobertura por descritor.',
        href: '/admin/conteudos',
        tom: 'atencao',
      });
    }

    return { dados: { cartoes, lacunas, ultimoVideo: ultimo, diasSemVideo: dias } };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'falha ao carregar' };
  }
}
