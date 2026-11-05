# Ebook "Pack de Mensagens Prontas para Vender" (PDF A4)
css = open('planner.py').read().split("css = f'''")[1].split("'''")[0].replace('{{', '{').replace('}}', '}').replace('{F}', '../ads/')
css += '''.m{background:#fff;border:.6px solid #cfd6cf;border-radius:3mm;padding:3mm 4mm;margin:0 0 3mm;font-size:9.6pt;line-height:1.55;break-inside:avoid}
.m b{display:block;font-size:7.5pt;letter-spacing:.12em;text-transform:uppercase;color:#c9785b;margin-bottom:1mm}
.t{font-size:10.4pt;line-height:1.7}.t p{margin:0 0 3mm}.t li{margin:0 0 1.5mm 5mm}
.dica{background:#eef3ee;border-left:1.4mm solid #3f5e49;border-radius:2mm;padding:3mm 4.5mm;margin:3mm 0;font-size:9.6pt}'''
P = []
def page(h, foot=True): P.append(f'<section class="p">{h}{"<div class=foot>Pack de Mensagens Prontas para Vender</div>" if foot else ""}</section>')
SEC = [
 ('Primeiro contato', 'Para abrir conversa sem parecer chato', [
  'Oi, [nome]! Tudo bem? Vi que você se interessou por [assunto]. Posso te mostrar uma coisa rapidinho que tem ajudado muita gente nisso?',
  'Oi, [nome]! Estou divulgando o [produto] e lembrei de você. Quer que eu te mande os detalhes? Sem compromisso.',
  'Oi! Obrigado por seguir o perfil 😊 Se quiser, te mando a lista do que eu tenho disponível hoje. Posso?',
  'Oi, [nome]! Vi seu comentário no post e fiquei feliz. Ficou com alguma dúvida? Estou por aqui.',
  '[Nome], tudo bem? Tenho uma novidade que tem tudo a ver com você: [produto]. Quer saber como funciona?',
  'Oi! Você pediu informação sobre o [produto], certo? Vou te explicar em 3 linhas pra não tomar seu tempo.',
  'Bom dia, [nome]! Passando pra avisar que o [produto] chegou/está disponível. Quer ver uma prévia?',
  'Oi, [nome]! Uma pergunta rápida: você ainda está procurando [solução]? Acho que tenho algo que pode te ajudar.',
  'Oi! Quem me indicou você foi a [pessoa]. Ela achou que você ia gostar do [produto]. Posso te mostrar?',
  'Oi, [nome]! Sem enrolação: tenho o [produto] por [preço]. Se fizer sentido pra você, te explico tudo. Se não, tudo bem também 🙂']),
 ('Apresentar o produto', 'Explicar rápido o que é e por que vale', [
  'O [produto] é [o que é]. Com ele você consegue [benefício principal] sem precisar [dor que evita].',
  'Funciona assim: você compra, recebe na hora no e-mail e já pode usar. Simples assim.',
  'O que vem: [item 1], [item 2] e [item 3]. Tudo pronto pra usar hoje mesmo.',
  'A maioria das pessoas que compra quer [objetivo]. O [produto] foi feito exatamente pra isso.',
  'Pensa no tempo que você gastaria fazendo [tarefa] do zero. Com o [produto] isso já vem pronto.',
  'O valor é [preço], pagamento único. Não tem mensalidade nem taxa escondida.',
  'Vou te mandar uma prévia pra você ver como é por dentro. 👇',
  'Diferente de [alternativa comum], o [produto] [diferencial].',
  'É ideal pra quem [perfil 1] ou [perfil 2]. Você se encaixa em algum desses?',
  'Resumindo em uma frase: [benefício principal] por menos do que [comparação de preço baixo].']),
 ('Responder objeções', 'Quando a pessoa fica em dúvida', [
  '"Tá caro": Entendo! Mas pensa assim: são [preço] uma vez só, e você usa quantas vezes quiser. Sai menos que [comparação].',
  '"Vou pensar": Claro, sem pressa! Ficou alguma dúvida que eu possa tirar agora? Às vezes é só um detalhe.',
  '"Será que funciona pra mim?": Me conta rapidinho o que você precisa, que eu te digo com sinceridade se vale a pena ou não.',
  '"Não tenho tempo": Por isso mesmo ele é prático: em [tempo curto] você já está usando.',
  '"Já vi coisa parecida de graça": Pode ser! A diferença é que aqui está tudo organizado, pronto e com suporte. Você economiza o tempo de procurar e juntar.',
  '"É seguro pagar?": Sim! O pagamento é pela [plataforma], que é segura, e você tem [X] dias de garantia.',
  '"Depois eu compro": Sem problema! Só te aviso que [condição real, ex.: o bônus vale até hoje]. Quer que eu te lembre amanhã?',
  '"Não sei se vou usar": Tem garantia de [X] dias. Se não gostar, pede o reembolso. O risco é zero pra você.',
  '"Preciso falar com alguém": Claro! Quer que eu te mande um resumo pra você mostrar?',
  '"Não tenho dinheiro agora": Entendo totalmente. Quando for um bom momento, me chama que eu te passo o link 🙂']),
 ('Fechar a venda', 'Levar para o pagamento sem pressão', [
  'Posso te mandar o link pra garantir o seu?',
  'Aqui está o link: [link]. Assim que pagar, chega no seu e-mail na hora.',
  'Prefere pagar no Pix ou no cartão? O link aceita os dois.',
  'Pronto pra começar? É só clicar aqui: [link] 👇',
  'Se fizer o pedido agora, já consegue usar hoje mesmo.',
  'Te mandei o link. Qualquer dificuldade no pagamento, me chama aqui que eu te ajudo.',
  'Fechado então? Te mando o link e você me avisa quando finalizar, combinado?',
  'Pra você não esquecer: o link é este [link]. Leva menos de 2 minutos.',
  'Quer que eu já te mande o passo a passo de como acessar depois da compra?',
  'Último detalhe: confere se o e-mail que você vai usar na compra está certinho, é nele que o acesso chega.']),
 ('Acompanhamento (follow-up)', 'Para quem sumiu ou não respondeu', [
  'Oi, [nome]! Conseguiu dar uma olhada no que te mandei?',
  'Oi! Passando só pra saber se ficou alguma dúvida sobre o [produto].',
  '[Nome], lembrei de você hoje. O [produto] ainda faz sentido pra você?',
  'Oi! Não quero ser chato, então essa é minha última mensagem sobre isso 🙂 Se quiser, o link é este: [link].',
  'Bom dia, [nome]! Vi que você abriu o link mas não finalizou. Deu algum problema no pagamento?',
  'Oi! Separei uma prévia nova do [produto] pra você. Quer ver?',
  'Oi, [nome]! Uma pessoa que comprou ontem me disse que [comentário real de cliente]. Lembrei de você.',
  'Oi! Tudo bem por aí? Se ainda estiver pensando no [produto], estou à disposição.',
  '[Nome], só pra avisar: [novidade real, ex.: entrou um bônus novo].',
  'Oi! Imagino que a semana esteja corrida. Quando tiver 2 minutinhos, me chama que eu te explico tudo.']),
 ('Pós-venda', 'Para o cliente voltar e indicar', [
  'Oi, [nome]! Obrigado pela compra 🙏 O acesso já chegou no seu e-mail? Qualquer coisa, estou aqui.',
  'Conseguiu baixar tudo certinho? Se quiser, te mando um passo a passo.',
  'Oi! Já deu tempo de usar o [produto]? Me conta o que achou, sua opinião me ajuda muito.',
  'Que bom que gostou! Posso usar o seu comentário (sem o seu nome) pra mostrar pra outras pessoas?',
  'Oi, [nome]! Saiu um produto novo que combina com o que você comprou: [produto 2]. Quer ver?',
  'Se você conhece alguém que também ia gostar, pode me indicar? Vou cuidar bem dessa pessoa 😊',
  'Oi! Passando pra te lembrar de [dica de uso do produto].',
  'Obrigado de novo pela confiança. Clientes como você fazem meu trabalho valer a pena!']),
 ('Legendas para posts', 'Para Instagram, status e grupos', [
  'Você ainda faz [tarefa] do zero? Tem um jeito mais fácil, e custa menos que um lanche. 👇 Link na bio.',
  '3 motivos pra você ter o [produto]: 1) [motivo] 2) [motivo] 3) [motivo]. Chama no direct!',
  'Antes: [situação ruim]. Depois do [produto]: [situação boa]. Quer o seu? Comenta "EU QUERO".',
  'Pergunta sincera: quanto tempo você perde com [problema] por semana? 🤔',
  'Chegou! [produto] por [preço]. Entrega na hora, direto no e-mail. 📩',
  'O que vem dentro do [produto]? Arrasta pro lado e vê tudo 👉',
  'Status: vendendo o [produto] por [preço]. Me chama que eu te passo o link 😉',
  'Pra quem pediu: o link do [produto] está na bio! Corre que é rapidinho.',
  'Feedback que eu recebi hoje: "[comentário real]". Obrigado! 🙏',
  'Dica do dia: [dica útil]. Quer mais dicas assim? Tem tudo no [produto].']),
 ('Grupos e comunidades', 'Para divulgar sem ser removido', [
  'Oi, pessoal! Posso compartilhar uma coisa que tem me ajudado com [assunto]? Se o admin não permitir, eu apago.',
  'Alguém aqui também sofre com [problema]? Eu resolvi assim: [solução curta]. Se quiserem, mando o material no privado.',
  'Deixo aqui uma dica gratuita: [dica]. Quem quiser a versão completa, me chama no privado.',
  'Para quem me pediu: o [produto] está disponível. Detalhes no privado pra não lotar o grupo 🙂',
  'Bom dia, grupo! Hoje vou responder dúvidas sobre [assunto]. Mandem aqui embaixo!',
  'Quem tiver interesse em [assunto], comenta um "👍" que eu chamo no privado.']),
]
tot = sum(len(s[2]) for s in SEC)
page(f'''<div style="position:absolute;inset:0;background:#3f5e49"></div><div style="position:absolute;left:18mm;right:18mm;top:62mm;color:#fbf8f3">
<div class="k" style="color:#f0c9b6">Copie, cole e venda</div>
<div style="font-family:A;font-weight:800;font-size:44pt;line-height:1;margin-top:6mm">{tot} Mensagens Prontas para Vender</div>
<div style="width:30mm;height:2mm;background:#c9785b;margin:10mm 0"></div>
<div style="font-size:13pt;line-height:1.6;max-width:135mm;color:#dfe8e0">No WhatsApp, no direct e em grupos: do primeiro contato ao pós-venda, com respostas para as objeções mais comuns.</div></div>''', False)
page('<div class="k">Antes de começar</div><h1 style="font-size:24pt;margin:2mm 0 6mm">Como usar este pack</h1><div class="t">'
     '<p>Cada mensagem tem espaços entre colchetes, como <b>[nome]</b>, <b>[produto]</b>, <b>[preço]</b> e <b>[link]</b>. Troque pelo que for real no seu caso e ajuste ao seu jeito de falar.</p>'
     '<ul><li><b>Seja você:</b> adapte as palavras. Mensagem que parece robô não vende.</li><li><b>Uma mensagem por vez:</b> espere a resposta antes de mandar a próxima.</li>'
     '<li><b>Nunca invente:</b> use só condições, bônus e comentários de clientes que existam de verdade.</li><li><b>Respeite o "não":</b> quem não quer hoje pode comprar amanhã, se você for educado.</li>'
     '<li><b>Não mande spam:</b> só fale com quem pediu informação, segue você ou já é cliente. Mensagem em massa para desconhecidos pode bloquear o seu número.</li></ul>'
     '<div class="dica"><b>A sequência que mais funciona:</b> Primeiro contato → Apresentar → Responder dúvidas → Fechar → Acompanhamento → Pós-venda.</div>'
     '<h2>Índice</h2><ol style="padding-left:6mm;line-height:1.95">' + ''.join(f'<li>{t} ({len(m)} mensagens)</li>' for t, _, m in SEC) + '</ol></div>')
n = 0
for i, (t, s, ms) in enumerate(SEC, 1):
    for c in range(0, len(ms), 10):
        blk = ''
        for m in ms[c:c + 10]:
            n += 1; blk += f'<div class="m"><b>Mensagem {n}</b>{m}</div>'
        head = f'<div class="k">Parte {i} · {s}</div><h1 style="font-size:22pt;margin:1mm 0 5mm">{t}{" (cont.)" if c else ""}</h1>'
        page(head + blk)
open('msgs.html', 'w').write(f'<!doctype html><html><head><meta charset="utf-8"><style>{css}</style></head><body>{"".join(P)}</body></html>')
print(len(P), 'paginas', tot, 'mensagens')
