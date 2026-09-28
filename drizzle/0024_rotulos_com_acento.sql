-- ============================================================================
-- MyPlace — acentuação dos rótulos das características (Fase 21)
--
-- O catálogo semeado na 0001 foi escrito sem acento ("Iluminacao",
-- "Portao", "Agua"...), e esses rótulos aparecem para todo mundo: cartões
-- da busca, página do anúncio, filtros e etapa de características do
-- anúncio. Achado na revisão visual da Fase 21.
--
-- Só troca o texto que ainda é o original: se alguém já corrigiu ou
-- renomeou um rótulo no painel, fica como está. A chave (`key`) não muda —
-- é ela que os anúncios guardam, então nada precisa ser migrado neles.
-- ============================================================================

UPDATE public.features AS f
SET label = v.novo
FROM (VALUES
  ('acesso_caminhao', 'Acesso para caminhao',     'Acesso para caminhão'),
  ('agua',            'Agua',                     'Água'),
  ('camera',          'Camera de seguranca',      'Câmera de segurança'),
  ('carga_descarga',  'Area de carga e descarga', 'Área de carga e descarga'),
  ('iluminacao',      'Iluminacao',               'Iluminação'),
  ('portao',          'Portao',                   'Portão'),
  ('portaria',        'Portaria / vigilancia',    'Portaria / vigilância'),
  ('terreo',          'Terreo',                   'Térreo')
) AS v(key, antigo, novo)
WHERE f.key = v.key AND f.label = v.antigo;
