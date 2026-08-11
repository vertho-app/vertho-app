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

    const cartoes: Record<string, Cartao[]> = {
      biblioteca: [
        { rotulo: 'Módulos-base', valor: n(mbTotal), detalhe: `${n(mbPublicado)} publicados · ${n(mbRevisao)} em revisão`, tom: 'neutro' },
        { rotulo: 'Micro-conteúdos', valor: n(microTotal), detalhe: `${n(microAtivo)} ativos`, tom: 'neutro' },
        { rotulo: 'Módulos de cliente', valor: n(mbDeEmpresa), detalhe: 'polimórficos, presos a uma empresa', tom: 'neutro' },
        { rotulo: 'Micro sem módulo-base', valor: n(microSemMB), detalhe: 'não herdam a régua do acervo mestre', tom: n(microSemMB) > 0 ? 'atencao' : 'ok' },
      ],
      producao: [
        { rotulo: 'Jobs de kit concluídos', valor: n(jobsDone), detalhe: 'histórico completo', tom: 'ok' },
        { rotulo: 'Jobs de kit com erro', valor: n(jobsErro), detalhe: 'precisam de reprocessamento', tom: n(jobsErro) > 0 ? 'critico' : 'ok' },
        { rotulo: 'Vídeos com erro', valor: n(vidErro), detalhe: `de ${n(vidDone) + n(vidErro)} tentativas`, tom: n(vidErro) > 0 ? 'critico' : 'ok' },
        { rotulo: 'Último vídeo gerado', valor: ultimo ? new Date(ultimo).toLocaleDateString('pt-BR') : '—', detalhe: dias === null ? 'nenhum registro' : `há ${dias} dias`, tom: dias !== null && dias > 7 ? 'critico' : 'ok' },
      ],
      kits: [
        { rotulo: 'Kits publicados', valor: n(kitsPublicados), detalhe: 'na prateleira, por DISC', tom: 'ok' },
        { rotulo: 'Jobs concluídos', valor: n(jobsDone), detalhe: 'rodadas de geração', tom: 'neutro' },
        { rotulo: 'Jobs com erro', valor: n(jobsErro), detalhe: 'kit que não chegou à prateleira', tom: n(jobsErro) > 0 ? 'critico' : 'ok' },
      ],
      fontes: [
        { rotulo: 'Documentos na base', valor: n(kbTotal), detalhe: 'RAG por cliente', tom: 'neutro' },
        { rotulo: 'Sem vetor', valor: n(kbSemEmbedding), detalhe: n(kbSemEmbedding) === n(kbTotal) && n(kbTotal) > 0 ? 'nenhum documento é buscável por semântica' : 'busca semântica parcial', tom: n(kbSemEmbedding) > 0 ? 'critico' : 'ok' },
      ],
      desempenho: [
        { rotulo: 'Vídeos prontos', valor: n(vidDone), detalhe: 'gerados e publicados', tom: 'ok' },
        { rotulo: 'Vídeos personalizados entregues', valor: n(personalizadosOk), detalhe: 'com o nome da pessoa — é o que ela assiste', tom: 'ok' },
        { rotulo: 'Taxa de erro do render', valor: `${Math.round((n(vidErro) / Math.max(1, n(vidDone) + n(vidErro))) * 100)}%`, detalhe: `${n(vidErro)} falhas`, tom: n(vidErro) > n(vidDone) / 4 ? 'critico' : 'atencao' },
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
