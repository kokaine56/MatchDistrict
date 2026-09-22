import { motion } from 'framer-motion'
import gameBgmi from '../assets/supported_games/bgmi.png'
import gameFreeFire from '../assets/supported_games/freefire.png'
import gameCodm from '../assets/supported_games/codm.png'
import gameValorant from '../assets/supported_games/valorant.png'

const GAMES = [
  { name: 'BGMI', img: gameBgmi, active: true, count: '8.7K Tournaments' },
  { name: 'Free Fire', img: gameFreeFire, active: false },
  { name: 'COD Mobile', img: gameCodm, active: false },
  { name: 'Valorant', img: gameValorant, active: false },
  { name: 'CS2', img: gameFreeFire, active: false },
  { name: 'Apex Legends', img: gameCodm, active: false },
]

function GameCard({ game }) {
  return (
    <motion.div
      whileHover={{ y: -6 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="group relative flex flex-col items-center rounded-[18px] bg-white p-3 sm:p-4 cursor-pointer shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.12)] transition-shadow"
    >
      <div className={`relative w-[72px] h-[72px] sm:w-[88px] sm:h-[88px] rounded-[20px] overflow-hidden ${
        game.active
          ? 'shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_4px_16px_rgba(59,130,246,0.12)]'
          : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)]'
      }`}>
        <img
          className={`w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-[250ms] ease-out ${game.active ? '' : 'grayscale'}`}
          alt={game.name}
          src={game.img}
        />
      </div>

      <p className="mt-3.5 text-center text-[14px] sm:text-[15px] font-semibold text-[#111827] leading-tight truncate w-full">
        {game.name}
      </p>
      <p className="mt-1.5 text-center text-[12px] sm:text-[13px] font-medium text-[#6B7280]">
        {game.active ? game.count : 'Coming Soon'}
      </p>
    </motion.div>
  )
}

export default function SupportedGames() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.5 }}
      className="space-y-3 sm:space-y-4"
    >
      <h2 className="font-headline-lg text-lg sm:text-xl md:text-2xl flex items-center gap-2 sm:gap-2.5 font-bold text-white tracking-tight">
        <span className="w-1 h-5 sm:h-6 bg-primary rounded-full shadow-[0_0_10px_rgba(192,193,255,0.5)]"></span>
        Supported Games
      </h2>
      <div className="flex sm:grid sm:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 pb-2" style={{ touchAction: 'pan-x pan-y', WebkitOverflowScrolling: 'touch' }}>
        {GAMES.map((g) => (
          <div key={g.name} className="shrink-0 w-[120px] sm:w-auto">
            <GameCard game={g} />
          </div>
        ))}
      </div>
    </motion.div>
  )
}
