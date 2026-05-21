-- ═══════════════════════════════════════════════════════════════════════════
-- Migración 0127 — Seed de planillas mensuales (mar/abr/may 2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- Complementa 0126:
--   • Diversifica salarios por usuario (variación intra-rol)
--   • Crea 3 payroll_runs (mar/abr pagadas, may sellada pendiente de pago)
--   • Inserta payroll_items con ISSS / AFP / ISR calculados
--   • Algunos empleados ya firmaron su recibo en mar/abr
--
-- Constantes fiscales SV (mig 0117):
--   ISSS empleado 3%, patrono 7.5%, tope $1000
--   AFP   empleado 7.25%, patrono 8.75%, sin tope
--   ISR   4 tramos: 0% / 10%+17.67 / 20%+60 / 30%+288.57
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_admin_id   uuid;
  v_dir_id     uuid;
  v_cnt_id     uuid;
  v_run_mar    uuid;
  v_run_apr    uuid;
  v_run_may    uuid;
  v_snapshot   jsonb;
BEGIN
  -- ── 1. Staff IDs ────────────────────────────────────────────────────────
  SELECT id INTO v_admin_id FROM public.users WHERE role='admin'     ORDER BY created_at LIMIT 1;
  SELECT id INTO v_dir_id   FROM public.users WHERE role='directora' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_cnt_id   FROM public.users WHERE role='contable'  ORDER BY created_at LIMIT 1;
  v_dir_id := COALESCE(v_dir_id, v_admin_id);
  v_cnt_id := COALESCE(v_cnt_id, v_admin_id);

  -- ── 2. Diversificar salarios por usuario ───────────────────────────────
  -- Terapistas: $10.00–$15.00/hr según antigüedad
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
    FROM public.users WHERE role='terapista'
  )
  UPDATE public.users u
  SET hourly_rate_usd = (10.00 + (LEAST(ranked.rn, 11) * 0.50))::numeric(10,2)
  FROM ranked WHERE u.id = ranked.id;

  -- Maestras: $650–$850/mes
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
    FROM public.users WHERE role='maestra'
  )
  UPDATE public.users u
  SET monthly_salary_usd = (650.00 + (LEAST(ranked.rn-1, 8) * 25))::numeric(10,2)
  FROM ranked WHERE u.id = ranked.id;

  -- Recepción: $500–$650/mes
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
    FROM public.users WHERE role='recepcion'
  )
  UPDATE public.users u
  SET monthly_salary_usd = (500.00 + (LEAST(ranked.rn-1, 6) * 25))::numeric(10,2)
  FROM ranked WHERE u.id = ranked.id;

  -- Coordinadoras: $850–$1000/mes
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
    FROM public.users WHERE role IN ('coordinadora_familias','coordinadora_terapias')
  )
  UPDATE public.users u
  SET monthly_salary_usd = (850.00 + (LEAST(ranked.rn-1, 6) * 25))::numeric(10,2)
  FROM ranked WHERE u.id = ranked.id;

  -- DUI / ISSS / AFP únicos por usuario (placeholder)
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
    FROM public.users WHERE contract_type <> 'sin_contrato'
  )
  UPDATE public.users u
  SET dui         = '0' || LPAD((10000000 + ranked.rn * 137)::text, 7, '0') || '-' || (ranked.rn % 10)::text,
      isss_number = 'ISSS-' || LPAD(ranked.rn::text, 5, '0'),
      afp_number  = 'NUP-'  || LPAD(ranked.rn::text, 6, '0')
  FROM ranked WHERE u.id = ranked.id AND u.dui IS NULL;

  -- ── 3. Snapshot del config fiscal ──────────────────────────────────────
  SELECT jsonb_build_object(
    'effective_from',      effective_from,
    'isss_employee_rate',  isss_employee_rate,
    'isss_employer_rate',  isss_employer_rate,
    'isss_cap_salary_usd', isss_cap_salary_usd,
    'afp_employee_rate',   afp_employee_rate,
    'afp_employer_rate',   afp_employer_rate,
    'afp_cap_salary_usd',  afp_cap_salary_usd,
    'isr_brackets_json',   isr_brackets_json
  )
  INTO v_snapshot
  FROM public.payroll_fiscal_config
  ORDER BY effective_from DESC LIMIT 1;

  -- ── 4. Crear los 3 payroll_runs ─────────────────────────────────────────
  -- Marzo: pagada
  INSERT INTO public.payroll_runs (
    period_year, period_month, status, fiscal_config_snapshot_json, notes,
    created_by_user_id, sealed_at, sealed_by_user_id, paid_at, paid_by_user_id
  ) VALUES (
    2026, 3, 'paid', v_snapshot, 'Planilla marzo 2026 — pagada por transferencia',
    v_cnt_id, '2026-03-27 14:00+00', v_dir_id, '2026-03-30 10:00+00', v_cnt_id
  ) RETURNING id INTO v_run_mar;

  -- Abril: pagada
  INSERT INTO public.payroll_runs (
    period_year, period_month, status, fiscal_config_snapshot_json, notes,
    created_by_user_id, sealed_at, sealed_by_user_id, paid_at, paid_by_user_id
  ) VALUES (
    2026, 4, 'paid', v_snapshot, 'Planilla abril 2026 — pagada por transferencia',
    v_cnt_id, '2026-04-28 14:00+00', v_dir_id, '2026-04-30 10:00+00', v_cnt_id
  ) RETURNING id INTO v_run_apr;

  -- Mayo: sellada, pendiente de pago
  INSERT INTO public.payroll_runs (
    period_year, period_month, status, fiscal_config_snapshot_json, notes,
    created_by_user_id, sealed_at, sealed_by_user_id
  ) VALUES (
    2026, 5, 'sealed', v_snapshot, 'Planilla mayo 2026 — sellada, pendiente de pago',
    v_cnt_id, '2026-05-20 14:00+00', v_dir_id
  ) RETURNING id INTO v_run_may;

  -- ── 5. Insertar payroll_items (3 pasadas) ──────────────────────────────
  DECLARE
    v_run uuid;
    v_period_start date;
    v_period_end date;
    v_signed_at timestamptz;
    v_i int;
  BEGIN
    FOR v_i IN 1..3 LOOP
      IF v_i = 1 THEN
        v_run := v_run_mar;
        v_period_start := '2026-03-01'::date;
        v_period_end   := '2026-04-01'::date;
        v_signed_at    := '2026-04-02 14:00+00'::timestamptz;
      ELSIF v_i = 2 THEN
        v_run := v_run_apr;
        v_period_start := '2026-04-01'::date;
        v_period_end   := '2026-05-01'::date;
        v_signed_at    := '2026-05-04 14:00+00'::timestamptz;
      ELSE
        v_run := v_run_may;
        v_period_start := '2026-05-01'::date;
        v_period_end   := '2026-06-01'::date;
        v_signed_at    := NULL;
      END IF;

      -- ── 5a. INSERT base: gross + ISSS + AFP + aportes patronales ──────
      WITH base AS (
        SELECT
          u.id AS user_id,
          jsonb_build_object(
            'full_name',     u.full_name,
            'dui',           u.dui,
            'isss_number',   u.isss_number,
            'afp_number',    u.afp_number,
            'afp_provider',  u.afp_provider,
            'role',          u.role,
            'contract_type', u.contract_type
          ) AS snap,
          u.contract_type,
          u.monthly_salary_usd,
          u.hourly_rate_usd,
          COALESCE(h.hours, 0)::numeric(8,2) AS hours_worked,
          (
            CASE
              WHEN u.contract_type = 'mensual_fijo' THEN u.monthly_salary_usd
              WHEN u.contract_type = 'por_hora'    THEN COALESCE(h.hours, 0) * COALESCE(u.hourly_rate_usd, 0)
              ELSE 0
            END
          )::numeric(10,2) AS gross
        FROM public.users u
        LEFT JOIN LATERAL (
          SELECT ROUND(SUM(EXTRACT(EPOCH FROM (a.ends_at - a.starts_at)) / 3600.0)::numeric, 2) AS hours
          FROM public.appointments a
          WHERE a.therapist_id = u.id
            AND a.status = 'completed'
            AND a.starts_at >= v_period_start
            AND a.starts_at <  v_period_end
        ) h ON true
        WHERE u.contract_type <> 'sin_contrato'
          AND (u.monthly_salary_usd > 0 OR u.hourly_rate_usd > 0)
      )
      INSERT INTO public.payroll_items (
        payroll_run_id, user_id, user_snapshot_json,
        base_salary_usd, extra_hours, extra_hours_rate_usd, extra_hours_amount_usd,
        bonus_usd, other_deductions_usd,
        gross_total_usd, isss_employee_usd, afp_employee_usd, isr_usd,
        total_deductions_usd, net_pay_usd,
        isss_employer_usd, afp_employer_usd, employer_cost_usd,
        hours_worked_from_appointments, signed_at
      )
      SELECT
        v_run, b.user_id, b.snap,
        CASE WHEN b.contract_type = 'mensual_fijo' THEN b.gross ELSE 0 END,
        CASE WHEN b.contract_type = 'por_hora'    THEN b.hours_worked ELSE 0 END,
        CASE WHEN b.contract_type = 'por_hora'    THEN b.hourly_rate_usd ELSE NULL END,
        CASE WHEN b.contract_type = 'por_hora'    THEN b.gross ELSE 0 END,
        0, 0,
        b.gross,
        (LEAST(b.gross, 1000) * 0.03)::numeric(10,2),
        (b.gross * 0.0725)::numeric(10,2),
        0,  -- ISR se calcula en UPDATE abajo
        0,  -- total_deductions ídem
        0,  -- net_pay ídem
        (LEAST(b.gross, 1000) * 0.075)::numeric(10,2),
        (b.gross * 0.0875)::numeric(10,2),
        0,  -- employer_cost ídem
        b.hours_worked,
        CASE
          WHEN v_signed_at IS NULL THEN NULL
          WHEN abs(hashtext(b.user_id::text)) % 10 < 7 THEN v_signed_at
          ELSE NULL
        END
      FROM base b;

      -- ── 5b. UPDATE: ISR por tramos + totales finales ──────────────────
      UPDATE public.payroll_items pi
      SET
        isr_usd = (
          CASE
            WHEN (pi.gross_total_usd - pi.isss_employee_usd - pi.afp_employee_usd) <= 472     THEN 0
            WHEN (pi.gross_total_usd - pi.isss_employee_usd - pi.afp_employee_usd) <= 895.24  THEN
                 ((pi.gross_total_usd - pi.isss_employee_usd - pi.afp_employee_usd) - 472)    * 0.10 + 17.67
            WHEN (pi.gross_total_usd - pi.isss_employee_usd - pi.afp_employee_usd) <= 2038.10 THEN
                 ((pi.gross_total_usd - pi.isss_employee_usd - pi.afp_employee_usd) - 895.24) * 0.20 + 60.00
            ELSE ((pi.gross_total_usd - pi.isss_employee_usd - pi.afp_employee_usd) - 2038.10)* 0.30 + 288.57
          END
        )::numeric(10,2)
      WHERE pi.payroll_run_id = v_run;

      UPDATE public.payroll_items pi
      SET
        total_deductions_usd = (pi.isss_employee_usd + pi.afp_employee_usd + pi.isr_usd),
        net_pay_usd          = (pi.gross_total_usd - pi.isss_employee_usd - pi.afp_employee_usd - pi.isr_usd),
        employer_cost_usd    = (pi.gross_total_usd + pi.isss_employer_usd + pi.afp_employer_usd)
      WHERE pi.payroll_run_id = v_run;

    END LOOP;
  END;

END;
$$;
