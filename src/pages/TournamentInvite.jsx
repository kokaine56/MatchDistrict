import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Users, Shield, Loader2, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import Header from "../components/Header.jsx";
import LoadingScreen from "../components/LoadingScreen.jsx";
import { getAuthToken } from "../utils/getAuthToken.js";

export default function TournamentInvite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, isLoading: authLoading } = useCurrentUser();
  
  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("active");
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    fetchInvitation();
  }, [token]);

  const fetchInvitation = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/invitation/${token}`);
      const data = await res.json();
      
      if (!data.success) {
        setStatus(data.status || 'invalid');
        throw new Error(data.message || 'Invitation not found');
      }
      
      setInvitation(data.invitation);
      // Auto-select if only 1 unlinked slot
      const slots = data.invitation?.unlinkedSlots || [];
      if (slots.length === 1) {
        setSelectedSlot(slots[0].slot);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginRedirect = () => {
    try {
      sessionStorage.setItem('md_invite_redirect', location.pathname);
    } catch { /* storage fallback */ }
    navigate(`/auth?redirect=${encodeURIComponent(location.pathname)}`);
  };

  const handleJoin = async () => {
    const unlinked = invitation?.unlinkedSlots || [];
    if (unlinked.length > 0 && selectedSlot === null) {
      setError("Please select which roster slot (IGN) is yours.");
      return;
    }

    setIsJoining(true);
    setError(null);
    try {
      const authToken = await getAuthToken();
      const res = await fetch(`/api/invitation/${token}/join`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roster_slot: selectedSlot !== null ? selectedSlot : undefined,
        }),
      });
      const data = await res.json();
      
      if (!data.success) {
        if (data.code === 'SLOT_ALREADY_CLAIMED') {
          // Refresh invitation to update slot state
          fetchInvitation();
          throw new Error('That roster slot was just claimed by a teammate. Please choose another.');
        }
        if (data.code === 'ALREADY_IN_TEAM') {
          throw new Error('You are already an active member of this team.');
        }
        throw new Error(data.message || 'Failed to join team');
      }
      
      // Success
      navigate(`/tournaments/${invitation.tournamentId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsJoining(false);
    }
  };

  if (authLoading || loading) {
    return <LoadingScreen message="Resolving invitation..." />;
  }

  const unlinkedSlots = invitation?.unlinkedSlots || [];

  return (
    <div className="min-h-screen bg-[#07080C] text-slate-200 selection:bg-indigo-500/30 font-sans flex flex-col">
      <Header />
      
      <main className="flex-grow flex items-center justify-center p-6 relative">
        {/* Background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg h-96 bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none"></div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#0A0B10] border border-white/10 rounded-3xl p-8 max-w-lg w-full shadow-2xl relative z-10 overflow-hidden"
        >
          {error && status !== 'active' ? (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/20 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="w-8 h-8 text-rose-500" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white mb-2">
                  {status === 'expired' ? 'Invitation Expired' : 
                   status === 'revoked' ? 'Invitation Revoked' : 
                   status === 'full' ? 'Team Full' :
                   status === 'closed' ? 'Tournament Closed' : 
                   'Invalid Invitation'}
                </h2>
                <p className="text-gray-400">{error}</p>
              </div>
              <button
                onClick={() => navigate('/')}
                className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold py-3 px-4 rounded-xl transition-colors"
              >
                Go to Homepage
              </button>
            </div>
          ) : invitation ? (
            <div className="text-center space-y-6">
              <div>
                <span className="inline-block px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold uppercase tracking-wider rounded-lg mb-3">
                  Team Invitation
                </span>
                <h2 className="text-3xl font-black text-white mb-1.5">{invitation.teamName}</h2>
                <p className="text-gray-400 text-sm font-medium">{invitation.tournamentTitle}</p>
              </div>

              <div className="bg-white/5 border border-white/5 rounded-2xl p-4 space-y-3 text-left">
                <div className="flex items-center justify-between text-sm border-b border-white/5 pb-2.5">
                  <span className="text-gray-400 font-medium">Team Leader</span>
                  <span className="text-white font-bold">{invitation.leaderName}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 font-medium">Squad Capacity</span>
                  <div className="flex items-center gap-1.5 font-bold text-white">
                    <Users className="w-4 h-4 text-emerald-400" />
                    {invitation.memberCount} / {invitation.maxMembers}
                  </div>
                </div>
              </div>

              {/* Roster Slot Selection (Claim by IGN only) */}
              {unlinkedSlots.length > 0 && (
                <div className="text-left space-y-2.5 pt-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-400">
                      Claim Your Roster Slot
                    </label>
                    <span className="text-xs text-indigo-400 font-medium">
                      Select your IGN
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {unlinkedSlots.map((s) => {
                      const isSelected = selectedSlot === s.slot;
                      return (
                        <button
                          key={s.slot}
                          type="button"
                          onClick={() => setSelectedSlot(s.slot)}
                          className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                            isSelected
                              ? 'bg-indigo-600/20 border-indigo-500/60 shadow-[0_0_15px_rgba(99,102,241,0.15)] text-white'
                              : 'bg-white/5 border-white/10 hover:border-white/20 text-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                              isSelected ? 'border-indigo-400 bg-indigo-500' : 'border-gray-500'
                            }`}>
                              {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-sm truncate">{s.ign}</div>
                              <div className="text-[11px] text-gray-400">Roster Slot #{s.slot + 1}</div>
                            </div>
                          </div>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                            isSelected ? 'bg-indigo-500/30 text-indigo-200' : 'bg-white/5 text-gray-400'
                          }`}>
                            Available
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    Choose the In-Game Name (IGN) your captain registered for you. Your Match District account will link to this slot.
                  </p>
                </div>
              )}

              {error && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs text-left flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {!currentUser ? (
                <div className="space-y-3 pt-2">
                  <p className="text-xs text-gray-400">You must be logged in to join this squad.</p>
                  <button
                    onClick={handleLoginRedirect}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:shadow-[0_0_30px_rgba(79,70,229,0.5)] flex items-center justify-center gap-2"
                  >
                    Login / Create Account
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="pt-2">
                  <button
                    onClick={handleJoin}
                    disabled={isJoining || (unlinkedSlots.length > 0 && selectedSlot === null)}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isJoining ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                    {isJoining ? 'Joining Squad...' : 'Join Squad'}
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </motion.div>
      </main>
    </div>
  );
}
