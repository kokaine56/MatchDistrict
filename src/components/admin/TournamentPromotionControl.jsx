/**
 * Tiny admin-only overlay for a tournament card in the Trending & Featured
 * section. Visible only when the current user is a system administrator.
 * Renders nothing for regular users so their experience is unchanged.
 */
export default function TournamentPromotionControl({ promotion, onManage }) {
  const promoted = !!promotion
  const active = promoted && promotion.is_active !== false

  const label = promoted ? (active ? 'Promoted' : 'Paused') : 'Promote'
  const icon = promoted ? (active ? 'local_fire_department' : 'pause_circle') : 'add_circle'

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        onManage && onManage()
      }}
      title={promoted ? 'Manage promotion' : 'Promote this tournament'}
      className={`absolute top-2 left-2 z-50 flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-extrabold uppercase tracking-wider backdrop-blur-md transition-all hover:scale-105 shadow-md ${
        promoted
          ? active
            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-amber-500/10'
            : 'bg-surface/80 text-on-surface-variant border border-outline-variant/40'
          : 'bg-primary/20 text-primary border border-primary/40 shadow-primary/10 hover:bg-primary hover:text-white'
      }`}
    >
      <span className="material-symbols-outlined leading-none" style={{ fontSize: '12px' }}>{icon}</span>
      {label}
      <span className="material-symbols-outlined leading-none opacity-60" style={{ fontSize: '11px' }}>settings</span>
    </button>
  )
}
