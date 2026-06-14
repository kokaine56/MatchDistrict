import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const FIELD_TYPES = [
  { value: 'text', label: 'Text Field' },
  { value: 'textarea', label: 'Text Area' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'radio', label: 'Radio Buttons' },
  { value: 'multiselect', label: 'Multi Select' },
  { value: 'file', label: 'File Upload' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'number', label: 'Number' },
]

export default function FormBuilder({ subscriptionApi, triggerToast, tournaments, tournamentId: initialTournamentId }) {
  const [fields, setFields] = useState([])
  const [selectedTournament, setSelectedTournament] = useState(initialTournamentId || '')
  const [showFieldEditor, setShowFieldEditor] = useState(false)
  const [editingField, setEditingField] = useState(null)
  const [saving, setSaving] = useState(false)
  const [isActive, setIsActive] = useState(true)

  useEffect(() => {
    if (selectedTournament) {
      (async () => {
        const res = await subscriptionApi.getRegistrationForm(selectedTournament)
        if (res.success && res.form) {
          try {
            const schema = typeof res.form.form_schema === 'string' ? JSON.parse(res.form.form_schema) : (res.form.form_schema || [])
            setFields(schema)
            setIsActive(res.form.is_active)
          } catch { setFields([]) }
        }
      })()
    }
  }, [selectedTournament, subscriptionApi])

  const addField = (type) => {
    const newField = {
      id: 'fld_' + Date.now(),
      type,
      label: `New ${type} field`,
      placeholder: '',
      required: false,
      options: ['dropdown', 'radio', 'multiselect'].includes(type) ? ['Option 1', 'Option 2'] : undefined,
      validation: type === 'email' ? 'email' : type === 'phone' ? 'phone' : undefined,
      accept: type === 'file' ? '.jpg,.png,.pdf' : undefined,
    }
    setFields([...fields, newField])
    setEditingField(newField.id)
    setShowFieldEditor(true)
  }

  const updateField = (id, updates) => {
    setFields(fields.map(f => f.id === id ? { ...f, ...updates } : f))
  }

  const removeField = (id) => {
    setFields(fields.filter(f => f.id !== id))
    if (editingField === id) { setEditingField(null); setShowFieldEditor(false) }
  }

  const moveField = (id, direction) => {
    const idx = fields.findIndex(f => f.id === id)
    if (idx === -1) return
    const newFields = [...fields]
    const targetIdx = idx + direction
    if (targetIdx < 0 || targetIdx >= newFields.length) return
    ;[newFields[idx], newFields[targetIdx]] = [newFields[targetIdx], newFields[idx]]
    setFields(newFields)
  }

  const handleSave = async () => {
    if (!selectedTournament) { triggerToast('Select a tournament first'); return }
    setSaving(true)
    try {
      const res = await subscriptionApi.saveRegistrationForm({
        tournamentId: selectedTournament,
        formSchema: fields,
        isActive
      })
      if (res.success) triggerToast('Registration form saved!')
      else triggerToast(res.message || 'Failed to save')
    } catch (e) { triggerToast('Network error') }
    finally { setSaving(false) }
  }

  const currentField = fields.find(f => f.id === editingField)

  return (
    <div className="glass-card p-4 sm:p-6 rounded-[20px] border border-outline-variant/30 bg-surface/40 backdrop-blur-md shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-headline-md text-sm sm:text-base font-bold text-on-background flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-lg">dynamic_form</span>
          Custom Registration Form
        </h3>
        <span className="px-2 py-0.5 bg-amber-500/15 text-amber-400 text-[9px] font-bold uppercase rounded">Pro Feature</span>
      </div>

      <div className="space-y-3 mb-4">
        <select value={selectedTournament} onChange={(e) => setSelectedTournament(e.target.value)}
          className="w-full px-3 py-2 bg-surface-container-highest/40 border border-outline-variant/40 rounded-xl text-xs text-on-surface outline-none focus:border-primary/50">
          <option value="">Select Tournament</option>
          {tournaments.filter(t => t.status !== 'completed').map(t => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>

        {selectedTournament && (
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 accent-primary" />
              <span className="text-[10px] text-on-surface-variant">Use custom form for registration</span>
            </label>
          </div>
        )}
      </div>

      {selectedTournament && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
          {FIELD_TYPES.map(ft => (
            <button key={ft.value} onClick={() => addField(ft.value)}
              className="px-2 py-1.5 bg-surface-container-highest/30 hover:bg-primary/10 border border-outline-variant/30 rounded-lg text-[9px] font-medium text-on-surface-variant hover:text-primary transition-all">
              + {ft.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {fields.length === 0 ? (
            <p className="text-[10px] text-on-surface-variant text-center py-8 border-2 border-dashed border-outline-variant/20 rounded-xl">
              {selectedTournament ? 'Click a field type above to start building your form' : 'Select a tournament to begin'}
            </p>
          ) : fields.map((field, idx) => (
            <div key={field.id}
              className={`flex items-center justify-between bg-surface-container-highest/20 rounded-xl p-2.5 cursor-pointer border transition-all ${editingField === field.id ? 'border-primary/50 bg-primary/5' : 'border-transparent hover:border-outline-variant/30'}`}
              onClick={() => { setEditingField(field.id); setShowFieldEditor(true) }}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-on-surface truncate">{field.label}</span>
                  {field.required && <span className="text-error text-[9px]">*</span>}
                </div>
                <p className="text-[8px] text-on-surface-variant capitalize">{field.type}{field.options ? ` (${field.options.length} options)` : ''}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={(e) => { e.stopPropagation(); moveField(field.id, -1) }} disabled={idx === 0}
                  className="text-[10px] text-on-surface-variant/50 hover:text-on-surface disabled:opacity-20 p-0.5">
                  <span className="material-symbols-outlined text-sm">arrow_upward</span>
                </button>
                <button onClick={(e) => { e.stopPropagation(); moveField(field.id, 1) }} disabled={idx === fields.length - 1}
                  className="text-[10px] text-on-surface-variant/50 hover:text-on-surface disabled:opacity-20 p-0.5">
                  <span className="material-symbols-outlined text-sm">arrow_downward</span>
                </button>
                <button onClick={(e) => { e.stopPropagation(); removeField(field.id) }}
                  className="text-[10px] text-error/50 hover:text-error p-0.5">
                  <span className="material-symbols-outlined text-sm">delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {showFieldEditor && currentField && (
          <div className="bg-surface-container-highest/20 border border-outline-variant/30 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-bold text-on-surface">Edit Field</h4>
            <div>
              <label className="text-[9px] text-on-surface-variant block mb-1">Label</label>
              <input type="text" value={currentField.label}
                onChange={(e) => updateField(currentField.id, { label: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-surface-container-highest/40 border border-outline-variant/40 rounded-lg text-xs text-on-surface outline-none focus:border-primary/50" />
            </div>
            <div>
              <label className="text-[9px] text-on-surface-variant block mb-1">Placeholder</label>
              <input type="text" value={currentField.placeholder || ''}
                onChange={(e) => updateField(currentField.id, { placeholder: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-surface-container-highest/40 border border-outline-variant/40 rounded-lg text-xs text-on-surface outline-none focus:border-primary/50" />
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={currentField.required} onChange={(e) => updateField(currentField.id, { required: e.target.checked })} className="w-4 h-4 accent-primary" />
                <span className="text-[10px] text-on-surface-variant">Required field</span>
              </label>
            </div>
            {(currentField.options) && (
              <div>
                <label className="text-[9px] text-on-surface-variant block mb-1">Options (one per line)</label>
                <textarea value={(currentField.options || []).join('\n')}
                  onChange={(e) => updateField(currentField.id, { options: e.target.value.split('\n').filter(Boolean) })}
                  rows={3} className="w-full px-2.5 py-1.5 bg-surface-container-highest/40 border border-outline-variant/40 rounded-lg text-xs text-on-surface outline-none focus:border-primary/50 resize-none" />
              </div>
            )}
            {currentField.type === 'file' && (
              <div>
                <label className="text-[9px] text-on-surface-variant block mb-1">Accepted file types</label>
                <input type="text" value={currentField.accept || ''}
                  onChange={(e) => updateField(currentField.id, { accept: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-surface-container-highest/40 border border-outline-variant/40 rounded-lg text-xs text-on-surface outline-none focus:border-primary/50" />
              </div>
            )}
          </div>
        )}
      </div>

      {selectedTournament && fields.length > 0 && (
        <button onClick={handleSave} disabled={saving}
          className="mt-4 w-full py-2.5 bg-primary hover:bg-primary/90 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Registration Form'}
        </button>
      )}
    </div>
  )
}