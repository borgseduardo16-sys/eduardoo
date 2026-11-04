# Planner 2027 (PDF A4 para imprimir) - gera HTML e o Playwright converte em PDF
import calendar, os
F = '../ads/'
MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
DS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
FER = {(1, 1): 'Confraternização Universal', (2, 8): 'Carnaval (ponto facultativo)', (2, 9): 'Carnaval (ponto facultativo)',
       (3, 26): 'Sexta-feira Santa', (3, 28): 'Páscoa', (4, 21): 'Tiradentes', (5, 1): 'Dia do Trabalho', (5, 27): 'Corpus Christi (ponto facultativo)',
       (9, 7): 'Independência do Brasil', (10, 12): 'Nossa Senhora Aparecida', (11, 2): 'Finados', (11, 15): 'Proclamação da República',
       (11, 20): 'Dia da Consciência Negra', (12, 25): 'Natal'}
DATAS = {(3, 8): 'Dia da Mulher', (5, 9): 'Dia das Mães', (6, 12): 'Dia dos Namorados', (8, 8): 'Dia dos Pais', (10, 15): 'Dia do Professor', (10, 12): 'Dia das Crianças'}
cal = calendar.Calendar(firstweekday=6)
css = f'''
@font-face{{font-family:A;font-weight:800;src:url({F}archivo-latin-800-normal.woff2)}}
@font-face{{font-family:I;font-weight:400;src:url({F}inter-latin-400-normal.woff2)}}
@font-face{{font-family:I;font-weight:600;src:url({F}inter-latin-600-normal.woff2)}}
@page{{size:A4;margin:0}}*{{box-sizing:border-box;margin:0}}
body{{font-family:I;color:#2d3a33;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
.p{{width:210mm;height:297mm;padding:16mm 15mm;position:relative;page-break-after:always;background:#fbf8f3;overflow:hidden}}
h1{{font-family:A;font-weight:800;font-size:30pt;color:#3f5e49;letter-spacing:-.01em}}
h2{{font-family:A;font-weight:800;font-size:13pt;color:#3f5e49;margin:7mm 0 3mm}}
.k{{font-size:8.5pt;letter-spacing:.18em;text-transform:uppercase;color:#c9785b;font-weight:600}}
.ln{{border-bottom:.5px solid #cfd6cf;height:8.2mm}}
.box{{border:.6px solid #cfd6cf;border-radius:3mm;background:#fff;padding:4mm}}
table{{border-collapse:collapse;width:100%}}
.foot{{position:absolute;bottom:9mm;left:15mm;right:15mm;font-size:7pt;color:#9aa69d;text-align:right}}
'''
P = []
def page(html, foot=True): P.append(f'<section class="p">{html}{"<div class=foot>Planner 2027</div>" if foot else ""}</section>')
def lines(n): return ''.join('<div class="ln"></div>' for _ in range(n))

# capa
page('''<div style="position:absolute;inset:0;background:#3f5e49"></div>
<div style="position:absolute;left:18mm;right:18mm;top:70mm;color:#fbf8f3">
<div class="k" style="color:#f0c9b6">Seu ano, organizado</div>
<div style="font-family:A;font-weight:800;font-size:64pt;line-height:.95;margin-top:6mm">Planner<br>2027</div>
<div style="width:30mm;height:2mm;background:#c9785b;margin:10mm 0"></div>
<div style="font-size:12pt;line-height:1.6;max-width:120mm;color:#dfe8e0">Calendário anual, mês a mês com feriados, metas, planejamento semanal e diário, hábitos e finanças.</div></div>''', False)
# pertence
page('''<div class="k">Planner 2027</div><h1 style="margin-top:3mm">Este planner pertence a</h1>
<div class="ln" style="height:14mm;margin-top:8mm"></div>
<h2 style="margin-top:14mm">Contato em caso de perda</h2>''' + lines(2) + '''
<h2 style="margin-top:12mm">Como usar</h2><div style="font-size:10pt;line-height:1.75">
1. Comece pelas <b>metas do ano</b>: escreva o que você quer conquistar em cada área da vida.<br>
2. No início de cada mês, preencha a página do mês com as datas importantes e as 3 prioridades.<br>
3. Imprima quantas páginas <b>semanais, diárias, de hábitos e de finanças</b> precisar.<br>
4. No fim do mês, faça a <b>revisão</b>: o que funcionou, o que ajustar.<br>
5. Dica: imprima em A4 e encaderne em espiral, ou use em tablet com app de anotações.</div>''')
# ano em um olhar
mini = ''
for m in range(1, 13):
    rows = ''.join('<tr>' + ''.join(f'<td style="text-align:center;padding:.6mm 0;color:{"#c9785b" if (m, d.day) in FER and d.month == m else ("#2d3a33" if d.month == m else "transparent")};font-weight:{600 if (m, d.day) in FER and d.month == m else 400}">{d.day}</td>' for d in w) + '</tr>' for w in cal.monthdatescalendar(2027, m))
    mini += f'<div class="box" style="padding:3mm"><div style="font-family:A;font-weight:800;font-size:10pt;color:#3f5e49;margin-bottom:1.5mm">{MES[m-1]}</div><table style="font-size:7.5pt"><tr>{"".join(f"<td style=text-align:center;color:#9aa69d;font-size:6.5pt>{x[0]}</td>" for x in DS)}</tr>{rows}</table></div>'
page(f'<div class="k">Visão geral</div><h1 style="margin-top:2mm">2027 em um olhar</h1><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;margin-top:7mm">{mini}</div><div style="font-size:8pt;color:#c9785b;margin-top:4mm">● Feriados e datas nacionais em destaque</div>')
# feriados
fl = ''.join(f'<tr><td style="padding:2.4mm 0;border-bottom:.5px solid #cfd6cf;width:32mm;font-weight:600">{d:02d}/{m:02d} · {DS[(calendar.weekday(2027, m, d) + 1) % 7]}</td><td style="border-bottom:.5px solid #cfd6cf">{n}</td></tr>' for (m, d), n in sorted(FER.items()))
dl = ''.join(f'<tr><td style="padding:2.4mm 0;border-bottom:.5px solid #cfd6cf;width:32mm;font-weight:600">{d:02d}/{m:02d}</td><td style="border-bottom:.5px solid #cfd6cf">{n}</td></tr>' for (m, d), n in sorted(DATAS.items()))
page(f'<div class="k">Para não esquecer</div><h1 style="margin-top:2mm">Feriados nacionais 2027</h1><table style="font-size:10pt;margin-top:6mm">{fl}</table><h2>Datas comemorativas</h2><table style="font-size:10pt">{dl}</table><div style="font-size:8pt;color:#9aa69d;margin-top:5mm">Confira também os feriados do seu estado e da sua cidade.</div>')
# metas
areas = ['Saúde e corpo', 'Finanças', 'Estudos e carreira', 'Relacionamentos', 'Desenvolvimento pessoal', 'Lazer e viagens']
page('<div class="k">O que eu quero para 2027</div><h1 style="margin-top:2mm">Metas do ano</h1><div style="display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-top:7mm">' + ''.join(f'<div class="box" style="height:68mm"><div style="font-family:A;font-weight:800;font-size:11pt;color:#3f5e49">{a}</div>{lines(6)}</div>' for a in areas) + '</div>')
# meses
for m in range(1, 13):
    weeks = cal.monthdatescalendar(2027, m)
    hh = 178 / len(weeks)
    rows = ''
    for w in weeks:
        rows += '<tr>'
        for d in w:
            inm = d.month == m; f = FER.get((d.month, d.day)) if inm else None; dt = DATAS.get((d.month, d.day)) if inm else None
            lab = f or dt or ''
            rows += f'<td style="height:{hh}mm;vertical-align:top;border:.5px solid #cfd6cf;background:{"#fff" if inm else "#f2efe9"};padding:1.6mm;width:14.28%"><div style="font-weight:600;font-size:10pt;color:{"#c9785b" if f else ("#2d3a33" if inm else "#c5ccc6")}">{d.day}</div><div style="font-size:6pt;line-height:1.25;color:#c9785b;margin-top:1mm">{lab}</div></td>'
        rows += '</tr>'
    page(f'''<div style="display:flex;justify-content:space-between;align-items:flex-end"><div><div class="k">2027 · mês {m:02d}</div><h1 style="margin-top:1mm;font-size:34pt">{MES[m-1]}</h1></div></div>
<table style="margin-top:5mm;table-layout:fixed"><tr>{"".join(f"<th style='font-size:8pt;color:#6b7a70;padding:1.5mm 0;font-weight:600'>{x}</th>" for x in DS)}</tr>{rows}</table>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-top:5mm"><div class="box" style="height:38mm"><div style="font-family:A;font-weight:800;font-size:10pt;color:#3f5e49">3 prioridades do mês</div>{lines(3)}</div><div class="box" style="height:38mm"><div style="font-family:A;font-weight:800;font-size:10pt;color:#3f5e49">Anotações</div>{lines(3)}</div></div>''')
# semanal
dias = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
page('<div class="k">Imprima uma por semana</div><h1 style="margin-top:1mm;font-size:24pt">Planejamento semanal</h1><div style="font-size:9pt;color:#6b7a70;margin-top:2mm">Semana de ____/____ a ____/____</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-top:5mm">' + ''.join(f'<div class="box" style="height:52mm;padding:3mm 4mm"><div style="font-family:A;font-weight:800;font-size:10pt;color:#3f5e49">{d}</div>{lines(5)}</div>' for d in dias) + f'<div class="box" style="height:52mm;padding:3mm 4mm;background:#eef3ee"><div style="font-family:A;font-weight:800;font-size:10pt;color:#3f5e49">Foco da semana</div>{lines(5)}</div></div>')
# diario
hrs = ''.join(f'<div style="display:flex;border-bottom:.5px solid #cfd6cf;height:8.6mm;align-items:center"><span style="width:14mm;font-size:8.5pt;color:#9aa69d">{h:02d}:00</span></div>' for h in range(6, 23))
page(f'''<div class="k">Imprima um por dia</div><h1 style="margin-top:1mm;font-size:24pt">Planejamento diário</h1><div style="font-size:9pt;color:#6b7a70;margin-top:2mm">Data: ____/____/2027 &nbsp;&nbsp; D S T Q Q S S</div>
<div style="display:grid;grid-template-columns:1.15fr 1fr;gap:5mm;margin-top:5mm"><div class="box">{hrs}</div><div style="display:flex;flex-direction:column;gap:4mm">
<div class="box"><div style="font-family:A;font-weight:800;font-size:10pt;color:#3f5e49">Prioridades</div>{"".join("<div class=ln style='display:flex;align-items:center'>☐</div>" for _ in range(5))}</div>
<div class="box"><div style="font-family:A;font-weight:800;font-size:10pt;color:#3f5e49">Tarefas</div>{"".join("<div class=ln style='display:flex;align-items:center'>☐</div>" for _ in range(7))}</div>
<div class="box"><div style="font-family:A;font-weight:800;font-size:10pt;color:#3f5e49">Água 💧</div><div style="font-size:16pt;letter-spacing:2mm;margin-top:2mm;color:#8fb3c9">○○○○○○○○</div></div>
<div class="box"><div style="font-family:A;font-weight:800;font-size:10pt;color:#3f5e49">Gratidão / anotações</div>{lines(3)}</div></div></div>''')
# habitos
hb = ''.join('<tr><td style="border:.5px solid #cfd6cf;height:8.4mm;width:46mm;background:#fff"></td>' + ''.join('<td style="border:.5px solid #cfd6cf;background:#fff"></td>' for _ in range(31)) + '</tr>' for _ in range(25))
page(f'<div class="k">Constância</div><h1 style="margin-top:1mm;font-size:24pt">Rastreador de hábitos</h1><div style="font-size:9pt;color:#6b7a70;margin-top:2mm">Mês: ______________ &nbsp; Pinte o quadrinho do dia em que cumpriu.</div><table style="margin-top:5mm;table-layout:fixed;font-size:6.5pt"><tr><th style="text-align:left;color:#6b7a70;width:46mm">Hábito</th>{"".join(f"<th style=color:#6b7a70>{i}</th>" for i in range(1, 32))}</tr>{hb}</table>')
# financas
def tbl(t, n, cols):
    return f'<div class="box" style="padding:3mm 4mm"><div style="font-family:A;font-weight:800;font-size:10pt;color:#3f5e49;margin-bottom:1mm">{t}</div><table style="font-size:8pt"><tr>{"".join(f"<th style=text-align:left;color:#6b7a70;padding:1mm>{c}</th>" for c in cols)}</tr>{"".join("<tr>" + "".join("<td style=border-bottom:.5px solid #cfd6cf;height:7.4mm></td>" for _ in cols) + "</tr>" for _ in range(n))}</table></div>'
page('<div class="k">Dinheiro sob controle</div><h1 style="margin-top:1mm;font-size:24pt">Finanças do mês</h1><div style="font-size:9pt;color:#6b7a70;margin-top:2mm">Mês: ______________</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-top:5mm">'
     + tbl('Entradas', 6, ['Descrição', 'Data', 'Valor']) + tbl('Contas fixas', 6, ['Conta', 'Vence', 'Valor', 'Pago']) + '</div><div style="margin-top:4mm">' + tbl('Gastos do mês', 14, ['Data', 'Descrição', 'Categoria', 'Valor']) + '</div>'
     + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;margin-top:4mm">' + ''.join(f'<div class="box" style="height:20mm"><div style="font-size:8pt;color:#6b7a70">{x}</div><div style="font-family:A;font-size:14pt;color:#3f5e49;margin-top:3mm">R$</div></div>' for x in ['Total de entradas', 'Total de saídas', 'Sobrou / faltou']) + '</div>')
# tarefas
page('<div class="k">Nada esquecido</div><h1 style="margin-top:1mm;font-size:24pt">Lista de tarefas</h1><div style="display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin-top:6mm">' + ''.join(f'<div class="box"><div style="font-family:A;font-weight:800;font-size:10pt;color:#3f5e49">{t}</div>' + ''.join("<div class=ln style='display:flex;align-items:center'>☐</div>" for _ in range(13)) + '</div>' for t in ['Urgente', 'Pode esperar', 'Compras', 'Ideias']) + '</div>')
# revisao
qs = ['O que deu certo este mês?', 'O que não saiu como eu queria?', 'O que eu aprendi?', 'Do que eu me orgulho?', 'O que vou fazer diferente no próximo mês?']
page('<div class="k">Fim do mês</div><h1 style="margin-top:1mm;font-size:24pt">Revisão do mês</h1><div style="font-size:9pt;color:#6b7a70;margin-top:2mm">Mês: ______________ &nbsp; Nota do mês: ① ② ③ ④ ⑤</div>' + ''.join(f'<h2>{q}</h2>{lines(4)}' for q in qs))
# anotacoes
page('<div class="k">Livre</div><h1 style="margin-top:1mm;font-size:24pt">Anotações</h1><div style="margin-top:6mm">' + lines(27) + '</div>')
open('planner.html', 'w').write(f'<!doctype html><html><head><meta charset="utf-8"><style>{css}</style></head><body>{"".join(P)}</body></html>')
print(len(P), 'paginas')
