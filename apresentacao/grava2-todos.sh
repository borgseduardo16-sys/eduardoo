g(){ node grava2.mjs "$1" "q2/$2" "$3" || echo "FALHOU $2"; }
g heartmade hm-jardim '[["y",2275],["grava"],["desliza",5,5403]]' &
g homestaging hs-intro '[["carrega"],["espera",3.2],["desliza",4,2275]]' &
g kelle kelle-hero '[["carrega"],["espera",2],["desliza",3,1849]]' &
wait
g kelle kelle-cap '[["y",4013],["grava"],["desliza",4.5,9985]]' &
g andrade andrade-proj '[["y",4550],["grava"],["desliza",5,9954]]' &
g heartmade hm-rolo '[["y",6825],["grava"],["desliza",2.2,9200]]' &
wait
g truz truz-hero '[["carrega"],["espera",5]]' &
g heartmade hm-proposta '[["y",18560],["grava"],["espera",0.6],["clica","sel:[role=radio]:has-text(\"Casamento\")"],["espera",0.8],["clica","sel:button:has-text(\"Continuar\")"],["espera",0.9],["clica","sel:[role=radio]:has-text(\"Funchal\")"],["espera",0.4],["clica","sel:label:has-text(\"Ainda não temos data\")"],["espera",0.7],["clica","sel:button:has-text(\"Continuar\")"],["espera",0.9],["clica","sel:[role=radio]:has-text(\"80 a 150\")"],["espera",0.8]]' &
g meridian meridian '[["y",5119],["grava"],["desliza",5,9500]]' &
wait
echo FIM
