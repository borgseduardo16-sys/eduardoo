-- Fase 23 — datas invertidas recusadas pela regra certa.
--
-- Achado da verificação do schema: as triggers de calendário montam o
-- intervalo de datas (daterange) antes de qualquer outra conferência. Com a
-- data final antes da inicial, o próprio daterange estourava ("range lower
-- bound must be less than or equal to range upper bound") e a recusa saía
-- com essa mensagem crua, sem o nome da regra. As triggers rodam antes dos
-- CHECKs; agora elas deixam passar o que está invertido e quem recusa é o
-- CHECK de sempre (`space_availability_blocks_dates_ordered`,
-- `bookings_dates_ordered`), com o nome dele no erro. Nada que era aceito
-- passa a ser aceito: só muda QUEM recusa.

CREATE OR REPLACE FUNCTION public.guard_availability_block()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  periodo daterange;
BEGIN
  -- Desfazer um bloqueio nunca conflita com nada.
  IF NEW.cancelled_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- Datas invertidas: o CHECK space_availability_blocks_dates_ordered recusa.
  IF NEW.ends_on < NEW.starts_on THEN
    RETURN NEW;
  END IF;
  periodo := daterange(NEW.starts_on, NEW.ends_on, '[]');

  PERFORM 1 FROM public.spaces WHERE id = NEW.space_id FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.space_availability_blocks o
     WHERE o.space_id = NEW.space_id
       AND o.id <> NEW.id
       AND o.cancelled_at IS NULL
       AND daterange(o.starts_on, o.ends_on, '[]') && periodo
  ) THEN
    RAISE EXCEPTION 'Ja existe um bloqueio que cobre essas datas'
      USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'space_availability_blocks_no_overlap';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.space_id = NEW.space_id
       AND public.booking_occupies(b.status)
       AND daterange(b.start_date, b.end_date, '[)') && periodo
  ) THEN
    RAISE EXCEPTION 'Ha uma reserva vigente nessas datas'
      USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'space_availability_blocks_no_booking';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.guard_booking_against_blocks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  bloqueio record;
BEGIN
  IF NOT public.booking_occupies(NEW.status) THEN
    RETURN NEW;
  END IF;
  -- Datas invertidas: o CHECK bookings_dates_ordered recusa.
  IF NEW.end_date IS NOT NULL AND NEW.end_date <= NEW.start_date THEN
    RETURN NEW;
  END IF;
  -- Já ocupava exatamente o mesmo período (ex.: active -> past_due): nada novo.
  IF TG_OP = 'UPDATE'
     AND public.booking_occupies(OLD.status)
     AND NEW.start_date = OLD.start_date
     AND NEW.end_date IS NOT DISTINCT FROM OLD.end_date THEN
    RETURN NEW;
  END IF;

  PERFORM 1 FROM public.spaces WHERE id = NEW.space_id FOR UPDATE;

  SELECT k.starts_on, k.ends_on INTO bloqueio
    FROM public.space_availability_blocks k
   WHERE k.space_id = NEW.space_id
     AND k.cancelled_at IS NULL
     AND daterange(k.starts_on, k.ends_on, '[]') && daterange(NEW.start_date, NEW.end_date, '[)')
   ORDER BY k.starts_on
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'O proprietario bloqueou o espaco de % a %',
      to_char(bloqueio.starts_on, 'DD/MM/YYYY'), to_char(bloqueio.ends_on, 'DD/MM/YYYY')
      USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'bookings_period_not_blocked';
  END IF;

  RETURN NEW;
END;
$$;
