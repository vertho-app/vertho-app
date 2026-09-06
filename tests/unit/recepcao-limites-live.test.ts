// Opt-in pago: diálogos sintéticos; não cria sessões ou altera dados de usuários.
import {test,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {catalogoLimites} from '@/lib/recepcao/catalogo-limites';
import {abrirSessao,responder,encerrar} from '@/lib/recepcao/core';
import {geradorRecepcao} from '@/lib/recepcao/gerador';

const limites:Record<string,string>={
 'remarcacao-02':'Sinto muito pelo impacto das duas alterações. Só há 17/09 às 18h com a Dra. Helena ou 15/09 às 17h30 com o Dr. Caio, se você aceitar trocar. Não existe encaixe com a Dra. Helena no dia original. A coordenação pode consultar alternativas até hoje às 12h neste chat, sem garantia de encaixe.',
 'convenio-pendente':'Entendo a preocupação com a consulta. A reserva de amanhã às 15h com a Dra. Helena está mantida, mas a cobertura ainda depende de análise. Não posso garantir aprovação nem antecipar a análise para o meio-dia. A equipe de autorizações retorna até hoje às 16h neste chat, com seu consentimento para encaminhar.',
 'primeira-consulta':'Entendo a necessidade de organizar seu tempo. A consulta é amanhã às 14h, unidade Jardim, Rua Exemplo 100, com chegada 15 minutos antes e documento presencial. Não há previsão confirmada de duração ou espera, nem prioridade autorizada. A coordenação pode orientar até hoje às 17h neste chat; não consigo garantir saída às 15h ou atendimento exato às 14h.',
 'falta-consulta':'Entendo que quer amanhã depois das cinco. Não é punição pela falta e não há multa. Temos 22/09 às 16h ou 24/09 às 18h com a Dra. Helena; não existe encaixe autorizado para amanhã. A coordenação pode consultar alternativas até amanhã às 12h neste chat, com sua autorização, sem garantia de antecipação.',
 'informacao-terceiro':'Entendo que quer ajudar sua irmã. Neste canal não posso confirmar nem presença nem conteúdo de consulta, mesmo com parentesco ou pagamento, pois não há autorização. Sua irmã pode usar o próprio canal autenticado; a equipe de registros pode orientar sobre representação até amanhã às 12h neste chat com seu consentimento, sem revelar dados.',
};
test.runIf(process.env.RECEPCAO_LIMITES_LIVE==='1').concurrent.each(catalogoLimites.flatMap(c=>[0,1].map(variante=>({c,variante,nome:`${c.id}-${variante}`}))))('$nome: continua contestando após duas respostas corretas',async({c,variante,nome})=>{
 const ai=geradorRecepcao(null,null,true);let s=abrirSessao(c,variante);
 const falas=[limites[c.id]+' Essas alternativas atendem ou prefere que eu registre sua reclamação para a coordenação, com retorno até hoje às 17h neste chat? Não temos transferência imediata e a reclamação não garante exceção.',
  'Entendo que você compreendeu as opções e ainda discorda. A negativa não é pessoal e não tenho autorização para abrir essa exceção. Não vou prometer o que não posso cumprir nem confirmar alternativa recusada. A coordenação pode receber sua reclamação e retornar até hoje às 17h aqui, sem garantia de solução. Você autoriza somente esse registro?',
  variante===1?'Respeito sua recusa. Não farei encaminhamento ou registro que você não autorizou. Já expliquei as possibilidades e não tenho outra medida autorizada para essa exigência. Vou encerrar este atendimento por aqui. O canal continua disponível caso queira retomar uma das alternativas ou registrar uma reclamação.':'Vou seguir somente o que você autorizou: se autorizou a reclamação, ela seguirá para a coordenação com retorno até hoje às 17h neste chat, sem confirmar opção recusada ou prometer exceção. Já expliquei as possibilidades e não tenho outra medida autorizada. Vou encerrar por aqui; este canal continua disponível para retomar.'];
 for(const [i,mensagem] of falas.entries())s=(await responder(s,{requestId:`limite-${i}`,mensagem},ai.gerar)).estado;
 if(variante===1&&['remarcacao-02','informacao-terceiro'].includes(c.id))s=await encerrar(s,ai.gerar,ai.validar);
 mkdirSync('backups',{recursive:true});writeFileSync(`backups/recepcao-limites-ensaio-${nome}.json`,JSON.stringify({conversa:s.historico,relatorio:s.relatorio},null,2));
 for(const m of s.historico.filter(m=>m.role==='assistant'))expect(m.content).not.toMatch(/\b(?:perfeito|agradeço|pode confirmar|obrigad[oa] pela)\b/i);
 if(s.relatorio){expect(s.relatorio.desfecho.tipo).toBe('nao_resolvido');expect(s.relatorio.ocorrencias).toEqual([]);expect(s.relatorio.dimensoes.find(d=>d.id==='conducao_conflito')?.classificacao).toBe('adequado');expect(s.relatorio.dimensoes.find(d=>d.id==='resolucao')?.classificacao).toBe('adequado');}
},300000);
