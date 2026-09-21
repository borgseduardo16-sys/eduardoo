/**
 * Verificacao pura do classificador de presenca digital — sem banco, sem
 * rede. Prova que a regra central do produto (site/cardapio/catalogo/
 * agendamento descarta, rede social nao) se comporta exatamente como os
 * exemplos do pedido original.
 *
 *   pnpm tsx scripts/verify-prospecting.ts
 */
import { classifyWebsite } from '../src/lib/prospecting/website-classifier';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}${detail ? ` \x1b[2m${detail}\x1b[0m` : ''}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? `\n      ${detail}` : ''}`);
  }
}

console.log('\n\x1b[1m1. Sem nenhum link — lead valido (Exemplo 1 e 5 do pedido)\x1b[0m');
{
  const r = classifyWebsite(null);
  check('nenhum website informado nao descarta', !r.isFunctionalSite && r.classification === 'none');
  check('sem ambiguidade', !r.isAmbiguous);
}

console.log('\n\x1b[1m2. Redes sociais e contato NUNCA descartam\x1b[0m');
{
  const casos: Array<[string, string]> = [
    ['https://wa.me/5527999998888', 'whatsapp'],
    ['https://api.whatsapp.com/send?phone=5527999998888', 'whatsapp'],
    ['https://instagram.com/clinicabelezax', 'instagram'],
    ['https://www.instagram.com/clinicabelezax', 'instagram'],
    ['https://facebook.com/clinicabelezax', 'facebook'],
    ['https://m.facebook.com/clinicabelezax', 'facebook'],
    ['https://www.tiktok.com/@clinicax', 'social_other'],
    ['https://youtube.com/@clinicax', 'social_other'],
    ['https://t.me/clinicax', 'social_other'],
  ];
  for (const [url, expected] of casos) {
    const r = classifyWebsite(url);
    check(`${url} → ${expected}, nao descarta`, r.classification === expected && !r.isFunctionalSite, r.detailPt);
  }

  const insta = classifyWebsite('https://instagram.com/clinicabelezax');
  check('extrai o link do Instagram para o campo proprio', insta.extracted?.instagram === 'https://instagram.com/clinicabelezax');
  const wpp = classifyWebsite('https://wa.me/5527999998888');
  check('extrai o link do WhatsApp para o campo proprio', wpp.extracted?.whatsapp === 'https://wa.me/5527999998888');
}

console.log('\n\x1b[1m3. Cardapio digital descarta (Exemplo 2 do pedido)\x1b[0m');
{
  const casos = [
    'https://goomer.app/restaurantex',
    'https://www.cardapioweb.com/restaurantex',
    'https://anota.ai/restaurantex',
    'https://www.ifood.com.br/delivery/cidade/restaurante-x',
  ];
  for (const url of casos) {
    const r = classifyWebsite(url);
    check(`${url} → cardapio, descarta`, r.isFunctionalSite && r.discardBucket === 'menu', r.detailPt);
  }
}

console.log('\n\x1b[1m4. Agendamento proprio descarta (Exemplo 3 do pedido)\x1b[0m');
{
  const casos = ['https://www.trinks.com/salaox', 'https://booksy.com/pt-br/salaox', 'https://calendly.com/salaox'];
  for (const url of casos) {
    const r = classifyWebsite(url);
    check(`${url} → agendamento, descarta`, r.isFunctionalSite && r.discardBucket === 'scheduling', r.detailPt);
  }
}

console.log('\n\x1b[1m5. Catalogo/loja virtual descarta (Exemplo 4 do pedido)\x1b[0m');
{
  const casos = ['https://lojax.lojaintegrada.com.br', 'https://lojax.myshopify.com', 'https://lojax.nuvemshop.com.br'];
  for (const url of casos) {
    const r = classifyWebsite(url);
    check(`${url} → catalogo/loja, descarta`, r.isFunctionalSite && r.discardBucket === 'catalog', r.detailPt);
  }
}

console.log('\n\x1b[1m6. Site proprio (dominio ou construtor) descarta\x1b[0m');
{
  const casos: Array<[string, string]> = [
    ['https://www.clinicabelezax.com.br', 'own_site'],
    ['https://clinicax.business.site', 'builder_page'],
    ['https://clinicax.wixsite.com/site', 'builder_page'],
    ['https://sites.google.com/view/clinicax', 'builder_page'],
  ];
  for (const [url, expected] of casos) {
    const r = classifyWebsite(url);
    check(`${url} → ${expected}, descarta como site`, r.classification === expected && r.discardBucket === 'site', r.detailPt);
  }
}

console.log('\n\x1b[1m7. Casos de duvida viram "verificacao recomendada", nao descartam\x1b[0m');
{
  const linktree = classifyWebsite('https://linktr.ee/clinicax');
  check('link na bio nao descarta, mas fica ambiguo', !linktree.isFunctionalSite && linktree.isAmbiguous);

  const malformado = classifyWebsite('não é uma url::://');
  check('URL ilegivel nao descarta, mas fica ambigua', !malformado.isFunctionalSite && malformado.isAmbiguous);
}

console.log(
  `\n\x1b[1mResultado:\x1b[0m \x1b[32m${passed} passaram\x1b[0m` +
    (failed ? `, \x1b[31m${failed} falharam\x1b[0m` : '') + '\n',
);
if (failed > 0) process.exit(1);
