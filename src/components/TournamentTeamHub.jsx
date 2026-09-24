import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Shield, Loader2, AlertCircle, Plus, Hash, Clock, CheckCircle2, QrCode, Share2, Copy, RefreshCw, X, Link } from "lucide-react";
import { getAuthToken } from "../utils/getAuthToken";
import QRCode from "qrcode";
import ParticipantMatchCard from "./ParticipantMatchCard";

export default function TournamentTeamHub({ tournamentId, tournamentTitle, maxTeamSize = 4 }) {
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState(null);
  const [members, setMembers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [error, setError] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState(null);
  
  // Form state
  const [isCreating, setIsCreating] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [createError, setCreateError] = useState(null);

  // Invitation State
  const [invitation, setInvitation] = useState(null);
  const [invLoading, setInvLoading] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [showQrModal, setShowQrModal] = useState(false);
  const [copyStatus, setCopyStatus] = useState(false);

  useEffect(() => {
    fetchMyTeam();
  }, [tournamentId]);

  const fetchMyTeam = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/my-team`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || data.error || 'Failed to fetch team data');
      setTeam(data.team);
      setMembers(data.members || []);
      setAssignments(data.assignments || []);
      if (data.team) {
        fetchInvitation(data.team.id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!team) return;
    setIsVerifying(true);
    setVerifyError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/teams/${team.id}/verify`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || data.error || 'Verification failed');
      
      alert(data.message || 'Verification processed successfully.');
      await fetchMyTeam();
    } catch (err) {
      setVerifyError(err.message);
    } finally {
      setIsVerifying(false);
    }
  };

  const fetchInvitation = async (teamId) => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/teams/${teamId}/invitation`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.invitation) {
        setInvitation(data.invitation);
      } else {
        setInvitation(null);
      }
    } catch (err) {
      console.error("Failed to fetch invitation", err);
    }
  };

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    setCreateError(null);
    if (!teamName.trim()) {
      setCreateError("Team name is required.");
      return;
    }
    
    setIsCreating(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/teams`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ teamName })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || data.error || 'Failed to create team');
      
      await fetchMyTeam();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleGenerateInvite = async () => {
    if (!team) return;
    setInvLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/teams/${team.id}/invitation`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || data.error);
      
      setInvitation({ token: data.token, expires_at: data.expiresAt, status: 'active' });
    } catch (err) {
      alert("Error generating invitation: " + err.message);
    } finally {
      setInvLoading(false);
    }
  };

  const handleRevokeInvite = async () => {
    if (!team || !confirm("Are you sure you want to revoke this invitation?")) return;
    setInvLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/teams/${team.id}/invitation/revoke`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || data.error);
      
      setInvitation(null);
    } catch (err) {
      alert("Error revoking invitation: " + err.message);
    } finally {
      setInvLoading(false);
    }
  };

  const getInviteLink = () => {
    if (!invitation) return "";
    return `${window.location.origin}/tournament/invite/${invitation.token}`;
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(getInviteLink());
    setCopyStatus(true);
    setTimeout(() => setCopyStatus(false), 2000);
  };

  const handleShare = async () => {
    const link = getInviteLink();
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join my team on Match District`,
          text: `Join my Match District team for ${tournamentTitle}. Team: ${team.team_name}`,
          url: link
        });
      } catch (err) {
        console.error("Share failed", err);
      }
    } else {
      handleCopyLink();
    }
  };

  const handleShowQR = async () => {
    try {
      const url = await QRCode.toDataURL(getInviteLink(), {
        width: 300,
        margin: 2,
        color: { dark: '#0A0B10', light: '#FFFFFF' }
      });
      setQrCodeUrl(url);
      setShowQrModal(true);
    } catch (err) {
      console.error(err);
      alert("Could not generate QR code");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-6 rounded-2xl flex items-start gap-4">
        <AlertCircle className="w-6 h-6 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-bold text-rose-500 text-lg mb-1">Failed to load team data</h3>
          <p>{error}</p>
          <button 
            onClick={fetchMyTeam}
            className="mt-4 px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-lg transition-colors font-medium text-sm"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // --- STATE 1: CREATE TEAM FORM ---
  if (!team) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="bg-[#0A0B10] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
          <div className="p-6 border-b border-white/10 bg-white/5">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-400" />
              Create Tournament Team
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              You are eligible to participate in <strong>{tournamentTitle}</strong>. 
              Create your team to get started. You will automatically become the Team Leader.
            </p>
          </div>
          
          <form onSubmit={handleCreateTeam} className="p-6 space-y-6">
            {createError && (
              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl flex items-start gap-3 text-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p>{createError}</p>
              </div>
            )}
            
            <div>
              <label htmlFor="teamName" className="block text-sm font-semibold text-gray-300 mb-2">
                Team Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Hash className="w-5 h-5 text-gray-500" />
                </div>
                <input
                  id="teamName"
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g. Nexus Alpha"
                  className="w-full bg-black/40 border border-white/10 text-white placeholder-gray-500 rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  maxLength={20}
                  minLength={3}
                  disabled={isCreating}
                  required
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">Between 3 and 20 characters. Must be unique for this tournament.</p>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isCreating || !teamName.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:shadow-[0_0_30px_rgba(79,70,229,0.5)] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Creating Team...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    Create Team
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // --- STATE 2: TEAM DASHBOARD ---
  const isLeader = team.role === 'leader';
  
  return (
    <>
      <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header Card */}
      <div className="bg-[#0A0B10] border border-white/10 rounded-2xl p-6 relative overflow-hidden">
        {/* Decorative background element */}
        <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
          <Shield className="w-64 h-64 text-indigo-500" />
        </div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {team.status.replace('_', ' ')}
              </span>
              <span className="text-sm font-mono text-gray-500">ID: {team.id.split('_')[1]}</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-1">
              {team.team_name}
            </h1>
            <p className="text-indigo-400 font-medium">{tournamentTitle}</p>
          </div>
          
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center min-w-[120px]">
            <Users className="w-6 h-6 text-gray-400 mb-2" />
            <div className="text-2xl font-black text-white">
              {Math.max(1, members.length)} <span className="text-gray-500 text-lg">/ {maxTeamSize}</span>
            </div>
            <div className="text-xs text-gray-500 font-semibold uppercase mt-1">Members</div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Roster Section */}
        <div className="lg:col-span-2 space-y-6 self-start">
          {team.status === 'members_complete' && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5 flex items-start gap-4">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-emerald-400 font-bold text-lg mb-1">TEAM COMPLETE</h3>
                <p className="text-emerald-500/80 text-sm">
                  All {maxTeamSize} / {maxTeamSize} members have joined. Your team is now ready for the next verification and tournament allocation stage.
                </p>
              </div>
            </div>
          )}

          <div className="bg-[#0A0B10] border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-white/10 bg-white/5 flex items-center justify-between">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-400" />
                Team Roster
              </h3>
            </div>
            <div className="p-2">
              {members.length > 0 ? (
                members.map((member, idx) => (
                  <div key={member.id} className={`flex items-center justify-between p-4 hover:bg-white/5 rounded-xl transition-colors ${idx > 0 ? 'border-t border-white/5' : ''}`}>
                    <div className="flex items-center gap-4">
                      {member.avatar ? (
                        <img src={member.avatar} alt={member.name} className="w-10 h-10 rounded-full object-cover border border-white/10" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold">
                          {member.name ? member.name.charAt(0).toUpperCase() : '?'}
                        </div>
                      )}
                      <div>
                        <p className="font-bold text-white">{member.name || 'Unknown User'}</p>
                        <p className="text-xs text-gray-500">Joined {new Date(member.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 text-xs font-bold rounded ${member.role === 'leader' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-white/5 text-gray-300 border border-white/10'}`}>
                        {member.role === 'leader' ? 'LEADER' : 'MEMBER'}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-between p-4 hover:bg-white/5 rounded-xl transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold">
                      You
                    </div>
                    <div>
                      <p className="font-bold text-white">You</p>
                      <p className="text-xs text-gray-500">Joined {new Date(team.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-bold rounded">
                      LEADER
                    </span>
                  </div>
                </div>
              )}
              
              {/* Empty Slots */}
              {Array.from({ length: Math.max(0, maxTeamSize - Math.max(1, members.length)) }).map((_, idx) => (
                <div key={`empty-${idx}`} className="flex items-center gap-4 p-4 opacity-50 border-t border-white/5">
                  <div className="w-10 h-10 rounded-full bg-white/5 border border-dashed border-white/20 flex items-center justify-center">
                    <Plus className="w-4 h-4 text-gray-500" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-400">Empty Slot</p>
                    <p className="text-xs text-gray-600">Waiting for teammate...</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Management Section (Phase 5 & 7) */}
        <div className="lg:col-span-1 space-y-6">
          {team.status === 'allocated' && assignments.length > 0 ? (
            <div className="bg-[#0A0B10] border border-white/10 rounded-2xl overflow-hidden self-start">
              <div className="p-5 border-b border-white/10 bg-white/5">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  Tournament Schedule
                </h3>
              </div>
              <div className="p-4 space-y-4 bg-transparent border-none">
                {assignments.map((asn) => (
                  <ParticipantMatchCard
                    key={asn.id}
                    tournamentId={tournamentId}
                    teamId={team.id}
matchDetails={{
                      match_id: asn.match_id,
                      match_number: asn.match_number,
                      round_number: asn.round_number,
                      round_name: asn.round_name,
                      day_number: asn.day_number,
                      group_name: asn.group_name,
                      room_number: asn.room_number,
                      date: asn.day_date,
                      start_time: asn.start_time
                    }}
                  />
                ))}
              </div>
            </div>
          ) : team.status === 'members_complete' ? (
            <div className="bg-[#0A0B10] border border-indigo-500/30 rounded-2xl overflow-hidden self-start shadow-[0_0_15px_rgba(79,70,229,0.1)]">
              <div className="p-5 border-b border-white/10 bg-white/5">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-indigo-400" />
                  Team Verification
                </h3>
              </div>
              <div className="p-5 space-y-4 text-center">
                {verifyError && (
                  <div className="text-rose-400 text-sm bg-rose-500/10 p-3 rounded-lg border border-rose-500/20 text-left">
                    {verifyError}
                  </div>
                )}
                <p className="text-sm text-gray-400">
                  Your team has all required members. You can now verify your team to enter the automatic tournament allocation process.
                </p>
                {isLeader ? (
                  <button
                    onClick={handleVerify}
                    disabled={isVerifying}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(79,70,229,0.3)] disabled:opacity-50"
                  >
                    {isVerifying ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                    {isVerifying ? 'Verifying...' : 'Verify Team & Allocate'}
                  </button>
                ) : (
                  <p className="text-xs text-amber-500 bg-amber-500/10 py-2 rounded">Waiting for Leader to Verify</p>
                )}
              </div>
            </div>
          ) : team.status === 'allocation_pending' ? (
             <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5 text-center">
               <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
               <h3 className="font-bold text-amber-500 mb-1">Allocation Pending</h3>
               <p className="text-xs text-amber-500/80">
                 Your team is verified, but there are currently no available tournament roadmap slots. Please wait for the organizer to expand capacity.
               </p>
             </div>
          ) : (
            <div className="bg-[#0A0B10] border border-white/10 rounded-2xl overflow-hidden self-start">
              <div className="p-5 border-b border-white/10 bg-white/5">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <Link className="w-5 h-5 text-indigo-400" />
                  Invite Teammates
                </h3>
              </div>
          <div className="p-5 space-y-4">
            {!isLeader ? (
              <div className="text-sm text-gray-400 text-center py-4">
                Only the team leader can generate and manage invitations.
              </div>
            ) : invLoading ? (
              <div className="flex items-center justify-center p-6">
                <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
              </div>
            ) : !invitation ? (
              <div className="text-center py-4 space-y-4">
                <p className="text-sm text-gray-400">
                  Generate a secure invitation link to share with your teammates.
                </p>
                <button
                  onClick={handleGenerateInvite}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 px-4 rounded-xl transition-all shadow-[0_0_15px_rgba(79,70,229,0.3)] flex items-center justify-center gap-2 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Generate Invitation
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></span>
                    <span className="font-medium text-emerald-400">Active Invitation</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleCopyLink}
                    className="flex flex-col items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white p-3 rounded-xl border border-white/5 transition-colors"
                  >
                    {copyStatus ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5 text-indigo-400" />}
                    <span className="text-xs font-medium">{copyStatus ? 'Copied!' : 'Copy Link'}</span>
                  </button>
                  <button
                    onClick={handleShowQR}
                    className="flex flex-col items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white p-3 rounded-xl border border-white/5 transition-colors"
                  >
                    <QrCode className="w-5 h-5 text-indigo-400" />
                    <span className="text-xs font-medium">Show QR</span>
                  </button>
                  <button
                    onClick={handleShare}
                    className="col-span-2 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white p-2.5 rounded-xl border border-white/5 transition-colors mt-1"
                  >
                    <Share2 className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-medium">Share Invitation</span>
                  </button>
                </div>

                <div className="text-[11px] text-gray-500 text-center bg-black/40 p-2 rounded-lg border border-white/5">
                  Expires: {new Date(invitation.expires_at).toLocaleString()}
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    onClick={handleGenerateInvite}
                    title="Regenerate Invitation"
                    className="flex-1 bg-white/5 hover:bg-white/10 text-white font-medium py-2 px-3 rounded-xl transition-all border border-white/5 flex items-center justify-center gap-1.5 text-xs"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Regenerate
                  </button>
                  <button
                    onClick={handleRevokeInvite}
                    title="Revoke Invitation"
                    className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-medium py-2 px-3 rounded-xl transition-all border border-rose-500/20 flex items-center justify-center gap-1.5 text-xs"
                  >
                    <X className="w-3.5 h-3.5" />
                    Revoke
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        )}
      </div>
      </div>
      </div>

      {/* QR Modal */}
      <AnimatePresence>
        {showQrModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowQrModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl relative"
            >
              <button 
                onClick={() => setShowQrModal(false)}
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="text-center mb-6">
                <h3 className="text-xl font-black text-gray-900 mb-1">{team.team_name}</h3>
                <p className="text-sm text-gray-500 font-medium">{tournamentTitle}</p>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-2xl flex items-center justify-center mb-6">
                <img src={qrCodeUrl} alt="Invitation QR Code" className="w-48 h-48 rounded-xl" />
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={handleShare}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm shadow-lg shadow-indigo-200"
                >
                  <Share2 className="w-4 h-4" />
                  Share
                </button>
                <button
                  onClick={() => { handleCopyLink(); setShowQrModal(false); }}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  <Copy className="w-4 h-4" />
                  Copy
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
