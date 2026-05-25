# Setup completo Kinetic — desde proyecto Supabase vacío

Ejecuta estos 3 archivos en orden en **SQL Editor** de Supabase Studio.

| Archivo | Líneas | Qué hace |
|---|---|---|
| `01_base_fm.sql` | ~4,400 | Schema base heredado de FM CRM (users, clients, pipeline, billing legacy, inbox, review, calendar, portal). |
| `02_kinetic_schema.sql` | ~6,200 | Schema Kinetic propiamente (families, children, appointments, treatment_plans, progress_reports, waitlist, payroll, expenses, pipeline). |
| `03_seed_demo.sql` | ~1,300 | Seed opcional de 22 familias / niños / citas / planillas para tener data demo. |

## Procedimiento

1. **Proyecto Supabase nuevo** o resetea uno existente desde Project Settings → Database → Reset.

2. **Ejecuta `01_base_fm.sql`** en SQL Editor.
   - Si la query es muy larga para pegarse de un solo bloque, copia/pega y ejecuta el archivo en 2 chunks (córtalo entre cualquier `-- ──` separator).
   - Espera a que termine sin errores.

3. **Ejecuta `02_kinetic_schema.sql`**.
   - Crea todas las tablas operativas de Kinetic.

4. **Configura Authentication**:
   - Authentication → Providers → Email: habilita.
   - Authentication → URL Configuration:
     - Site URL: `https://tu-dominio.vercel.app`
     - Redirect URLs: `https://tu-dominio.vercel.app/auth/callback` y `https://tu-dominio.vercel.app/**`

5. **Crea los usuarios internos**:
   - Authentication → Users → Add user (uno por cada rol que necesites).
   - Después en SQL Editor asigna roles:
     ```sql
     UPDATE public.users SET role = 'admin',                 full_name = 'Daniel Mancia'     WHERE email = 'tu@email.com';
     UPDATE public.users SET role = 'directora',             full_name = 'Directora Kinetic' WHERE email = '...';
     UPDATE public.users SET role = 'coordinadora_familias', full_name = 'Coord Familias'    WHERE email = '...';
     UPDATE public.users SET role = 'coordinadora_terapias', full_name = 'Coord Terapias'    WHERE email = '...';
     UPDATE public.users SET role = 'recepcion',             full_name = 'Recepción'         WHERE email = '...';
     UPDATE public.users SET role = 'contable',              full_name = 'Contable'          WHERE email = '...';
     UPDATE public.users SET role = 'maestra',               full_name = 'Maestra BlueKids'  WHERE email = '...';
     UPDATE public.users SET role = 'terapista',             full_name = 'Terapista 1'       WHERE email = '...';
     UPDATE public.users SET role = 'terapista',             full_name = 'Terapista 2'       WHERE email = '...';
     UPDATE public.users SET role = 'terapista',             full_name = 'Terapista 3'       WHERE email = '...';
     UPDATE public.users SET role = 'terapista',             full_name = 'Terapista 4'       WHERE email = '...';
     ```

6. **(Opcional) Ejecuta `03_seed_demo.sql`** si quieres data de prueba para ver dashboards, planillas, lista de espera, etc.

7. **Actualiza Vercel** con las nuevas variables si cambió el `project ref`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

8. **Buckets de Storage**: los archivos `0007`, `0042`, `0045`, `0108`, `0119` crean automáticamente los buckets `client-logos`, `agency-assets`, `review-files`, `reports-files`, `child-attachments`. Pero `avatars` puede que no esté incluido — verifícalo en Storage → si no aparece, créalo manual como bucket **público** con límite de 5 MB y mime types `image/*`.

## Si Supabase SQL Editor falla con queries muy largas

El editor de Supabase puede atragantarse con archivos de varias miles de líneas. En ese caso:

- Usa **`psql` desde tu terminal**:
  ```bash
  psql "postgresql://postgres:[TU_PASS]@db.[NUEVO_REF].supabase.co:5432/postgres" \
    -f supabase/scripts/full-setup/01_base_fm.sql
  ```
  Reemplaza `[TU_PASS]` con la contraseña de DB y `[NUEVO_REF]` con el ref del proyecto nuevo.

- O divide cada archivo en 2-3 partes usando los separadores `-- ──` como puntos de corte natural.
