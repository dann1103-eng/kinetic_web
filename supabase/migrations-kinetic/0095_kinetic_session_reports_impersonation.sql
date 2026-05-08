-- =============================================================================
-- 0095 — Permitir impersonación en submit_session_report
-- Fix: el RPC original chequea auth.uid() == therapist_id, lo que falla cuando
-- un admin está impersonando a la terapista. Cambio a un check que también
-- acepta is_admin() — el admin real puede actuar en nombre de la terapista
-- impersonada (mismo patrón que el resto de las acciones bajo impersonación).
-- =============================================================================

create or replace function public.submit_session_report(
  p_report_id uuid
) returns public.session_reports language plpgsql security definer as $$
declare
  v_report public.session_reports;
begin
  select * into v_report
    from public.session_reports
   where id = p_report_id
   for update;

  if not found then
    raise exception 'report_not_found';
  end if;

  -- Autoriza al terapista autor o, durante impersonación, al admin real.
  if v_report.therapist_id is distinct from auth.uid()
     and not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  if v_report.status not in ('draft','rejected') then
    raise exception 'invalid_state_for_submit';
  end if;

  if length(trim(v_report.actividades)) = 0 then
    raise exception 'actividades_required';
  end if;

  update public.session_reports
     set status = 'submitted',
         submitted_at = now(),
         rejected_by_user_id = null,
         rejected_at = null,
         rejection_reason = null
   where id = p_report_id
   returning * into v_report;

  return v_report;
end;
$$;
