export function getRegistrationPaymentDetails(registration = {}) {
  const payment = registration.payment || {};
  return {
    teamName: registration.team_name || registration.teamName || registration.linked_team_name || '—',
    utr: registration.payment_utr || registration.raw_utr || registration.transaction_id || payment.utr_number || '—',
    proofUrl: registration.payment_proof_url || registration.proof_url || registration.proofImg || registration.screenshot_url || payment.proof_url || null,
    paymentApp: registration.payment_app || registration.ps_payment_app || payment.payment_app || '—',
    amountDue: registration.amount_due ?? registration.amountDue ?? null,
    amountPaid: registration.amount_paid ?? registration.payment_amount_paid ?? payment.amount ?? null,
    submittedAt: registration.payment_submitted_at_ist || registration.submitted_at_ist || registration.payment_submitted_at || registration.submitted_at || registration.created_at || registration.reg_created_at || null,
  };
}

export function formatPaymentSubmittedAt(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).formatToParts(date);
  const fields = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${fields.day} ${fields.month} ${fields.year}, ${fields.hour}:${fields.minute} ${fields.dayPeriod.toUpperCase()} IST`;
}

export function RegistrationPaymentDetails({ registration, mode = 'table', onOpenProof }) {
  const details = getRegistrationPaymentDetails(registration);
  const submittedAt = registration.payment_submitted_at_ist || formatPaymentSubmittedAt(details.submittedAt);

  if (mode === 'queue-card') {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-surface-variant/25 text-xs">
          <div><span className="text-[10px] text-on-surface-variant/70 block">Due vs Paid</span><div className="mt-0.5 flex items-center gap-1.5 flex-wrap"><span className="font-semibold text-on-surface-variant">Due: {details.amountDue != null ? `₹${details.amountDue}` : 'Not recorded'}</span><span>•</span><span className="font-bold text-on-background">Paid: {details.amountPaid != null ? `₹${details.amountPaid}` : '₹0'}</span></div></div>
          <div><span className="text-[10px] text-on-surface-variant/70 block">UTR Reference</span><span className="font-mono text-xs font-bold text-on-background break-all">{details.utr}</span></div>
        </div>
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-outline-variant/15 text-xs">
          <span className="text-[11px] text-on-surface-variant font-mono">{submittedAt}</span>
          {details.proofUrl ? <button type="button" onClick={() => onOpenProof?.(details.proofUrl)} className="rounded-full px-2.5 py-1 text-[11px] font-bold bg-surface-variant/40 hover:bg-surface-variant text-primary border border-outline-variant/30">View Proof</button> : <span className="text-[11px] text-on-surface-variant/50 italic">No proof attached</span>}
        </div>
      </div>
    );
  }

  if (mode === 'table') {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-wider text-slate-400 dark:text-white/30 w-[68px] shrink-0">Amount</span>
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            {details.amountPaid != null ? `₹${details.amountPaid}` : details.amountDue != null ? `₹${details.amountDue}` : '—'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-wider text-slate-400 dark:text-white/30 w-[68px] shrink-0">UTR</span>
          <span className="text-[10px] font-mono text-slate-800 dark:text-white/80 select-all break-all">{details.utr}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-wider text-blue-600 dark:text-blue-400 w-[68px] shrink-0">Proof</span>
          {details.proofUrl ? (
            <button type="button" onClick={() => onOpenProof?.(details.proofUrl)} className="text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline">
              View Screenshot
            </button>
          ) : <span className="text-[10px] text-slate-500 dark:text-white/40">No proof attached</span>}
        </div>
        <div className="text-[10px] text-slate-500 dark:text-white/40">{submittedAt}</div>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-xs bg-surface-variant/20 p-3 rounded-xl">
      <div className="flex justify-between gap-3"><span className="text-on-surface-variant">Team Name:</span><strong className="text-on-background text-right break-words">{details.teamName}</strong></div>
      <div className="flex justify-between gap-3"><span className="text-on-surface-variant">UTR / Reference:</span><strong className="font-mono text-on-background text-right break-all">{details.utr}</strong></div>
      <div className="flex justify-between gap-3"><span className="text-on-surface-variant">Payment App:</span><strong className="text-on-background text-right">{details.paymentApp}</strong></div>
      <div className="flex justify-between gap-3"><span className="text-on-surface-variant">Amount Due:</span><strong className="text-on-background">{details.amountDue != null ? `₹${details.amountDue}` : 'Not recorded'}</strong></div>
      <div className="flex justify-between gap-3"><span className="text-on-surface-variant">Amount Paid:</span><strong className="text-on-background">{details.amountPaid != null ? `₹${details.amountPaid}` : '₹0'}</strong></div>
      <div className="flex justify-between gap-3"><span className="text-on-surface-variant">Submitted At (IST):</span><strong className="font-mono text-on-background text-right">{submittedAt || '—'}</strong></div>
    </div>
  );
}

export function PaymentProofBox({ registration, onOpenProof }) {
  const { proofUrl } = getRegistrationPaymentDetails(registration);
  return (
    <div className="space-y-2">
      <span className="text-xs font-bold text-on-surface-variant block uppercase tracking-wider">Payment Screenshot Proof</span>
      {proofUrl ? (
        <button type="button" onClick={() => onOpenProof?.(proofUrl)} className="relative group w-full rounded-xl overflow-hidden border border-outline-variant/20 bg-black/40 max-h-[300px] flex items-center justify-center cursor-zoom-in">
          <img src={proofUrl} alt="Payment screenshot proof" className="w-full object-contain max-h-[300px] group-hover:scale-[1.02] transition-transform duration-200" />
          <span className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1.5">Open screenshot</span>
        </button>
      ) : <div className="rounded-xl border border-dashed border-outline-variant/30 p-8 text-center text-on-surface-variant/50 text-xs">No screenshot proof attached.</div>}
    </div>
  );
}
