/**
 * Usuarios que SIEMPRE deben estar en cada canal (DMs no aplican).
 *
 * VACÍA para Kinetic. Los dos UUIDs originales (Laura Morataya y P.A. Samuel
 * Flores) eran cuentas legacy de FM que ya no existen en `public.users` de
 * Kinetic; forzarlos en cada canal reventaba `createChannel` con FK violation
 * ("conversation_members_user_id_fkey"). Kinetic no necesita miembros
 * forzados por defecto.
 *
 * Si en el futuro se quiere que ciertos usuarios estén en todo canal, agregar
 * sus UUIDs aquí — pero `createChannel` ya filtra defensivamente contra
 * `public.users`, así que un ID obsoleto no volverá a tronar la creación.
 *
 * Aplica en:
 *  - `createChannel` (server action)
 *  - Migración 0071 (backfill histórico — no re-correr)
 */
export const FORCE_CHANNEL_MEMBER_IDS: readonly string[] = []
