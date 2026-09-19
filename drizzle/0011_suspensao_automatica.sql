-- ============================================================================
-- MyPlace — suspensao automatica por reincidencia (Fase 11)
--
-- `refresh_upheld_report_count` ja mantinha o contador de denuncias
-- procedentes. Agora, ao recalcular o contador, a mesma trigger tambem aplica
-- o limite de `safety.auto_suspend_upheld_threshold` (padrao 5): ao
-- atingi-lo, a conta vira 'suspended' com um motivo padrao.
--
-- So ESCALA: nunca reativa sozinha. Se um moderador corrigir uma denuncia
-- (upheld -> false) e o contador cair de novo abaixo do limite, a conta
-- continua suspensa ate um admin decidir reativar pelo painel — reativacao e
-- decisao humana, nao efeito colateral de um UPDATE.
--
-- So suspende quem esta 'active': nao mexe em quem ja esta banido/suspenso
-- por outro motivo nem ressuscita conta apagada.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.refresh_upheld_report_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  alvo uuid;
  novo_total integer;
  limite integer;
BEGIN
  -- Para denuncia de anuncio ou mensagem, o responsavel e o autor do conteudo.
  alvo := COALESCE(
    NEW.target_user_id,
    (SELECT owner_id FROM public.spaces WHERE id = NEW.space_id),
    (SELECT sender_id FROM public.messages WHERE id = NEW.message_id)
  );

  IF alvo IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO novo_total
  FROM public.reports r
  WHERE r.upheld = true
    AND COALESCE(
          r.target_user_id,
          (SELECT owner_id FROM public.spaces WHERE id = r.space_id),
          (SELECT sender_id FROM public.messages WHERE id = r.message_id)
        ) = alvo;

  UPDATE public.profiles SET upheld_report_count = novo_total WHERE id = alvo;

  SELECT (value #>> '{}')::int INTO limite
  FROM public.platform_settings WHERE key = 'safety.auto_suspend_upheld_threshold';
  limite := COALESCE(limite, 5);

  IF novo_total >= limite THEN
    UPDATE public.profiles
    SET status = 'suspended',
        status_reason = 'Suspensão automática: ' || novo_total || ' denúncias procedentes.'
    WHERE id = alvo AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$;
