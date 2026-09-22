import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUser } from '../UserContext.jsx';
import { emailConfig } from '../config/email.js';
function HelpSupport({ onNavigate }) {
  const { currentUser, signOut } = useUser();

  const [openFaqId, setOpenFaqId] = useState(null);
  const [ticketCategory, setTicketCategory] = useState('Payment Issue');
  const [ticketMessage, setTicketMessage] = useState('');
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [ticketId, setTicketId] = useState('');

  const handleSignOut = async () => {
    await signOut();
    onNavigate && onNavigate('home');
  };

  const faqs = [
    {
      id: 'payments-secure',
      question: 'Are the payments secure?',
      answer: 'Yes. We process all transactions directly via secure UPI channels. We strictly use UPI for entries and payouts, and we do not process, collect, or store any sensitive credit/debit card details or bank credentials on our servers.'
    },
    {
      id: 'refunds-work',
      question: 'How do refunds work and how long do they take?',
      answer: 'If eligible (such as a cancellation 24 hours prior to a tournament or an organizer cancellation), approved refunds will be processed and credited back to your original payment method (UPI) within 5 to 7 business days.'
    },
    {
      id: 'prize-pools-distribution',
      question: 'How do I get my prize pool winnings?',
      answer: 'Prize pools are distributed securely via the UPI ID you have linked to your profile upon the successful and verified completion of the tournament.'
    },
    {
      id: 'become-organizer-requirements',
      question: 'What is required to become an organizer?',
      answer: 'Organizers must complete a KYC process, which includes submitting a Government ID proof and location data for verification.'
    }
  ];

  const toggleFaq = (id) => {
    setOpenFaqId(openFaqId === id ? null : id);
  };

  const generateTicketId = () => {
    const num = Math.floor(10000 + Math.random() * 90000);
    return `#MD-${num}`;
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (!ticketCategory || !ticketMessage) return;
    const id = generateTicketId();
    setTicketId(id);
    setIsSubmitted(true);
  };

  const handleNewTicket = () => {
    setIsSubmitted(false);
    setTicketId('');
    setTicketCategory('Payment Issue');
    setTicketMessage('');
    setScreenshotFile(null);
  };

  const trustMetrics = [
    { label: 'Avg Response Time', value: '< 12 Mins', desc: 'Fast, verified resolutions.', icon: 'bolt' },
    { label: 'Support Experts', desc: 'Active certified arbiters.', value: '24 / 7', icon: 'support_agent' },
    { label: 'Data Encryption', desc: 'TLS 1.3 socket paths.', value: '100% Safe', icon: 'encrypted' },
    { label: 'Organizer Support', desc: 'Direct host hotline.', value: 'Priority', icon: 'verified_user' }
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 relative selection:bg-blue-200 selection:text-blue-900">
      {/* Subtle grid background */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `
              linear-gradient(to right, #3B82F6 1px, transparent 1px),
              linear-gradient(to bottom, #3B82F6 1px, transparent 1px)
            `,
            backgroundSize: '48px 48px'
          }}
        />
        <div className="absolute top-0 left-1/3 w-[400px] h-[400px] bg-blue-400/8 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-[300px] h-[300px] bg-indigo-400/6 blur-[80px] rounded-full pointer-events-none" />
      </div>

      <main className="w-full max-w-4xl mx-auto px-4 pt-24 sm:pt-32 pb-12 sm:pb-20 relative z-10">

        {/* Hero */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4 pb-8 mb-8 border-b border-slate-200"
        >
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
            Help &amp; Support
          </h1>
          <p className="text-sm sm:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Have questions about payments, tournaments, or your account? Browse our FAQs or submit a support ticket.
          </p>
        </motion.section>

        {/* FAQ Section */}
        <section className="space-y-6 mb-14">
          <div className="space-y-1 text-center sm:text-left">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">Frequently Asked Questions</h2>
            <p className="text-sm text-slate-500">Quick answers to the most common queries.</p>
          </div>

          <div className="space-y-3 max-w-3xl mx-auto">
            {faqs.map((faq) => {
              const isOpen = openFaqId === faq.id;
              return (
                <div
                  key={faq.id}
                  className={`bg-white rounded-xl border shadow-sm transition-all duration-200 overflow-hidden ${
                    isOpen ? 'border-blue-200 shadow-md' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <button
                    onClick={() => toggleFaq(faq.id)}
                    className="w-full flex items-center justify-between p-5 sm:p-6 text-left focus:outline-none"
                  >
                    <span className="text-sm sm:text-base font-semibold text-slate-900 pr-4 leading-snug">{faq.question}</span>
                    <motion.span
                      animate={{ rotate: isOpen ? 180 : 0 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className="material-symbols-outlined text-blue-500 text-xl shrink-0"
                    >
                      expand_more
                    </motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.04, 0.62, 0.23, 0.98] }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-slate-100 px-5 sm:px-6 pb-5 sm:pb-6 pt-3.5 text-sm text-slate-600 leading-relaxed">
                          {faq.answer}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </section>

        {/* Trust Metrics */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-14">
          {trustMetrics.map((metric, idx) => (
            <div
              key={idx}
              className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 text-center space-y-2"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-base">{metric.icon}</span>
              </div>
              <div className="space-y-0.5">
                <p className="text-sm sm:text-base font-extrabold text-slate-900">{metric.value}</p>
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">{metric.label}</p>
                <p className="text-[10px] text-slate-500">{metric.desc}</p>
              </div>
            </div>
          ))}
        </section>

        {/* Contact & Ticket Section */}
        <section className="grid grid-cols-1 md:grid-cols-12 gap-8 pt-8 border-t border-slate-200 items-start">

          {/* Contact Channels */}
          <div className="md:col-span-5 space-y-4">
            <div className="space-y-1">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">Contact Channels</h2>
              <p className="text-sm text-slate-500">Reach us through any of these channels.</p>
            </div>

            <div className="space-y-3">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-base">mail</span>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Email</h4>
                  <a href={`mailto:${emailConfig.support}`} className="text-sm text-blue-600 hover:underline font-medium">{emailConfig.support}</a>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-base">forum</span>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Discord</h4>
                  <a href="https://discord.gg/matchdistrict" target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline font-medium">discord.gg/matchdistrict</a>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-base">chat</span>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Lobby Live Chat</h4>
                  <p className="text-sm text-slate-500">Active inside all match interface lobbies.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Ticket Form */}
          <div className="md:col-span-7">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-7 space-y-5">
              <h3 className="text-base sm:text-lg font-bold text-slate-900">Submit a Ticket</h3>

              <AnimatePresence mode="wait">
                {isSubmitted ? (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="space-y-5"
                  >
                    <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-xl text-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                        <span className="material-symbols-outlined text-2xl">check_circle</span>
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-slate-900">Ticket Submitted Successfully</h4>
                        <p className="text-sm text-slate-600">
                          Your reference ID is{' '}
                          <span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">{ticketId}</span>
                        </p>
                        <p className="text-xs text-slate-500">Our support team will reach out to your registered email shortly.</p>
                      </div>
                    </div>
                    <button
                      onClick={handleNewTicket}
                      className="w-full py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold shadow-sm hover:bg-slate-50 transition-all"
                    >
                      Submit Another Ticket
                    </button>
                  </motion.div>
                ) : (
                  <motion.form
                    key="form"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onSubmit={handleFormSubmit}
                    className="space-y-4"
                  >
                    {/* Current User Info (read-only) */}
                    <div className="bg-slate-50 rounded-xl border border-slate-100 p-3.5 space-y-1.5">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Submitting as</p>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold uppercase shrink-0">
                          {currentUser?.name?.charAt(0) || '?'}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{currentUser?.name || 'Player'}</p>
                          <p className="text-xs text-slate-500">{currentUser?.email || ''}</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Issue Category</label>
                      <select
                        value={ticketCategory}
                        onChange={(e) => setTicketCategory(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all appearance-none"
                        style={{ WebkitAppearance: 'none', MozAppearance: 'none', backgroundImage: 'none' }}
                      >
                        <option>Payment Issue</option>
                        <option>Tournament Dispute</option>
                        <option>Account Verification</option>
                        <option>Bug Report</option>
                        <option>Other</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Issue Description</label>
                      <textarea
                        required
                        value={ticketMessage}
                        onChange={(e) => setTicketMessage(e.target.value)}
                        rows="4"
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all placeholder-slate-400"
                        placeholder="Describe your issue in detail..."
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Screenshot <span className="text-slate-400 font-normal normal-case">(optional)</span>
                      </label>
                      <label className="flex items-center gap-3 p-3.5 rounded-xl border border-dashed border-slate-300 bg-white cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all group">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-600 flex items-center justify-center shrink-0 transition-colors">
                          <span className="material-symbols-outlined text-base">image</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 group-hover:text-blue-600 transition-colors">
                            {screenshotFile ? screenshotFile.name : 'Upload a screenshot'}
                          </p>
                          <p className="text-xs text-slate-400">PNG, JPG or WebP accepted</p>
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => setScreenshotFile(e.target.files[0] || null)}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-sm hover:bg-blue-700 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      <span>Submit Ticket</span>
                      <span className="material-symbols-outlined text-base">send</span>
                    </button>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
          </div>

        </section>

      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-200 bg-white py-6 px-4">
        <div className="w-full max-w-6xl mx-auto flex flex-col gap-5">
          <div className="flex justify-center items-center gap-5 border-b border-slate-100 pb-4">
            <button onClick={() => onNavigate && onNavigate('terms-service')} className="text-sm text-slate-500 hover:text-blue-600 transition-colors font-medium">Terms</button>
            <button onClick={() => onNavigate && onNavigate('privacy-policy')} className="text-sm text-slate-500 hover:text-blue-600 transition-colors font-medium">Privacy</button>
            <button onClick={() => onNavigate && onNavigate('help-support')} className="text-sm text-slate-500 hover:text-blue-600 transition-colors font-medium">Support</button>
          </div>
          <div className="flex flex-col items-center justify-center gap-1.5 text-center">
            <button onClick={() => onNavigate && onNavigate('home')} className="text-base font-extrabold text-blue-600 tracking-tight hover:opacity-80 transition-opacity">
              Match District
            </button>
            <p className="text-xs text-slate-400">&copy; {new Date().getFullYear()} MATCH DISTRICT. ALL RIGHTS RESERVED.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default HelpSupport;
