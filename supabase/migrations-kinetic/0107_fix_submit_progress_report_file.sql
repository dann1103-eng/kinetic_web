-- Corrige submit_progress_report para que NO valide data_json cuando
-- upload_kind = 'file'. Los informes basados en archivo no tienen data_json
-- y la validación del template siempre fallaba con "required_block_empty".

create or replace function public.submit_progress_report(
  p_report_id uuid
) returns public.progress_reports language plpgsql security definer as $$
declare
  v_report public.progress_reports;
begin
  select * into v_report
    from public.progress_reports
   where id = p_report_id
   for update;

  if not found then
    raise exception 'report_not_found';
  end if;

  -- Autoriza al autor o, durante impersonación, al admin real.
  if v_report.authored_by_user_id is distinct from auth.uid()
     and not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  if v_report.status not in ('draft','rejected') then
    raise exception 'invalid_state_for_submit';
  end if;

  -- Solo validar data_json cuando el informe es de tipo editor.
  -- Informes tipo 'file' no tienen data_json y no deben validarse.
  if coalesce(v_report.upload_kind, 'editor') = 'editor' then
    perform public.validate_progress_report_against_template(p_report_id);
  end if;

  update public.progress_reports
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
