export default function Logo({ className = '', showText = true, size = 'md' }) {
  const imgSize = size === 'sm' ? 'h-6' : size === 'lg' ? 'h-10' : 'h-7 md:h-8'
  const textSize = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-xl' : 'text-sm'
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <img
        src="/logo.png"
        alt="Match District"
        className={`${imgSize} w-auto drop-shadow-[0_0_8px_rgba(99,102,241,0.3)]`}
      />
      {showText && (
        <span className={`font-extrabold ${textSize} text-slate-900 dark:text-white tracking-tight`}>
          Match District
        </span>
      )}
    </div>
  )
}
