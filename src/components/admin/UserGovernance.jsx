import React from 'react'
import { Eye, Trash2, Shield, User, PauseCircle, PlayCircle, Gavel, Search } from 'lucide-react'

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
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">User Governance</h1>
          <p className="mt-1 text-sm text-slate-500">Manage player accounts, roles, and platform access.</p>
        </div>

        <div className="relative w-full sm:max-w-xs shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search tag, email, name..."
            value={userSearchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>
      </div>

      <div className="w-full overflow-x-auto bg-white border border-slate-200 rounded-xl shadow-sm">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase font-bold text-slate-500 tracking-wider">
            <tr>
              <th className="px-6 py-4">Gamer Tag / Name</th>
              <th className="px-6 py-4">Email</th>
              <th className="px-6 py-4">Role</th>
              <th className="px-6 py-4">Tier</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {users.length > 0 ? (
              users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-4">
                      {user.avatar ? (
                        <img
                          src={user.avatar}
                          alt={user.name}
                          className="w-10 h-10 rounded-full object-cover shrink-0 border border-slate-200"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center shrink-0 border border-indigo-100">
                          <User className="w-5 h-5 text-indigo-600" />
                        </div>
                      )}
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900 text-sm">
                          {user.gamerTag && user.gamerTag.startsWith('@') ? user.gamerTag : `@${user.gamerTag || (user.name || 'Anonymous').toLowerCase().replace(/\s+/g, '_')}`}
                        </span>
                        <span className="text-xs text-slate-500">{user.name}</span>
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                    {user.email}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold border ${
                      user.role === 'admin'
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : user.role === 'organiser'
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        : 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}>
                      {user.role}
                    </span>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">
                    {user.tier || 'Amateur'}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
                      user.status === 'Active' || user.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : user.status === 'Held' || user.status === 'HELD'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                    }`}>
                      {user.status || 'Active'}
                    </span>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onNavigate && onNavigate('profile', user)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="View Profile"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {(user.role === 'organiser' || user.role === 'verified organizer') && (
                        <>
                          <button
                            onClick={() => onToggleStatus && onToggleStatus(user)}
                            className={`p-2 rounded-lg transition-colors ${
                              user.status === 'Held'
                                ? 'text-amber-500 hover:text-emerald-600 hover:bg-emerald-50'
                                : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                            }`}
                            title={user.status === 'Held' ? 'Resume hosting privilege' : 'Hold hosting privilege'}
                          >
                            {user.status === 'Held' ? <PlayCircle className="w-4 h-4" /> : <PauseCircle className="w-4 h-4" />}
                          </button>

                          <button
                            onClick={() => onRevokeRole && onRevokeRole(user)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Revoke organizer role"
                          >
                            <Gavel className="w-4 h-4" />
                          </button>
                        </>
                      )}

                      {user.role !== 'admin' && (
                        <button
                          onClick={() => onDelete && onDelete(user.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
                <td colSpan="6" className="text-center py-12 text-slate-400 text-sm">
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
