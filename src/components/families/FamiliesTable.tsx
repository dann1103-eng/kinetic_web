'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Family } from '@/types/db'

const STATUS_LABELS: Record<string, string> = {
  active: 'Activa',
  paused: 'Pausada',
  overdue: 'Morosa',
  dropped: 'Baja',
}
const STATUS_COLORS: Record<string, string> = {
  active: 'bg-fm-tertiary/15 text-fm-tertiary',
  paused: 'bg-fm-on-surface-variant/10 text-fm-on-surface-variant',
  overdue: 'bg-fm-error/10 text-fm-error',
  dropped: 'bg-fm-on-surface-variant/10 text-fm-on-surface-variant',
}

const avatarGradients = [
  'linear-gradient(135deg, #1FA4DA 0%, #87daff 100%)',
  'linear-gradient(135deg, #d99a26 0%, #ffd58f 100%)',
  'linear-gradient(135deg, #65a73d 0%, #b6e094 100%)',
  'linear-gradient(135deg, #E5316E 0%, #ff7aa6 100%)',
  'linear-gradient(135deg, #5c4a8a 0%, #b89cff 100%)',
]
function familyGradient(name: string) {
  return avatarGradients[name.charCodeAt(0) % avatarGradients.length]
}
function getInitials(name: string) {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
}

interface FamilyRow extends Family {
  children_count?: number
}

interface FamiliesTableProps {
  families: FamilyRow[]
}

export function FamiliesTable({ families }: FamiliesTableProps) {
  const [search, setSearch] = useState('')

  const q = search.trim().toLowerCase()
  const filtered = q
    ? families.filter(
        (f) =>
          f.primary_contact_name.toLowerCase().includes(q) ||
          (f.primary_contact_email ?? '').toLowerCase().includes(q) ||
          (f.primary_contact_phone ?? '').toLowerCase().includes(q),
      )
    : families

  return (
    <div className="space-y-4">
      <div className="relative w-full sm:w-80">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-fm-outline-variant text-base pointer-events-none">
          search
        </span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por contacto, email, teléfono…"
          className="w-full pl-9 pr-8 py-2 text-sm bg-fm-surface-container-lowest border border-fm-surface-container-high rounded-xl focus:outline-none focus:border-fm-primary/50 focus:ring-2 focus:ring-fm-primary-container/30 text-fm-on-surface placeholder:text-fm-outline-variant"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-fm-outline-variant hover:text-fm-on-surface-variant"
            aria-label="Limpiar búsqueda"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState search={q} />
      ) : (
        <div className="bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-fm-outline-variant/10">
                <th className="text-left text-xs font-semibold text-fm-outline px-5 py-3">Familia (contacto principal)</th>
                <th className="text-left text-xs font-semibold text-fm-outline px-4 py-3">Contacto</th>
                <th className="text-left text-xs font-semibold text-fm-outline px-4 py-3">Niños</th>
                <th className="text-left text-xs font-semibold text-fm-outline px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => (
                <tr key={f.id} className="border-b border-fm-outline-variant/5 hover:bg-fm-surface-container-low transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/familias/${f.id}`} className="flex items-center gap-3 group min-h-[44px]">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
                        style={{ background: familyGradient(f.primary_contact_name) }}
                        aria-hidden="true"
                      >
                        {getInitials(f.primary_contact_name)}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-fm-on-surface group-hover:text-fm-primary transition-colors">
                          {f.primary_contact_name}
                        </div>
                        {f.code && <div className="text-xs text-fm-on-surface-variant">{f.code}</div>}
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="text-fm-on-surface">{f.primary_contact_email ?? <span className="text-fm-on-surface-variant">—</span>}</div>
                    <div className="text-xs text-fm-on-surface-variant">{f.primary_contact_phone ?? ''}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-fm-on-surface">
                    {f.children_count ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[f.status] ?? 'bg-fm-surface-container'}`}>
                      {STATUS_LABELS[f.status] ?? f.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function EmptyState({ search }: { search: string }) {
  if (search) {
    return (
      <div className="text-center py-14">
        <p className="text-sm text-fm-on-surface-variant max-w-md mx-auto">
          Ninguna familia coincide con <span className="font-medium text-fm-on-surface">&ldquo;{search}&rdquo;</span>.
        </p>
        <p className="text-xs text-fm-on-surface-variant/70 mt-1">
          Probá con el nombre del padre/madre, email o teléfono.
        </p>
      </div>
    )
  }
  return (
    <div className="text-center py-14 px-6">
      <p className="text-base text-fm-on-surface font-medium">Aún no hay familias en Kinetic.</p>
      <p className="text-sm text-fm-on-surface-variant max-w-prose mx-auto mt-1.5">
        Cuando registres la primera, aparecerá acá. Comenzá agregando los datos de contacto de los padres y luego los niños/as a su cargo.
      </p>
    </div>
  )
}
