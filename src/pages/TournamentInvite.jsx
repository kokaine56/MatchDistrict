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
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginRedirect = () => {
    // Preserve the invite URL so user returns here after login
    navigate(`/auth?redirect=${encodeURIComponent(location.pathname)}`);
  };

  const [isJoining, setIsJoining] = useState(false);

  const handleJoin = async () => {
    setIsJoining(true);
    setError(null);
    try {
      const authToken = await getAuthToken();
      const res = await fetch(`/api/invitation/${token}/join`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      const data = await res.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to join team');
      }
      
      // Success
      alert(data.message || "Successfully joined the team!");
      navigate(`/tournaments/${invitation.tournamentId}`);
    } catch (err) {
      setError(err.message);
      setStatus('error');
    } finally {
      setIsJoining(false);
    }
  };

  if (authLoading || loading) {
    return <LoadingScreen message="Resolving invitation..." />;
  }

  return (
    <div className="min-h-screen bg-[#07080C] text-slate-200 selection:bg-indigo-500/30 font-sans flex flex-col">
      <Header />
      
      <main className="flex-grow flex items-center justify-center p-6 relative">
        {/* Background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg h-96 bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none"></div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#0A0B10] border border-white/10 rounded-3xl p-8 max-w-md w-full shadow-2xl relative z-10 overflow-hidden"
        >
          {error ? (
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
            <div className="text-center space-y-8">
              <div>
                <span className="inline-block px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold uppercase tracking-wider rounded-lg mb-4">
                  Team Invitation
                </span>
                <h2 className="text-3xl font-black text-white mb-2">{invitation.teamName}</h2>
                <p className="text-gray-400 font-medium">{invitation.tournamentTitle}</p>
              </div>

              <div className="bg-white/5 border border-white/5 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between text-sm border-b border-white/5 pb-3">
                  <span className="text-gray-500 font-medium">Team Leader</span>
                  <span className="text-white font-bold">{invitation.leaderName}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 font-medium">Available Capacity</span>
                  <div className="flex items-center gap-1.5 font-bold text-white">
                    <Users className="w-4 h-4 text-emerald-400" />
                    {invitation.memberCount} / {invitation.maxMembers}
                  </div>
                </div>
              </div>

              {!currentUser ? (
                <div className="space-y-4">
                  <p className="text-sm text-gray-400">You must be logged in to join this team.</p>
                  <button
                    onClick={handleLoginRedirect}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:shadow-[0_0_30px_rgba(79,70,229,0.5)] flex items-center justify-center gap-2"
                  >
                    Login / Create Account
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleJoin}
                  disabled={isJoining}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isJoining ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                  {isJoining ? 'Joining...' : 'Join Team'}
                </button>
              )}
            </div>
          ) : null}
        </motion.div>
      </main>
    </div>
  );
}
