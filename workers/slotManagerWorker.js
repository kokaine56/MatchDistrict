// --- SLOT RECONCILIATION MANAGER WORKER DAEMON ---
export async function reconcileTournamentSlots(pool, tournamentId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch tournament details
    const tRes = await client.query('SELECT "slotsTotal" FROM tournaments WHERE id = $1', [tournamentId]);
    if (tRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return;
    }
    const slotsTotal = parseInt(tRes.rows[0].slotsTotal) || 100;

    // 2. Fetch all registrations for this tournament
    const regsRes = await client.query(
      'SELECT id, status, slot_number FROM tournament_registrations WHERE tournament_id = $1 ORDER BY created_at ASC',
      [tournamentId]
    );
    const regs = regsRes.rows;

    const occupiedSlots = new Set();
    const approvedWithoutSlot = [];

    // Map occupied slots for approved or pending registrations
    for (const reg of regs) {
      if (reg.status === 'approved' || reg.status === 'confirmed' || reg.status === 'pending' || reg.status === 'pending_payment' || reg.status === 'VERIFIED_BY_HOST') {
        const slot = parseInt(reg.slot_number);
        if (slot >= 1 && slot <= slotsTotal && !occupiedSlots.has(slot)) {
          occupiedSlots.add(slot);
        } else {
          approvedWithoutSlot.push(reg);
        }
      } else {
        if (reg.slot_number !== null) {
          await client.query('UPDATE tournament_registrations SET slot_number = NULL WHERE id = $1', [reg.id]);
        }
      }
    }

    // Auto-promote waitlisted registrations to pending if slots are available
    const waitlistedRegs = regs.filter(r => r.status === 'waitlisted');
    for (const reg of waitlistedRegs) {
      if (occupiedSlots.size < slotsTotal) {
        reg.status = 'pending';
        approvedWithoutSlot.push(reg);
        await client.query("UPDATE tournament_registrations SET status = 'pending' WHERE id = $1", [reg.id]);
        console.log(`🤖 [SLOT WORKER] Auto-promoted Waitlisted Registration ${reg.id} to Pending due to available slot.`);
      }
    }

    // Auto-allocate slots to approved/pending registrations that don't have one
    let currentSlot = 1;
    for (const reg of approvedWithoutSlot) {
      while (currentSlot <= slotsTotal && occupiedSlots.has(currentSlot)) {
        currentSlot++;
      }
      if (currentSlot <= slotsTotal) {
        await client.query('UPDATE tournament_registrations SET slot_number = $1 WHERE id = $2', [currentSlot, reg.id]);
        occupiedSlots.add(currentSlot);
        console.log(`🤖 [SLOT WORKER] Auto-allocated Slot #${currentSlot} to Approved/Pending Registration ${reg.id}`);
      } else {
        // No slots left, downgrade back to waitlisted
        await client.query('UPDATE tournament_registrations SET status = $1, slot_number = NULL WHERE id = $2', ['waitlisted', reg.id]);
        console.log(`🤖 [SLOT WORKER] No slots left in tournament ${tournamentId}. Downgraded registration ${reg.id} to waitlisted.`);
      }
    }

    // 3. Update the slotsFilled count in tournaments table to match approved + confirmed count
    const approvedCountRes = await client.query(
      "SELECT COUNT(*) FROM tournament_registrations WHERE tournament_id = $1 AND status IN ('approved', 'confirmed')",
      [tournamentId]
    );
    const slotsFilled = parseInt(approvedCountRes.rows[0].count) || 0;
    await client.query('UPDATE tournaments SET "slotsFilled" = $1 WHERE id = $2', [slotsFilled, tournamentId]);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`❌ [SLOT MANAGER WORKER] Error in reconcileTournamentSlots for ${tournamentId}:`, err.message);
  } finally {
    client.release();
  }
}

export function startSlotManagerWorker(pool) {
  console.log('🤖 [SLOT MANAGER WORKER] Slot reconciliation is event-driven (triggered on registration & approval).');
}
