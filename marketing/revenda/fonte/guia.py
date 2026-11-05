# Ebook "Guia de Estudos Inteligente" (PDF A4) - mesmo estilo do planner
import re
css = open('planner.py').read().split("css = f'''")[1].split("'''")[0].replace('{{', '{').replace('}}', '}').replace('{F}', '../ads/')
css += '''.t{font-size:10.6pt;line-height:1.72}.t p{margin:0 0 3.2mm}.t li{margin:0 0 1.6mm 5mm}
.dica{background:#eef3ee;border-left:1.4mm solid #3f5e49;border-radius:2mm;padding:3.5mm 4.5mm;margin:4mm 0;font-size:10pt}
.num{font-family:A;font-weight:800;font-size:44pt;color:#e4ddd2;position:absolute;right:15mm;top:12mm}
td,th{border:.5px solid #cfd6cf;padding:2mm;font-size:9pt;background:#fff}th{background:#eef3ee;color:#3f5e49}'''
P = []
def page(h, foot=True): P.append(f'<section class="p">{h}{"<div class=foot>Guia de Estudos Inteligente</div>" if foot else ""}</section>')
def cap(n, k, t, body):
    page(f'<div class="num">{n:02d}</div><div class="k">{k}</div><h1 style="font-size:24pt;margin:2mm 0 6mm;max-width:150mm">{t}</h1><div class="t">{body}</div>')
def lines(n): return ''.join('<div class="ln"></div>' for _ in range(n))

page('''<div style="position:absolute;inset:0;background:#3f5e49"></div><div style="position:absolute;left:18mm;right:18mm;top:66mm;color:#fbf8f3">
<div class="k" style="color:#f0c9b6">Ebook + modelos para imprimir</div>
<div style="font-family:A;font-weight:800;font-size:46pt;line-height:1;margin-top:6mm">Guia de Estudos Inteligente</div>
<div style="width:30mm;height:2mm;background:#c9785b;margin:10mm 0"></div>
<div style="font-size:13pt;line-height:1.6;max-width:135mm;color:#dfe8e0">Aprenda mais estudando menos: os métodos que a ciência já comprovou, um cronograma pronto e um plano de 30 dias.</div></div>''', False)
page('<div class="k">Sumário</div><h1 style="margin:2mm 0 8mm">O que você vai encontrar</h1><div class="t"><ol style="padding-left:6mm;line-height:2.1">' + ''.join(f'<li>{x}</li>' for x in [
    'Por que a gente esquece o que estudou', 'Revisão ativa: o método mais eficiente que existe', 'Revisão espaçada: estude no dia certo',
    'Foco de verdade: Pomodoro e o celular', 'Como montar o seu cronograma', 'Resumos, mapas mentais e flashcards que funcionam',
    'Como estudar para uma prova', 'Exercícios: onde o aprendizado acontece', 'Sono, comida e ansiedade', 'Seu plano de 30 dias',
    'Modelos para imprimir: cronograma, revisões e checklist de prova']) + '</ol></div>')
cap(1, 'Comece por aqui', 'Por que a gente esquece o que estudou', '''
<p>Você lê o capítulo inteiro, entende tudo, e uma semana depois não lembra quase nada. Isso não é falta de inteligência. É como o cérebro funciona.</p>
<p>No século XIX, o psicólogo Hermann Ebbinghaus mediu quanto a gente esquece com o tempo. O resultado ficou conhecido como <b>curva do esquecimento</b>: sem revisão, boa parte do que aprendemos some nos primeiros dias.</p>
<p>A boa notícia é que a curva fica mais "deitada" a cada revisão. Quem revisa na hora certa esquece cada vez menos e precisa de cada vez menos tempo para lembrar.</p>
<div class="dica"><b>A ideia principal deste guia:</b> estudar bem não é estudar mais horas. É (1) puxar a informação da cabeça em vez de só reler, (2) revisar no momento certo e (3) estudar com foco total por blocos curtos.</div>
<p>Os erros mais comuns de quem estuda muito e rende pouco:</p><ul>
<li><b>Reler e grifar</b> o texto várias vezes. Dá a sensação de que você sabe, mas é só familiaridade.</li>
<li><b>Estudar tudo na véspera.</b> Funciona para o dia seguinte e some logo depois.</li>
<li><b>Estudar com o celular do lado.</b> Cada notificação quebra a concentração por vários minutos.</li>
<li><b>Não fazer exercícios.</b> A prova pede que você use o conteúdo, não que reconheça.</li></ul>''')
cap(2, 'Método 1', 'Revisão ativa: o método mais eficiente que existe', '''
<p>Revisão ativa é <b>tentar lembrar sem olhar</b>. Em vez de reler, você fecha o caderno e se pergunta: "o que eu acabei de estudar?". Esse esforço de buscar a informação é o que grava o conteúdo.</p>
<p>Como fazer na prática:</p><ul>
<li><b>Feche e explique:</b> depois de cada tópico, feche o material e explique em voz alta, como se estivesse ensinando alguém.</li>
<li><b>Folha em branco:</b> escreva tudo o que lembra numa folha. Depois abra o material e complete com outra cor o que faltou. O que faltou é o que você precisa revisar.</li>
<li><b>Perguntas no caderno:</b> ao estudar, escreva perguntas na margem ("Quais são as causas da Revolução Francesa?"). Na revisão, cubra o texto e responda.</li>
<li><b>Flashcards:</b> pergunta de um lado, resposta do outro (veja o capítulo 6).</li></ul>
<div class="dica"><b>Sentiu dificuldade para lembrar?</b> Ótimo. Esse esforço é exatamente o que faz a memória ficar. Se está fácil demais, você está só relendo.</div>''')
cap(3, 'Método 2', 'Revisão espaçada: estude no dia certo', '''
<p>Revisar dez vezes no mesmo dia rende muito menos do que revisar quatro vezes em dias diferentes. Espalhar as revisões no tempo é a <b>revisão espaçada</b>.</p>
<p>Um calendário simples que funciona para a maioria das matérias:</p>
<table style="margin:3mm 0 5mm"><tr><th>Quando</th><th>O que fazer</th><th>Tempo</th></tr>
<tr><td>Dia 0</td><td>Estudar o conteúdo e fazer a revisão ativa</td><td>o necessário</td></tr>
<tr><td>Dia 1</td><td>1ª revisão: folha em branco ou perguntas</td><td>10 a 15 min</td></tr>
<tr><td>Dia 7</td><td>2ª revisão + alguns exercícios</td><td>15 a 20 min</td></tr>
<tr><td>Dia 30</td><td>3ª revisão + exercícios de provas antigas</td><td>20 min</td></tr></table>
<p>Use a <b>Tabela de Revisões</b> no final deste guia: cada vez que estudar um assunto novo, anote a data e já marque os dias de revisão.</p>
<div class="dica"><b>Dica:</b> comece cada sessão de estudo pelas revisões do dia. Elas são curtas e garantem que você não perde o que já estudou.</div>''')
cap(4, 'Método 3', 'Foco de verdade: Pomodoro e o celular', '''
<p>Uma hora de estudo com o celular do lado pode render menos do que 25 minutos de foco total. O método <b>Pomodoro</b> ajuda a criar esse foco:</p><ul>
<li>Escolha <b>uma</b> tarefa (ex.: "fazer 10 exercícios de equações").</li>
<li>Coloque um timer de <b>25 minutos</b> e estude sem parar e sem celular.</li>
<li>Faça uma pausa de <b>5 minutos</b>: levante, beba água, alongue. Não abra redes sociais.</li>
<li>A cada 4 blocos, faça uma pausa maior, de 15 a 30 minutos.</li></ul>
<p><b>O celular:</b> deixe em outro cômodo ou dentro de uma gaveta, no silencioso. Só ter o celular à vista já atrapalha a concentração. Use o timer do relógio, do computador ou um timer de cozinha.</p>
<div class="dica"><b>Começar é a parte mais difícil.</b> Quando bater a preguiça, combine com você mesmo: "só um Pomodoro". Na maioria das vezes, depois do primeiro, você continua.</div>
<p>Ambiente: mesa limpa, só o material da matéria do dia, boa luz e uma garrafa de água. Se possível, estude sempre no mesmo lugar e no mesmo horário. O cérebro aprende que ali é hora de focar.</p>''')
cap(5, 'Organização', 'Como montar o seu cronograma', '''
<p>Um cronograma bom é <b>realista</b>. Melhor estudar 1 hora todo dia do que planejar 5 horas e desistir na quarta-feira.</p>
<p>Passo a passo:</p><ul>
<li><b>1. Veja o seu tempo livre de verdade:</b> marque na grade semanal (no fim do guia) aula, trabalho, transporte e refeições. O que sobrar é o seu tempo de estudo.</li>
<li><b>2. Liste as matérias</b> e dê uma nota de 1 a 3 para a dificuldade de cada uma. As de nota 3 ganham mais blocos.</li>
<li><b>3. Distribua em blocos de 25 a 50 minutos.</b> Alterne matérias de exatas e de humanas no mesmo dia.</li>
<li><b>4. Reserve 15 minutos por dia para revisões</b> (capítulo 3).</li>
<li><b>5. Deixe um dia mais leve</b> na semana, para descansar ou colocar em dia o que atrasou.</li></ul>
<div class="dica"><b>Exemplo para quem tem 2 horas por dia:</b> 15 min de revisões + 2 blocos de 40 min de matérias diferentes + 20 min de exercícios.</div>
<p>No domingo, gaste 10 minutos olhando a semana: o que atrasou, o que tem prova, o que pode sair. O cronograma é um mapa, não uma prisão: ajuste sempre que precisar.</p>''')
cap(6, 'Ferramentas', 'Resumos, mapas mentais e flashcards que funcionam', '''
<p><b>Resumo bom é curto e com as suas palavras.</b> Copiar o livro não é resumir. Leia um trecho, feche o livro e escreva o que entendeu em poucas linhas. Use tópicos, setas e exemplos.</p>
<p><b>Mapa mental:</b> escreva o tema no centro da folha e puxe galhos com as ideias principais. De cada galho, puxe os detalhes. Use cores e palavras-chave, nunca frases longas. Ótimo para história, biologia e geografia.</p>
<p><b>Flashcards:</b> cartões com uma pergunta na frente e a resposta atrás. Perfeitos para fórmulas, datas, vocabulário e conceitos.</p><ul>
<li>Uma ideia por cartão. Pergunta curta e direta.</li>
<li>Separe em três montes: "errei", "acertei com dificuldade" e "acertei fácil". Revise mais vezes o monte "errei".</li>
<li>Pode ser em papel ou em apps gratuitos de flashcards.</li></ul>
<div class="dica"><b>Regra de ouro:</b> qualquer material só funciona se você usar para <b>testar</b> a memória. Mapa bonito guardado na gaveta não ensina nada.</div>''')
cap(7, 'Dia de prova', 'Como estudar para uma prova', '''
<p><b>Duas semanas antes:</b> descubra o que cai (pergunte ao professor, veja o conteúdo e as provas anteriores). Divida o conteúdo pelos dias que faltam e deixe os 2 últimos dias só para revisão.</p>
<p><b>Na semana da prova:</b> priorize exercícios e questões de provas antigas. Anote os erros num caderno de erros: o que errou, por que errou e o jeito certo.</p>
<p><b>Na véspera:</b> revisão leve (resumos, flashcards e caderno de erros). Nada de conteúdo novo. Separe o material da prova e <b>durma bem</b>. Uma noite de sono vale mais do que a madrugada estudando.</p>
<p><b>Na hora da prova:</b></p><ul>
<li>Leia a prova inteira rapidamente e comece pelas questões que você sabe.</li>
<li>Marque as difíceis e volte nelas depois. Não trave numa questão só.</li>
<li>Controle o tempo: divida o tempo total pelo número de questões.</li>
<li>Releia as respostas antes de entregar.</li></ul>
<div class="dica"><b>Bateu o branco?</b> Respire fundo 3 vezes, devagar, e pule para outra questão. A memória costuma voltar quando a ansiedade baixa.</div>''')
cap(8, 'Prática', 'Exercícios: onde o aprendizado acontece', '''
<p>Entender a explicação é só o começo. Você só sabe mesmo quando consegue <b>resolver sozinho</b>. Por isso, cada sessão de estudo deveria terminar com exercícios.</p><ul>
<li><b>Comece fácil e suba a dificuldade.</b> Errar tudo no começo desanima.</li>
<li><b>Tente antes de olhar a resposta.</b> Pelo menos 5 minutos de tentativa real.</li>
<li><b>Errou? Ótimo.</b> Descubra o porquê e anote no caderno de erros. O erro mostra exatamente o que estudar.</li>
<li><b>Misture os assuntos</b> nos exercícios de revisão. Na prova, as questões não vêm separadas por capítulo.</li>
<li><b>Use provas antigas</b> da sua escola, de vestibulares e do ENEM. Elas mostram o estilo das perguntas.</li></ul>
<div class="dica"><b>Caderno de erros:</b> divida a página em três colunas: a questão, por que errei e o jeito certo. Revise esse caderno toda semana e antes das provas.</div>''')
cap(9, 'Cuide da base', 'Sono, comida e ansiedade', '''
<p><b>Sono:</b> é durante o sono que o cérebro organiza e grava o que você estudou. Dormir pouco para estudar mais costuma sair caro. Tente dormir de 7 a 9 horas e manter horários parecidos todos os dias.</p>
<p><b>Comida e água:</b> estudar com fome ou com sede derruba o foco. Faça refeições normais, tenha água por perto e prefira lanches leves nas pausas.</p>
<p><b>Movimento:</b> uma caminhada de 15 minutos ou alguns alongamentos entre os blocos ajudam a "acordar" o cérebro.</p>
<p><b>Ansiedade:</b> é normal ficar nervoso com prova. Algumas coisas ajudam:</p><ul>
<li>Respiração lenta: inspire em 4 segundos, segure 4, solte em 6. Repita algumas vezes.</li>
<li>Troque "eu preciso tirar 10" por "eu vou fazer o meu melhor hoje".</li>
<li>Compare você com você mesmo de ontem, não com os colegas.</li>
<li>Converse com alguém de confiança: família, amigos, professores, orientador da escola.</li></ul>
<div class="dica">Se a ansiedade ou a tristeza estiverem atrapalhando muito o seu dia a dia, procure ajuda de um profissional de saúde. Pedir ajuda é sinal de força.</div>''')
plano = [('Semana 1', 'Organizar', ['Montar a grade semanal com o seu tempo livre', 'Fazer a lista de matérias com as notas de dificuldade', 'Testar o Pomodoro todos os dias (pelo menos 2 blocos)', 'Começar a Tabela de Revisões']),
         ('Semana 2', 'Criar o hábito', ['Estudar todos os dias no mesmo horário', 'Fazer a revisão ativa depois de cada assunto', 'Começar o caderno de erros', 'Domingo: ajustar o cronograma']),
         ('Semana 3', 'Praticar', ['Terminar cada sessão com exercícios', 'Fazer flashcards das matérias mais difíceis', 'Resolver uma prova antiga de uma matéria', 'Cumprir todas as revisões marcadas']),
         ('Semana 4', 'Consolidar', ['Aumentar um bloco por dia, se estiver tranquilo', 'Revisar o caderno de erros inteiro', 'Fazer um simulado com tempo marcado', 'Avaliar o mês: o que funcionou e o que mudar'])]
page('<div class="num">10</div><div class="k">Mão na massa</div><h1 style="font-size:24pt;margin:2mm 0 4mm">Seu plano de 30 dias</h1><div class="t"><p>Não tente mudar tudo de uma vez. Cada semana adiciona uma coisa nova. Marque o quadrinho quando concluir.</p></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-top:3mm">'
     + ''.join(f'<div class="box"><div class="k">{s}</div><div style="font-family:A;font-weight:800;font-size:13pt;color:#3f5e49;margin:1mm 0 2mm">{t}</div>' + ''.join(f'<div style="font-size:9.6pt;padding:1.8mm 0;border-bottom:.5px solid #e4e8e4">☐ {x}</div>' for x in it) + '</div>' for s, t, it in plano) + '</div>')
# modelos
dias = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
grid = '<tr><th style="width:16mm">Horário</th>' + ''.join(f'<th>{d}</th>' for d in dias) + '</tr>' + ''.join(f'<tr><td style="height:12.6mm;color:#9aa69d"></td>' + ''.join('<td></td>' for _ in dias) + '</tr>' for _ in range(16))
page(f'<div class="k">Modelo para imprimir</div><h1 style="font-size:22pt;margin:1mm 0 4mm">Cronograma semanal de estudos</h1><table style="table-layout:fixed">{grid}</table>')
rev = '<tr><th style="width:52mm">Assunto</th><th>Estudei em</th><th>Rev. 1 (dia 1)</th><th>Rev. 2 (dia 7)</th><th>Rev. 3 (dia 30)</th></tr>' + ''.join('<tr><td style="height:10.6mm"></td><td></td><td></td><td></td><td></td></tr>' for _ in range(21))
page(f'<div class="k">Modelo para imprimir</div><h1 style="font-size:22pt;margin:1mm 0 4mm">Tabela de revisões</h1><table style="table-layout:fixed">{rev}</table>')
ck = ['Sei exatamente qual conteúdo cai', 'Dividi o conteúdo pelos dias que faltam', 'Fiz exercícios de todos os assuntos', 'Resolvi pelo menos uma prova antiga', 'Revisei o caderno de erros', 'Revisei os flashcards e resumos', 'Separei o material (caneta, lápis, borracha, calculadora, documento)', 'Sei o horário e o local da prova', 'Vou dormir cedo na véspera', 'Vou tomar café da manhã antes da prova']
page('<div class="k">Modelo para imprimir</div><h1 style="font-size:22pt;margin:1mm 0 2mm">Checklist da prova</h1><div style="font-size:9pt;color:#6b7a70">Matéria: ________________ Data da prova: ____/____</div><div class="box" style="margin-top:5mm">' + ''.join(f'<div style="font-size:11pt;padding:3.6mm 0;border-bottom:.5px solid #e4e8e4">☐ &nbsp;{x}</div>' for x in ck) + '</div><h2>Caderno de erros (comece aqui)</h2><table><tr><th>Questão</th><th>Por que errei</th><th>O jeito certo</th></tr>' + ''.join('<tr><td style="height:11mm"></td><td></td><td></td></tr>' for _ in range(5)) + '</table>')
page('<div style="position:absolute;inset:0;background:#3f5e49"></div><div style="position:absolute;left:18mm;right:18mm;top:105mm;color:#fbf8f3"><div style="font-family:A;font-weight:800;font-size:30pt;line-height:1.1">Agora é com você.</div><div style="font-size:12pt;line-height:1.7;margin-top:6mm;color:#dfe8e0;max-width:140mm">Escolha um método deste guia e use hoje mesmo. Constância vale mais do que intensidade: um pouco todos os dias leva longe.</div></div>', False)
open('guia.html', 'w').write(f'<!doctype html><html><head><meta charset="utf-8"><style>{css}</style></head><body>{"".join(P)}</body></html>')
print(len(P), 'paginas')
