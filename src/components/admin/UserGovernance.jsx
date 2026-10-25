import React from 'react'
import { Eye, Trash2, User, PauseCircle, PlayCircle, Gavel, Search } from 'lucide-react'

export const UserGovernance = ({
  users = [],
  userSearchQuery = '',
  onSearchChange,
  onNavigate,
  onToggleStatus,
  onRevokeRole,
  onDelete
}) => {
  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
      {/* Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-headline-lg text-lg sm:text-2xl font-black text-on-background tracking-tight">
            User Governance
          </h1>
          <p className="font-body-sm text-xs sm:text-sm text-on-surface-variant mt-0.5">
            Manage registered players, roles, verification tiers, and moderation actions.
          </p>
        </div>

        <div className="relative w-full sm:max-w-xs shrink-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/50" />
          <input
            type="text"
            placeholder="Search by name, email, tag..."
            value={userSearchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-surface border border-outline-variant/30 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-on-background placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-2xs"
          />
        </div>
      </div>

      {/* Table Container */}
      <div className="w-full overflow-x-auto bg-surface border border-outline-variant/30 rounded-2xl shadow-sm">
        <table className="w-full text-left border-collapse min-w-[760px]">
          <thead className="bg-surface-variant/40 border-b border-outline-variant/20 text-[11px] uppercase font-bold text-on-surface-variant tracking-wider">
            <tr>
              <th className="px-5 py-3.5">User / District ID</th>
              <th className="px-5 py-3.5">Email</th>
              <th className="px-5 py-3.5">Role</th>
              <th className="px-5 py-3.5">Tier</th>
              <th className="px-5 py-3.5">Status</th>
              <th className="px-5 py-3.5 text-right">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-outline-variant/15 text-xs">
            {users.length > 0 ? (
              users.map((user) => (
                <tr key={user.id} className="hover:bg-surface-variant/20 transition-colors group">
                  {/* Name / Avatar / District ID */}
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      {user.avatar ? (
                        <img
                          src={user.avatar}
                          alt={user.name}
                          className="w-9 h-9 rounded-full object-cover shrink-0 border border-outline-variant/30"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 text-primary">
                          <User className="w-4 h-4" />
                        </div>
                      )}
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-on-background truncate">
                          {user.name || 'Anonymous User'}
                        </span>
                        {user.district_id && (
                          <span className="text-[11px] text-on-surface-variant font-mono">
                            ID: {user.district_id}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Email */}
                  <td className="px-5 py-3.5 whitespace-nowrap text-on-surface-variant font-medium">
                    {user.email || '—'}
                  </td>

                  {/* Role */}
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border ${
                      user.role === 'admin'
                        ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                        : user.role === 'organiser' || user.role === 'verified organizer'
                        ? 'bg-primary/10 text-primary border-primary/20'
                        : 'bg-surface-variant/60 text-on-surface-variant border-outline-variant/30'
                    }`}>
                      {user.role}
                    </span>
                  </td>

                  {/* Tier */}
                  <td className="px-5 py-3.5 whitespace-nowrap text-on-surface-variant font-medium">
                    {user.tier || 'Free'}
                  </td>

                  {/* Status */}
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                      user.status === 'Active' || user.status === 'ACTIVE'
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                        : user.status === 'Held' || user.status === 'HELD'
                        ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                        : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        user.status === 'Active' || user.status === 'ACTIVE' ? 'bg-emerald-500' :
                        user.status === 'Held' || user.status === 'HELD' ? 'bg-amber-500' : 'bg-rose-500'
                      }`} />
                      {user.status || 'Active'}
                    </span>
                  </td>

                  {/* Action Buttons */}
                  <td className="px-5 py-3.5 whitespace-nowrap text-right font-medium">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onNavigate && onNavigate('profile', user)}
                        className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                        title="View Profile"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {(user.role === 'organiser' || user.role === 'verified organizer') && (
                        <>
                          <button
                            onClick={() => onToggleStatus && onToggleStatus(user)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              user.status === 'Held'
                                ? 'text-amber-500 hover:text-emerald-500 hover:bg-emerald-500/10'
                                : 'text-on-surface-variant hover:text-amber-500 hover:bg-amber-500/10'
                            }`}
                            title={user.status === 'Held' ? 'Resume hosting privilege' : 'Hold hosting privilege'}
                          >
                            {user.status === 'Held' ? <PlayCircle className="w-4 h-4" /> : <PauseCircle className="w-4 h-4" />}
                          </button>

                          <button
                            onClick={() => onRevokeRole && onRevokeRole(user)}
                            className="p-1.5 text-on-surface-variant hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                            title="Revoke organizer role"
                          >
                            <Gavel className="w-4 h-4" />
                          </button>
                        </>
                      )}

                      {user.role !== 'admin' && (
                        <button
                          onClick={() => onDelete && onDelete(user.id)}
                          className="p-1.5 text-on-surface-variant hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                          title="Delete user"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" className="text-center py-12 text-on-surface-variant text-xs">
                  No matching users found in roster.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
