import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useUser } from '../UserContext.jsx'
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
  const { currentUser } = useUser()
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

  const renderTrophyIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34" />
      <path d="M12 2a7 7 0 0 0-7 7v4a7 7 0 0 0 14 0V9a7 7 0 0 0-7-7z" />
    </svg>
  )

  const renderTicketIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z" />
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="9" y1="10" x2="15" y2="10" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  )

  const renderCalendarIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )

  const getTagIcon = (label) => {
    const l = (label || '').toLowerCase()
    if (l.includes('prize')) return renderTrophyIcon()
    if (l.includes('entry')) return renderTicketIcon()
    return renderCalendarIcon()
  }

  return (
    <section
      ref={containerRef}
      style={{ touchAction: 'pan-y !important' }}
      className="relative w-full overflow-hidden isolate !touch-pan-y"
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
      <div className="absolute top-1/4 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-primary/5 blur-[120px] rounded-full pointer-events-none z-0 hidden sm:block" />
      <div className="absolute top-1/3 right-1/4 w-[300px] h-[300px] bg-indigo-500/5 blur-[100px] rounded-full pointer-events-none z-0 hidden sm:block" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] bg-primary/5 blur-[80px] rounded-full pointer-events-none z-0 block sm:hidden" />

      {/* Main content wrapper */}
      <div className="relative z-10 max-w-container-max mx-auto px-4 sm:px-sm md:px-lg pt-11 md:pt-14">
        {/* Top static greeting area */}
        <div className="text-left sm:text-center pb-3 md:pb-5 pt-3 sm:pt-4">
          <h1 className="font-display-lg text-xl sm:text-2xl md:text-3xl lg:text-4xl font-semibold text-white tracking-wide leading-tight">
            Welcome to the District{currentUser ? `, ${(currentUser.name || currentUser.gamerTag || '').split(' ')[0]}` : '.'}
          </h1>
        </div>

        {/* Slide container */}
        <div className="pb-6 sm:pb-8 flex justify-center w-full !touch-pan-y" style={{ touchAction: 'pan-y !important' }}>
          {/* Slides area */}
          <div 
            className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-slate-200 ring-1 ring-slate-900/5 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] shadow-slate-300/60 bg-white/95 backdrop-blur-md w-full max-w-[800px] !touch-pan-y"
            style={{ touchAction: 'pan-y !important' }}
          >
            <AnimatePresence initial={false} mode="wait" custom={direction}>
              <motion.div
                key={current.id}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="relative flex flex-col md:flex-row md:items-center justify-between py-6 px-6 md:py-8 md:px-10 gap-6 md:gap-8 min-h-fit !touch-pan-y overflow-hidden"
                style={{ touchAction: 'pan-y !important' }}
              >
                {/* Content - Left side: Title & Stats */}
                <div className="relative z-10 flex flex-col items-start gap-4 md:gap-5 flex-grow text-left">
                  {/* Tournament Title */}
                  <div>
                    <h2 className="font-display-lg text-2xl sm:text-3xl font-extrabold text-slate-900 uppercase tracking-tight leading-none">
                      {current.title}
                    </h2>
                  </div>

                  {/* Data Panels Row */}
                  <div className="flex flex-wrap items-center gap-4 sm:gap-6 w-full">
                    {current.tags.map((tag, tIdx) => (
                      <div 
                        key={tIdx} 
                        className="flex items-center gap-2.5 py-1"
                      >
                        <div className="shrink-0 text-primary">
                          {getTagIcon(tag.label)}
                        </div>
                        <div className="flex flex-col text-left">
                          <span className="text-[8px] sm:text-[9px] font-bold text-slate-500 tracking-widest leading-none mb-1 uppercase font-display-lg">
                            {tag.label}
                          </span>
                          <span className="text-xs sm:text-sm font-black text-slate-900 leading-none">
                            {tag.value}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Content - Right side: CTA Button */}
                <div className="relative z-10 flex items-center justify-start md:justify-end shrink-0 py-2 md:py-0">
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onNavigate && onNavigate('tournaments')}
                    className="group relative px-6 py-2.5 sm:px-8 sm:py-3 rounded-xl font-headline-md text-xs sm:text-sm font-semibold uppercase tracking-wider transition-all duration-300 bg-primary hover:bg-primary/90 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/25 active:translate-y-0 text-white shadow-lg shadow-primary/30 flex items-center justify-center gap-3 min-h-[42px]"
                  >
                    <span>{current.buttonText}</span>
                    
                    <svg className="w-4 h-4 text-white group-hover:translate-x-1 transition-transform duration-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </motion.button>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Pagination dots container centered at the bottom */}
            <div className="absolute bottom-3.5 left-1/2 -translate-x-1/2 flex items-center gap-2.5 z-20">
              {slides.map((_, dotIdx) => (
                <button
                  key={dotIdx}
                  onClick={() => goToSlide(dotIdx)}
                  className={`w-2.5 h-2.5 rounded-full transition-all duration-300 focus:outline-none ${
                    currentIndex === dotIdx
                      ? 'bg-primary shadow-[0_0_8px_rgba(90,93,250,0.4)] scale-110'
                      : 'bg-gray-200 hover:bg-gray-300'
                  }`}
                  aria-label={`Go to slide ${dotIdx + 1}`}
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
