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
  const color = promoted ? (active ? '#fbbf24' : 'rgba(255,255,255,0.5)') : '#c0c1ff'

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        onManage && onManage()
      }}
      title={promoted ? 'Manage promotion' : 'Promote this tournament'}
      className="absolute top-0 left-0 z-50 flex items-center gap-1 px-1.5 py-1 rounded-lg text-[8px] font-extrabold uppercase tracking-wider transition-all hover:scale-105"
      style={{
        background: 'rgba(10,11,18,0.92)',
        border: `1px solid ${promoted ? 'rgba(251,191,36,0.4)' : 'rgba(192,193,255,0.4)'}`,
        color,
        boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
    >
      <span className="material-symbols-outlined leading-none" style={{ fontSize: '11px' }}>{icon}</span>
      {label}
      <span className="material-symbols-outlined leading-none opacity-60" style={{ fontSize: '10px' }}>settings</span>
    </button>
  )
}
