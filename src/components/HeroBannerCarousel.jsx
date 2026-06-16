import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import heroImg from '../assets/background/hero.png'
import heroImgMobile from '../assets/background/hero_mobile.png'

const slides = [
  {
    id: 'bgis-2026',
    badge: 'Promoted Tournament',
    badgeIcon: 'military_tech',
    title: 'BGIS 2026',
    titleAccent: 'Promoted Tournament',
    description: 'The grandest mobile battle royale stage is back. Register your squad now and lock horns with the nation\'s top-tier esports teams for a legendary prize pool.',
    bgGradient: 'from-[#4c1d95]/90 via-[#451a03]/80 to-[#07080c]/95',
    accentColor: 'from-amber-400 via-orange-500 to-rose-600',
    tags: [
      { label: 'PRIZE POOL', value: '₹50,00,000' },
      { label: 'ENTRY', value: 'Free Entry' },
      { label: 'STARTS', value: 'July 15' },
    ],
    buttonText: 'CLAIM SLOTS NOW',
    buttonIcon: 'forward',
  },
  {
    id: 'val-challenger',
    badge: 'Promoted Tournament',
    badgeIcon: 'local_fire_department',
    title: 'Valorant Challenger',
    titleAccent: 'Enter Register Road',
    description: '5v5 tactical shooter mayhem. Bring your A-game, execute flawless strategies, and dominate the competition to claim the championship crown.',
    bgGradient: 'from-[#881337]/90 via-[#2d0615]/80 to-[#07080c]/95',
    accentColor: 'from-red-400 via-rose-500 to-pink-600',
    tags: [
      { label: 'PRIZE POOL', value: '₹10,00,000' },
      { label: 'ENTRY', value: '₹500 / Team' },
      { label: 'STARTS', value: 'July 28' },
    ],
    buttonText: 'ENTER REGISTER ROAD',
    buttonIcon: 'rocket_launch',
  },
]

const slideVariants = {
  enter: (direction) => ({
    opacity: 0,
    x: direction > 0 ? 60 : -60,
    scale: 0.97,
  }),
  center: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: {
      x: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
      opacity: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
      scale: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
    },
  },
  exit: (direction) => ({
    opacity: 0,
    x: direction > 0 ? -60 : 60,
    scale: 0.97,
    transition: {
      x: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
      opacity: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
      scale: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
    },
  }),
}

function HeroBannerCarousel({ onNavigate }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [direction, setDirection] = useState(1)
  const intervalRef = useRef(null)
  const containerRef = useRef(null)

  const totalSlides = slides.length

  const goToSlide = useCallback((idx) => {
    setDirection(idx > currentIndex ? 1 : -1)
    setCurrentIndex(idx)
  }, [currentIndex])

  const goNext = useCallback(() => {
    setDirection(1)
    setCurrentIndex((prev) => (prev + 1) % totalSlides)
  }, [totalSlides])

  useEffect(() => {
    intervalRef.current = setInterval(goNext, 10000)
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [goNext])

  const current = slides[currentIndex]

  return (
    <section
      ref={containerRef}
      style={{ touchAction: 'pan-y' }}
      className="relative w-full overflow-hidden isolate"
    >
      {/* Hero background images - persistent across all slides */}
      <div className="absolute inset-0 z-0 overflow-hidden bg-background">
        <img
          alt="Match District Arena"
          fetchpriority="high"
          decoding="async"
          className="w-full h-full object-cover opacity-40 hidden sm:block mix-blend-luminosity"
          src={heroImg}
        />
        <img
          alt="Match District Arena Mobile"
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover opacity-40 block sm:hidden mix-blend-luminosity"
          src={heroImgMobile}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/85 to-background" />
      </div>

      {/* Ambient cinematic glows */}
      <div className="absolute top-1/4 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-primary/15 blur-[120px] rounded-full pointer-events-none z-0 hidden sm:block" />
      <div className="absolute top-1/3 right-1/4 w-[300px] h-[300px] bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none z-0 hidden sm:block" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] bg-primary/10 blur-[80px] rounded-full pointer-events-none z-0 block sm:hidden" />

      {/* Main content wrapper */}
      <div className="relative z-10 max-w-container-max mx-auto px-4 sm:px-sm md:px-lg pt-11 md:pt-14">
        {/* Top static greeting area */}
        <div className="text-left sm:text-center pb-6 pt-4">
          <h1 className="font-display-lg text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-white uppercase tracking-tight leading-tight">
            Welcome to the district.
          </h1>
        </div>

        {/* Slide container */}
        <div className="pb-6 sm:pb-8 md:pb-12">
          {/* Slides area */}
          <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-white/10 shadow-2xl">
            <AnimatePresence initial={false} mode="wait" custom={direction}>
              <motion.div
                key={current.id}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="relative flex flex-col sm:flex-row justify-between items-stretch min-h-[320px] sm:min-h-[280px] md:min-h-[300px] lg:min-h-[340px]"
              >
                {/* Slide gradient background */}
                <div className={`absolute inset-0 bg-gradient-to-br ${current.bgGradient}`} />

                {/* Geometric cyber-mesh overlay pattern */}
                <div
                  className="absolute inset-0 opacity-30 pointer-events-none"
                  style={{
                    backgroundImage: `
                      linear-gradient(45deg, rgba(255,255,255,0.03) 25%, transparent 25%),
                      linear-gradient(-45deg, rgba(255,255,255,0.03) 25%, transparent 25%),
                      linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.03) 75%),
                      linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.03) 75%)
                    `,
                    backgroundSize: '40px 40px',
                    backgroundPosition: '0 0, 0 20px, 20px -20px, -20px 0px',
                  }}
                />

                {/* Radial ambient glow per slide */}
                <div
                  className={`absolute -top-20 -right-20 w-64 h-64 rounded-full bg-gradient-to-br ${current.accentColor} opacity-[0.12] blur-[80px] pointer-events-none`}
                />
                <div
                  className={`absolute -bottom-20 -left-20 w-48 h-48 rounded-full bg-gradient-to-tr ${current.accentColor} opacity-[0.08] blur-[60px] pointer-events-none`}
                />

                {/* Horizontal neon divider accent */}
                <div className="absolute top-0 left-0 right-0 h-[2px]">
                  <div className={`w-full h-full bg-gradient-to-r ${current.accentColor} opacity-60`} />
                </div>

                {/* Content - Left */}
                <div className="relative z-10 flex flex-col justify-center flex-grow p-6 sm:p-8 md:p-10 lg:p-12 space-y-4">
                  {/* Badge */}
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-extrabold uppercase tracking-[0.15em] bg-white/10 text-white/90 border border-white/20 backdrop-blur-md w-fit shadow-lg">
                      <span className={`w-2 h-2 rounded-full bg-gradient-to-r ${current.accentColor} animate-pulse`} />
                      {current.badge}
                    </span>
                  </div>

                  {/* Title */}
                  <h2 className="font-display-lg text-xl sm:text-2xl md:text-3xl lg:text-4xl font-black text-white uppercase tracking-tight leading-tight">
                    {current.title}
                    <br />
                    <span className={`bg-gradient-to-r ${current.accentColor} bg-clip-text text-transparent`}>
                      {current.titleAccent}
                    </span>
                  </h2>

                  {/* Description */}
                  <p className="font-body-md text-xs sm:text-sm md:text-base text-white/70 max-w-xl leading-relaxed">
                    {current.description}
                  </p>

                  {/* Tags */}
                  <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                    {current.tags.map((tag, tIdx) => (
                      <div key={tIdx} className="flex flex-col">
                        <span className="text-[9px] sm:text-[10px] font-bold text-white/40 uppercase tracking-[0.15em] leading-none mb-1">
                          {tag.label}
                        </span>
                        <span className={`text-sm sm:text-base font-black leading-none ${
                          tag.value ? 'text-white' : 'text-white/60'
                        }`}>
                          {tag.value || tag.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CTA - Right/Bottom */}
                <div className="relative z-10 flex items-center justify-start sm:justify-end shrink-0 p-6 sm:p-8 md:p-10 lg:p-12 pt-0 sm:pt-6">
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => onNavigate && onNavigate('tournaments')}
                    className={`
                      group relative px-6 sm:px-8 py-3 sm:py-3.5
                      rounded-xl font-headline-md text-xs sm:text-sm font-black uppercase tracking-wider
                      transition-all duration-300
                      bg-white text-gray-900
                      hover:bg-white/95
                      shadow-[0_0_24px_rgba(255,255,255,0.12)]
                      hover:shadow-[0_0_40px_rgba(255,255,255,0.2)]
                      flex items-center justify-center gap-2.5
                      min-h-[44px]
                    `}
                  >
                    <span className="relative">{current.buttonText}</span>
                    <span className={`material-symbols-outlined text-base sm:text-lg group-hover:translate-x-0.5 transition-transform`}>
                      {current.buttonIcon}
                    </span>
                  </motion.button>
                </div>

                {/* Bottom neon glow bar */}
                <div className={`absolute bottom-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-white/20 to-transparent`} />
              </motion.div>
            </AnimatePresence>

            {/* Dots navigation */}
            <div className="absolute bottom-4 right-4 sm:bottom-5 sm:right-6 flex items-center gap-2 z-20">
              {slides.map((_, dotIdx) => (
                <button
                  key={dotIdx}
                  onClick={() => goToSlide(dotIdx)}
                  className={`rounded-full transition-all duration-500 ${
                    currentIndex === dotIdx
                      ? 'w-6 sm:w-8 h-2 sm:h-2.5 bg-white shadow-[0_0_12px_rgba(255,255,255,0.4)]'
                      : 'w-2 sm:w-2.5 h-2 sm:h-2.5 bg-white/30 hover:bg-white/50'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default HeroBannerCarousel
