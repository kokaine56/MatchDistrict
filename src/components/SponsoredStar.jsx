export default function SponsoredStar({ size = 10 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="#F59E0B"
      className="shrink-0"
      style={size >= 10 ? { filter: 'drop-shadow(0 0 3px rgba(245,158,11,0.45))' } : undefined}
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1L12 2z" />
    </svg>
  )
}
