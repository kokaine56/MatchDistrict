import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { getThemeConfig } from '../utils/themeEngine'


const THEME_SIGNATURES = {
  // Twinkling star field for Cosmic
  cosmic: () => (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-40 mix-blend-screen">
      {Array.from({ length: 12 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 bg-white rounded-full shadow-[0_0_8px_2px_rgba(255,255,255,0.8)]"
          style={{
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
          }}
          animate={{
            opacity: [0.2, 1, 0.2],
            scale: [0.8, 1.2, 0.8],
            x: [0, Math.random() * 20 - 10],
            y: [0, Math.random() * 20 - 10]
          }}
          transition={{
            duration: 3 + Math.random() * 4,
            repeat: Infinity,
            ease: "easeInOut",
            delay: Math.random() * 2
          }}
        />
      ))}
    </div>
  ),
  // Slow ember drift
  ember: () => (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30 mix-blend-screen">
      {Array.from({ length: 8 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1.5 h-1.5 bg-orange-400 rounded-full blur-[1px]"
          style={{
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
          }}
          animate={{
            y: [0, -60],
            x: [0, Math.random() * 40 - 20],
            opacity: [0, 0.8, 0]
          }}
          transition={{
            duration: 4 + Math.random() * 3,
            repeat: Infinity,
            ease: "linear",
            delay: Math.random() * 2
          }}
        />
      ))}
    </div>
  ),
  // Royal / Cyber scanner sweep
  sweep: ({ color }) => (
    <div className="absolute inset-0 overflow-hidden mix-blend-overlay opacity-30">
      <motion.div
        className="absolute inset-0 w-[200%] h-full"
        style={{ background: `linear-gradient(90deg, transparent, ${color}40, transparent)` }}
        animate={{ x: ['-100%', '50%'] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  )
}

/**
 * Ultra-minimalist Ambient Treatments
 * Renders exactly ONE quiet motion effect based on the theme.
 */
function AmbientTreatment({ themeId, color, isHero }) {
  const shouldReduceMotion = useReducedMotion()
  if (shouldReduceMotion) return null

  const scale = isHero ? 2 : 1
  
  switch (themeId) {
    case 'cosmic':
      return THEME_SIGNATURES.cosmic()
    case 'ember':
      return THEME_SIGNATURES.ember()
    case 'royal':
    case 'cyber':
    case 'blue':
      return THEME_SIGNATURES.sweep({ color })
    case 'diamond':
    case 'white':
    case 'mint':
      // Clean, quiet ambient refraction shift using transform for 60fps
      return (
        <div className="absolute inset-0 overflow-hidden mix-blend-overlay opacity-20">
          <motion.div
            className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%]"
            style={{ background: `linear-gradient(45deg, transparent 40%, ${color} 50%, transparent 60%)` }}
            animate={{ x: ['-25%', '25%'], y: ['-25%', '25%'] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
          />
        </div>
      )
    default:
      // Gold / Obsidian get a slow conic pulse
      return (
        <motion.div
          className="absolute inset-0 mix-blend-overlay opacity-25"
          style={{ background: `conic-gradient(from 0deg at 50% 50%, transparent 0deg, ${color} 180deg, transparent 360deg)` }}
          animate={{ rotate: 360, opacity: [0.15, 0.3, 0.15] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        />
      )
  }
}

export default function ThemeCollectibleCardBg({ themeId = 'white', isHovered = false, isHero = false }) {
  const config = getThemeConfig(themeId)
  
  // Premium depth: SVG Noise Grain
  const noisePattern = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`

  return (
    <div className={`absolute inset-0 w-full h-full rounded-2xl overflow-hidden pointer-events-none ${isHero ? 'z-0' : 'z-0'}`}>
      {/* 1. Base Gradient Foundation */}
      <div 
        className="absolute inset-0 opacity-100"
        style={{ 
          background: `linear-gradient(135deg, ${config.cardBg} 0%, ${config.pageBg} 100%)`
        }} 
      />
      
      {/* 2. Premium Depth: Radial Highlight Layer */}
      <div 
        className="absolute inset-0 opacity-40 mix-blend-screen"
        style={{
          background: `radial-gradient(circle at 50% 0%, ${config.accentColor}40 0%, transparent 70%)`
        }}
      />
      
      {/* 3. Premium Depth: Soft SVG Noise Texture */}
      <div 
        className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
        style={{ backgroundImage: noisePattern, backgroundSize: '128px 128px' }}
      />
      
      {/* 4. Signature Minimalist Motion Treatment */}
      <AmbientTreatment themeId={themeId} color={config.accentColor} />

      {/* 5. Hover Reactive Glow (Interaction Layer) */}
      {isHovered && (
        <motion.div 
          className="absolute inset-0 z-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.15 }}
          style={{
            background: `radial-gradient(circle at 50% 50%, ${config.accentColor}, transparent 70%)`
          }}
        />
      )}

      {/* Clean Edge Reflection */}
      <div className="absolute inset-0 rounded-2xl border border-white/5 pointer-events-none" />
    </div>
  )
}
