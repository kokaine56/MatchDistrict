import { useState, useEffect } from 'react'

export function OptimizedInput({ value, onChange, type = 'text', placeholder, className, min, max, step, disabled, maxLength }) {
  const [localValue, setLocalValue] = useState(value ?? '')

  useEffect(() => {
    setLocalValue(value ?? '')
  }, [value])

  const handleChange = (e) => {
    setLocalValue(e.target.value)
  }

  const handleSync = () => {
    if (String(localValue) !== String(value ?? '')) {
      onChange(localValue)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSync()
    }
  }

  return (
    <input
      type={type}
      value={localValue}
      onChange={handleChange}
      onBlur={handleSync}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className={className}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      maxLength={maxLength}
    />
  )
}

export function OptimizedTextarea({ value, onChange, placeholder, className, rows, disabled }) {
  const [localValue, setLocalValue] = useState(value ?? '')

  useEffect(() => {
    setLocalValue(value ?? '')
  }, [value])

  const handleChange = (e) => {
    setLocalValue(e.target.value)
  }

  const handleSync = () => {
    if (String(localValue) !== String(value ?? '')) {
      onChange(localValue)
    }
  }

  return (
    <textarea
      value={localValue}
      onChange={handleChange}
      onBlur={handleSync}
      placeholder={placeholder}
      className={className}
      rows={rows}
      disabled={disabled}
    />
  )
}
