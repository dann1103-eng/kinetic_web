-- =============================================================================
-- 0096 — Permitir impersonación al insertar entradas en child_journal_entries
-- Fix: la policy "cje insert staff" exigía author_user_id = auth.uid(), lo que
-- bloquea cuando el admin impersona a una terapista. Acepta también is_admin().
-- =============================================================================

drop policy if exists "cje insert staff" on public.child_journal_entries;
create policy "cje insert staff"
  on public.child_journal_entries for insert
  with check (
    public.is_agency_user()
    and (author_user_id = auth.uid() or public.is_admin())
  );
