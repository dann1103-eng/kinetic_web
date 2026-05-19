-- Migración 0120 — submit_session_report: actividades opcional para
-- niños en programa matutino.
--
-- Antes: el RPC siempre exigía `actividades` no vacío.
-- Ahora: si `children.enrolled_program IS NOT NULL` (el niño está inscrito
-- en programa matutino tipo blue_kids / learning_kids / aula_educativa),
-- el reporte puede enviarse sin actividades. Para terapias 1-a-1 sigue
-- siendo obligatorio.

CREATE OR REPLACE FUNCTION public.submit_session_report(
  p_report_id uuid
) RETURNS public.session_reports LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_report public.session_reports;
  v_enrolled_program text;
BEGIN
  SELECT * INTO v_report
    FROM public.session_reports
   WHERE id = p_report_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'report_not_found';
  END IF;

  -- Autoriza al terapista autor o, durante impersonación, al admin real.
  IF v_report.therapist_id IS DISTINCT FROM auth.uid()
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_report.status NOT IN ('draft', 'rejected') THEN
    RAISE EXCEPTION 'invalid_state_for_submit';
  END IF;

  -- Buscar si el niño está en programa matutino (entonces actividades opcional).
  SELECT enrolled_program INTO v_enrolled_program
    FROM public.children
   WHERE id = v_report.child_id;

  -- Solo exigir actividades cuando NO hay programa matutino y NO es upload_kind='file'.
  IF (v_enrolled_program IS NULL)
     AND (COALESCE(v_report.upload_kind, 'editor') = 'editor')
     AND length(trim(COALESCE(v_report.actividades, ''))) = 0 THEN
    RAISE EXCEPTION 'actividades_required';
  END IF;

  UPDATE public.session_reports
     SET status = 'submitted',
         submitted_at = now(),
         rejected_by_user_id = null,
         rejected_at = null,
         rejection_reason = null
   WHERE id = p_report_id
   RETURNING * INTO v_report;

  RETURN v_report;
END;
$$;
