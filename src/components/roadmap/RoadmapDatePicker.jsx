import React, { useState, useEffect, useRef } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { formatToDDMMYYYY, parseFromDDMMYYYY } from '../../utils/roadmapDateUtils.js';

export { formatToDDMMYYYY, parseFromDDMMYYYY };

export default function RoadmapDatePicker({
  value = '',
  onChange,
  min = '',
  placeholder = 'DD/MM/YYYY',
  disabled = false,
  className = '',
  id,
}) {
  const [textValue, setTextValue] = useState(formatToDDMMYYYY(value));
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef(null);

  // Derive initial view month/year from current value or min or today
  const getInitialView = () => {
    const target = value || min || new Date().toISOString().slice(0, 10);
    const parts = target.slice(0, 10).split('-').map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return { year: parts[0], month: parts[1] - 1 };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  };

  const [viewDate, setViewDate] = useState(getInitialView);

  // Sync textValue when external value changes
  useEffect(() => {
    setTextValue(formatToDDMMYYYY(value));
    if (value) {
      const parts = value.slice(0, 10).split('-').map(Number);
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        setViewDate({ year: parts[0], month: parts[1] - 1 });
      }
    }
  }, [value]);

  // Click outside listener to close popover
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setTextValue(val);
    const parsedIso = parseFromDDMMYYYY(val);
    if (parsedIso) {
      if (!min || parsedIso >= min) {
        onChange?.(parsedIso);
      }
    }
  };

  const handleInputBlur = () => {
    const parsedIso = parseFromDDMMYYYY(textValue);
    if (parsedIso) {
      if (min && parsedIso < min) {
        // Revert to current valid value or min
        setTextValue(formatToDDMMYYYY(value));
      } else {
        onChange?.(parsedIso);
        setTextValue(formatToDDMMYYYY(parsedIso));
      }
    } else if (textValue.trim() === '') {
      onChange?.('');
    } else {
      // Invalid text, revert to previous valid value
      setTextValue(formatToDDMMYYYY(value));
    }
  };

  const handleSelectDay = (day) => {
    const mm = String(viewDate.month + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const iso = `${viewDate.year}-${mm}-${dd}`;
    onChange?.(iso);
    setTextValue(formatToDDMMYYYY(iso));
    setIsOpen(false);
  };

  const handlePrevMonth = () => {
    setViewDate((prev) => {
      if (prev.month === 0) {
        return { year: prev.year - 1, month: 11 };
      }
      return { ...prev, month: prev.month - 1 };
    });
  };

  const handleNextMonth = () => {
    setViewDate((prev) => {
      if (prev.month === 11) {
        return { year: prev.year + 1, month: 0 };
      }
      return { ...prev, month: prev.month + 1 };
    });
  };

  // Calendar matrix calculation
  const daysInMonth = new Date(Date.UTC(viewDate.year, viewDate.month + 1, 0)).getUTCDate();
  const firstDayOfWeek = new Date(Date.UTC(viewDate.year, viewDate.month, 1)).getUTCDay();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  return (
    <div className="relative inline-block w-full" ref={popoverRef}>
      <div className="relative flex items-center">
        <input
          id={id}
          type="text"
          disabled={disabled}
          value={textValue}
          placeholder={placeholder}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          className={`w-full pl-3 pr-9 py-2 rounded-xl text-xs sm:text-sm font-semibold tracking-wide border border-slate-200/90 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition shadow-2xs disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed ${className}`}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen((prev) => !prev)}
          className="absolute right-2 p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 transition cursor-pointer disabled:cursor-not-allowed"
          title="Open calendar (DD/MM/YYYY)"
        >
          <CalendarIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Calendar Popover */}
      {isOpen && (
        <div className="absolute z-50 left-0 mt-1.5 w-64 p-3 rounded-2xl bg-white border border-slate-200 shadow-xl text-slate-800 animate-in fade-in zoom-in-95 duration-100 select-none">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-black tracking-wide text-slate-800">
              {monthNames[viewDate.month]} {viewDate.year}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday labels */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 mb-1">
            <span>Su</span>
            <span>Mo</span>
            <span>Tu</span>
            <span>We</span>
            <span>Th</span>
            <span>Fr</span>
            <span>Sa</span>
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-xs">
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="h-7" />
            ))}

            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const mm = String(viewDate.month + 1).padStart(2, '0');
              const dd = String(day).padStart(2, '0');
              const thisDateStr = `${viewDate.year}-${mm}-${dd}`;
              const isSelected = value === thisDateStr;
              const isBeforeMin = min ? thisDateStr < min : false;

              return (
                <button
                  key={day}
                  type="button"
                  disabled={isBeforeMin}
                  onClick={() => handleSelectDay(day)}
                  className={`h-7 w-7 mx-auto rounded-lg font-bold flex items-center justify-center transition cursor-pointer text-[11px] ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-xs'
                      : isBeforeMin
                      ? 'text-slate-300 cursor-not-allowed bg-transparent'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-blue-600'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Clear or Close footer */}
          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
            <span className="text-slate-400 font-medium">Format: DD/MM/YYYY</span>
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange?.('');
                  setTextValue('');
                  setIsOpen(false);
                }}
                className="text-rose-600 hover:underline font-bold cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
