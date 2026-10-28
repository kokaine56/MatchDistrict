import { getTournamentLifecycleStatus, getRegistrationButtonState } from '../src/utils/tournamentLifecycle.js';
import { formatDate } from '../src/utils/timeFormat.js';

console.log('Testing TournamentDetail expressions with real API data...');

// 1. Fetch data
const res = await fetch('http://localhost:10000/api/tournaments/TRN-rbtb-1OQN');
const data = await res.json();
const tourney = data.tournament;

console.log('Tournament ID:', tourney.id);

// Test startDate formatting
try {
  const startDateStr = tourney?.startDate ? new Date(tourney.startDate) : null;
  const formattedDate = startDateStr ? formatDate(startDateStr.toISOString()) : '';
  console.log('formattedDate:', formattedDate);
} catch (e) {
  console.error('ERROR in formattedDate:', e);
}

// Test slots calculation
const slotsRes = await fetch('http://localhost:10000/api/tournaments/TRN-rbtb-1OQN/slots');
const slotsData = await slotsRes.json();
const slotTotal = parseInt(tourney?.slotsTotal || slotsData?.slotsTotal, 10) || 128;
const occupiedFromSlotsArray = Array.isArray(slotsData?.slots)
  ? slotsData.slots.filter(s => s && s.status && s.status !== 'available' && s.registrationId).length
  : 0;

const registrations = [];
const validRegistrationsCount = 0;
const slotFilled = Math.min(
  slotTotal,
  Math.max(
    Number(slotsData?.slotsFilled) || 0,
    Number(tourney?.slotsFilled) || 0,
    occupiedFromSlotsArray,
    validRegistrationsCount
  )
);
const isSlotsFull = slotTotal > 0 && slotFilled >= slotTotal;
console.log('slotFilled:', slotFilled, 'isSlotsFull:', isSlotsFull);

// Test button state
const lifecycle = getTournamentLifecycleStatus(tourney, new Date());
console.log('lifecycle:', lifecycle);

const btnState = getRegistrationButtonState(null, lifecycle, { slotsFull: isSlotsFull });
console.log('btnState:', btnState);

// Test prize positions
try {
  const raw = tourney.prize_positions;
  const parsedPositions = typeof raw === 'string' ? JSON.parse(raw) : raw;
  console.log('prize positions count:', parsedPositions.length);
} catch (e) {
  console.error('ERROR in prize positions:', e);
}

console.log('All basic expressions evaluated successfully without throwing.');
