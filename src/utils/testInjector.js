import { supabase } from './supabaseClient';

export const injectDummyRegistrations = async (tournamentId, targetSlots = 1000) => {
  try {
    console.log(`Starting injection of ${targetSlots} teams for Tournament: ${tournamentId}`);

    const now = Date.now();
    const dummyData = Array.from({ length: targetSlots }).map((_, index) => {
      const teamIndex = index;
      const leaderIgn = `Leader_T${teamIndex}`;
      return {
        id: `REG-TEST-${now}-${teamIndex}`,
        tournament_id: tournamentId,
        user_id: `leader_${now}_${teamIndex}`,
        team_name: `Squad Alpha ${teamIndex}`,
        captain: leaderIgn,
        members: JSON.stringify([
          { role: 'Leader', ign: leaderIgn, in_game_id: `555${teamIndex}1` },
          { role: 'Member', ign: `Assaulter_T${teamIndex}`, in_game_id: `555${teamIndex}2` },
          { role: 'Member', ign: `Sniper_T${teamIndex}`, in_game_id: `555${teamIndex}3` },
          { role: 'Member', ign: `Support_T${teamIndex}`, in_game_id: `555${teamIndex}4` }
        ]),
        status: 'approved',
        slot_number: teamIndex + 1
      };
    });

    const chunkSize = 500;
    for (let i = 0; i < dummyData.length; i += chunkSize) {
      const chunk = dummyData.slice(i, i + chunkSize);

      const { error } = await supabase
        .from('tournament_registrations')
        .insert(chunk);

      if (error) throw error;
      console.log(`Injected chunk ${i / chunkSize + 1}`);
    }

    console.log('Injection Complete!');
    return { success: true, message: `Successfully injected ${targetSlots} teams.` };

  } catch (error) {
    console.error('Injection Failed:', error);
    return { success: false, error: error.message };
  }
};
