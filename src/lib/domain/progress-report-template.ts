/**
 * Plantilla hardcoded v0.7 para informes de avances cuatrimestrales.
 * Fase 3-C1: una sola plantilla común a todas las terapias.
 * Cuando lleguen ejemplos reales por tipo de terapia, se evolucionará a
 * Fase 3-C2 (multi-template DB-driven via tabla report_templates).
 */

import type { ProgressReportData } from '@/types/db'

export interface ProgressReportSection {
  /** Key dentro de data_json. */
  key: keyof ProgressReportData
  label: string
  description: string
  required: boolean
  /** Texto guía opcional como placeholder. */
  placeholder?: string
}

export const PROGRESS_REPORT_SECTIONS: ProgressReportSection[] = [
  {
    key: 'seguimiento',
    label: 'Seguimiento',
    description: 'Resumen del proceso del niño/a durante el período. Contexto familiar y escolar relevante.',
    required: true,
    placeholder:
      'Durante este cuatrimestre se trabajó con… El niño/a asistió a X sesiones. Contexto familiar: …',
  },
  {
    key: 'dificultades_ingreso',
    label: 'Dificultades al ingreso',
    description: 'Áreas donde se identificaron dificultades al inicio del período.',
    required: false,
    placeholder:
      'Al ingresar al período se observó dificultad en…\n• Área motora: …\n• Área cognitiva: …',
  },
  {
    key: 'objetivos_terapeuticos',
    label: 'Objetivos terapéuticos',
    description: 'Metas planteadas para el período.',
    required: false,
    placeholder:
      '1. Fortalecer…\n2. Mejorar la…\n3. Desarrollar…',
  },
  {
    key: 'actividades_ejercicios',
    label: 'Actividades y ejercicios realizados',
    description: 'Tipos de actividades que se trabajaron en sesión.',
    required: false,
    placeholder:
      'Se trabajaron actividades de…\n• Coordinación: …\n• Lenguaje expresivo: …',
  },
  {
    key: 'logros_obtenidos',
    label: 'Logros obtenidos',
    description: 'Avances concretos observados durante el período.',
    required: true,
    placeholder:
      'El niño/a logró…\n\n• Avance #1: …\n• Avance #2: …',
  },
  {
    key: 'orientaciones_casa',
    label: 'Orientaciones para casa',
    description: 'Recomendaciones específicas para la familia, ejercicios o rutinas a reforzar fuera de sesión.',
    required: false,
    placeholder:
      'Se sugiere a la familia:\n• Reforzar diariamente…\n• Establecer rutina de…',
  },
  {
    key: 'recomendaciones',
    label: 'Recomendaciones',
    description: 'Recomendaciones generales (académicas, conductuales, derivaciones, próximos pasos).',
    required: true,
    placeholder:
      'Se recomienda…\n• Continuar el proceso terapéutico\n• Coordinar con el colegio para…',
  },
]
