/**
 * Usuarios que SIEMPRE deben estar en cada canal (DMs no aplican).
 *
 * Política de FM: Laura Morataya y P.A. Samuel Flores son cuenta principal y
 * dirección de proyecto, respectivamente — necesitan ver toda la actividad
 * de canales internos sin tener que ser agregados manualmente cada vez.
 *
 * Aplica en:
 *  - `createChannel` y `createVoiceChannel` (server actions)
 *  - Migración 0071 (backfill para canales existentes donde no estén)
 *
 * Si alguno de estos UUIDs deja de existir en `public.users`, los inserts
 * fallarán con FK violation. Antes de borrar un usuario que esté en esta
 * lista, removerlo de aquí primero.
 */
export const FORCE_CHANNEL_MEMBER_IDS: readonly string[] = [
  '1c786d40-7954-423b-8d8f-a6405a2f6053', // Laura Morataya
  '32e9b7d5-40eb-491b-a799-3b1597e4ebba', // P.A. Samuel Flores
]
