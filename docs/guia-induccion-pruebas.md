# Guía de inducción y pruebas — registro y contabilización de terapias

Esta guía sirve para ensayar, de punta a punta, cómo se **registran las terapias**,
cómo se **marcan las extraordinarias** y cómo se ven **en la planilla de servicios
profesionales**. Usa datos de prueba aislados (terapista + familia + niño ficticios).

---

## 0. Preparar los datos de prueba

1. Abrí **Supabase Dashboard → SQL Editor**.
2. Pegá y corré el script `supabase/scripts/seed_test_induction.sql`.
3. Te crea:
   - **Terapista de prueba** — `terapista.prueba@ejemplo.com` / `Kinetic2026!`
     (planilla **mixta**: sueldo fijo + servicios profesionales por extras).
   - **Familia Zelaya (Prueba)** + **Niño Prueba Zelaya**, con plan de tratamiento
     de lenguaje (lun/mié 10:00).
   - **Citas mezcla**: 3 ya **completadas** este mes (1 marcada como extraordinaria)
     + 2 **agendadas para hoy** para completarlas en vivo.

> El script es idempotente: si lo corrés dos veces, no duplica la familia.
> Al final del archivo hay un bloque de **limpieza** (comentado) para borrar
> todo después de la inducción.

---

## 1. Vista de la terapista — registrar y controlar sus terapias

Iniciá sesión como **terapista de prueba** (`terapista.prueba@ejemplo.com`).

### Completar una terapia (flujo diario)
1. Andá a **Mi día**.
2. En la cita agendada de hoy: **Iniciar sesión** → al terminar **Finalizar**.
3. **Subir reporte** (el reporte diario que va a revisión): llená actividades y enviá.
4. **Despachar niño/a** cuando lo recojan.

### Control semanal (nuevo)
1. En **Mi día**, cambiá a la pestaña **"Mi semana"**.
2. Vas a ver **todas las terapias completadas de la semana** (ya no desaparecen
   al pasar el día), con el **estado del reporte** de cada una:
   - *Sin reporte* / *Borrador* / *Rechazado* → muestran botón para subir/continuar.
   - *Enviado a revisión* / *Aprobado* → ya están listas.
3. Si una terapia quedó **sin reporte**, aparece un aviso arriba con el conteo.
   Así la terapista detecta los reportes que se le pasó enviar.

---

## 2. Recepción / coordinadoras / admin — contabilizar y marcar extras

Iniciá sesión como **recepción**, **coordinadora** o **admin**.

1. Andá a **Operación → Capacidad de terapistas**.
2. Hacé clic en **"Ver horas completadas →"**.
3. Elegí la granularidad: **Día / Semana / Mes** y navegá con las flechas.
4. Por cada terapista ves sus terapias completadas (niño, terapia, tarifa) y el
   resumen: cantidad, horas y **cuánto iría a servicios profesionales**.
5. Para una terapia que fue **extraordinaria** (cobertura, hora extra o sábado):
   - Marcá la casilla **"Extra"** y elegí el **motivo**.
   - Como la terapista de prueba está en planilla **mixta**, **solo las extras**
     suman a servicios profesionales — vas a ver cambiar el subtotal al instante.

> Una terapista que esté **solo** en servicios profesionales cobra **todas** sus
> terapias completadas (no hace falta marcarlas como extra).

---

## 3. Ver el acumulado y la planilla

1. Andá a **Reportes → Por terapista**.
2. En la sección **"Pago por terapias completadas — acumulado del mes"** vas a ver
   lo que pagaría la planilla de servicios profesionales en vivo:
   - Terapista mixta → solo el monto de las terapias marcadas **extra**.
3. Al crear la **planilla de servicios profesionales** del mes
   (Reportes → Planillas), esas mismas terapias se reflejan como honorarios.

Con esto cerrás el ciclo: **completar → marcar extra → contabilizar → planilla**.

---

## 4. Limpieza (después de la inducción)

En **SQL Editor**, descomentá y corré el bloque de **LIMPIEZA** que está al final
de `supabase/scripts/seed_test_induction.sql`. Borra la familia, el niño, el plan,
las citas y la terapista de prueba.
