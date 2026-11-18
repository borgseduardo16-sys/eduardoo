set -e
g(){ node grava.mjs "$1" "clips/$2" "$3" && bash mp4.sh "clips/$2"; }
g heartmade hm-hero '[["carrega"],["espera",4.5]]'
g heartmade hm-jardim '[["y",2275],["espera",1],["grava"],["desliza",6,5403]]'
g heartmade hm-rolo '[["y",6825],["espera",1],["grava"],["desliza",6,11375]]'
g homestaging hs-intro '[["carrega"],["espera",4],["desliza",5,2275],["espera",0.6]]'
g homestaging hs-projetos '[["y",4456],["espera",1],["grava"],["desliza",6,10144]]'
g meridian meridian '[["espera",1.5],["grava"],["espera",0.6],["desliza",12,11660]]'
g kelle kelle-hero '[["carrega"],["espera",3],["desliza",4,1849]]'
g kelle kelle-cap '[["y",4013],["espera",1],["grava"],["desliza",6,9985]]'
g andrade andrade-hero '[["carrega"],["espera",3]]'
g andrade andrade-proj '[["y",4550],["espera",1],["grava"],["desliza",6,9954]]'
g jessica jessica-hero '[["carrega"],["espera",5]]'
g truz truz-hero '[["carrega"],["espera",5.5]]'
g heartmade hm-proposta '[["y",18560],["espera",1.2],["grava"],["espera",0.8],["clica","sel:[role=radio]:has-text(\"Casamento\")"],["espera",0.9],["clica","sel:button:has-text(\"Continuar\")"],["espera",1.1],["clica","sel:[role=radio]:has-text(\"Funchal\")"],["espera",0.5],["clica","sel:label:has-text(\"Ainda não temos data\")"],["espera",0.8],["clica","sel:button:has-text(\"Continuar\")"],["espera",1.1],["clica","sel:[role=radio]:has-text(\"80 a 150\")"],["espera",0.5],["clica","sel:button:has-text(\"Jardim botânico\")"],["espera",1.2]]'
echo FIM
