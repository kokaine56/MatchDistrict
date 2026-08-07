import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { getThemeConfig } from '../utils/themeEngine'

function RoyalGoldCardBg({ isHovered, isHero }) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <div className="absolute inset-0 w-full h-full rounded-2xl overflow-hidden pointer-events-none z-0 select-none">
      {/* Layer 1: Deep Metallic Gold Surface Gradient Base */}
      <div 
        className="absolute inset-0 opacity-100"
        style={{
          background: 'linear-gradient(135deg, #3D2800 0%, #6E4900 15%, #A87800 35%, #D4A017 52%, #FFC107 70%, #FFCA28 85%, #805400 100%)'
        }}
      />

      {/* Layer 2: Fine Brushed Metallic Gold Texture Lines */}
      <div 
        className="absolute inset-0 opacity-25 mix-blend-overlay"
        style={{
          backgroundImage: 'repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.08) 0px, rgba(255, 255, 255, 0.08) 1px, transparent 1px, transparent 4px)'
        }}
      />

      {/* Layer 3: Warm Ambient Radial Glows (Top Right Specular Highlight & Bottom Corner Depth) */}
      <div 
        className="absolute inset-0 opacity-60 mix-blend-screen"
        style={{
          background: 'radial-gradient(circle at 90% 10%, rgba(255, 244, 194, 0.55) 0%, rgba(255, 193, 7, 0.25) 45%, transparent 75%)'
        }}
      />
      <div 
        className="absolute inset-0 opacity-40 mix-blend-color-burn"
        style={{
          background: 'radial-gradient(circle at 10% 90%, rgba(100, 60, 0, 0.85) 0%, transparent 60%)'
        }}
      />

      {/* Layer 4: Large Transparent Match District "M" Emblem Watermark (3-5% Opacity) */}
      <div className="absolute top-[-5%] right-[-10%] w-[85%] h-[85%] opacity-[0.045] mix-blend-screen pointer-events-none transform -rotate-12">
        <svg viewBox="0 0 200 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-[#FFE082]">
          <path 
            d="M20 180 L70 30 L100 100 L130 30 L180 180 L140 180 L120 100 L100 140 L80 100 L60 180 Z" 
            fill="currentColor"
          />
          <path 
            d="M100 10 L190 60 L190 160 L100 210 L10 160 L10 60 Z" 
            stroke="currentColor" 
            strokeWidth="6" 
            fill="none"
          />
        </svg>
      </div>

      {/* Layer 5: Subtle Gold Noise Texture */}
      <div 
        className="absolute inset-0 opacity-[0.04] mix-blend-overlay"
        style={{ 
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          backgroundSize: '128px 128px' 
        }}
      />

      {/* Layer 6: GPU-Accelerated Dynamic Animations */}
      {!shouldReduceMotion && (
        <>
          {/* Light Sweep (Occurs every 8–10s, soft diagonal metallic shine) */}
          <div className="absolute inset-0 overflow-hidden mix-blend-screen opacity-50">
            <motion.div
              className="absolute inset-0 w-[200%] h-full pointer-events-none"
              style={{
                background: 'linear-gradient(110deg, transparent 35%, rgba(255, 244, 194, 0.45) 50%, transparent 65%)'
              }}
              animate={{ x: ['-100%', '60%'] }}
              transition={{ duration: 3, repeat: Infinity, repeatDelay: 6, ease: 'easeInOut' }}
            />
          </div>

          {/* Floating Golden Dust Particles (Upward Drift) */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {Array.from({ length: 14 }).map((_, i) => {
              const size = 1.5 + (i % 3) * 0.8
              const left = (i * 7 + 4) % 95
              const delay = (i * 0.4) % 3
              const duration = 4.5 + (i % 4) * 1.2
              return (
                <motion.div
                  key={`gold-dust-${i}`}
                  className="absolute rounded-full bg-[#FFE082] shadow-[0_0_6px_1px_rgba(255,224,130,0.8)]"
                  style={{
                    width: `${size}px`,
                    height: `${size}px`,
                    left: `${left}%`,
                    bottom: '-10%'
                  }}
                  animate={{
                    y: ['0px', '-220px'],
                    x: [0, (i % 2 === 0 ? 15 : -15)],
                    opacity: [0, 0.85, 0.85, 0]
                  }}
                  transition={{
                    duration: duration,
                    repeat: Infinity,
                    ease: 'linear',
                    delay: delay
                  }}
                />
              )
            })}
          </div>



          {/* Ambient Glow Breathing */}
          <motion.div
            className="absolute inset-0 mix-blend-screen opacity-30 pointer-events-none"
            style={{
              background: 'radial-gradient(circle at 50% 50%, rgba(255, 202, 40, 0.3) 0%, transparent 70%)'
            }}
            animate={{ opacity: [0.2, 0.45, 0.2] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          />
        </>
      )}

      {/* Layer 7: Hover Reactive Reflection Sheen */}
      {isHovered && (
        <motion.div 
          className="absolute inset-0 z-10 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.25 }}
          style={{
            background: 'radial-gradient(circle at 50% 50%, rgba(255, 244, 194, 0.5), transparent 70%)'
          }}
        />
      )}

      {/* Layer 8: Metallic Gold Rim Border & Soft Inner Specular Highlight */}
      <div className="absolute inset-0 rounded-2xl border border-[#FFE082]/60 shadow-[inset_0_1px_3px_rgba(255,244,194,0.4)] pointer-events-none" />
    </div>
  )
}

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
  const normThemeId = (themeId || 'white').toLowerCase().trim()
  
  if (normThemeId === 'gold') {
    return <RoyalGoldCardBg isHovered={isHovered} isHero={isHero} />
  }

  const config = getThemeConfig(themeId)
  
  // Premium depth: SVG Noise Grain
  const noisePattern = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`

  return (
    <div className={`absolute inset-0 w-full h-full rounded-2xl overflow-hidden pointer-events-none ${isHero ? 'z-0' : 'z-0'}`}>
      {/* 1. Base Solid Color Foundation */}
      <div 
        className="absolute inset-0 opacity-100"
        style={{ backgroundColor: config.cardBg }} 
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

