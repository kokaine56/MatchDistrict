import gameBgmi from '../assets/supported_games/bgmi.png'
import gameFreeFire from '../assets/supported_games/freefire.png'
import gameCodm from '../assets/supported_games/codm.png'
import gameValorant from '../assets/supported_games/valorant.png'
import { normalizeGameName } from './gameUtils.js'

const GAME_ICON_ASSETS = {
  BGMI: { img: gameBgmi, label: 'BGMI' },
  CODM: { img: gameCodm, label: 'CODM' },
  Valorant: { img: gameValorant, label: 'Valorant' },
  'Free Fire': { img: gameFreeFire, label: 'Free Fire' },
  CS2: { img: null, label: 'CS2' },
}

export function getGameAsset(game) {
  const canonical = normalizeGameName(game)
  return GAME_ICON_ASSETS[canonical] || { img: null, label: canonical || 'BGMI' }
}

export { GAME_ICON_ASSETS }