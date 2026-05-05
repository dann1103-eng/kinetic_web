export default function SinAccesoPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-fm-error/10 flex items-center justify-center mb-6">
        <span className="material-symbols-outlined text-fm-error text-3xl">lock</span>
      </div>
      <h1 className="text-2xl font-bold text-fm-on-surface mb-2">Sin acceso</h1>
      <p className="text-fm-on-surface-variant max-w-md">
        Tu usuario no tiene permisos para esta sección de la marca activa. Contacta al administrador
        principal de tu cuenta para que te otorgue acceso a Facturación o a Gestión de trabajo.
      </p>
      <form action="/auth/signout" method="post" className="mt-8">
        <button
          type="submit"
          className="px-4 py-2 rounded-xl bg-fm-surface-container hover:bg-fm-surface-container-high text-sm font-medium text-fm-on-surface"
        >
          Cerrar sesión
        </button>
      </form>
    </div>
  )
}
