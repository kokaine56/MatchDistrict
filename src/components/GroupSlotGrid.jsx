import RegisteredTeamsList from './RegisteredTeamsList.jsx';

/**
 * GroupSlotGrid (Legacy Adapter)
 * The Live Slot Occupancy Map, district tabs, and slot boxes have been discontinued.
 * This component delegates directly to RegisteredTeamsList for unified public display.
 */
export default function GroupSlotGrid({ tournamentId, slotsData, isGoldTheme = false }) {
  return (
    <RegisteredTeamsList
      tournamentId={tournamentId}
      slotsData={slotsData}
      isGoldTheme={isGoldTheme}
    />
  );
}