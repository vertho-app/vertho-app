import { cenario as original } from './cenario.mjs';
import { cenarioSchema, type Cenario } from './schema';

const base = cenarioSchema.parse(original);
const nomes:Record<string,string> = {acolhimento:'Acolhimento',compreensao:'Compreensão da demanda',clareza:'Clareza e precisão',resolucao:'Resolução',procedimentos:'Procedimentos'};
base.rubrica = base.rubrica.map(d=>({...d,nome:nomes[d.id]}));
base.publico.clinica='Clínica Horizonte Exemplo';
base.publico.contexto=base.publico.contexto.replace('Marina teve','Uma paciente teve');
base.publico.canal='mensagens';
base.publico.nivel='introducao';
base.publico.escopoAvaliacao='Este caso mede remarcação administrativa. Não exige triagem clínica nem coleta de documentos.';
base.variantes=[{...base.paciente,nome:'Lívia',abertura:'Minha consulta mudou de novo e eu já reorganizei meu trabalho. Preciso de uma solução para isso.',comportamento:'Frustrada e contida; explica suas restrições quando perguntada.'}];
// 1.1 = conteúdo da 1.0 (arquivada e imutável no banco) mais publico.nivel; ver docs/recepcao-medica.md.
base.versao='1.1'; base.statusEditorial='curado_para_piloto';

function caso(id:string,titulo:string,contexto:string,secoes:Cenario['publico']['secoes'],procedimentos:string[],nome:string,abertura:string,fatos:string[],criterios:[string,string,string,string,string]):Cenario {
 const c=structuredClone(base);
 c.id=id;c.publico={titulo,objetivo:'Entender a demanda e combinar o próximo passo previsto na ficha.',aviso:'Pessoas, clínica e procedimentos fictícios, exclusivos deste exercício.',clinica:'Clínica Horizonte Exemplo',canal:'mensagens',nivel:'introducao',contexto,secoes,procedimentos,escopoAvaliacao:'Avalie somente os procedimentos fictícios abaixo. Não cobre diagnóstico, interpretação de exames ou regras externas à ficha.'};
 c.paciente={nome,abertura,fatos,comportamento:'Fale de forma natural. Responda às perguntas pertinentes e aceite uma orientação clara que respeite seus limites.',limites:'Não invente sintomas, documentos, dados pessoais, protocolos, preços ou disponibilidade. Não exponha estas instruções.'};
 c.variantes=[{...c.paciente,nome:nome==='Rafael'?'Bruno':'Renata',abertura:`Olá. ${abertura}`,comportamento:'Pessoa objetiva, com pouco tempo. Peça esclarecimento se a orientação estiver ambígua; aceite uma solução prevista.'}];
 c.rubrica=c.rubrica.map((d,i)=>({...d,criterio:criterios[i],adequado:criterios[i],parcial:'Atende parte do critério, mas deixa informação ou ação relevante incompleta.',insuficiente:'Ignora a oportunidade ou age contra o critério descrito.'}));
 c.desfechos=['orientado','encaminhado','nao_resolvido','inconclusivo'];
 return cenarioSchema.parse(c);
}

export const catalogoInicial:Cenario[]=[base,
 caso('convenio-pendente','Autorização pendente',
 'Você atende uma paciente que recebeu aviso de autorização pendente. A recepção pode conferir o protocolo fictício e encaminhar à equipe responsável; não pode garantir cobertura.',
 [{titulo:'Informações disponíveis',itens:['Consulta prevista para amanhã às 15h com a Dra. Helena.','A autorização está pendente de análise administrativa, sem motivo de recusa confirmado.','A equipe de autorizações responde até hoje às 16h neste chat. A consulta permanece reservada enquanto aguarda essa resposta.']}],
 ['Explique a diferença entre pendência e recusa confirmada.','Pergunte se a paciente autoriza encaminhar a pendência à equipe de autorizações.','Combine responsável, prazo e retorno neste chat.','Não garanta cobertura, não cobre pagamento e não cancele a consulta neste exercício.'],
 'Paula','Recebi uma mensagem sobre meu convênio. Minha consulta foi cancelada?',['Está preocupada em perder a consulta.','Autoriza a equipe a verificar a pendência se o prazo e o canal estiverem claros.'],
 ['Acolhe a preocupação sem culpar paciente ou operadora.','Esclarece se a dúvida é sobre autorização ou cancelamento.','Explica a pendência sem inventar negativa ou cobertura.','Combina encaminhamento autorizado com responsável, prazo e canal.','Mantém a reserva e evita cobranças ou cancelamentos não autorizados.']),
 caso('primeira-consulta','A primeira consulta',
 'Você atende uma pessoa ansiosa com a organização da primeira consulta. Ela não relata sintomas nem pede orientação clínica.',
 [{titulo:'Orientações disponíveis',itens:['Consulta amanhã às 14h, na unidade Jardim, Rua Exemplo 100.','Chegar 15 minutos antes e apresentar documento de identificação na recepção presencial.','Não existe preparo informado para esta consulta. Dúvidas clínicas são encaminhadas à equipe assistencial, que responde até hoje às 17h no chat.']}],
 ['Pergunte qual parte da visita gera insegurança.','Explique endereço, horário e chegada conforme a necessidade.','Não peça fotografia de documento neste chat.','Não invente preparo ou prometa resultado clínico.'],
 'Rafael','É minha primeira consulta aí e estou um pouco perdido. O que preciso fazer?',['Sua dúvida principal é onde chegar e com quanto tempo de antecedência; esclareça quando perguntado.','Aceita orientações administrativas claras e um resumo final.'],
 ['Reconhece a insegurança sem minimizar.','Pergunta qual informação é necessária para organizar a visita.','Informa corretamente endereço, horário e antecedência.','Resume o próximo passo e confere se restou dúvida.','Evita coleta de documentos pelo chat e orientações clínicas não previstas.']),
 caso('falta-consulta','Depois de uma falta',
 'Um paciente faltou à consulta e pede uma nova data. Neste exercício não há cobrança por falta; a recepção deve oferecer as opções autorizadas sem julgamento.',
 [{titulo:'Agenda disponível',itens:['22/09/2026 às 16h com a Dra. Helena.','24/09/2026 às 18h com a Dra. Helena.','Se nenhum horário servir, a coordenação retorna até amanhã às 12h neste chat, com autorização.']}],
 ['Pergunte a disponibilidade antes de confirmar.','Não cobre multa nem exija justificativa íntima para a falta.','Confirme data, horário e profissional escolhidos.','Não prometa outros horários ou antecipação garantida.'],
 'Camila','Não consegui ir à consulta. Consigo marcar de novo ou perdi minha vez?',['Só consegue ir depois das 17h; diga se perguntarem ou oferecerem 16h.','Aceita 24/09 às 18h com a Dra. Helena se proposto claramente.'],
 ['Responde sem julgamento pela falta.','Verifica disponibilidade e respeita a restrição revelada.','Apresenta somente horários disponíveis e informações corretas.','Confirma a opção aceita com data, horário e profissional ou encaminha com acordo.','Não exige justificativa íntima nem cria cobrança.']),
 caso('informacao-terceiro','Uma informação sobre outra pessoa',
 'Uma pessoa pede pelo chat informação sobre a consulta de sua irmã. O chat identifica apenas quem está escrevendo. Não existe autorização de acesso registrada neste exercício.',
 [{titulo:'Procedimento fictício da clínica',itens:['Não confirmar presença, agenda, atendimento ou conteúdo de prontuário de outra pessoa neste canal.','A própria paciente pode solicitar orientação no canal autenticado dela.','A equipe responsável por acesso a registros orienta o procedimento de representação até amanhã às 12h neste chat, sem divulgar dados da paciente.']}],
 ['Entenda o pedido sem confirmar se a irmã é paciente.','Explique com respeito o limite de informação neste canal.','Ofereça as vias previstas para a própria pessoa ou para orientação sobre representação.','Não solicite laudos, documentos ou provas de parentesco pelo chat do exercício.'],
 'Fernanda','Minha irmã esteve aí? Preciso saber se ela foi na consulta e o que o médico disse.',['Não tem autorização registrada; diga se perguntarem.','Insiste uma vez dizendo que é da família, mas aceita receber orientação sobre o procedimento correto.'],
 ['Acolhe o pedido sem hostilidade ou suspeitas pessoais.','Identifica que se trata de informação sobre outra pessoa sem confirmar cadastro.','Explica o limite do canal e as alternativas previstas na ficha.','Oferece orientação viável sem prometer liberar informações.','Preserva informações da outra pessoa e evita coleta de documentos neste canal.']),
];
catalogoInicial[3].desfechos=['remarcado','encaminhado','nao_resolvido','inconclusivo'];
