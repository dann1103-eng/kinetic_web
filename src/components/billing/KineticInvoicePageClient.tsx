'use client'

/**
 * Página standalone "Nueva factura" Kinetic.
 *
 * Reemplaza el viejo InvoiceForm de FM (clientes/planes/cambios) por el flujo
 * Kinetic: seleccionar niño → armar factura desde el service_catalog.
 *
 * Usa AdHocInvoiceBuilder (mismo que el modal de la ficha del niño).
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AdHocInvoiceBuilder } from './AdHocInvoiceBuilder'
import type { MorningProgram, ServiceCatalogItem } from '@/types/db'

export interface InvoiceChildOption {
  id: string
  full_name: string
  family_id: string
  family_name: string
  enrolled_program: MorningProgram | null
}

interface Props {
  childOptions: InvoiceChildOption[]
  catalog: ServiceCatalogItem[]
}

export function KineticInvoicePageClient({ childOptions, catalog }: Props) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createdInvoiceId, setCreatedInvoiceId] = useState<string | null>(null)

  const selected = useMemo(
    () => childOptions.find((c) => c.id === selectedId) ?? null,
    [childOptions, selectedId],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return childOptions.slice(0, 30)
    return childOptions
      .filter(
        (c) =>
          c.full_name.toLowerCase().includes(q) ||
          c.family_name.toLowerCase().includes(q),
      )
      .slice(0, 30)
  }, [childOptions, query])

  // Estado: factura recién creada → mostrar confirmación
  if (createdInvoiceId && selected) {
    return (
      <div className="max-w-md mx-auto mt-10 rounded-2xl border border-fm-outline-variant/30 bg-fm-surface-container-lowest p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-fm-primary/10 flex items-center justify-center mx-auto">
          <span className="material-symbols-outlined text-fm-primary text-3xl">check_circle</span>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-fm-on-surface">Factura creada</h2>
          <p className="text-sm text-fm-on-surface-variant mt-1">
            Se generó la factura para {selected.full_name}.
          </p>
        </div>
        <div className="flex flex-col gap-2 pt-2">
          <Link
            href={`/familias/${selected.family_id}/children/${selected.id}`}
            className="px-4 py-2 rounded-xl bg-fm-primary text-white text-sm font-semibold hover:bg-fm-primary/90 transition-colors"
          >
            Ver ficha del niño/a
          </Link>
          <button
            type="button"
            onClick={() => {
              setCreatedInvoiceId(null)
              setSelectedId(null)
              setQuery('')
            }}
            className="px-4 py-2 rounded-xl border border-fm-outline-variant/40 text-sm font-medium text-fm-on-surface hover:bg-fm-surface-container transition-colors"
          >
            Crear otra factura
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Selector de niño */}
      <div className="rounded-2xl border border-fm-outline-variant/30 bg-fm-surface-container-lowest p-5">
        <label className="text-xs font-semibold uppercase tracking-wider text-fm-on-surface-variant">
          Niño/a a facturar
        </label>
        {selected ? (
          <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-fm-primary/40 bg-fm-primary/5 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-fm-on-surface">{selected.full_name}</p>
              <p className="text-xs text-fm-on-surface-variant">
                Familia {selected.family_name}
                {selected.enrolled_program && (
                  <span className="ml-2 px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200 text-[10px] font-bold uppercase">
                    {selected.enrolled_program === 'blue_kids'
                      ? 'BlueKids'
                      : selected.enrolled_program === 'learning_kids'
                        ? 'LearningKids'
                        : 'Aula'}
                    {' · precio BK'}
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedId(null)
                setQuery('')
              }}
              className="text-xs font-semibold text-fm-primary hover:underline"
            >
              Cambiar
            </button>
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre del niño o familia…"
              className="w-full text-sm px-3 py-2 bg-fm-background border border-fm-surface-container-high rounded-xl focus:outline-none focus:border-fm-primary"
            />
            <div className="max-h-56 overflow-y-auto rounded-xl border border-fm-outline-variant/20 divide-y divide-fm-outline-variant/10">
              {filtered.length === 0 ? (
                <p className="text-xs text-fm-on-surface-variant italic px-3 py-3">
                  No se encontraron niños con ese nombre.
                </p>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className="w-full text-left px-3 py-2 hover:bg-fm-primary/5 transition-colors"
                  >
                    <p className="text-sm font-medium text-fm-on-surface">{c.full_name}</p>
                    <p className="text-[11px] text-fm-on-surface-variant">
                      Familia {c.family_name}
                      {c.enrolled_program && ' · matutino'}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Builder — solo cuando hay niño seleccionado */}
      {selected && (
        <div className="rounded-2xl border border-fm-outline-variant/30 bg-fm-surface-container-lowest overflow-hidden">
          <AdHocInvoiceBuilder
            key={selected.id}
            childId={selected.id}
            enrolledProgram={selected.enrolled_program}
            catalog={catalog}
            onCreated={(id) => setCreatedInvoiceId(id)}
          />
        </div>
      )}
    </div>
  )
}
