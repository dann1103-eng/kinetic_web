"""
Genera un SQL idempotente para importar los niños desde el Excel de Kinetic 2026.

  • Excluye la sección Karate (population separada, decisión del usuario).
  • Crea families + children + treatment_plans (con therapies_json parseado).
  • Los terapistas se dejan en null (primary_therapist_id, y therapist_id de cada
    terapia) — el equipo asigna manualmente porque el Excel solo tiene el dato
    para las secciones legacy (~13 niños) y los nombres no matchean los users
    reales del CRM.
  • Los niños retirados se importan en current_phase_code='5_2_retirado'.

Uso:
    python scripts/import_kinetic_children.py <ruta_xlsx> > supabase/scripts/full-setup/09_import_children.sql
"""

from __future__ import annotations
import sys
import re
import uuid
import datetime as dt
from pathlib import Path

try:
    import pandas as pd
except ImportError:
    print("Falta pandas. Instalalo con: pip install pandas openpyxl", file=sys.stderr)
    sys.exit(1)


# ─── Mapeos ──────────────────────────────────────────────────────────────────

# Programas matutinos: enum enrolled_program
PROGRAM_MAP = {
    'BLUE KIDS 1': 'blue_kids',
    'BLUE KIDS 2': 'blue_kids',
    'BLUE KIDS 3': 'blue_kids',
    'BLUE KIDS 4': 'blue_kids',
    'LEARNING KIDS': 'learning_kids',
    'AULA EDUCATIVA': 'aula_educativa',
}

# Mapeo de strings sueltos de terapia (col "PROGRAMA") al service_type del CRM.
# Las terapias suelen venir concatenadas: "THL + Sensorial", "OCUPA-CONDUCTUAL", etc.
THERAPY_TOKENS = {
    # Lenguaje
    'THL':         'lenguaje',
    'EST H Y L':   'lenguaje',
    'EST. H Y L':  'lenguaje',
    'EST. DE H Y L': 'lenguaje',
    'LENGUAJE':    'lenguaje',
    # Sensorial
    'SENSORIAL':   'sensorial',
    'SENSO':       'sensorial',
    # Conductual
    'CONDUCTUAL':  'conductual',
    'COND':        'conductual',
    # Ocupacional
    'OCUPACIONAL': 'ocupacional',
    'OCUPA':       'ocupacional',
    'TO':          'ocupacional',
    # Funciones ejecutivas
    'FUN. EJE':    'funciones_ejecutivas',
    'FUN EJE':     'funciones_ejecutivas',
    'FUNCIONES':   'funciones_ejecutivas',
    # Motricidad
    'MOTRICIDAD GRUESA': 'motricidad_gruesa',
    'MOT GRUESA':  'motricidad_gruesa',
    'MOTRICIDAD FINA':   'motricidad_fina',
    'MOT FINA':    'motricidad_fina',
    # Lectoescritura
    'LECTOESCRITURA': 'lectoescritura',
    'LE':          'lectoescritura',
    # Psicológica
    'PSICOLOGICA': 'psicologica',
    'PSICOLÓGICA': 'psicologica',
    'PSICO':       'psicologica',
    # Físca
    'FISICA':      'fisica',
    'FÍSICA':      'fisica',
    # Alimentación y deglución
    'ALIM':        'alim_deglu',
    'DEGLU':       'alim_deglu',
    # Destreza manual / pre-escritura
    'DESTREZA':    'destreza_manual_pre_escritura',
    'PRE-ESCRITURA': 'destreza_manual_pre_escritura',
}

DEFAULT_SESSIONS_PER_MONTH = 8
DEFAULT_UNIT_COST_USD = 45


# ─── Helpers ─────────────────────────────────────────────────────────────────

def s(v) -> str:
    """Limpia un string del Excel para SQL: quita espacios extra, escapa comillas."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ''
    if isinstance(v, dt.datetime):
        return v.strftime('%Y-%m-%d')
    if isinstance(v, dt.date):
        return v.strftime('%Y-%m-%d')
    return str(v).strip()


def sql_str(v) -> str:
    """Convierte a literal SQL — devuelve NULL si vacío, o 'string' escapado."""
    cleaned = s(v)
    if not cleaned:
        return 'NULL'
    cleaned = cleaned.replace("'", "''")
    return f"'{cleaned}'"


SPANISH_MONTHS = {
    'ene': 1, 'enero': 1, 'jan': 1,
    'feb': 2, 'febr': 2, 'febrero': 2,
    'mar': 3, 'marz': 3, 'marzo': 3,
    'abr': 4, 'abri': 4, 'abril': 4, 'apr': 4,
    'may': 5, 'mayo': 5,
    'jun': 6, 'juni': 6, 'junio': 6,
    'jul': 7, 'juli': 7, 'julio': 7,
    'ago': 8, 'agos': 8, 'agosto': 8, 'aug': 8,
    'sep': 9, 'sept': 9, 'septiembre': 9, 'set': 9,
    'oct': 10, 'octu': 10, 'octubre': 10,
    'nov': 11, 'novi': 11, 'noviembre': 11,
    'dic': 12, 'dici': 12, 'diciembre': 12, 'dec': 12,
}


def parse_loose_date(txt: str) -> dt.date | None:
    """
    Intenta parsear strings de fecha en formatos sueltos del Excel:
      '29-01/19', '18/01-25', '01/sep/2018', '12-sep-2018', '13/sep/14',
      '17/abri/2017', '25/marz/2020', 'BK 22/02/2024, ...'
    Devuelve None si no encuentra una fecha válida.
    """
    if not txt:
        return None
    # Si el texto tiene una fecha embebida (BK 22/02/2024 ...), buscarla.
    m = re.search(r'(\d{1,2})[\-/](\d{1,2})[\-/](\d{2,4})', txt)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100: y += 2000
        try:
            return dt.date(y, mo, d)
        except ValueError:
            pass
    # Buscar DD-MES-YYYY o DD/MES/YYYY (mes en texto español)
    m = re.search(r'(\d{1,2})[\-/]([A-Za-zñ]+)[\-/](\d{2,4})', txt)
    if m:
        d = int(m.group(1))
        mo_txt = m.group(2).lower().rstrip('.')
        y = int(m.group(3))
        if y < 100: y += 2000
        mo = SPANISH_MONTHS.get(mo_txt)
        if not mo:
            # Probar prefijos
            for k, v in SPANISH_MONTHS.items():
                if mo_txt.startswith(k):
                    mo = v
                    break
        if mo:
            try:
                return dt.date(y, mo, d)
            except ValueError:
                pass
    return None


def sql_date(v) -> str:
    """Convierte a fecha SQL — devuelve NULL si vacío o no parseable."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return 'NULL'
    if isinstance(v, (dt.datetime, dt.date)):
        return f"'{v.strftime('%Y-%m-%d')}'"
    txt = str(v).strip()
    if not txt:
        return 'NULL'
    parsed = parse_loose_date(txt)
    if parsed:
        return f"'{parsed.strftime('%Y-%m-%d')}'"
    # No se pudo parsear — NULL en lugar de un literal inválido
    return 'NULL'


def sql_bool(v) -> str:
    """X / x / SI = true, NO = false, sino false (default)."""
    txt = s(v).strip().upper()
    if txt in ('X', 'SI', 'SÍ', 'TRUE', '1'):
        return 'true'
    return 'false'


def parse_therapies(program_str: str) -> list[str]:
    """
    Parsea la columna PROGRAMA (e.g. 'THL + Sensorial', 'OCUPA-CONDUCTUAL') y
    devuelve la lista de service_types únicos encontrados.
    """
    if not program_str:
        return []
    upper = program_str.upper()
    # Si es un grupo matutino, no hay terapias individuales (las maestras llevan)
    if any(prog in upper for prog in ('BLUE KIDS', 'LEARNING KIDS', 'AULA EDUCATIVA')):
        return []
    # Tokenizar por separadores comunes
    tokens = re.split(r'[\+\-/,]| Y |\s{2,}', upper)
    found = []
    for tok in tokens:
        tok = tok.strip().rstrip('.').rstrip()
        if not tok:
            continue
        # Buscar match en THERAPY_TOKENS
        for key, service in THERAPY_TOKENS.items():
            if key in tok and service not in found:
                found.append(service)
                break
    return found


def is_section_header(value) -> bool:
    """True si la fila parece ser un header de sección (no un niño)."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return False
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return False
    if isinstance(value, str):
        s = value.upper()
        return any(k in s for k in (
            'NIÑOS', 'BLUE KIDS GRUPO', 'GRUPO LEARNING', 'GRUPO AULA',
            'TERAPIAS MATUTINAS', 'TERAPIAS VESPERTINAS', 'TERAPIAS SABADOS',
            'TERAPIAS SÁBADOS', 'TERAPIAS GRATUITAS', 'PROGRAMA ADAPTATIVO',
            'KARATE', 'RETIRADO', 'TOTAL', 'PATERNO', 'APELLIDOS',
            'CAMPO VERDE', 'ABC', 'KÍNDER',
        ))
    return False


# ─── Parsing principal ───────────────────────────────────────────────────────

def parse_excel(xlsx_path: str):
    df = pd.read_excel(xlsx_path, sheet_name='BASE DE DATOS 2021', header=None)

    rows = []  # Lista de dicts con datos del niño
    current_section = None
    current_program = None  # enum value para enrolled_program o None
    in_retirados = False
    in_karate = False

    # Saltar secciones legacy 2021 (Campo Verde, ABC, Horizontes) — schema
    # distinto, datos mínimos, no merece la pena importarlas. El schema
    # actual empieza en row 22.
    LEGACY_END = 22

    for i in range(len(df)):
        if i < LEGACY_END:
            continue
        col0 = df.iloc[i, 0]

        # Detectar headers de sección
        if isinstance(col0, str):
            up = col0.upper()
            if 'KARATE' in up:
                in_karate = True
                continue
            if 'RETIRADO' in up:
                in_retirados = True
                current_program = None
                continue
            if 'BLUE KIDS GRUPO 1' in up:
                current_program = 'blue_kids'
                current_section = 'BLUE KIDS 1'
            elif 'BLUE KIDS GRUPO 2' in up:
                current_program = 'blue_kids'
                current_section = 'BLUE KIDS 2'
            elif 'BLUE KIDS GRUPO 3' in up:
                current_program = 'blue_kids'
                current_section = 'BLUE KIDS 3'
            elif 'BLUE KIDS GRUPO 4' in up:
                current_program = 'blue_kids'
                current_section = 'BLUE KIDS 4'
            elif 'GRUPO LEARNING KIDS' in up:
                current_program = 'learning_kids'
                current_section = 'LEARNING KIDS'
            elif 'GRUPO AULA EDUCATIVA' in up:
                current_program = 'aula_educativa'
                current_section = 'AULA EDUCATIVA'
            elif 'TERAPIAS MATUTINAS' in up:
                current_program = None
                current_section = 'TERAPIAS MATUTINAS'
            elif 'TERAPIAS VESPERTINAS' in up:
                current_program = None
                current_section = 'TERAPIAS VESPERTINAS'
            elif 'PROGRAMA ADAPTATIVO' in up:
                current_program = None
                current_section = 'PROGRAMA ADAPTATIVO'
            elif 'TERAPIAS SABADOS' in up or 'TERAPIAS SÁBADOS' in up:
                current_program = None
                current_section = 'TERAPIAS SABADOS'
            if is_section_header(col0):
                continue

        # Si estamos en karate, saltar
        if in_karate:
            continue

        # Validar que la fila tenga datos de niño (apellidos + nombre)
        paterno = df.iloc[i, 1]
        materno = df.iloc[i, 2]
        nombre  = df.iloc[i, 3]
        if pd.isna(paterno) or pd.isna(nombre):
            continue
        # Saltar filas con errores #REF! #VALUE! (formula glitch en el Excel)
        if isinstance(col0, str) and ('#REF' in col0 or '#VALUE' in col0):
            continue
        # Saltar headers que no son niños (texto repetido en cada sección)
        if str(paterno).strip().upper() in ('PATERNO', 'APELLIDOS'):
            continue
        if str(nombre).strip().upper() in ('NOMBRE', 'NOMBRE DEL NIÑO (@)', 'NOMBRE DEL NIÑO'):
            continue

        # Auto-detectar programa desde la propia col 9 si no tenemos current_program
        # (algunas filas están ANTES de su section header en el Excel).
        row_program = None
        programa_str = s(df.iloc[i, 9])
        prog_upper = programa_str.upper()
        if 'BLUE KIDS' in prog_upper:
            row_program = 'blue_kids'
        elif 'LEARNING KIDS' in prog_upper:
            row_program = 'learning_kids'
        elif 'AULA EDUCATIVA' in prog_upper:
            row_program = 'aula_educativa'
        derived_program = current_program or row_program

        # Construir registro del niño
        rec = {
            'section': current_section or programa_str or '?',
            'paterno': s(paterno),
            'materno': s(materno),
            'nombre':  s(nombre),
            'diagnostico': s(df.iloc[i, 4]),
            'photo_consent_x': df.iloc[i, 5],
            'photo_consent_y': df.iloc[i, 6],
            'fecha_nac':   df.iloc[i, 7] if i < len(df) and df.shape[1] > 7  else None,
            'edad_texto':  s(df.iloc[i, 8]),
            'programa_txt': s(df.iloc[i, 9]),
            'fecha_ingreso': df.iloc[i, 10],
            'mom_name':     s(df.iloc[i, 11]),
            'mom_workplace': s(df.iloc[i, 12]),
            'mom_phone':    s(df.iloc[i, 13]),
            'mom_phone2':   s(df.iloc[i, 14]),
            'mom_email':    s(df.iloc[i, 15]),
            'dad_name':     s(df.iloc[i, 16]),
            'dad_workplace': s(df.iloc[i, 17]),
            'dad_phone':    s(df.iloc[i, 18]),
            'dad_phone2':   s(df.iloc[i, 19]),
            'dad_email':    s(df.iloc[i, 20]),
            'pediatrician_name':  s(df.iloc[i, 21]),
            'pediatrician_phone': s(df.iloc[i, 22]),
            'school':       s(df.iloc[i, 23]),
            'school_phone': s(df.iloc[i, 24]),
            'enrolled_program': derived_program,
            'is_retirado': in_retirados,
            'excel_row': i,
        }
        rows.append(rec)
    return rows


# ─── Generación SQL ──────────────────────────────────────────────────────────

def emit_sql(rows: list[dict]) -> str:
    """Genera el SQL idempotente para insertar todos los niños."""
    lines = [
        "-- ═══════════════════════════════════════════════════════════════════════════",
        "-- KINETIC — Import de niños desde Excel 2026",
        "-- ═══════════════════════════════════════════════════════════════════════════",
        "-- Generado automáticamente. NO editar a mano.",
        "-- Requiere migración 0128 (campos workplace, pediatra, photo_consent).",
        "-- Ejecutar en Supabase SQL Editor — corre dentro de un solo BEGIN/COMMIT",
        "-- así que si algo falla no deja datos a medio crear.",
        f"-- Niños a importar: {len(rows)}",
        "-- ═══════════════════════════════════════════════════════════════════════════",
        "",
        "BEGIN;",
        "",
    ]

    for r in rows:
        family_id = uuid.uuid4()
        child_id  = uuid.uuid4()

        # primary_contact = mom; secondary = dad
        primary_name = r['mom_name'] or r['dad_name'] or 'Familia ' + r['paterno']
        primary_phone = r['mom_phone'] or r['dad_phone']
        primary_email = r['mom_email'] or r['dad_email']
        secondary_name = r['dad_name'] if r['mom_name'] else None
        secondary_phone = r['dad_phone'] if r['mom_name'] else None

        # Photo consent: X en col 5 o col 6 = true
        photo_consent = (
            s(r['photo_consent_x']).upper() in ('X', 'SI', 'SÍ') or
            s(r['photo_consent_y']).upper() in ('X', 'SI', 'SÍ')
        )

        # Nombre completo del niño
        full_name = f"{r['nombre']} {r['paterno']} {r['materno']}".strip()
        full_name = re.sub(r'\s+', ' ', full_name)

        # Fase
        phase = '5_2_retirado' if r['is_retirado'] else '3_3_activo_en_terapias'

        # Diagnoses
        diag = r['diagnostico']

        # Terapias parseadas
        therapies = parse_therapies(r['programa_txt'])
        therapies_json = '[' + ', '.join(
            f'{{"service":"{t}", "active":true, "sessions_per_month":{DEFAULT_SESSIONS_PER_MONTH}, "unit_cost_usd":{DEFAULT_UNIT_COST_USD}, "therapist_id":null}}'
            for t in therapies
        ) + ']'

        # Notas
        notes_parts = []
        if r['section']:
            notes_parts.append(f"Sección Excel: {r['section']}")
        if r['programa_txt']:
            notes_parts.append(f"Programa Excel: {r['programa_txt']}")
        if r['edad_texto']:
            notes_parts.append(f"Edad al importar: {r['edad_texto']}")
        notes = ' · '.join(notes_parts)

        lines.append(f"-- Excel row {r['excel_row']} — {full_name} ({r['section']})")
        lines.append(f"INSERT INTO public.families (")
        lines.append(f"  id, primary_contact_name, primary_contact_email, primary_contact_phone,")
        lines.append(f"  secondary_contact_name, secondary_contact_phone,")
        lines.append(f"  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,")
        lines.append(f"  pediatrician_name, pediatrician_phone, status")
        lines.append(f") VALUES (")
        lines.append(f"  '{family_id}',")
        lines.append(f"  {sql_str(primary_name)}, {sql_str(primary_email)}, {sql_str(primary_phone)},")
        lines.append(f"  {sql_str(secondary_name)}, {sql_str(secondary_phone)},")
        lines.append(f"  {sql_str(r['mom_workplace'])}, {sql_str(r['mom_phone2'])},")
        lines.append(f"  {sql_str(r['dad_workplace'])}, {sql_str(r['dad_phone2'])},")
        lines.append(f"  {sql_str(r['pediatrician_name'])}, {sql_str(r['pediatrician_phone'])},")
        status_val = "'dropped'" if r['is_retirado'] else "'active'"
        lines.append(f"  {status_val}")
        lines.append(f");")
        lines.append("")
        lines.append(f"INSERT INTO public.children (")
        lines.append(f"  id, family_id, full_name, birth_date,")
        lines.append(f"  diagnoses_display_text, school_name,")
        lines.append(f"  enrolled_program, enrollment_started_at,")
        lines.append(f"  current_phase_code, current_phase_changed_at,")
        lines.append(f"  photo_consent")
        lines.append(f") VALUES (")
        lines.append(f"  '{child_id}', '{family_id}',")
        lines.append(f"  {sql_str(full_name)},")
        lines.append(f"  {sql_date(r['fecha_nac'])},")
        lines.append(f"  {sql_str(diag)},")
        lines.append(f"  {sql_str(r['school'])},")
        lines.append(f"  {sql_str(r['enrolled_program']) if r['enrolled_program'] else 'NULL'},")
        lines.append(f"  {sql_date(r['fecha_ingreso']) if r['enrolled_program'] else 'NULL'},")
        lines.append(f"  '{phase}', now(),")
        lines.append(f"  {'true' if photo_consent else 'false'}")
        lines.append(f");")
        lines.append("")
        if therapies and not r['is_retirado']:
            lines.append(f"INSERT INTO public.treatment_plans (")
            lines.append(f"  child_id, primary_therapist_id, diagnosis_text, starts_at,")
            lines.append(f"  therapies_json, schedule_pattern_json, monthly_total_usd, active")
            lines.append(f") VALUES (")
            lines.append(f"  '{child_id}', NULL,")
            lines.append(f"  {sql_str(diag)},")
            lines.append(f"  {sql_date(r['fecha_ingreso'])},")
            lines.append(f"  '{therapies_json}'::jsonb,")
            lines.append(f"  '[]'::jsonb,")
            lines.append(f"  {len(therapies) * DEFAULT_SESSIONS_PER_MONTH * DEFAULT_UNIT_COST_USD},")
            lines.append(f"  true")
            lines.append(f");")
        if notes:
            notes_sql = notes.replace("'", "''")
            lines.append(f"UPDATE public.children SET notes = '{notes_sql}' WHERE id = '{child_id}';")
        lines.append("")

    lines.append("COMMIT;")
    lines.append("")
    lines.append("-- ── Verificación ────────────────────────────────────────────────────────")
    lines.append("SELECT")
    lines.append("  (SELECT COUNT(*) FROM public.families)        AS families,")
    lines.append("  (SELECT COUNT(*) FROM public.children)        AS children,")
    lines.append("  (SELECT COUNT(*) FROM public.children WHERE current_phase_code = '5_2_retirado') AS retirados,")
    lines.append("  (SELECT COUNT(*) FROM public.children WHERE enrolled_program IS NOT NULL) AS matutinos,")
    lines.append("  (SELECT COUNT(*) FROM public.treatment_plans) AS plans;")
    return '\n'.join(lines)


# ─── Main ────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    # Forzar UTF-8 en stdout para no romper con tildes/eñes en Windows.
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', newline='\n')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', newline='\n')

    if len(sys.argv) < 2:
        print("Uso: python import_kinetic_children.py <ruta_xlsx>", file=sys.stderr)
        sys.exit(1)
    xlsx_path = sys.argv[1]
    if not Path(xlsx_path).exists():
        print(f"No existe: {xlsx_path}", file=sys.stderr)
        sys.exit(1)
    rows = parse_excel(xlsx_path)
    print(emit_sql(rows))
    print(f"\n-- {len(rows)} ninos generados", file=sys.stderr)
