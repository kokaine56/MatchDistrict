import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuthToken } from '../utils/getAuthToken';
import AdminLayout from '../components/admin/AdminLayout';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';

export default function AdminSystemHealth() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ services: [], incidents: [], global_uptime: 100 });
  const [history, setHistory] = useState({});
  const [securityFindings, setSecurityFindings] = useState([]);
  const [activeTab, setActiveTab] = useState('overview'); // overview, incidents, security
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const token = getAuthToken();
      if (!token) return;

      const headers = { Authorization: `Bearer ${token}` };

      // Fetch Overview
      const overviewRes = await fetch('/api/admin/monitoring/overview', { headers });
      if (overviewRes.ok) {
        const overviewData = await overviewRes.json();
        setData(overviewData);
      }

      // Fetch History
      const historyRes = await fetch('/api/admin/monitoring/history', { headers });
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        setHistory(historyData.history);
      }

      // Fetch Security
      const secRes = await fetch('/api/admin/monitoring/security', { headers });
      if (secRes.ok) {
        const secData = await secRes.json();
        setSecurityFindings(secData.findings);
      }
    } catch (err) {
      console.error('Error fetching monitoring data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRunSecurityScan = async () => {
    setScanning(true);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/admin/monitoring/security/scan', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setScanning(false);
    }
  };

  const getStatusColor = (status) => {
    if (status === 'healthy') return 'text-emerald-500 bg-emerald-500/10';
    if (status === 'down') return 'text-rose-500 bg-rose-500/10';
    return 'text-amber-500 bg-amber-500/10';
  };

  const getSystemStatus = () => {
    if (data.incidents.length === 0) return { label: 'All Systems Operational', color: 'text-emerald-500' };
    const hasCritical = data.incidents.some(i => i.severity === 'critical');
    if (hasCritical) return { label: 'Service Outage Detected', color: 'text-rose-500' };
    return { label: 'Some Systems Degraded', color: 'text-amber-500' };
  };

  const sysStatus = getSystemStatus();

  return (
    <AdminLayout activeTab="monitoring">
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 w-full h-full overflow-y-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">System Health</h1>
            <p className="text-sm text-slate-500 dark:text-white/40">Monitoring application infrastructure and security.</p>
          </div>
          <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-lg shrink-0">
            {['overview', 'incidents', 'security'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize ${activeTab === tab ? 'bg-white dark:bg-[#1E293B] text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-white/40 hover:text-slate-900 dark:hover:text-white'}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="animate-pulse space-y-6">
            <div className="h-32 bg-slate-200 dark:bg-white/5 rounded-2xl w-full"></div>
            <div className="h-64 bg-slate-200 dark:bg-white/5 rounded-2xl w-full"></div>
          </div>
        ) : (
          <>
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Top Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white dark:bg-[#0F1729] rounded-2xl border border-slate-200 dark:border-outline-variant/20 p-5 shadow-sm">
                    <p className="text-xs font-semibold text-slate-500 dark:text-white/40 uppercase tracking-wider mb-2">System Status</p>
                    <div className={`text-lg font-bold tracking-tight ${sysStatus.color} flex items-center gap-2`}>
                      <span className="material-symbols-outlined text-xl">{sysStatus.label.includes('Operational') ? 'check_circle' : 'warning'}</span>
                      {sysStatus.label}
                    </div>
                  </div>
                  <div className="bg-white dark:bg-[#0F1729] rounded-2xl border border-slate-200 dark:border-outline-variant/20 p-5 shadow-sm">
                    <p className="text-xs font-semibold text-slate-500 dark:text-white/40 uppercase tracking-wider mb-2">30-Day Uptime</p>
                    <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{data.global_uptime}%</div>
                  </div>
                  <div className="bg-white dark:bg-[#0F1729] rounded-2xl border border-slate-200 dark:border-outline-variant/20 p-5 shadow-sm">
                    <p className="text-xs font-semibold text-slate-500 dark:text-white/40 uppercase tracking-wider mb-2">Active Incidents</p>
                    <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{data.incidents.length}</div>
                  </div>
                  <div className="bg-white dark:bg-[#0F1729] rounded-2xl border border-slate-200 dark:border-outline-variant/20 p-5 shadow-sm">
                    <p className="text-xs font-semibold text-slate-500 dark:text-white/40 uppercase tracking-wider mb-2">Total Services</p>
                    <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{data.services.length}</div>
                  </div>
                </div>

                {/* Service Cards (Responsive) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {data.services.map(srv => (
                    <div key={srv.id} className="bg-white dark:bg-[#0F1729] rounded-2xl border border-slate-200 dark:border-outline-variant/20 p-5 shadow-sm">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="font-semibold text-slate-900 dark:text-white">{srv.name}</h3>
                          <p className="text-xs text-slate-500 dark:text-white/40">{srv.description}</p>
                        </div>
                        <div className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase ${getStatusColor(srv.status)}`}>
                          {srv.status}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                        <div className="bg-slate-50 dark:bg-white/5 rounded-lg p-2">
                          <p className="text-[10px] text-slate-500 dark:text-white/40 uppercase font-semibold">Latency</p>
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{srv.latency != null ? `${srv.latency}ms` : '--'}</p>
                        </div>
                        <div className="bg-slate-50 dark:bg-white/5 rounded-lg p-2">
                          <p className="text-[10px] text-slate-500 dark:text-white/40 uppercase font-semibold">Uptime (30d)</p>
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{srv.uptime_30d}%</p>
                        </div>
                        <div className="bg-slate-50 dark:bg-white/5 rounded-lg p-2">
                          <p className="text-[10px] text-slate-500 dark:text-white/40 uppercase font-semibold">Type</p>
                          <p className="text-sm font-bold text-slate-900 dark:text-white capitalize">{srv.type.replace('_', ' ')}</p>
                        </div>
                      </div>

                      {/* Sparkline Chart */}
                      <div className="h-24 w-full">
                        {history[srv.id] && history[srv.id].length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={history[srv.id]}>
                              <Tooltip 
                                contentStyle={{ backgroundColor: '#1E293B', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                                labelFormatter={t => new Date(t).toLocaleTimeString()}
                                formatter={v => [`${v}ms`, 'Latency']}
                              />
                              <Line type="monotone" dataKey="latency" stroke="#6366F1" strokeWidth={2} dot={false} isAnimationActive={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">No data for 24h</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'incidents' && (
              <div className="bg-white dark:bg-[#0F1729] rounded-2xl border border-slate-200 dark:border-outline-variant/20 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-200 dark:border-outline-variant/20">
                  <h3 className="font-semibold text-slate-900 dark:text-white">Active Incidents</h3>
                </div>
                {data.incidents.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 dark:text-white/40">
                    <span className="material-symbols-outlined text-4xl mb-2 text-emerald-500">check_circle</span>
                    <p>No active incidents.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-outline-variant/20">
                    {data.incidents.map(inc => (
                      <div key={inc.id} className="p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${inc.severity === 'critical' ? 'bg-rose-500/10 text-rose-500' : 'bg-amber-500/10 text-amber-500'}`}>
                              {inc.severity}
                            </span>
                            <h4 className="font-semibold text-slate-900 dark:text-white">{inc.service_name} Outage</h4>
                          </div>
                          <p className="text-sm text-slate-600 dark:text-white/60">{inc.reason}</p>
                          <p className="text-xs text-slate-400 mt-1">Started: {new Date(inc.started_at).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-[#0F1729] rounded-2xl border border-slate-200 dark:border-outline-variant/20 p-5 shadow-sm">
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white">Security & Secret Exposure</h3>
                    <p className="text-sm text-slate-500 dark:text-white/40">Automated scanning for leaked credentials and weak configs.</p>
                  </div>
                  <button 
                    onClick={handleRunSecurityScan} 
                    disabled={scanning}
                    className="flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 shrink-0"
                  >
                    {scanning ? <span className="material-symbols-outlined animate-spin text-sm">sync</span> : <span className="material-symbols-outlined text-sm">security</span>}
                    {scanning ? 'Scanning...' : 'Run Scan Now'}
                  </button>
                </div>

                <div className="bg-white dark:bg-[#0F1729] rounded-2xl border border-slate-200 dark:border-outline-variant/20 shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-slate-200 dark:border-outline-variant/20 flex justify-between items-center">
                    <h3 className="font-semibold text-slate-900 dark:text-white">Latest Findings</h3>
                    <span className="text-xs bg-slate-100 dark:bg-white/10 px-2 py-1 rounded text-slate-600 dark:text-white/60 font-medium">Total: {securityFindings.length}</span>
                  </div>
                  
                  {securityFindings.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 dark:text-white/40">
                      <span className="material-symbols-outlined text-4xl mb-2 text-emerald-500">verified_user</span>
                      <p>No security findings detected. Your configuration is clean.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-outline-variant/20 max-h-[600px] overflow-y-auto custom-scrollbar">
                      {securityFindings.map(finding => (
                        <div key={finding.id} className="p-4 sm:p-5 flex flex-col sm:flex-row gap-4 justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${finding.severity === 'critical' ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white'}`}>
                                {finding.severity}
                              </span>
                              <span className="text-xs font-semibold text-slate-500 dark:text-white/40 uppercase tracking-wider">{finding.type.replace('_', ' ')}</span>
                            </div>
                            <h4 className="font-semibold text-slate-900 dark:text-white text-sm mt-2">{finding.description}</h4>
                            <p className="text-xs text-slate-500 dark:text-white/40 mt-1">Component: {finding.service} | Detected: {new Date(finding.detected_at).toLocaleString()}</p>
                          </div>
                          <div className="shrink-0 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded text-[10px] font-semibold uppercase text-slate-600 dark:text-white/60">
                            {finding.status}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
