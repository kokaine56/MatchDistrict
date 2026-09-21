import { getGameAsset } from '../utils/gameAssets'

const GameIcon = ({ game, size = 40, rounded = 'rounded-xl', className = '', showFallback = true }) => {
  const asset = getGameAsset(game)
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center shrink-0 overflow-hidden bg-surface-container border border-outline-variant/30 ${rounded} ${className}`}
      style={{ width: size, height: size }}
    >
      {asset.img ? (
        <img src={asset.img} alt="" draggable={false} className="w-full h-full object-contain" />
      ) : showFallback ? (
        <span className="w-full h-full flex items-center justify-center bg-sky-500/10 text-sky-400 font-label-caps text-[10px] font-black uppercase tracking-wider select-none">
          {asset.label.slice(0, 4)}
        </span>
      ) : null}
    </span>
  )
}

export default GameIcon