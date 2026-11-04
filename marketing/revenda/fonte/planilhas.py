# Pack de Planilhas (revenda) - 3 planilhas prontas em Excel (abre no Google Planilhas tambem)
import os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.chart import BarChart, Reference
from openpyxl.formatting.rule import CellIsRule

OUT = os.path.join(os.path.dirname(__file__), 'out', 'Pack-de-Planilhas')
os.makedirs(OUT, exist_ok=True)
VERDE, ESC, CLARO, LINHA = '2F6F4E', '1F2937', 'EEF5F0', 'D9E2DC'
H = Font(bold=True, color='FFFFFF', name='Calibri', size=11)
T = Font(bold=True, size=18, color=ESC, name='Calibri')
SUB = Font(size=10, color='6B7280', name='Calibri', italic=True)
B = Font(bold=True, name='Calibri', color=ESC)
FILL = PatternFill('solid', fgColor=VERDE); FCL = PatternFill('solid', fgColor=CLARO); FIN = PatternFill('solid', fgColor='FFF7E6')
thin = Side(style='thin', color=LINHA); BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
BRL = 'R$ #,##0.00'; PCT = '0%'
MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

def titulo(ws, t, s, ncol):
    ws['A1'] = t; ws['A1'].font = T
    ws['A2'] = s; ws['A2'].font = SUB
    ws.row_dimensions[1].height = 30
    ws.sheet_view.showGridLines = False

def cab(ws, row, cols, widths=None):
    for i, c in enumerate(cols, 1):
        x = ws.cell(row=row, column=i, value=c); x.font = H; x.fill = FILL
        x.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True); x.border = BOX
    ws.row_dimensions[row].height = 24
    if widths:
        for i, w in enumerate(widths, 1): ws.column_dimensions[chr(64 + i)].width = w

def grade(ws, r0, r1, c0, c1, fmt=None, fill=None):
    for r in range(r0, r1 + 1):
        for c in range(c0, c1 + 1):
            x = ws.cell(row=r, column=c); x.border = BOX
            if fmt and c in fmt: x.number_format = fmt[c]
            if fill: x.fill = fill

def como_usar(wb, linhas):
    ws = wb.create_sheet('Como usar', 0); titulo(ws, 'Como usar esta planilha', 'Leia antes de começar', 1)
    ws.column_dimensions['A'].width = 110
    for i, l in enumerate(linhas, 4):
        ws.cell(row=i, column=1, value=l).alignment = Alignment(wrap_text=True, vertical='top')
    ws.cell(row=len(linhas) + 5, column=1, value='Células em amarelo claro = você preenche. As demais são calculadas automaticamente.').font = B

# ---------------- 1. Controle financeiro pessoal ----------------
wb = Workbook(); L = wb.active; L.title = 'Lançamentos'
titulo(L, 'Controle Financeiro Pessoal', 'Anote cada entrada e saída. O resumo do mês e do ano se monta sozinho.', 5)
cab(L, 4, ['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor'], [14, 38, 22, 12, 16])
N = 1000
grade(L, 5, 4 + N, 1, 5, {1: 'DD/MM/YYYY', 5: BRL}, FIN)
cats = ['Salário', 'Renda extra', 'Moradia', 'Mercado', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Contas (água, luz, internet)', 'Cartão de crédito', 'Dívidas', 'Investimentos', 'Outros']
C = wb.create_sheet('Categorias'); titulo(C, 'Categorias', 'Edite os nomes se quiser (mantenha na coluna A).', 1)
cab(C, 4, ['Categoria'], [34])
for i, c in enumerate(cats, 5): C.cell(row=i, column=1, value=c).border = BOX
dv = DataValidation(type='list', formula1=f"=Categorias!$A$5:$A${4 + len(cats) + 10}", allow_blank=True); L.add_data_validation(dv); dv.add(f'C5:C{4 + N}')
dv2 = DataValidation(type='list', formula1='"Entrada,Saída"', allow_blank=True); L.add_data_validation(dv2); dv2.add(f'D5:D{4 + N}')
L.freeze_panes = 'A5'
ex = [('05/01/2027', 'Salário', 'Salário', 'Entrada', 2500), ('06/01/2027', 'Aluguel', 'Moradia', 'Saída', 900), ('08/01/2027', 'Compra do mês', 'Mercado', 'Saída', 520)]
from datetime import datetime
for i, (d, de, ca, ti, v) in enumerate(ex, 5):
    L.cell(row=i, column=1, value=datetime.strptime(d, '%d/%m/%Y')); L.cell(row=i, column=2, value=de); L.cell(row=i, column=3, value=ca); L.cell(row=i, column=4, value=ti); L.cell(row=i, column=5, value=v)
R = wb.create_sheet('Resumo do ano', 1); titulo(R, 'Resumo do ano', 'Escolha o ano na célula B3.', 5)
R['A3'] = 'Ano:'; R['A3'].font = B; R['B3'] = 2027; R['B3'].fill = FIN; R['B3'].border = BOX
cab(R, 5, ['Mês', 'Entradas', 'Saídas', 'Saldo do mês', 'Saldo acumulado'], [16, 16, 16, 16, 18])
rng = f"Lançamentos!$A$5:$A${4 + N}"; val = f"Lançamentos!$E$5:$E${4 + N}"; tip = f"Lançamentos!$D$5:$D${4 + N}"
for m in range(12):
    r = 6 + m; R.cell(row=r, column=1, value=MESES[m]).font = B
    ini = f"DATE($B$3,{m + 1},1)"; fim = f"EOMONTH(DATE($B$3,{m + 1},1),0)"
    R.cell(row=r, column=2, value=f'=SUMIFS({val},{tip},"Entrada",{rng},">="&{ini},{rng},"<="&{fim})')
    R.cell(row=r, column=3, value=f'=SUMIFS({val},{tip},"Saída",{rng},">="&{ini},{rng},"<="&{fim})')
    R.cell(row=r, column=4, value=f'=B{r}-C{r}')
    R.cell(row=r, column=5, value=f'=D{r}' if m == 0 else f'=E{r - 1}+D{r}')
grade(R, 6, 17, 1, 5, {2: BRL, 3: BRL, 4: BRL, 5: BRL})
R.cell(row=18, column=1, value='TOTAL').font = B
for c, col in ((2, 'B'), (3, 'C'), (4, 'D')): R.cell(row=18, column=c, value=f'=SUM({col}6:{col}17)').font = B
grade(R, 18, 18, 1, 5, {2: BRL, 3: BRL, 4: BRL}, FCL)
red = Font(color='B91C1C', bold=True)
R.conditional_formatting.add('D6:E18', CellIsRule(operator='lessThan', formula=['0'], font=red))
cab(R, 21, ['Gastos por categoria (ano)', 'Total', '% das saídas'])
cat = f"Lançamentos!$C$5:$C${4 + N}"
for i, c in enumerate(cats[2:], 22):
    R.cell(row=i, column=1, value=c)
    R.cell(row=i, column=2, value=f'=SUMIFS({val},{cat},A{i},{tip},"Saída",{rng},">="&DATE($B$3,1,1),{rng},"<="&DATE($B$3,12,31))')
    R.cell(row=i, column=3, value=f'=IF($C$18=0,0,B{i}/$C$18)')
grade(R, 22, 21 + len(cats) - 2, 1, 3, {2: BRL, 3: PCT})
ch = BarChart(); ch.title = 'Entradas x Saídas por mês'; ch.y_axis.title = 'R$'; ch.height = 8; ch.width = 18
ch.add_data(Reference(R, min_col=2, min_row=5, max_col=3, max_row=17), titles_from_data=True)
ch.set_categories(Reference(R, min_col=1, min_row=6, max_row=17)); R.add_chart(ch, 'G5')
como_usar(wb, ['1. Na aba "Lançamentos", anote cada dinheiro que entra ou sai: data, descrição, categoria (lista), tipo (Entrada/Saída) e valor.',
               '2. Apague as 3 linhas de exemplo quando começar.',
               '3. A aba "Resumo do ano" calcula sozinha o total de cada mês, o saldo e quanto você gastou em cada categoria, com gráfico.',
               '4. Para mudar o ano, troque o número na célula B3 do Resumo.',
               '5. Quer outras categorias? Edite a aba "Categorias".',
               'Funciona no Excel e no Google Planilhas (Arquivo > Importar).'])
wb.save(f'{OUT}/1-Controle-Financeiro-Pessoal.xlsx')

# ---------------- 2. Precificação ----------------
wb = Workbook(); M = wb.active; M.title = 'Materiais'
titulo(M, 'Cadastro de ingredientes e materiais', 'Coloque o preço que você paga e o tamanho da embalagem.', 6)
cab(M, 4, ['Ingrediente / material', 'Preço pago', 'Qtd. na embalagem', 'Unidade', 'Custo por unidade'], [34, 14, 18, 12, 18])
NM = 200
grade(M, 5, 4 + NM, 1, 4, {2: BRL}, FIN); grade(M, 5, 4 + NM, 5, 5, {5: 'R$ #,##0.0000'})
for r in range(5, 5 + NM): M.cell(row=r, column=5, value=f'=IF(OR(B{r}="",C{r}="",C{r}=0),"",B{r}/C{r})')
dvu = DataValidation(type='list', formula1='"g,kg,ml,L,un,m,cm"', allow_blank=True); M.add_data_validation(dvu); dvu.add(f'D5:D{4 + NM}')
for i, (n, p, q, u) in enumerate([('Leite condensado', 7.5, 395, 'g'), ('Chocolate em pó', 12.9, 200, 'g'), ('Manteiga', 14.0, 200, 'g'), ('Forminha nº 4', 6.0, 100, 'un')], 5):
    M.cell(row=i, column=1, value=n); M.cell(row=i, column=2, value=p); M.cell(row=i, column=3, value=q); M.cell(row=i, column=4, value=u)
M.freeze_panes = 'A5'
P = wb.create_sheet('Precificar produto'); titulo(P, 'Calculadora de preço', 'Monte a receita/produto e veja o preço certo de venda.', 6)
P['A3'] = 'Produto:'; P['A3'].font = B; P['B3'] = 'Brigadeiro gourmet'; P['B3'].fill = FIN
cab(P, 5, ['Ingrediente / material', 'Qtd. usada', 'Unidade', 'Custo por unidade', 'Custo na receita'], [34, 14, 12, 18, 18])
for r in range(6, 26):
    P.cell(row=r, column=3, value=f'=IFERROR(INDEX(Materiais!$D$5:$D${4 + NM},MATCH(A{r},Materiais!$A$5:$A${4 + NM},0)),"")')
    P.cell(row=r, column=4, value=f'=IFERROR(INDEX(Materiais!$E$5:$E${4 + NM},MATCH(A{r},Materiais!$A$5:$A${4 + NM},0)),"")')
    P.cell(row=r, column=5, value=f'=IF(OR(A{r}="",B{r}=""),0,B{r}*D{r})')
grade(P, 6, 25, 1, 2, None, FIN); grade(P, 6, 25, 3, 5, {4: 'R$ #,##0.0000', 5: BRL})
dvm = DataValidation(type='list', formula1=f'=Materiais!$A$5:$A${4 + NM}', allow_blank=True); P.add_data_validation(dvm); dvm.add('A6:A25')
for i, (n, q) in enumerate([('Leite condensado', 395), ('Chocolate em pó', 50), ('Manteiga', 20), ('Forminha nº 4', 30)], 6):
    P.cell(row=i, column=1, value=n); P.cell(row=i, column=2, value=q)
lin = [('Custo dos ingredientes/materiais', '=SUM(E6:E25)', BRL, False),
       ('Horas de trabalho', 1.5, '0.0', True), ('Quanto vale sua hora (R$)', 15, BRL, True), ('Mão de obra', '=B29*B30', BRL, False),
       ('Custos fixos (gás, luz, embalagem) - % sobre o custo', 0.15, PCT, True), ('Valor dos custos fixos', '=(B28+B31)*B32', BRL, False),
       ('CUSTO TOTAL', '=B28+B31+B33', BRL, False), ('Margem de lucro desejada (%)', 0.6, PCT, True), ('Taxa da maquininha/plataforma (%)', 0.05, PCT, True),
       ('PREÇO DE VENDA DO LOTE', '=B34*(1+B35)/(1-B36)', BRL, False), ('Rendimento (quantas unidades)', 30, '0', True), ('PREÇO POR UNIDADE', '=IF(B38=0,0,B37/B38)', BRL, False),
       ('Lucro por unidade', '=IF(B38=0,0,(B37*(1-B36)-B34)/B38)', BRL, False)]
for i, (n, v, f, inp) in enumerate(lin, 28):
    a = P.cell(row=i, column=1, value=n); b = P.cell(row=i, column=2, value=v); b.number_format = f; a.border = b.border = BOX
    if inp: b.fill = FIN
    if n.isupper(): a.font = b.font = Font(bold=True, color='FFFFFF'); a.fill = b.fill = FILL
como_usar(wb, ['1. Na aba "Materiais", cadastre cada ingrediente ou material: o preço que você paga e o tamanho da embalagem (ex.: 395 g).',
               '2. Na aba "Precificar produto", escolha os ingredientes na lista e digite quanto usa na receita (na mesma unidade do cadastro).',
               '3. Preencha horas de trabalho, valor da sua hora, custos fixos, margem e taxa da maquininha.',
               '4. Pronto: a planilha mostra o custo total, o preço de venda do lote, o preço por unidade e o lucro por unidade.',
               'Dica: duplique a aba "Precificar produto" (botão direito > Duplicar) para cada produto que você vende.',
               'Serve para confeitaria, salgados, artesanato, velas, sabonetes e qualquer produto feito à mão.'])
wb.save(f'{OUT}/2-Precificacao-Confeitaria-e-Artesanato.xlsx')

# ---------------- 3. Vendas e estoque ----------------
wb = Workbook(); PR = wb.active; PR.title = 'Produtos'
titulo(PR, 'Cadastro de produtos', 'Código, custo, preço e estoque inicial de cada produto.', 7)
cab(PR, 4, ['Código', 'Produto', 'Custo (R$)', 'Preço de venda (R$)', 'Estoque inicial', 'Vendidos', 'Estoque atual', 'Situação'], [10, 30, 13, 18, 14, 11, 14, 14])
NP, NV = 200, 2000
grade(PR, 5, 4 + NP, 1, 5, {3: BRL, 4: BRL}, FIN); grade(PR, 5, 4 + NP, 6, 8)
for r in range(5, 5 + NP):
    PR.cell(row=r, column=6, value=f'=IF(A{r}="","",SUMIF(Vendas!$B$5:$B${4 + NV},A{r},Vendas!$D$5:$D${4 + NV}))')
    PR.cell(row=r, column=7, value=f'=IF(A{r}="","",E{r}-F{r})')
    PR.cell(row=r, column=8, value=f'=IF(A{r}="","",IF(G{r}<=0,"SEM ESTOQUE",IF(G{r}<=3,"Repor","OK")))')
PR.conditional_formatting.add(f'H5:H{4 + NP}', CellIsRule(operator='equal', formula=['"SEM ESTOQUE"'], font=red))
PR.conditional_formatting.add(f'H5:H{4 + NP}', CellIsRule(operator='equal', formula=['"Repor"'], font=Font(color='B45309', bold=True)))
for i, row in enumerate([('P01', 'Camiseta básica', 18, 45, 20), ('P02', 'Caneca personalizada', 12, 35, 15)], 5):
    for c, v in enumerate(row, 1): PR.cell(row=i, column=c, value=v)
PR.freeze_panes = 'A5'
V = wb.create_sheet('Vendas'); titulo(V, 'Registro de vendas', 'Uma linha por venda. Escolha o código do produto.', 8)
cab(V, 4, ['Data', 'Código', 'Produto', 'Qtd.', 'Preço un.', 'Total', 'Lucro', 'Cliente / obs.'], [13, 10, 28, 8, 13, 14, 13, 28])
grade(V, 5, 4 + NV, 1, 2, {1: 'DD/MM/YYYY'}, FIN); grade(V, 5, 4 + NV, 4, 4, None, FIN); grade(V, 5, 4 + NV, 8, 8, None, FIN)
grade(V, 5, 4 + NV, 3, 3); grade(V, 5, 4 + NV, 5, 7, {5: BRL, 6: BRL, 7: BRL})
for r in range(5, 5 + NV):
    V.cell(row=r, column=3, value=f'=IFERROR(INDEX(Produtos!$B$5:$B${4 + NP},MATCH(B{r},Produtos!$A$5:$A${4 + NP},0)),"")')
    V.cell(row=r, column=5, value=f'=IFERROR(INDEX(Produtos!$D$5:$D${4 + NP},MATCH(B{r},Produtos!$A$5:$A${4 + NP},0)),"")')
    V.cell(row=r, column=6, value=f'=IF(OR(B{r}="",D{r}=""),"",D{r}*E{r})')
    V.cell(row=r, column=7, value=f'=IF(F{r}="","",F{r}-D{r}*IFERROR(INDEX(Produtos!$C$5:$C${4 + NP},MATCH(B{r},Produtos!$A$5:$A${4 + NP},0)),0))')
dvp = DataValidation(type='list', formula1=f'=Produtos!$A$5:$A${4 + NP}', allow_blank=True); V.add_data_validation(dvp); dvp.add(f'B5:B{4 + NV}')
V.cell(row=5, column=1, value=datetime(2027, 1, 10)); V.cell(row=5, column=2, value='P01'); V.cell(row=5, column=4, value=2); V.cell(row=5, column=8, value='Ana')
V.freeze_panes = 'A5'
RS = wb.create_sheet('Resumo', 1); titulo(RS, 'Resumo das vendas', 'Escolha o ano na célula B3.', 4)
RS['A3'] = 'Ano:'; RS['A3'].font = B; RS['B3'] = 2027; RS['B3'].fill = FIN; RS['B3'].border = BOX
cab(RS, 5, ['Mês', 'Faturamento', 'Lucro', 'Itens vendidos'], [16, 16, 16, 16])
dr = f'Vendas!$A$5:$A${4 + NV}'
for m in range(12):
    r = 6 + m; RS.cell(row=r, column=1, value=MESES[m]).font = B
    ini = f"DATE($B$3,{m + 1},1)"; fim = f"EOMONTH(DATE($B$3,{m + 1},1),0)"
    for c, col in ((2, 'F'), (3, 'G'), (4, 'D')):
        RS.cell(row=r, column=c, value=f'=SUMIFS(Vendas!${col}$5:${col}${4 + NV},{dr},">="&{ini},{dr},"<="&{fim})')
grade(RS, 6, 17, 1, 4, {2: BRL, 3: BRL})
RS.cell(row=18, column=1, value='TOTAL').font = B
for c, col in ((2, 'B'), (3, 'C'), (4, 'D')): RS.cell(row=18, column=c, value=f'=SUM({col}6:{col}17)').font = B
grade(RS, 18, 18, 1, 4, {2: BRL, 3: BRL}, FCL)
ch = BarChart(); ch.title = 'Faturamento e lucro por mês'; ch.height = 8; ch.width = 18
ch.add_data(Reference(RS, min_col=2, min_row=5, max_col=3, max_row=17), titles_from_data=True)
ch.set_categories(Reference(RS, min_col=1, min_row=6, max_row=17)); RS.add_chart(ch, 'F5')
como_usar(wb, ['1. Na aba "Produtos", cadastre cada produto com código (ex.: P01), custo, preço de venda e estoque inicial.',
               '2. Na aba "Vendas", registre cada venda: data, código (lista), quantidade e cliente. Nome, preço, total e lucro aparecem sozinhos.',
               '3. Na aba "Produtos", a coluna "Estoque atual" desconta as vendas e avisa quando é hora de repor.',
               '4. A aba "Resumo" mostra faturamento, lucro e itens vendidos de cada mês, com gráfico.',
               'Apague as linhas de exemplo antes de usar. Funciona no Excel e no Google Planilhas.'])
wb.save(f'{OUT}/3-Controle-de-Vendas-e-Estoque.xlsx')
print('ok', os.listdir(OUT))
