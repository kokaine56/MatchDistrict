import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  Save,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Trophy,
  Plus,
  Users,
  Clock,
  Trash2,
  ChevronUp,
  ChevronDown,
  ShieldAlert,
  ArrowRight,
  Sparkles,
  Lock,
  Unlock,
  Layers,
  X,
  GripVertical,
  Map,
  Check,
  Search,
  SlidersHorizontal,
  Filter,
  Medal,
} from "lucide-react";
import { getAuthToken } from "../utils/getAuthToken";

// Game default maps
const GAME_MAP_OPTIONS = {
  bgmi: ["Erangel", "Miramar", "Rondo", "Sanhok", "Vikendi", "Livik", "Karakin", "Nusa"],
  "battlegrounds mobile india": ["Erangel", "Miramar", "Rondo", "Sanhok", "Vikendi", "Livik", "Karakin", "Nusa"],
  freefire: ["Bermuda", "Purgatory", "Kalahari", "Alpine", "NexTerra"],
  "free fire": ["Bermuda", "Purgatory", "Kalahari", "Alpine", "NexTerra"],
  codm: ["Crash", "Standoff", "Raid", "Crossfire", "Summit"],
  "cod mobile": ["Crash", "Standoff", "Raid", "Crossfire", "Summit"],
  valorant: ["Ascent", "Haven", "Bind", "Split", "Sunset"],
};

function getMapOptions(game) {
  const key = (game || "bgmi").toLowerCase().trim();
  return GAME_MAP_OPTIONS[key] || GAME_MAP_OPTIONS.bgmi;
}

function formatTime12h(timeStr) {
  if (!timeStr) return "TBD";
  const parts = timeStr.split(":").map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return timeStr;
  const [h, m] = parts;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(hour12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
}

export function getDayOfWeek(dateStr) {
  if (!dateStr) return "";
  try {
    const clean = String(dateStr).slice(0, 10);
    const parts = clean.split("-").map(Number);
    if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return "";
    const [y, m, d] = parts;
    const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return date.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  } catch {
    return "";
  }
}

export function addDaysToDateStr(dateStr, daysToAdd = 1) {
  if (!dateStr) return "";
  try {
    const clean = String(dateStr).slice(0, 10);
    const parts = clean.split("-").map(Number);
    if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return "";
    const [y, m, d] = parts;
    const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    date.setUTCDate(date.getUTCDate() + daysToAdd);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch {
    return "";
  }
}

export function computeMinSelectableDate(regCloseDate) {
  if (!regCloseDate) return "";
  try {
    const baseStr = String(regCloseDate).slice(0, 10);
    return addDaysToDateStr(baseStr, 1);
  } catch {
    return "";
  }
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return "Date TBD";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const dayOfWeek = getDayOfWeek(dateStr);
    const formatted = d.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
    return dayOfWeek ? `${dayOfWeek}, ${formatted}` : formatted;
  } catch {
    return dateStr;
  }
}

/**
 * Dynamically parse configured prize distribution from tournament metadata.
 * Does not hardcode 4 ranks; returns configured ranks with percentages and amounts.
 */
export function getPrizePositions(meta) {
  if (!meta) return [];

  // 1. If structured prize_positions JSON is available
  if (meta.prize_positions) {
    try {
      const raw = typeof meta.prize_positions === "string" ? JSON.parse(meta.prize_positions) : meta.prize_positions;
      if (Array.isArray(raw) && raw.length > 0) {
        return raw.map((p, idx) => {
          const pool = Number(meta.prize_pool_amount) || (meta.prize && !isNaN(Number(meta.prize)) ? Number(meta.prize) : 0);
          const pct = p.percentage != null ? Number(p.percentage) : null;
          let calculatedAmount = p.prize_amount != null ? Number(p.prize_amount) : null;
          if (calculatedAmount == null && pct != null && pool > 0) {
            calculatedAmount = Math.round((pct / 100) * pool);
          }
          return {
            rank: idx + 1,
            name: p.name || `Rank ${idx + 1}`,
            percentage: pct,
            prize_amount: calculatedAmount,
          };
        });
      }
    } catch {
      // Fallback below
    }
  }

  // 2. Fallback to individual splits (prize_split_1st, prize_split_2nd, prize_split_3rd, prize_split_mvp)
  const splits = [];
  const pool = Number(meta.prize_pool_amount) || (meta.prize && !isNaN(Number(meta.prize)) ? Number(meta.prize) : 0);

  if (meta.prize_split_1st) {
    const pct = Number(meta.prize_split_1st);
    splits.push({ rank: 1, name: "1st Place (Champion)", percentage: pct, prize_amount: pool ? Math.round((pct / 100) * pool) : null });
  }
  if (meta.prize_split_2nd) {
    const pct = Number(meta.prize_split_2nd);
    splits.push({ rank: 2, name: "2nd Place (Runner-up)", percentage: pct, prize_amount: pool ? Math.round((pct / 100) * pool) : null });
  }
  if (meta.prize_split_3rd) {
    const pct = Number(meta.prize_split_3rd);
    splits.push({ rank: 3, name: "3rd Place", percentage: pct, prize_amount: pool ? Math.round((pct / 100) * pool) : null });
  }
  if (meta.prize_split_mvp) {
    const pct = Number(meta.prize_split_mvp);
    splits.push({ rank: 4, name: "MVP / 4th Place", percentage: pct, prize_amount: pool ? Math.round((pct / 100) * pool) : null });
  }

  if (splits.length > 0) return splits;

  // 3. Fallback: default placement distribution
  return [
    { rank: 1, name: "1st Place (Champion)", percentage: 50, prize_amount: pool ? Math.round(pool * 0.5) : null },
    { rank: 2, name: "2nd Place", percentage: 25, prize_amount: pool ? Math.round(pool * 0.25) : null },
    { rank: 3, name: "3rd Place", percentage: 15, prize_amount: pool ? Math.round(pool * 0.15) : null },
    { rank: 4, name: "4th Place", percentage: 10, prize_amount: pool ? Math.round(pool * 0.10) : null },
  ];
}

export default function TournamentRoadmapBuilder({
  tournamentId,
  tournamentTitle = "Tournament Roadmap",
  isOrganizer = false,
  registrationCloseDate = null,
  onClose = null,
  onApproved = null,
}) {
  const [organizerState, setOrganizerState] = useState(isOrganizer);
  const effectiveOrganizer = isOrganizer || organizerState;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [generatingRoadmap, setGeneratingRoadmap] = useState(false);

  // Deletion modals state
  const [showMasterDeleteModal, setShowMasterDeleteModal] = useState(false);
  const [deletingRoadmap, setDeletingRoadmap] = useState(false);
  const [roundToDelete, setRoundToDelete] = useState(null);
  const [deletingRound, setDeletingRound] = useState(false);

  // Tournament metadata & DB-derived districts
  const [districts, setDistricts] = useState([]);
  const [meta, setMeta] = useState(null);
  const [isPublished, setIsPublished] = useState(false);
  const [publishErrors, setPublishErrors] = useState([]);

  // Hierarchical manual roadmap state
  const [rounds, setRounds] = useState([]);
  const [selectedRoundIdx, setSelectedRoundIdx] = useState(0);
  const [expandedMatches, setExpandedMatches] = useState(new Set());
  const [draggedAllocIdx, setDraggedAllocIdx] = useState(null);

  // Min selectable date derived from meta or prop (registration close date + 1 day)
  const minSelectableDate = useMemo(() => {
    const rawDate = meta?.registration_close_date || registrationCloseDate;
    return computeMinSelectableDate(rawDate);
  }, [meta?.registration_close_date, registrationCloseDate]);

  // Grand Finals / Custom District Modal State
  const [showCustomDistrictModal, setShowCustomDistrictModal] = useState(false);
  const [customDistrictRoundIdx, setCustomDistrictRoundIdx] = useState(0);
  const [customDistrictDayIdx, setCustomDistrictDayIdx] = useState(0);
  const [customDistrictName, setCustomDistrictName] = useState("Grand Finals");
  const [customDistrictCapacity, setCustomDistrictCapacity] = useState(16);

  // Team Qualification & Advancement Modal State
  const [showAdvancementModal, setShowAdvancementModal] = useState(false);
  const [advancementSourceRound, setAdvancementSourceRound] = useState(null);
  const [advancementTargetRoundId, setAdvancementTargetRoundId] = useState("");
  const [advancementTargetGroupId, setAdvancementTargetGroupId] = useState("");
  const [advancementStandings, setAdvancementStandings] = useState(null);
  const [selectedTeamIds, setSelectedTeamIds] = useState(new Set());
  const [advancementLoading, setAdvancementLoading] = useState(false);
  const [advancingExecuting, setAdvancingExecuting] = useState(false);
  const [advancementSearch, setAdvancementSearch] = useState("");
  const [advancementDistrictFilter, setAdvancementDistrictFilter] = useState("all");
  const [advancementPreset, setAdvancementPreset] = useState("round_total");
  const [customTopCount, setCustomTopCount] = useState(16);
  const [customPerDistrictCount, setCustomPerDistrictCount] = useState(2);

  // Fetch districts from database
  const fetchDistricts = useCallback(async () => {
    if (!tournamentId) return [];
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/roadmap/districts`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.districts)) {
        setDistricts(data.districts);
        setMeta(data.meta || null);
        return data.districts;
      }
    } catch (err) {
      console.warn("Could not fetch tournament districts:", err);
    }
    return [];
  }, [tournamentId]);

  // Fetch roadmap from database
  const fetchRoadmap = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/roadmap`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.message || data.error || "Failed to load roadmap.");
      }

      const status = data.roadmap_status || "draft";
      const published = typeof data.published === "boolean" ? data.published : (status === "approved" || status === "published");
      setIsPublished(published);

      const isUserOrg = isOrganizer || Boolean(data.is_organizer || data.mode === "organizer");
      if (isUserOrg) {
        setOrganizerState(true);
      }
      const isOrg = isUserOrg || effectiveOrganizer;

      if (!isOrg && !published) {
        setRounds([]);
        return;
      }
      const rm = data.roadmap;
      if (rm) {
        if (rm.meta) setMeta(rm.meta);
        if (Array.isArray(rm.districts) && rm.districts.length > 0) {
          setDistricts(rm.districts);
        }

        if (Array.isArray(rm.structured_rounds) && rm.structured_rounds.length > 0) {
          // Preserve existing saved rounds and their configurations intact
          setRounds(rm.structured_rounds);
        } else if (
          Array.isArray(rm.rounds) &&
          rm.rounds.length > 0 &&
          (status === "approved" || status === "published" || status === "draft")
        ) {
          // If flat saved rounds exist, construct manual hierarchy preserving all saved rounds
          setRounds(
            rm.rounds.map((r, i) => {
              const isGrandFinal = r.round_type === "grand_final" || (!r.round_type && i === rm.rounds.length - 1 && rm.rounds.length > 1) || (r.name || "").toLowerCase().includes("grand final");
              return {
                id: r.id || `RND-${i + 1}`,
                round_number: r.round_number || i + 1,
                name: r.name || `Round ${i + 1}`,
                round_type: isGrandFinal ? "grand_final" : (r.round_type || "qualifier"),
                status: r.status || "configured",
                advancement_type: isGrandFinal ? null : (r.advancement_type || "per_district"),
                teams_advancing: isGrandFinal ? null : (r.teams_advancing || 16),
                teams_advancing_per_district: isGrandFinal ? null : (r.teams_advancing_per_district || 2),
                advancement_target_round_id: isGrandFinal ? null : (r.advancement_target_round_id || null),
                days: Array.isArray(r.days) && r.days.length > 0 ? r.days : [
                  { id: `DAY-${i + 1}-1`, day_number: 1, date: "", allocations: [] }
                ],
              };
            })
          );
        } else {
          setRounds([]);
        }
      } else {
        setRounds([]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, isOrganizer, effectiveOrganizer]);

  useEffect(() => {
    queueMicrotask(() => {
      fetchDistricts();
      fetchRoadmap();
    });
  }, [fetchDistricts, fetchRoadmap]);

  // Client-side real-time validation calculation (derived via useMemo)
  const validationErrors = useMemo(() => {
    if (!effectiveOrganizer || rounds.length === 0) return [];
    const errs = [];
    const seenNames = new Set();

    rounds.forEach((round, rIdx) => {
      const rNum = round.round_number || rIdx + 1;
      const rName = (round.name || "").trim();
      if (!rName) {
        errs.push(`Round ${rNum} must have a non-empty name.`);
      } else {
        const lowerName = rName.toLowerCase();
        if (seenNames.has(lowerName)) {
          errs.push(`Round name "${rName}" is duplicated. Each round should have a distinct name.`);
        }
        seenNames.add(lowerName);
      }

      const days = round.days || [];
      if (days.length === 0) {
        errs.push(`Round "${rName || `Round ${rNum}`}" must have at least one match day.`);
      }

      let roundMatchCount = 0;
      days.forEach((day, dIdx) => {
        const dNum = day.day_number || dIdx + 1;
        const allocs = day.allocations || [];
        if (allocs.length === 0) {
          errs.push(`Day ${dNum} in "${rName || `Round ${rNum}`}" has no districts scheduled.`);
        }

        const dayDistricts = new Set();
        allocs.forEach((a) => {
          if (!a.district_id) {
            errs.push(`Day ${dNum} in "${rName || `Round ${rNum}`}" contains an allocation with no district selected.`);
          } else if (dayDistricts.has(a.district_id)) {
            errs.push(`District "${a.district_name || 'District'}" is scheduled more than once on Day ${dNum}. Please adjust its match count instead of adding duplicate allocations on the same day.`);
          }
          dayDistricts.add(a.district_id);

          const mCount = Number(a.match_count) || (a.matches ? a.matches.length : 0);
          if (mCount <= 0) {
            errs.push(`District "${a.district_name || 'District'}" on Day ${dNum} must have at least 1 match scheduled.`);
          }
          roundMatchCount += mCount;
        });
      });

      if (days.length > 0 && roundMatchCount === 0) {
        errs.push(`Round "${rName || `Round ${rNum}`}" has no matches configured.`);
      }

      const isGrandFinal = round.round_type === "grand_final" || (round.name || "").toLowerCase().includes("grand final");
      if (!isGrandFinal && round.advancement_target_round_id) {
        const targetRound = rounds.find((r) => r.id === round.advancement_target_round_id);
        const targetIdx = rounds.findIndex((r) => r.id === round.advancement_target_round_id);
        if (!targetRound) {
          errs.push(`Round "${rName || `Round ${rNum}`}" targets a next round that does not exist.`);
        } else if (targetIdx <= rIdx) {
          errs.push(`Round "${rName || `Round ${rNum}`}" can only advance teams forward to a subsequent round.`);
        }
      }
    });

    return errs;
  }, [rounds, effectiveOrganizer]);

  // Client-side advisory warnings (non-blocking for drafts, but informs organizer)
  const validationWarnings = useMemo(() => {
    if (!effectiveOrganizer || rounds.length === 0) return [];
    const warns = [];
    rounds.forEach((round, rIdx) => {
      const isGrandFinal = round.round_type === "grand_final" || (round.name || "").toLowerCase().includes("grand final");
      const rNum = round.round_number || rIdx + 1;
      const rName = (round.name || `Round ${rNum}`).trim();
      (round.days || []).forEach((day, dIdx) => {
        const dNum = day.day_number || dIdx + 1;
        (day.allocations || []).forEach((a) => {
          const matchingDist = districts.find((d) => d.id === a.district_id || d.name === a.district_name);
          const regCount = matchingDist?.registered_teams_count ?? matchingDist?.team_count ?? 0;
          const mCount = Number(a.match_count) || (a.matches ? a.matches.length : 0);
          // Pre-tournament: Grand Finals reserved slots should not trigger a 0-team error
          if (regCount === 0 && mCount > 0 && !isGrandFinal) {
            warns.push(`District "${a.district_name || 'District'}" on Day ${dNum} of "${rName}" has 0 registered teams for ${mCount} scheduled match(es).`);
          }
        });
      });
    });
    return warns;
  }, [rounds, districts, effectiveOrganizer]);

  // Round Management Actions
  const handleAddRound = () => {
    const nextNum = rounds.length + 1;
    let defaultDate = "";
    if (rounds.length > 0) {
      const prevRound = rounds[rounds.length - 1];
      const prevDays = prevRound?.days || [];
      for (let i = prevDays.length - 1; i >= 0; i--) {
        if (prevDays[i]?.date) {
          defaultDate = addDaysToDateStr(prevDays[i].date, 1);
          break;
        }
      }
    }
    if (!defaultDate) {
      defaultDate = minSelectableDate || new Date().toISOString().slice(0, 10);
    }

    const isFinalRound = nextNum === 2 && rounds.length === 1;
    const newRound = {
      id: `RND-${Date.now()}-${nextNum}`,
      round_number: nextNum,
      name: isFinalRound ? "Grand Finals" : `Round ${nextNum}`,
      round_type: isFinalRound ? "grand_final" : "qualifier",
      status: "configured",
      advancement_type: "per_district",
      teams_advancing: 16,
      teams_advancing_per_district: 2,
      days: [
        {
          id: `DAY-${Date.now()}-1`,
          day_number: 1,
          date: defaultDate,
          allocations: [],
        },
      ],
    };
    setRounds((prev) => [...prev, newRound]);
    setSelectedRoundIdx(rounds.length);
  };

  // District Reordering Actions within Match Day
  const handleMoveDistrictAllocation = (roundIdx, dayIdx, allocIdx, direction) => {
    const targetIdx = direction === "up" ? allocIdx - 1 : allocIdx + 1;
    handleReorderDistrictAllocation(roundIdx, dayIdx, allocIdx, targetIdx);
  };

  const handleReorderDistrictAllocation = async (roundIdx, dayIdx, fromIdx, toIdx) => {
    if (fromIdx === toIdx || isNaN(fromIdx) || isNaN(toIdx)) return;
    const round = rounds[roundIdx];
    const day = round?.days?.[dayIdx];
    if (!day || !day.allocations) return;
    const allocations = [...day.allocations];
    if (fromIdx < 0 || fromIdx >= allocations.length || toIdx < 0 || toIdx >= allocations.length) {
      return;
    }

    const [moved] = allocations.splice(fromIdx, 1);
    allocations.splice(toIdx, 0, moved);

    // Optimistically update frontend state
    setRounds((prev) => {
      const updated = [...prev];
      const r = { ...updated[roundIdx] };
      const days = [...r.days];
      days[dayIdx] = { ...days[dayIdx], allocations };
      r.days = days;
      updated[roundIdx] = r;
      return updated;
    });

    // Persist reorder immediately if day and allocations exist
    const dayId = day.id;
    const groupIds = allocations.map((a) => a.id || a.group_id).filter(Boolean);
    if (tournamentId && dayId && groupIds.length === allocations.length) {
      try {
        const token = await getAuthToken();
        const res = await fetch(`/api/tournaments/${tournamentId}/roadmap/days/${dayId}/allocations/reorder`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ ordered_group_ids: groupIds }),
        });
        const data = await res.json();
        if (!data.success) {
          if (data.error !== "DAY_NOT_FOUND" && data.error !== "INVALID_ALLOCATION") {
            console.warn("District reorder persistence note:", data.message || data.error);
          }
        }
      } catch (err) {
        console.warn("District reorder call error:", err);
      }
    }
  };

  const handleUpdateRound = (idx, field, value) => {
    setRounds((prev) => {
      const updated = [...prev];
      const target = { ...updated[idx], [field]: value };
      if (field === "round_type") {
        if (value === "grand_final") {
          target.advancement_target_round_id = "";
          target.advancement_type = null;
          target.teams_advancing = null;
          target.teams_advancing_per_district = null;
          target.teams_advancing_per_match = null;
          if (!target.name || target.name.startsWith("Round ")) {
            target.name = "Grand Finals";
          }
        } else if (!target.advancement_type) {
          target.advancement_type = "per_district";
          target.teams_advancing_per_district = 2;
        }
      }
      updated[idx] = target;
      return updated;
    });
  };

  const handleMoveRound = (idx, direction) => {
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= rounds.length) return;
    setRounds((prev) => {
      const copy = [...prev];
      const temp = copy[idx];
      copy[idx] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy.map((r, i) => ({ ...r, round_number: i + 1 }));
    });
    setSelectedRoundIdx(targetIdx);
  };

  const handleDeleteRound = (idx) => {
    if (rounds.length <= 1) {
      setError("A tournament roadmap must have at least one round. To reset the entire roadmap, use 'Delete Entire Roadmap'.");
      return;
    }
    const target = rounds[idx];
    if (!target) return;
    setRoundToDelete(target);
  };

  const handleConfirmDeleteRound = async () => {
    if (!roundToDelete) return;
    setDeletingRound(true);
    setError(null);
    setSuccess(null);
    try {
      const rId = roundToDelete.id;
      if (tournamentId && rId) {
        const token = await getAuthToken();
        const res = await fetch(`/api/tournaments/${tournamentId}/roadmap/rounds/${rId}`, {
          method: "DELETE",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (!data.success) {
          if (data.code !== "ROUND_NOT_FOUND") {
            throw new Error(data.message || data.error || "Failed to delete round.");
          }
        }
      }

      setRounds((prev) => {
        const filtered = prev.filter((r) => r.id !== roundToDelete.id);
        return filtered.map((r, i) => ({ ...r, round_number: i + 1 }));
      });
      setSelectedRoundIdx((prev) => Math.max(0, Math.min(prev, rounds.length - 2)));
      setSuccess(`Round "${roundToDelete.name}" deleted successfully.`);
      setRoundToDelete(null);
    } catch (err) {
      setError(err.message || "Failed to delete round.");
    } finally {
      setDeletingRound(false);
    }
  };

  const handleConfirmMasterDelete = async () => {
    setDeletingRoadmap(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/roadmap`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!data.success) {
        if (data.error === "ROADMAP_HAS_RESULTS") {
          throw new Error(data.message || "Cannot delete roadmap because this tournament has recorded match results. Historical match records must be preserved.");
        }
        throw new Error(data.message || data.error || "Failed to delete entire roadmap.");
      }

      setShowMasterDeleteModal(false);
      setIsPublished(false);
      setSelectedRoundIdx(0);
      setExpandedMatches(new Set());
      setPublishErrors([]);

      setRounds([]);
      setSuccess("Entire roadmap deleted successfully. You can now generate a fresh roadmap or build one manually.");
      if (onApproved) onApproved();
    } catch (err) {
      setError(err.message || "Failed to delete entire roadmap.");
    } finally {
      setDeletingRoadmap(false);
    }
  };

  const handleGenerateRoadmap = async () => {
    setGeneratingRoadmap(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/roadmap/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ mode: "regenerate_all" }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || data.error || "Failed to generate roadmap.");
      }
      setSuccess("Roadmap generated successfully! You can now review, customize, and publish.");
      await fetchRoadmap();
      if (onApproved) onApproved();
    } catch (err) {
      setError(err.message || "Failed to generate roadmap.");
    } finally {
      setGeneratingRoadmap(false);
    }
  };

  // Day Management Actions
  const handleAddDay = (roundIdx) => {
    setRounds((prev) => {
      const updated = [...prev];
      const round = { ...updated[roundIdx] };
      const days = [...(round.days || [])];
      const nextDayNum = days.length + 1;

      // Automatically determine the next date from the last day in current round or previous rounds
      let nextDate = "";
      if (days.length > 0) {
        const lastDay = days[days.length - 1];
        if (lastDay.date) {
          nextDate = addDaysToDateStr(lastDay.date, 1);
        }
      }
      if (!nextDate && roundIdx > 0) {
        const prevRound = updated[roundIdx - 1];
        const prevDays = prevRound?.days || [];
        for (let i = prevDays.length - 1; i >= 0; i--) {
          if (prevDays[i]?.date) {
            nextDate = addDaysToDateStr(prevDays[i].date, 1);
            break;
          }
        }
      }
      if (!nextDate) {
        nextDate = minSelectableDate || new Date().toISOString().slice(0, 10);
      }

      days.push({
        id: `DAY-${Date.now()}-${nextDayNum}`,
        day_number: nextDayNum,
        date: nextDate,
        allocations: [],
      });
      round.days = days;
      updated[roundIdx] = round;
      return updated;
    });
  };

  const handleUpdateDay = (roundIdx, dayIdx, field, value) => {
    if (field === "date" && minSelectableDate && value && value < minSelectableDate) {
      setError(`Match day date cannot be on or before registration closes (${minSelectableDate}). Date clamped to earliest available date.`);
      value = minSelectableDate;
    }
    setRounds((prev) => {
      const updated = [...prev];
      const round = { ...updated[roundIdx] };
      const days = [...round.days];
      days[dayIdx] = { ...days[dayIdx], [field]: value };
      round.days = days;
      updated[roundIdx] = round;
      return updated;
    });
  };

  // Grand Finals / Custom District Handlers
  const handleOpenCustomDistrictModal = (roundIdx, dayIdx) => {
    setCustomDistrictRoundIdx(roundIdx);
    setCustomDistrictDayIdx(dayIdx);
    const round = rounds[roundIdx];
    const isFinalOrGrand = (round?.name || "").toLowerCase().includes("final") || roundIdx === rounds.length - 1;
    setCustomDistrictName(isFinalOrGrand ? "Grand Finals" : `District ${districts.length + 1}`);
    setCustomDistrictCapacity(16);
    setShowCustomDistrictModal(true);
  };

  const handleConfirmCreateCustomDistrict = () => {
    const cleanName = (customDistrictName || "").trim() || "Grand Finals";
    const cap = Math.max(2, Math.min(64, Number(customDistrictCapacity) || 16));
    const newDistrictId = `GRP-CUSTOM-${Date.now()}`;
    const newDistrict = {
      id: newDistrictId,
      name: cleanName,
      capacity: cap,
      team_count: 0,
      registered_teams_count: 0,
    };

    setDistricts((prev) => [...prev, newDistrict]);
    handleAddDistrictToDay(customDistrictRoundIdx, customDistrictDayIdx, newDistrictId, 1);
    setShowCustomDistrictModal(false);
    setSuccess(`Created and scheduled "${cleanName}" district for Day ${customDistrictDayIdx + 1}!`);
  };

  // Team Qualification & Advancement Modal Handlers
  const openAdvancementModal = async (sourceRound) => {
    if (!sourceRound) return;
    setAdvancementSourceRound(sourceRound);
    setShowAdvancementModal(true);
    setAdvancementLoading(true);
    setError(null);

    // Pick target round: sourceRound.advancement_target_round_id or subsequent round
    const nextRound =
      rounds.find((r) => r.id === sourceRound.advancement_target_round_id) ||
      rounds.find((r) => (r.round_number || 0) > (sourceRound.round_number || 0)) ||
      null;

    const initialTargetRoundId = nextRound ? nextRound.id : "";
    setAdvancementTargetRoundId(initialTargetRoundId);

    let initialGroupId = "";
    if (nextRound && Array.isArray(nextRound.days)) {
      for (const d of nextRound.days) {
        if (Array.isArray(d.allocations) && d.allocations.length > 0) {
          initialGroupId = d.allocations[0].id || d.allocations[0].group_id || d.allocations[0].district_id;
          break;
        }
      }
    }
    setAdvancementTargetGroupId(initialGroupId);

    try {
      const token = await getAuthToken();
      const roundNum = sourceRound.round_number || 1;
      const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${roundNum}/standings`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || data.error || "Failed to load round standings.");
      }

      setAdvancementStandings(data);

      const advType = sourceRound.advancement_type || "per_district";
      const preSelected = new Set();

      if (advType === "per_district" && Array.isArray(data.districts)) {
        const perDist = Number(sourceRound.teams_advancing_per_district) || 2;
        data.districts.forEach((d) => {
          (d.teams || []).slice(0, perDist).forEach((t) => {
            if (t.team_id) preSelected.add(t.team_id);
          });
        });
        setAdvancementPreset("per_district");
        setCustomPerDistrictCount(perDist);
      } else if (Array.isArray(data.overallStandings)) {
        const topCount = Number(sourceRound.teams_advancing) || 16;
        data.overallStandings.slice(0, topCount).forEach((t) => {
          if (t.team_id) preSelected.add(t.team_id);
        });
        setAdvancementPreset("round_total");
        setCustomTopCount(topCount);
      }

      setSelectedTeamIds(preSelected);

      if (!initialGroupId && Array.isArray(data.nextRoundGroups) && data.nextRoundGroups.length > 0) {
        setAdvancementTargetGroupId(data.nextRoundGroups[0].id);
      }
    } catch (err) {
      console.error("Error loading standings:", err);
      setError(err.message || "Failed to load standings.");
    } finally {
      setAdvancementLoading(false);
    }
  };

  const applyPresetOverall = (count) => {
    if (!advancementStandings?.overallStandings) return;
    const n = Math.max(1, Number(count) || 16);
    const set = new Set();
    advancementStandings.overallStandings.slice(0, n).forEach((t) => {
      if (t.team_id) set.add(t.team_id);
    });
    setSelectedTeamIds(set);
    setAdvancementPreset("round_total");
  };

  const applyPresetPerDistrict = (count) => {
    if (!advancementStandings?.districts) return;
    const n = Math.max(1, Number(count) || 2);
    const set = new Set();
    advancementStandings.districts.forEach((d) => {
      (d.teams || []).slice(0, n).forEach((t) => {
        if (t.team_id) set.add(t.team_id);
      });
    });
    setSelectedTeamIds(set);
    setAdvancementPreset("per_district");
  };

  const toggleSelectTeam = (teamId) => {
    setSelectedTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      return next;
    });
    setAdvancementPreset("manual");
  };

  const handleExecuteAdvancement = async () => {
    if (selectedTeamIds.size === 0) {
      setError("Please select at least 1 team to advance.");
      return;
    }
    if (!advancementTargetRoundId) {
      setError("Please select a target round for the advancing teams.");
      return;
    }

    setAdvancingExecuting(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/rounds/advance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          sourceRoundId: advancementSourceRound?.id,
          targetRoundId: advancementTargetRoundId,
          targetGroupId: advancementTargetGroupId || undefined,
          teamIds: Array.from(selectedTeamIds),
          advancementType: advancementPreset,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || data.error || "Failed to advance teams.");
      }

      const targetRoundObj = rounds.find((r) => r.id === advancementTargetRoundId);
      const targetName = targetRoundObj ? targetRoundObj.name : "Next Round";

      setSuccess(`🎉 Successfully qualified and advanced ${data.advanced_count || selectedTeamIds.size} teams to "${targetName}"!`);
      setShowAdvancementModal(false);

      await fetchDistricts();
      await fetchRoadmap();
    } catch (err) {
      setError(err.message || "Failed to advance teams.");
    } finally {
      setAdvancingExecuting(false);
    }
  };

  const handleDeleteDay = (roundIdx, dayIdx) => {
    setRounds((prev) => {
      const updated = [...prev];
      const round = { ...updated[roundIdx] };
      if ((round.days || []).length <= 1) {
        alert("Each round must have at least one match day.");
        return prev;
      }
      const days = round.days.filter((_, i) => i !== dayIdx).map((d, i) => ({ ...d, day_number: i + 1 }));
      round.days = days;
      updated[roundIdx] = round;
      return updated;
    });
  };

  // District Allocation Actions
  const handleAddDistrictToDay = (roundIdx, dayIdx, districtId, count = 1) => {
    if (!districtId) return;
    const selectedDist = districts.find((d) => d.id === districtId);
    const distName = selectedDist ? selectedDist.name : `District ${districtId}`;
    const game = meta?.game || "bgmi";
    const mapRoster = getMapOptions(game);

    setRounds((prev) => {
      const updated = [...prev];
      const round = { ...updated[roundIdx] };
      const days = [...round.days];
      const day = { ...days[dayIdx] };
      const allocations = [...(day.allocations || [])];

      // Check if already added to this day
      if (allocations.some((a) => a.district_id === districtId)) {
        alert(`${distName} is already scheduled on Day ${day.day_number}. You can increase its match count directly.`);
        return prev;
      }

      const matchCount = Math.max(1, Number(count) || 1);
      const matches = [];
      for (let m = 1; m <= matchCount; m++) {
        matches.push({
          id: `MAT-${Date.now()}-${m}`,
          district_match_number: m,
          start_time: `${12 + m}:00`,
          end_time: `${12 + m}:30`,
          map: mapRoster[(m - 1) % mapRoster.length],
          notes: "",
        });
      }

      const stableAllocId = `ALLOC-${Date.now()}-${allocations.length + 1}-${Math.random().toString(36).slice(2, 6)}`;
      allocations.push({
        id: stableAllocId,
        group_id: stableAllocId,
        district_id: districtId,
        district_name: distName,
        capacity: selectedDist?.capacity || 16,
        team_count: selectedDist?.team_count ?? 0,
        registered_teams_count: selectedDist?.registered_teams_count ?? selectedDist?.team_count ?? 0,
        match_count: matchCount,
        matches,
      });

      day.allocations = allocations;
      days[dayIdx] = day;
      round.days = days;
      updated[roundIdx] = round;
      return updated;
    });
  };

  const handleUpdateDistrictMatchCount = (roundIdx, dayIdx, allocIdx, newCount) => {
    const count = Math.max(1, Math.min(20, Number(newCount) || 1));
    const game = meta?.game || "bgmi";
    const mapRoster = getMapOptions(game);

    setRounds((prev) => {
      const updated = [...prev];
      const round = { ...updated[roundIdx] };
      const days = [...round.days];
      const day = { ...days[dayIdx] };
      const allocations = [...day.allocations];
      const alloc = { ...allocations[allocIdx] };

      const existingMatches = [...(alloc.matches || [])];
      if (count > existingMatches.length) {
        for (let m = existingMatches.length + 1; m <= count; m++) {
          existingMatches.push({
            id: `MAT-${Date.now()}-${m}`,
            district_match_number: m,
            start_time: `${12 + m}:00`,
            end_time: `${12 + m}:30`,
            map: mapRoster[(m - 1) % mapRoster.length],
            notes: "",
          });
        }
      } else if (count < existingMatches.length) {
        existingMatches.splice(count);
      }

      alloc.match_count = count;
      alloc.matches = existingMatches;
      allocations[allocIdx] = alloc;
      day.allocations = allocations;
      days[dayIdx] = day;
      round.days = days;
      updated[roundIdx] = round;
      return updated;
    });
  };

  const handleRemoveDistrictFromDay = (roundIdx, dayIdx, allocIdx) => {
    setRounds((prev) => {
      const updated = [...prev];
      const round = { ...updated[roundIdx] };
      const days = [...round.days];
      const day = { ...days[dayIdx] };
      day.allocations = day.allocations.filter((_, i) => i !== allocIdx);
      days[dayIdx] = day;
      round.days = days;
      updated[roundIdx] = round;
      return updated;
    });
  };

  const handleUpdateDistrictAllocation = (roundIdx, dayIdx, allocIdx, newDistrictId) => {
    if (!newDistrictId) return;
    setRounds((prev) => {
      const updated = [...prev];
      const round = { ...updated[roundIdx] };
      const days = [...round.days];
      const day = { ...days[dayIdx] };
      const allocations = [...day.allocations];
      const alloc = { ...allocations[allocIdx] };

      // Ensure new district is not already allocated on THIS match day in another block
      if (allocations.some((a, i) => i !== allocIdx && a.district_id === newDistrictId)) {
        const distName = districts.find((d) => d.id === newDistrictId)?.name || `District ${newDistrictId}`;
        alert(`${distName} is already scheduled on Day ${day.day_number || dayIdx + 1}. Please choose another district.`);
        return prev;
      }

      const selectedDist = districts.find((d) => d.id === newDistrictId);
      const distName = selectedDist ? selectedDist.name : `District ${newDistrictId}`;

      alloc.district_id = newDistrictId;
      alloc.district_name = distName;
      alloc.capacity = selectedDist?.capacity || 16;
      alloc.team_count = selectedDist?.team_count ?? 0;
      alloc.registered_teams_count = selectedDist?.registered_teams_count ?? selectedDist?.team_count ?? 0;
      alloc.matches = (alloc.matches || []).map((m) => ({
        ...m,
        group_name: distName,
      }));

      allocations[allocIdx] = alloc;
      day.allocations = allocations;
      days[dayIdx] = day;
      round.days = days;
      updated[roundIdx] = round;
      return updated;
    });
  };

  const handleAddNextDistrictToDay = (roundIdx, dayIdx) => {
    const round = rounds[roundIdx];
    const day = round?.days?.[dayIdx];
    if (!day) return;
    const scheduledDistIds = new Set((day.allocations || []).map((a) => a.district_id));
    const nextAvailable = districts.find((d) => !scheduledDistIds.has(d.id));
    if (nextAvailable) {
      handleAddDistrictToDay(roundIdx, dayIdx, nextAvailable.id, 1);
    } else if (districts.length > 0) {
      alert(`All ${districts.length} tournament districts are already scheduled on Day ${day.day_number || dayIdx + 1}. You can edit or increase their match counts directly.`);
    } else {
      handleAddDistrictToDay(roundIdx, dayIdx, `GRP-${Date.now()}`, 1);
    }
  };

  const toggleExpandMatches = (allocKey) => {
    setExpandedMatches((prev) => {
      const next = new Set(prev);
      if (next.has(allocKey)) {
        next.delete(allocKey);
      } else {
        next.add(allocKey);
      }
      return next;
    });
  };

  // Match Level Editing
  const handleUpdateMatch = (roundIdx, dayIdx, allocIdx, matchIdx, field, value) => {
    setRounds((prev) => {
      const updated = [...prev];
      const round = { ...updated[roundIdx] };
      const days = [...round.days];
      const day = { ...days[dayIdx] };
      const allocations = [...day.allocations];
      const alloc = { ...allocations[allocIdx] };
      const matches = [...alloc.matches];

      matches[matchIdx] = { ...matches[matchIdx], [field]: value };
      alloc.matches = matches;
      allocations[allocIdx] = alloc;
      day.allocations = allocations;
      days[dayIdx] = day;
      round.days = days;
      updated[roundIdx] = round;
      return updated;
    });
  };

  // Bulk apply map or start times across district matches
  const handleBulkApplyMap = (roundIdx, dayIdx, allocIdx, mapName) => {
    setRounds((prev) => {
      const updated = [...prev];
      const round = { ...updated[roundIdx] };
      const days = [...round.days];
      const day = { ...days[dayIdx] };
      const allocations = [...day.allocations];
      const alloc = { ...allocations[allocIdx] };
      alloc.matches = (alloc.matches || []).map((m) => ({ ...m, map: mapName }));
      allocations[allocIdx] = alloc;
      day.allocations = allocations;
      days[dayIdx] = day;
      round.days = days;
      updated[roundIdx] = round;
      return updated;
    });
  };

  // Persistence: Save Draft
  const handleSaveDraft = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/roadmap/draft`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ roadmap: { rounds } }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || data.error || "Failed to save draft.");
      setSuccess("Roadmap draft saved to database successfully.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Persistence: Publish Roadmap
  const handlePublish = async () => {
    if (validationErrors.length > 0) {
      setError("Please resolve the validation errors before publishing.");
      return;
    }
    if (!window.confirm("Publish this roadmap? Once published, participants will be able to view the schedule.")) {
      return;
    }

    setPublishing(true);
    setError(null);
    setSuccess(null);
    setPublishErrors([]);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/roadmap/publish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ roadmap: { rounds } }),
      });
      const data = await res.json();
      if (!data.success) {
        if (data.errors && Array.isArray(data.errors)) {
          setPublishErrors(data.errors);
        }
        throw new Error(data.message || data.error || "Failed to publish roadmap.");
      }
      setIsPublished(true);
      setSuccess("Roadmap published successfully! Participants can now view the tournament schedule.");
      if (onApproved) onApproved();
      await fetchRoadmap();
    } catch (err) {
      setError(err.message);
    } finally {
      setPublishing(false);
    }
  };

  // Unpublish / Revert to Draft
  const handleUnpublish = async () => {
    if (!window.confirm("Revert roadmap to Draft? Ordinary participants will see 'Roadmap will be published soon' until you publish again.")) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/roadmap/unpublish`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || data.error || "Failed to unpublish.");
      setIsPublished(false);
      setSuccess("Roadmap reverted to draft.");
      await fetchRoadmap();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const activeRound = rounds[selectedRoundIdx] || rounds[0];
  const isGrandFinal = Boolean(
    activeRound && (
      activeRound.round_type === "grand_final" ||
      (!activeRound.round_type && selectedRoundIdx === rounds.length - 1 && rounds.length > 1) ||
      (activeRound.name || "").toLowerCase().includes("grand final")
    )
  );

  const configuredPrizePositions = useMemo(() => {
    return getPrizePositions(meta);
  }, [meta]);

  // Helper calculating total advancing teams (0 for Grand Finals)
  const calculateTotalAdvancing = (round) => {
    if (!round) return 0;
    if (round.round_type === "grand_final" || (round.name || "").toLowerCase().includes("grand final")) return 0;
    if (round.advancement_type === "per_district") {
      const scheduledDistCount = new Set((round.days || []).flatMap((d) => (d.allocations || []).map((a) => a.district_id))).size;
      return scheduledDistCount * (Number(round.teams_advancing_per_district) || 0);
    }
    if (round.advancement_type === "per_match") {
      const totalMatches = (round.days || []).reduce((acc, d) => acc + (d.allocations || []).reduce((mAcc, a) => mAcc + (a.match_count || 0), 0), 0);
      return totalMatches * (Number(round.teams_advancing_per_match) || 0);
    }
    return Number(round.teams_advancing) || 0;
  };

  // ─────────────────────────────────────────────────────────────
  // RENDER: Loading State
  // ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="w-full max-w-6xl mx-auto my-8 p-12 bg-white border border-[#E4E7EC] rounded-2xl text-[#667085] shadow-xs flex flex-col items-center justify-center text-center">
        <RefreshCw className="w-8 h-8 animate-spin text-[#2563EB] mb-3" />
        <p className="font-semibold text-[#172033] text-sm">Loading Tournament Roadmap...</p>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // RENDER: Participant View (Before Publication)
  // ─────────────────────────────────────────────────────────────
  if (!effectiveOrganizer && !isPublished) {
    return (
      <div className="w-full max-w-3xl mx-auto my-8 p-8 sm:p-12 bg-white border border-[#E4E7EC] rounded-2xl text-center shadow-xs">
        <div className="inline-flex p-4 rounded-2xl bg-blue-50 border border-blue-100 text-[#2563EB] mb-5">
          <Clock className="w-9 h-9" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-[#172033] mb-2 tracking-tight">
          Roadmap will be published soon
        </h2>
        <p className="text-[#667085] text-sm sm:text-base max-w-md mx-auto leading-relaxed">
          The tournament organizer is setting up the round schedules and district match allocations. Check back once the roadmap goes live!
        </p>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // RENDER: Organizer View when No Roadmap Exists (Initial / Post-Delete State)
  // ─────────────────────────────────────────────────────────────
  if (effectiveOrganizer && rounds.length === 0) {
    const game = meta?.game || "BGMI";
    return (
      <div className="w-full max-w-4xl mx-auto space-y-6">
        {/* Header Bar */}
        <div className="p-5 sm:p-6 bg-white border border-[#E4E7EC] rounded-2xl shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                Status: Not Configured
              </span>
              <span className="text-xs font-mono text-[#667085] uppercase bg-[#F8FAFC] border border-[#E4E7EC] px-2 py-0.5 rounded">
                Game: {game}
              </span>
              {onClose && (
                <button
                  onClick={onClose}
                  className="p-1 rounded-lg text-[#667085] hover:text-[#172033] hover:bg-[#F2F4F7] transition ml-auto sm:ml-2"
                  title="Close Roadmap"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#172033] tracking-tight">{tournamentTitle}</h1>
            <p className="text-xs sm:text-sm text-[#667085] mt-1">
              Configure and publish tournament rounds, match schedules, and district progression.
            </p>
          </div>
          <div className="flex items-center gap-3 sm:gap-6 bg-[#F8FAFC] p-3 sm:p-3.5 rounded-xl border border-[#E4E7EC] w-full sm:w-auto justify-around sm:justify-start">
            <div className="text-center px-2">
              <div className="text-xs text-[#667085] font-medium">Districts</div>
              <div className="text-lg sm:text-xl font-bold text-[#172033]">{districts.length || meta?.total_districts || 0}</div>
            </div>
            <div className="w-px h-8 bg-[#E4E7EC]" />
            <div className="text-center px-2">
              <div className="text-xs text-[#667085] font-medium">Teams</div>
              <div className="text-lg sm:text-xl font-bold text-[#16A34A]">{meta?.total_teams ?? meta?.slots_filled ?? 0}</div>
            </div>
            <div className="w-px h-8 bg-[#E4E7EC]" />
            <div className="text-center px-2">
              <div className="text-xs text-[#667085] font-medium">Total Slots</div>
              <div className="text-lg sm:text-xl font-bold text-[#667085]">{meta?.total_slots || 64}</div>
            </div>
          </div>
        </div>

        {/* Feedback Messages */}
        <AnimatePresence>
          {success && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center justify-between shadow-xs"
            >
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-[#16A34A] shrink-0" />
                <span>{success}</span>
              </div>
              <button onClick={() => setSuccess(null)} className="text-emerald-700 hover:text-emerald-950 p-1">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-center justify-between shadow-xs"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-[#DC2626] shrink-0" />
                <span className="break-words">{error}</span>
              </div>
              <button onClick={() => setError(null)} className="text-red-700 hover:text-red-950 p-1">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty State Action Card */}
        <div className="p-8 sm:p-12 bg-white border border-[#E4E7EC] rounded-2xl text-center shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 text-[#2563EB] flex items-center justify-center mx-auto mb-4">
            <Map className="w-8 h-8" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#172033] mb-2 tracking-tight">
            No Roadmap Generated
          </h2>
          <p className="text-[#667085] text-sm sm:text-base max-w-lg mx-auto mb-6 leading-relaxed">
            The roadmap for this tournament has been cleared. Ordinary participants currently see &ldquo;Roadmap will be published soon&rdquo;.
            Click &ldquo;Generate Roadmap&rdquo; to automatically construct a tournament schedule from your registered districts, or start manually.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={handleGenerateRoadmap}
              disabled={generatingRoadmap}
              className="px-6 py-3 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white font-bold text-sm transition shadow-xs flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {generatingRoadmap ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
              {generatingRoadmap ? "Generating Roadmap..." : "Generate Roadmap"}
            </button>
            <button
              onClick={handleAddRound}
              className="px-5 py-3 rounded-xl bg-white hover:bg-slate-50 text-[#172033] font-bold text-sm border border-[#E4E7EC] transition shadow-xs flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[#2563EB]" />
              Start Manually (Add Round 1)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // RENDER: Participant View (After Publication) OR Organizer Preview
  // ─────────────────────────────────────────────────────────────
  if ((!effectiveOrganizer && isPublished) || (effectiveOrganizer && previewMode)) {
    return (
      <div className="w-full max-w-5xl mx-auto space-y-6">
        {/* Preview Banner if Organizer */}
        {effectiveOrganizer && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 shadow-xs">
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-amber-600 shrink-0" />
              <span className="font-semibold text-xs sm:text-sm">Participant Preview Mode — Showing how attendees see the live roadmap.</span>
            </div>
            <button
              onClick={() => setPreviewMode(false)}
              className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition shadow-xs"
            >
              Exit Preview
            </button>
          </div>
        )}

        {/* Header Overview Card */}
        <div className="p-5 sm:p-6 bg-white border border-[#E4E7EC] rounded-2xl shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-50 text-[#16A34A] border border-emerald-200">
                Official Schedule
              </span>
              <span className="text-xs text-[#667085] uppercase font-mono bg-[#F8FAFC] border border-[#E4E7EC] px-2 py-0.5 rounded">
                {meta?.game || "BGMI"}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#172033] tracking-tight">{tournamentTitle}</h1>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div className="text-right">
              <div className="text-xs text-[#667085] font-medium">Districts</div>
              <div className="text-base sm:text-lg font-bold text-[#172033]">{districts.length || meta?.total_districts || 0}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-[#667085] font-medium">Participants</div>
              <div className="text-base sm:text-lg font-bold text-[#16A34A]">{meta?.total_teams || meta?.slots_filled || 0} Teams</div>
            </div>
          </div>
        </div>

        {/* Rounds Navigation Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 border-b border-[#E4E7EC]">
          {rounds.map((round, idx) => (
            <button
              key={round.id || idx}
              onClick={() => setSelectedRoundIdx(idx)}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap transition flex items-center gap-2 shrink-0 ${
                selectedRoundIdx === idx
                  ? "bg-[#2563EB] text-white shadow-xs"
                  : "bg-white text-[#667085] hover:text-[#172033] hover:bg-[#F8FAFC] border border-[#E4E7EC]"
              }`}
            >
              <Trophy className="w-4 h-4" />
              <span>{round.name || `Round ${idx + 1}`}</span>
            </button>
          ))}
        </div>

        {/* Active Round Content */}
        {activeRound && (
          <div className="space-y-6">
            {/* Round Advancement Summary */}
            {activeRound.advancement_target_round_id && (
              <div className="p-4 bg-blue-50/60 border border-blue-100 rounded-xl flex items-center gap-3 text-xs sm:text-sm text-[#172033]">
                <Sparkles className="w-5 h-5 text-[#2563EB] shrink-0" />
                <div>
                  <span className="font-semibold text-[#172033]">Advancement Rule: </span>
                  {activeRound.advancement_type === "per_district"
                    ? `Top ${activeRound.teams_advancing_per_district || 2} teams from each district advance to the next stage.`
                    : `Top teams advance to the next round.`}
                </div>
              </div>
            )}

            {/* Days in Round */}
            {(activeRound.days || []).map((day, dIdx) => (
              <div key={day.id || dIdx} className="bg-white border border-[#E4E7EC] rounded-2xl overflow-hidden shadow-xs">
                <div className="p-4 bg-[#F8FAFC] border-b border-[#E4E7EC] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#2563EB] border border-blue-100 flex items-center justify-center font-bold text-xs sm:text-sm">
                      D{day.day_number || dIdx + 1}
                    </div>
                    <div>
                      <h3 className="font-bold text-[#172033] text-sm sm:text-base">Day {day.day_number || dIdx + 1}</h3>
                      <div className="text-xs text-[#667085] flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{formatDateDisplay(day.date)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-xs font-semibold px-2.5 py-1 bg-white border border-[#E4E7EC] rounded-lg text-[#667085]">
                    {(day.allocations || []).reduce((acc, a) => acc + (a.match_count || (a.matches ? a.matches.length : 0)), 0)} Matches
                  </div>
                </div>

                <div className="p-4 sm:p-6 space-y-6">
                  {(day.allocations || []).map((alloc, aIdx) => {
                    const matchingDist = districts.find((d) => d.id === alloc.district_id || d.name === alloc.district_name);
                    const regCount = matchingDist?.registered_teams_count ?? matchingDist?.team_count ?? alloc.registered_teams_count ?? alloc.team_count ?? 0;
                    return (
                      <div key={alloc.id || alloc.district_id || aIdx} className="bg-[#F8FAFC] border border-[#E4E7EC] rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3 border-b border-[#E4E7EC] pb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-[#667085]">{aIdx + 1}.</span>
                            <Users className="w-4 h-4 text-[#2563EB]" />
                            <h4 className="font-bold text-[#172033] text-sm sm:text-base">{alloc.district_name}</h4>
                            <span className="text-xs px-2.5 py-0.5 rounded-md bg-white border border-[#E4E7EC] text-[#667085] font-medium">
                              {regCount} registered team{regCount === 1 ? "" : "s"}
                            </span>
                          </div>
                          <span className="text-xs font-semibold text-[#667085]">
                            {alloc.match_count} Match{alloc.match_count === 1 ? "" : "es"}
                          </span>
                        </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {(alloc.matches || []).map((match, mIdx) => (
                          <div
                            key={match.id || mIdx}
                            className="p-3.5 rounded-xl bg-white border border-[#E4E7EC] hover:border-blue-300 transition flex flex-col justify-between gap-3 shadow-xs"
                          >
                            <div className="flex items-start justify-between">
                              <span className="font-bold text-sm text-[#2563EB]">Match {match.district_match_number || mIdx + 1}</span>
                              <span className="text-xs px-2 py-0.5 rounded bg-[#F8FAFC] border border-[#E4E7EC] text-[#667085] font-medium">
                                {match.map || "Erangel"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-xs text-[#667085]">
                              <div className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-[#667085]" />
                                <span>{formatTime12h(match.start_time)}</span>
                              </div>
                              {match.credentials_available ? (
                                <span className="inline-flex items-center gap-1 text-[#16A34A] font-semibold">
                                  <Unlock className="w-3.5 h-3.5" /> ID/Pass Ready
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[#98A2B3]">
                                  <Lock className="w-3.5 h-3.5" /> Credentials Locked
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // RENDER: Full Manual Dynamic Roadmap Builder (Organizer View)
  // ─────────────────────────────────────────────────────────────
  const game = meta?.game || "bgmi";
  const mapOptions = getMapOptions(game);

  const mainBuilderContent = (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* 1. TOURNAMENT OVERVIEW HEADER */}
      <div className="p-5 sm:p-6 bg-white border border-[#E4E7EC] rounded-2xl shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border ${
                isPublished
                  ? "bg-emerald-50 text-[#16A34A] border-emerald-200"
                  : "bg-amber-50 text-[#D97706] border-amber-200"
              }`}
            >
              {isPublished ? "Status: Published" : "Status: Draft"}
            </span>
            <span className="text-xs font-mono text-[#667085] uppercase bg-[#F8FAFC] border border-[#E4E7EC] px-2 py-0.5 rounded">
              Game: {game}
            </span>
            {onClose && (
              <button
                onClick={onClose}
                className="p-1 rounded-lg text-[#667085] hover:text-[#172033] hover:bg-[#F2F4F7] transition ml-auto sm:ml-2"
                title="Close Roadmap"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#172033] tracking-tight">{tournamentTitle}</h1>
          <p className="text-xs sm:text-sm text-[#667085] mt-1">
            Manual Roadmap Builder — Configure rounds, match days, district scheduling, and advancement rules.
          </p>
        </div>

        {/* Database-derived stats bar */}
        <div className="flex items-center gap-3 sm:gap-6 bg-[#F8FAFC] p-3 sm:p-3.5 rounded-xl border border-[#E4E7EC] w-full sm:w-auto justify-around sm:justify-start">
          <div className="text-center px-2">
            <div className="text-xs text-[#667085] font-medium">Districts</div>
            <div className="text-lg sm:text-xl font-bold text-[#172033]">{districts.length || meta?.total_districts || 0}</div>
          </div>
          <div className="w-px h-8 bg-[#E4E7EC]" />
          <div className="text-center px-2">
            <div className="text-xs text-[#667085] font-medium">Teams</div>
            <div className="text-lg sm:text-xl font-bold text-[#16A34A]">{meta?.total_teams ?? meta?.slots_filled ?? 0}</div>
          </div>
          <div className="w-px h-8 bg-[#E4E7EC]" />
          <div className="text-center px-2">
            <div className="text-xs text-[#667085] font-medium">Total Slots</div>
            <div className="text-lg sm:text-xl font-bold text-[#667085]">{meta?.total_slots || 64}</div>
          </div>
        </div>
      </div>

      {/* Toast Feedback */}
      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center justify-between shadow-xs"
          >
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-[#16A34A] shrink-0" />
              <span>{success}</span>
            </div>
            <button onClick={() => setSuccess(null)} className="text-emerald-700 hover:text-emerald-950 p-1">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-center justify-between shadow-xs"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-[#DC2626] shrink-0" />
              <span className="break-words">{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-red-700 hover:text-red-950 p-1">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Validation Banners */}
      {(validationErrors.length > 0 || publishErrors.length > 0) && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-2">
          <div className="flex items-center gap-2 font-semibold text-red-800 text-sm">
            <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
            <span>Roadmap Validation Errors (Resolve to publish):</span>
          </div>
          <ul className="list-disc list-inside text-xs text-red-700 space-y-1.5 pl-1">
            {[...new Set([...validationErrors, ...publishErrors])].map((err, i) => (
              <li key={i} className="leading-relaxed break-words">{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Advisory Warnings Banner (e.g. 0 registered teams) */}
      {validationWarnings.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
          <div className="flex items-center gap-2 font-semibold text-amber-800 text-sm">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Configuration Advisories:</span>
          </div>
          <ul className="list-disc list-inside text-xs text-amber-700 space-y-1.5 pl-1">
            {validationWarnings.map((warn, i) => (
              <li key={i} className="leading-relaxed break-words">{warn}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 2. TOURNAMENT ROUNDS SECTION */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#2563EB]" />
            <h2 className="text-base sm:text-lg font-bold text-[#172033] tracking-tight">Tournament Rounds</h2>
            <span className="text-xs bg-[#F2F4F7] text-[#667085] px-2.5 py-0.5 rounded-full font-semibold">
              {rounds.length}
            </span>
          </div>
          <button
            onClick={handleAddRound}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-medium text-xs sm:text-sm rounded-lg shadow-xs transition focus:ring-2 focus:ring-blue-500/20"
          >
            <Plus className="w-4 h-4" /> Add Round
          </button>
        </div>

        {/* Round Tabs with horizontal scrolling and Add Round button */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-[#E4E7EC] scrollbar-thin">
          {rounds.map((round, idx) => (
            <div
              key={round.id || idx}
              onClick={() => setSelectedRoundIdx(idx)}
              className={`cursor-pointer px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-2 transition shrink-0 ${
                selectedRoundIdx === idx
                  ? "bg-[#2563EB] text-white shadow-xs"
                  : "bg-white text-[#667085] hover:text-[#172033] hover:bg-[#F8FAFC] border border-[#E4E7EC]"
              }`}
            >
              <span>{round.name || `Round ${idx + 1}`}</span>
              <div className="flex items-center gap-0.5 ml-1" onClick={(e) => e.stopPropagation()}>
                {idx > 0 && (
                  <button
                    onClick={() => handleMoveRound(idx, "up")}
                    className={`p-0.5 rounded ${selectedRoundIdx === idx ? "hover:bg-white/20 text-white" : "hover:bg-[#F2F4F7] text-[#98A2B3] hover:text-[#172033]"}`}
                    title="Move Round Left/Up"
                  >
                    <ChevronUp className="w-3.5 h-3.5 -rotate-90" />
                  </button>
                )}
                {idx < rounds.length - 1 && (
                  <button
                    onClick={() => handleMoveRound(idx, "down")}
                    className={`p-0.5 rounded ${selectedRoundIdx === idx ? "hover:bg-white/20 text-white" : "hover:bg-[#F2F4F7] text-[#98A2B3] hover:text-[#172033]"}`}
                    title="Move Round Right/Down"
                  >
                    <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
                  </button>
                )}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={handleAddRound}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-[#2563EB] font-semibold text-xs sm:text-sm rounded-lg border border-blue-200 transition shrink-0"
            title="Add another tournament round"
          >
            <Plus className="w-4 h-4" /> Add Round
          </button>
        </div>

        {/* 3. ACTIVE ROUND WORKSPACE */}
        {activeRound && (
          <div className="p-4 sm:p-6 bg-white border border-[#E4E7EC] rounded-2xl space-y-6 shadow-xs">
            {/* Round Settings Bar */}
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#E4E7EC] pb-5">
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 flex-1 min-w-[280px]">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-semibold text-[#667085] mb-1.5">Round Name</label>
                  <input
                    type="text"
                    value={activeRound.name}
                    onChange={(e) => handleUpdateRound(selectedRoundIdx, "name", e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#E4E7EC] rounded-xl text-[#172033] font-bold text-sm sm:text-base placeholder:text-[#98A2B3] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition shadow-2xs"
                    placeholder="e.g. Round 1, Qualifier 1, Semifinals, Grand Finals"
                  />
                </div>

                <div className="w-56 shrink-0">
                  <label className="block text-xs font-semibold text-[#667085] mb-1.5">Round Stage Type</label>
                  <select
                    value={activeRound.round_type || "qualifier"}
                    onChange={(e) => {
                      const newType = e.target.value;
                      handleUpdateRound(selectedRoundIdx, "round_type", newType);
                    }}
                    className={`w-full px-3 py-2.5 rounded-xl font-bold text-xs sm:text-sm border transition focus:outline-none ${
                      isGrandFinal
                        ? "bg-amber-50 text-amber-900 border-amber-300 focus:ring-2 focus:ring-amber-500/20"
                        : "bg-white text-[#172033] border-[#E4E7EC] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    }`}
                  >
                    <option value="qualifier">Qualifier / Group Stage</option>
                    <option value="grand_final">🏆 Grand Finals (Terminal Stage)</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="px-3.5 py-2 bg-[#F8FAFC] border border-[#E4E7EC] rounded-xl text-xs text-[#667085] flex items-center gap-2">
                  <span>Round Summary:</span>
                  <strong className="text-[#2563EB] font-bold">
                    {(activeRound.days || []).reduce(
                      (acc, d) => acc + (d.allocations || []).reduce((mAcc, a) => mAcc + (Number(a.match_count) || 0), 0),
                      0
                    )}{" "}
                    matches
                  </strong>
                  <span>across</span>
                  <strong className="text-[#172033] font-bold">
                    {(activeRound.days || []).length} match day{(activeRound.days || []).length === 1 ? "" : "s"}
                  </strong>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteRound(selectedRoundIdx)}
                  className="px-3.5 py-2 text-xs sm:text-sm font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition flex items-center gap-1.5 border border-red-200"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Round
                </button>
              </div>
            </div>

            {/* 4. DAY-BY-DAY DISTRICT ALLOCATION */}
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-[#172033] flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[#2563EB]" />
                    Match Days & District Allocations
                  </h3>
                  <p className="text-xs text-[#667085] mt-0.5">
                    Configure dates and district match counts for each day. Multiple districts can play the same round across different days.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleAddDay(selectedRoundIdx)}
                  className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 bg-white hover:bg-[#F8FAFC] text-[#172033] font-medium text-xs sm:text-sm rounded-lg border border-[#E4E7EC] shadow-xs transition"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Match Day
                </button>
              </div>

              {/* Days List */}
              {(activeRound.days || []).length === 0 ? (
                <div className="py-12 px-4 text-center border border-dashed border-[#E4E7EC] rounded-2xl bg-[#F8FAFC] space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#2563EB] border border-blue-100 flex items-center justify-center mx-auto">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-base text-[#172033]">No match days in {activeRound.name} yet</h4>
                  <p className="text-xs text-[#667085] max-w-sm mx-auto">
                    Add a match day to configure dates, scheduled districts, and match counts for this round.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleAddDay(selectedRoundIdx)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-xs sm:text-sm rounded-xl shadow-xs transition"
                  >
                    <Plus className="w-4 h-4" /> Add Match Day
                  </button>
                </div>
              ) : (
                (activeRound.days || []).map((day, dIdx) => {
                  const dayAllocations = day.allocations || [];
                  const dayTotalMatches = dayAllocations.reduce((acc, a) => acc + (Number(a.match_count) || 0), 0);

                  return (
                    <div key={day.id || dIdx} className="bg-[#F8FAFC] border border-[#E4E7EC] rounded-xl p-4 sm:p-5 space-y-4">
                      {/* Day Header */}
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E7EC] pb-3">
                        <div className="flex items-center gap-3">
                          <span className="w-7 h-7 rounded-lg bg-blue-50 text-[#2563EB] border border-blue-100 flex items-center justify-center font-bold text-xs">
                            D{day.day_number || dIdx + 1}
                          </span>
                          <div>
                            <span className="font-bold text-[#172033] text-sm">Day {day.day_number || dIdx + 1}</span>
                            <span className="text-xs text-[#667085] ml-2 font-mono">
                              Total: <strong className="text-[#2563EB] font-bold">{dayTotalMatches}</strong> match{dayTotalMatches === 1 ? "" : "es"}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-1.5 text-xs text-[#667085]">
                            <label className="font-semibold text-[#172033]">Date:</label>
                            <input
                              type="date"
                              min={minSelectableDate || undefined}
                              value={day.date || ""}
                              onChange={(e) => handleUpdateDay(selectedRoundIdx, dIdx, "date", e.target.value)}
                              className="px-2.5 py-1.5 bg-white border border-[#E4E7EC] rounded-lg text-[#172033] text-xs font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition shadow-2xs"
                            />
                            {day.date && getDayOfWeek(day.date) && (
                              <span className="px-2.5 py-1 rounded-md bg-blue-50 text-[#2563EB] font-bold text-xs border border-blue-200 flex items-center gap-1 shadow-2xs">
                                <Calendar className="w-3.5 h-3.5" />
                                {getDayOfWeek(day.date)}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteDay(selectedRoundIdx, dIdx)}
                            className="p-1.5 rounded-lg text-[#667085] hover:text-red-600 hover:bg-red-50 transition"
                            title="Delete Day"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* District Allocations Section */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-[#667085] uppercase tracking-wider">
                            District allocations
                          </label>
                          <span className="text-xs text-[#667085]">
                            {dayAllocations.length} district{dayAllocations.length === 1 ? "" : "s"} scheduled
                          </span>
                        </div>

                        {dayAllocations.length === 0 ? (
                          <div className="py-6 text-center text-xs text-[#667085] border border-dashed border-[#E4E7EC] rounded-xl bg-white space-y-2">
                            <p>No districts scheduled for Day {day.day_number || dIdx + 1} yet.</p>
                            <button
                              type="button"
                              onClick={() => handleAddNextDistrictToDay(selectedRoundIdx, dIdx)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#2563EB] font-semibold text-xs rounded-lg transition"
                            >
                              <Plus className="w-3.5 h-3.5" /> Add First District
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {dayAllocations.map((alloc, aIdx) => {
                              const allocStableId = alloc.id || alloc.group_id || alloc.district_id || `alloc-${aIdx}`;
                              const allocKey = `${selectedRoundIdx}-${dIdx}-${allocStableId}`;
                              const isExpanded = expandedMatches.has(allocKey);
                              const otherDistIdsOnThisDay = new Set(
                                dayAllocations.filter((_, i) => i !== aIdx).map((a) => a.district_id)
                              );

                              const matchingDist = districts.find(
                                (d) => d.id === alloc.district_id || d.name === alloc.district_name
                              );
                              const registeredCount =
                                matchingDist?.registered_teams_count ??
                                matchingDist?.team_count ??
                                alloc.registered_teams_count ??
                                alloc.team_count ??
                                0;
                              const isDragging = draggedAllocIdx === aIdx;

                              return (
                                <div
                                  key={allocKey}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = "move";
                                  }}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    const fromIdx = Number(e.dataTransfer.getData("text/plain"));
                                    handleReorderDistrictAllocation(selectedRoundIdx, dIdx, fromIdx, aIdx);
                                    setDraggedAllocIdx(null);
                                  }}
                                  className={`bg-white border rounded-xl p-3 sm:p-4 space-y-3 shadow-2xs transition ${
                                    isDragging
                                      ? "border-blue-500 bg-blue-50/40 opacity-75 ring-2 ring-blue-500/20"
                                      : "border-[#E4E7EC] hover:border-[#D0D5DD]"
                                  }`}
                                >
                                  {/* Main Allocation Row: [Reorder controls] [District Selector ▼] [Registered Count] [Match Count] [Details Toggle] [Remove] */}
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
                                      {/* Position Index & Reorder Controls */}
                                      <div className="flex items-center gap-1 shrink-0">
                                        <span className="font-mono text-xs font-bold text-[#667085] w-5 text-right shrink-0 select-none">
                                          {aIdx + 1}.
                                        </span>

                                        {/* Drag Handle */}
                                        <div
                                          draggable
                                          onDragStart={(e) => {
                                            e.dataTransfer.setData("text/plain", String(aIdx));
                                            e.dataTransfer.effectAllowed = "move";
                                            setDraggedAllocIdx(aIdx);
                                          }}
                                          onDragEnd={() => setDraggedAllocIdx(null)}
                                          className="cursor-grab active:cursor-grabbing p-1.5 text-[#98A2B3] hover:text-[#172033] hover:bg-[#F2F4F7] rounded-lg transition shrink-0"
                                          title="Drag to reorder district allocation"
                                        >
                                          <GripVertical className="w-4 h-4" />
                                        </div>

                                        {/* Touch-Friendly Accessible Up / Down Buttons */}
                                        <div className="flex items-center gap-0.5 shrink-0">
                                          <button
                                            type="button"
                                            disabled={aIdx === 0}
                                            onClick={() => handleMoveDistrictAllocation(selectedRoundIdx, dIdx, aIdx, "up")}
                                            className="p-1 rounded-md text-[#98A2B3] hover:text-[#172033] hover:bg-[#F2F4F7] disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-[#98A2B3] transition"
                                            title="Move District Up"
                                            aria-label={`Move ${alloc.district_name} up`}
                                          >
                                            <ChevronUp className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            disabled={aIdx === dayAllocations.length - 1}
                                            onClick={() => handleMoveDistrictAllocation(selectedRoundIdx, dIdx, aIdx, "down")}
                                            className="p-1 rounded-md text-[#98A2B3] hover:text-[#172033] hover:bg-[#F2F4F7] disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-[#98A2B3] transition"
                                            title="Move District Down"
                                            aria-label={`Move ${alloc.district_name} down`}
                                          >
                                            <ChevronDown className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </div>

                                      {/* District Selector Dropdown */}
                                      <select
                                        value={alloc.district_id}
                                        onChange={(e) =>
                                          handleUpdateDistrictAllocation(selectedRoundIdx, dIdx, aIdx, e.target.value)
                                        }
                                        className="px-3 py-2 bg-white border border-[#E4E7EC] rounded-lg text-[#172033] font-bold text-xs sm:text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none min-w-[200px] sm:min-w-[240px] max-w-full"
                                      >
                                        {districts.map((d) => {
                                          const isAllocatedElsewhereToday = otherDistIdsOnThisDay.has(d.id);
                                          const dCount = d.registered_teams_count ?? d.team_count ?? 0;
                                          return (
                                            <option key={d.id} value={d.id} disabled={isAllocatedElsewhereToday}>
                                              {d.name} ({dCount} registered team{dCount === 1 ? "" : "s"})
                                              {isAllocatedElsewhereToday ? " — already added today" : ""}
                                            </option>
                                          );
                                        })}
                                      </select>

                                      {/* District Name — Registered-team count display */}
                                      <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-[#F8FAFC] border border-[#E4E7EC] text-[#172033] shrink-0">
                                        {alloc.district_name} — <strong className={registeredCount === 0 && !isGrandFinal ? "text-amber-600 font-bold" : "text-[#16A34A] font-bold"}>{registeredCount}</strong> registered team{registeredCount === 1 ? "" : "s"}
                                      </span>

                                      {isGrandFinal ? (
                                        <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-md flex items-center gap-1.5 shrink-0" title="Finalist slots reserved for Round 1 / Qualifier winners">
                                          <Sparkles className="w-3 h-3 text-blue-600" /> 16 Finalist Slots Reserved • Awaiting Qualifier Results
                                        </span>
                                      ) : (
                                        registeredCount === 0 && alloc.match_count > 0 && (
                                          <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0" title="This district has 0 registered teams">
                                            <AlertCircle className="w-3 h-3 text-amber-600" /> 0 registered teams
                                          </span>
                                        )
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2.5 shrink-0 ml-auto">
                                      {/* Match Count Input */}
                                      <div className="flex items-center gap-1.5 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg px-2.5 py-1">
                                        <input
                                          type="number"
                                          min="1"
                                          max="20"
                                          value={alloc.match_count}
                                          onChange={(e) =>
                                            handleUpdateDistrictMatchCount(selectedRoundIdx, dIdx, aIdx, e.target.value)
                                          }
                                          className="w-12 bg-transparent text-center text-xs sm:text-sm text-[#2563EB] font-bold focus:outline-none"
                                          title="Number of matches for this district"
                                        />
                                        <span className="text-xs text-[#667085] font-medium">
                                          {alloc.match_count === 1 ? "match" : "matches"}
                                        </span>
                                      </div>

                                      {/* Match Details Toggle */}
                                      <button
                                        type="button"
                                        onClick={() => toggleExpandMatches(allocKey)}
                                        className="px-2.5 py-1 text-xs text-[#667085] hover:text-[#172033] hover:bg-[#F2F4F7] border border-[#E4E7EC] rounded-lg transition whitespace-nowrap"
                                        title="Configure start times and maps"
                                      >
                                        {isExpanded ? "Hide Details" : "Details"}
                                      </button>

                                      {/* Remove Button */}
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveDistrictFromDay(selectedRoundIdx, dIdx, aIdx)}
                                        className="px-2.5 py-1 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg border border-red-200 transition flex items-center gap-1 shrink-0"
                                        title="Remove this district allocation"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        <span>Remove</span>
                                      </button>
                                    </div>
                                  </div>

                                {/* Expandable Individual Match Details (Map / Time) */}
                                {isExpanded && (
                                  <div className="pt-2 border-t border-[#E4E7EC] space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#667085]">
                                      <span className="font-semibold text-[#172033]">Individual Match Schedule</span>
                                      <div className="flex items-center gap-2">
                                        <span>Quick Map:</span>
                                        <select
                                          onChange={(e) => handleBulkApplyMap(selectedRoundIdx, dIdx, aIdx, e.target.value)}
                                          className="bg-white border border-[#E4E7EC] text-xs px-2.5 py-1 rounded text-[#172033] focus:border-blue-500 focus:outline-none"
                                          defaultValue=""
                                        >
                                          <option value="" disabled>Apply Map to All</option>
                                          {mapOptions.map((m) => (
                                            <option key={m} value={m}>{m}</option>
                                          ))}
                                        </select>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                      {(alloc.matches || []).map((match, mIdx) => (
                                        <div
                                          key={match.id || mIdx}
                                          className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E4E7EC] space-y-2"
                                        >
                                          <div className="flex items-center justify-between">
                                            <span className="font-bold text-xs text-[#2563EB]">
                                              Match {match.district_match_number || mIdx + 1}
                                            </span>
                                          </div>
                                          <div className="grid grid-cols-2 gap-2 text-xs">
                                            <div>
                                              <label className="block text-[#667085] text-[10px] uppercase font-semibold font-mono">Start</label>
                                              <input
                                                type="time"
                                                value={match.start_time || "13:00"}
                                                onChange={(e) => handleUpdateMatch(selectedRoundIdx, dIdx, aIdx, mIdx, "start_time", e.target.value)}
                                                className="w-full bg-white border border-[#E4E7EC] rounded px-2 py-1 text-[#172033] text-xs focus:border-blue-500 focus:outline-none"
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-[#667085] text-[10px] uppercase font-semibold font-mono">Map</label>
                                              <select
                                                value={match.map || mapOptions[0]}
                                                onChange={(e) => handleUpdateMatch(selectedRoundIdx, dIdx, aIdx, mIdx, "map", e.target.value)}
                                                className="w-full bg-white border border-[#E4E7EC] rounded px-2 py-1 text-[#172033] text-xs focus:border-blue-500 focus:outline-none"
                                              >
                                                {mapOptions.map((map) => (
                                                  <option key={map} value={map}>{map}</option>
                                                ))}
                                              </select>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* [+ Add District] and [+ Add Grand Finals / Custom District] buttons */}
                      <div className="pt-1 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleAddNextDistrictToDay(selectedRoundIdx, dIdx)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-xs sm:text-sm rounded-lg shadow-xs transition"
                        >
                          <Plus className="w-4 h-4" /> Add District
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenCustomDistrictModal(selectedRoundIdx, dIdx)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold text-xs sm:text-sm rounded-lg border border-purple-200 shadow-2xs transition"
                          title="Create a single new district (e.g. Grand Finals) for this day"
                        >
                          <Trophy className="w-4 h-4 text-purple-600" />
                          <span>+ Add Grand Finals / Custom District</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}

              {/* [+ Add Match Day] button inside current round */}
              <button
                type="button"
                onClick={() => handleAddDay(selectedRoundIdx)}
                className="w-full py-3 px-4 bg-white hover:bg-[#F8FAFC] text-[#172033] font-semibold text-xs sm:text-sm rounded-xl border border-dashed border-[#CBD5E1] hover:border-blue-400 shadow-2xs transition flex items-center justify-center gap-2 group"
              >
                <Plus className="w-4 h-4 text-[#2563EB] group-hover:scale-110 transition-transform" />
                <span>+ Add Match Day</span>
              </button>
            </div>

            {/* 5. ROUND PROGRESSION & ADVANCEMENT SETTINGS OR GRAND FINALS PRIZE DISTRIBUTION */}
            {isGrandFinal ? (
              <div className="p-4 sm:p-6 bg-gradient-to-br from-amber-50/70 via-white to-blue-50/40 border border-amber-200/80 rounded-2xl space-y-4 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200/60 pb-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 border border-amber-300 flex items-center justify-center font-bold shadow-2xs">
                      🏆
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm sm:text-base text-[#172033]">
                        Grand Finals — Terminal Stage & Prize Pool Distribution
                      </h4>
                      <p className="text-xs text-[#667085] mt-0.5">
                        This is the final stage of the tournament. No teams advance beyond Grand Finals. The completed Grand Finals leaderboard determines official rankings and prize winners.
                      </p>
                    </div>
                  </div>

                  {rounds.length > 1 && (
                    <button
                      type="button"
                      onClick={() => openAdvancementModal(rounds[0] || activeRound)}
                      className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition shrink-0"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Manage Finalist Qualifiers</span>
                    </button>
                  )}
                </div>

                {/* Configured Prize Distribution Grid */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-[#172033] uppercase tracking-wider flex items-center gap-1.5">
                      <Medal className="w-4 h-4 text-amber-600" />
                      Official Prize Distribution ({configuredPrizePositions.length} Prize Ranks)
                    </span>
                    {(meta?.prize_pool_amount || meta?.prize) && (
                      <span className="font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                        Total Prize Pool: {meta?.prize_pool_amount ? `₹${Number(meta.prize_pool_amount).toLocaleString('en-IN')}` : meta?.prize}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                    {configuredPrizePositions.map((pos) => {
                      const medalEmoji = pos.rank === 1 ? "🥇" : pos.rank === 2 ? "🥈" : pos.rank === 3 ? "🥉" : "🎖️";
                      return (
                        <div
                          key={pos.rank}
                          className="p-3.5 rounded-xl bg-white border border-[#E4E7EC] shadow-2xs space-y-1 hover:border-amber-300 transition"
                        >
                          <div className="flex items-center justify-between text-xs font-bold">
                            <span className="text-[#172033] flex items-center gap-1.5">
                              <span>{medalEmoji}</span>
                              <span>{pos.name || `Rank ${pos.rank}`}</span>
                            </span>
                            {pos.percentage != null && (
                              <span className="text-[#2563EB] bg-blue-50 px-1.5 py-0.5 rounded text-[10px]">
                                {pos.percentage}%
                              </span>
                            )}
                          </div>
                          <div className="text-base font-extrabold text-[#16A34A]">
                            {pos.prize_amount != null
                              ? `₹${Number(pos.prize_amount).toLocaleString('en-IN')}`
                              : `Rank ${pos.rank} Prize`}
                          </div>
                          <div className="text-[11px] text-[#667085] leading-tight">
                            Determined by final leaderboard standings
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="p-3 bg-amber-50/60 border border-amber-200/70 rounded-xl text-xs text-amber-900 flex items-start gap-2.5 leading-relaxed">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>Leaderboard Rules: </strong>
                    Cumulative match points (placement points + kill points) decide the winner ranks.
                    Verified match results are finalized securely through official result verification, and tie-breaking rules follow the tournament regulation.
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 sm:p-5 bg-[#F8FAFC] border border-[#E4E7EC] rounded-xl space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#2563EB]" />
                  <h4 className="font-bold text-sm text-[#172033]">Round Advancement Rules</h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-xs">
                  <div>
                    <label className="block text-[#667085] mb-1.5 font-semibold">Advancement Method</label>
                    <select
                      value={activeRound.advancement_type || "per_district"}
                      onChange={(e) => handleUpdateRound(selectedRoundIdx, "advancement_type", e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#E4E7EC] rounded-lg text-[#172033] text-xs sm:text-sm focus:border-blue-500 focus:outline-none"
                    >
                      <option value="per_district">Top Teams Per District</option>
                      <option value="per_match">Top Teams Per Match</option>
                      <option value="round_total">Total Teams from Round</option>
                      <option value="manual">Manual Advancement</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[#667085] mb-1.5 font-semibold">
                      {activeRound.advancement_type === "per_district"
                        ? "Teams Advancing Per District"
                        : activeRound.advancement_type === "per_match"
                        ? "Teams Advancing Per Match"
                        : "Total Advancing Teams"}
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="64"
                      value={
                        activeRound.advancement_type === "per_district"
                          ? activeRound.teams_advancing_per_district || 2
                          : activeRound.advancement_type === "per_match"
                          ? activeRound.teams_advancing_per_match || 8
                          : activeRound.teams_advancing || 16
                      }
                      onChange={(e) => {
                        const val = Number(e.target.value) || 0;
                        if (activeRound.advancement_type === "per_district") {
                          handleUpdateRound(selectedRoundIdx, "teams_advancing_per_district", val);
                        } else if (activeRound.advancement_type === "per_match") {
                          handleUpdateRound(selectedRoundIdx, "teams_advancing_per_match", val);
                        } else {
                          handleUpdateRound(selectedRoundIdx, "teams_advancing", val);
                        }
                      }}
                      className="w-full px-3 py-2 bg-white border border-[#E4E7EC] rounded-lg text-[#2563EB] font-bold text-xs sm:text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[#667085] mb-1.5 font-semibold">Advancing Target Round</label>
                    <select
                      value={activeRound.advancement_target_round_id || ""}
                      onChange={(e) => handleUpdateRound(selectedRoundIdx, "advancement_target_round_id", e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#E4E7EC] rounded-lg text-[#172033] text-xs sm:text-sm focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">None (Final Stage)</option>
                      {rounds
                        .filter((_, idx) => idx > selectedRoundIdx)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name || `Round ${r.round_number || ""}`}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {/* Advancement summary & Qualify Action Button */}
                <div className="p-3 bg-white border border-[#E4E7EC] rounded-lg text-xs flex flex-wrap items-center justify-between gap-3 text-[#667085]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>
                      Calculated Advancement: <strong className="text-[#2563EB] font-bold">{calculateTotalAdvancing(activeRound)} teams</strong> will advance from this round.
                    </span>
                    {activeRound.advancement_target_round_id && (
                      <span className="text-[#16A34A] font-semibold flex items-center gap-1">
                        <ArrowRight className="w-3.5 h-3.5" /> Next stage capacity validated
                      </span>
                    )}
                  </div>

                  {rounds.length > 1 && (
                    <button
                      type="button"
                      onClick={() => openAdvancementModal(activeRound)}
                      className="flex items-center gap-2 px-3.5 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs rounded-lg shadow-xs transition"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Qualify & Advance Teams</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 6. ACTION CONTROLS FOOTER */}
      <div className="p-4 bg-white border border-[#E4E7EC] rounded-2xl flex flex-wrap items-center justify-between gap-3 sm:gap-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setPreviewMode(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-[#F8FAFC] text-[#172033] font-semibold text-xs sm:text-sm rounded-lg border border-[#E4E7EC] shadow-xs transition"
          >
            <Eye className="w-4 h-4 text-[#667085]" /> Preview Roadmap
          </button>
          {isPublished && (
            <button
              onClick={handleUnpublish}
              className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-amber-50 text-[#D97706] font-semibold text-xs sm:text-sm rounded-lg border border-amber-200 transition"
            >
              <EyeOff className="w-4 h-4" /> Unpublish (Revert to Draft)
            </button>
          )}
          <div className="hidden sm:block w-px h-6 bg-[#E4E7EC] mx-1" />
          <button
            type="button"
            onClick={() => setShowMasterDeleteModal(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 hover:text-red-800 font-semibold text-xs sm:text-sm rounded-lg border border-red-200 transition shadow-2xs"
            title="Clear all rounds and reset roadmap to fresh state"
          >
            <Trash2 className="w-4 h-4 text-red-600" /> Delete Entire Roadmap
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleSaveDraft}
            disabled={saving || publishing}
            className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-[#F8FAFC] disabled:opacity-50 text-[#172033] font-semibold text-xs sm:text-sm rounded-lg border border-[#E4E7EC] shadow-xs transition"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin text-[#2563EB]" /> : <Save className="w-4 h-4 text-[#667085]" />}
            Save Draft
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing || saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-bold text-xs sm:text-sm uppercase tracking-wider rounded-lg transition shadow-xs focus:ring-2 focus:ring-blue-500/20"
          >
            {publishing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Publish Roadmap
          </button>
        </div>
      </div>

      {/* MASTER DELETE ROADMAP CONFIRMATION MODAL */}
      {showMasterDeleteModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => !deletingRoadmap && setShowMasterDeleteModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="master-delete-title"
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E4E7EC] space-y-4 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 border border-red-200 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 id="master-delete-title" className="text-lg font-bold text-[#172033]">
                  Delete Entire Roadmap?
                </h3>
                <p className="text-xs text-[#667085]">Destructive tournament reset</p>
              </div>
            </div>

            <p className="text-sm text-[#475467] leading-relaxed">
              This will completely remove all configured rounds, match days, district allocations, and roadmap configuration for this tournament. Ordinary participants will see &ldquo;Roadmap will be published soon&rdquo;, and you will be able to generate a fresh roadmap or build one manually. This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E4E7EC]">
              <button
                type="button"
                disabled={deletingRoadmap}
                onClick={() => setShowMasterDeleteModal(false)}
                className="px-4 py-2 bg-white hover:bg-[#F8FAFC] text-[#344054] font-semibold text-sm rounded-lg border border-[#D0D5DD] shadow-xs transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingRoadmap}
                onClick={handleConfirmMasterDelete}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm rounded-lg shadow-xs transition disabled:opacity-50 focus:ring-2 focus:ring-red-500/20"
              >
                {deletingRoadmap ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete Entire Roadmap</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE SINGLE ROUND CONFIRMATION MODAL */}
      {roundToDelete && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => !deletingRound && setRoundToDelete(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-round-title"
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E4E7EC] space-y-4 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 border border-red-200 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 id="delete-round-title" className="text-lg font-bold text-[#172033]">
                  Delete {roundToDelete.name || "Round"}?
                </h3>
                <p className="text-xs text-[#667085]">Remove round configuration</p>
              </div>
            </div>

            <p className="text-sm text-[#475467] leading-relaxed">
              This will remove <strong>{roundToDelete.name || "this round"}</strong> along with all its match days, district allocations, and scheduled matches. Unrelated rounds will be preserved and re-sequenced. This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E4E7EC]">
              <button
                type="button"
                disabled={deletingRound}
                onClick={() => setRoundToDelete(null)}
                className="px-4 py-2 bg-white hover:bg-[#F8FAFC] text-[#344054] font-semibold text-sm rounded-lg border border-[#D0D5DD] shadow-xs transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingRound}
                onClick={handleConfirmDeleteRound}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm rounded-lg shadow-xs transition disabled:opacity-50 focus:ring-2 focus:ring-red-500/20"
              >
                {deletingRound ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete Round</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TEAM QUALIFICATION & ADVANCEMENT MODAL */}
      {showAdvancementModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
          onClick={() => !advancingExecuting && setShowAdvancementModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white rounded-2xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl border border-[#E4E7EC] space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#E4E7EC] pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-[#172033] flex items-center gap-2">
                    Team Qualification & Stage Advancement
                  </h3>
                  <p className="text-xs text-[#667085]">
                    Select and promote qualified teams from {advancementSourceRound?.name || "current round"} to the next round / Grand Finals.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={advancingExecuting}
                onClick={() => setShowAdvancementModal(false)}
                className="p-1.5 rounded-lg text-[#667085] hover:text-[#172033] hover:bg-[#F2F4F7] transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Qualification Mode & Match Status Banner */}
            {(() => {
              const hasRecordedResults = (advancementStandings?.overallStandings || []).some(
                (t) => (t.matches_played || 0) > 0 || (t.total_points || 0) > 0
              );
              return hasRecordedResults ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-[#16A34A] shrink-0" />
                  <span>
                    <strong>Leaderboard Active:</strong> Standings reflect verified match scores from completed matches. Select qualifying teams below to populate the target round.
                  </span>
                </div>
              ) : (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#2563EB] shrink-0" />
                  <span>
                    <strong>Roadmap Overview Mode:</strong> Matches have not taken place yet. All registered teams are listed below. Once matches are hosted and results are verified on the leaderboard, official standings and top qualifiers will be computed automatically.
                  </span>
                </div>
              );
            })()}

            {/* Target Destination Selectors */}
            <div className="p-3.5 bg-[#F8FAFC] border border-[#E4E7EC] rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[#172033] font-bold mb-1">
                  1. Target Next Round:
                </label>
                <select
                  value={advancementTargetRoundId}
                  onChange={(e) => {
                    const newTargetId = e.target.value;
                    setAdvancementTargetRoundId(newTargetId);
                    const tr = rounds.find((r) => r.id === newTargetId);
                    let grpId = "";
                    if (tr && Array.isArray(tr.days)) {
                      for (const d of tr.days) {
                        if (Array.isArray(d.allocations) && d.allocations.length > 0) {
                          grpId = d.allocations[0].id || d.allocations[0].group_id || d.allocations[0].district_id;
                          break;
                        }
                      }
                    }
                    setAdvancementTargetGroupId(grpId);
                  }}
                  className="w-full px-3 py-2 bg-white border border-[#E4E7EC] rounded-lg text-[#172033] font-bold focus:border-blue-500 focus:outline-none"
                >
                  <option value="" disabled>-- Select Target Round --</option>
                  {rounds
                    .filter((r) => r.id !== advancementSourceRound?.id)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} (Round {r.round_number})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[#172033] font-bold">
                    2. Target Group / District:
                  </label>
                  {advancementTargetRoundId && (
                    <button
                      type="button"
                      onClick={() => {
                        const targetRoundIdx = rounds.findIndex((r) => r.id === advancementTargetRoundId);
                        if (targetRoundIdx >= 0) {
                          handleOpenCustomDistrictModal(targetRoundIdx, 0);
                        }
                      }}
                      className="text-xs text-[#2563EB] hover:underline font-semibold"
                    >
                      + Create Grand Finals District
                    </button>
                  )}
                </div>
                {(() => {
                  const targetRound = rounds.find((r) => r.id === advancementTargetRoundId);
                  const availableAllocations = [];
                  if (targetRound && Array.isArray(targetRound.days)) {
                    targetRound.days.forEach((d) => {
                      (d.allocations || []).forEach((a) => {
                        availableAllocations.push({
                          id: a.id || a.group_id || a.district_id,
                          name: a.district_name || a.name || `District ${a.district_id}`,
                          capacity: a.capacity || 16,
                        });
                      });
                    });
                  }
                  const combined = [
                    ...availableAllocations,
                    ...(advancementStandings?.nextRoundGroups || []).filter(
                      (g) => !availableAllocations.some((a) => a.id === g.id)
                    ),
                  ];

                  return (
                    <select
                      value={advancementTargetGroupId}
                      onChange={(e) => setAdvancementTargetGroupId(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#E4E7EC] rounded-lg text-[#172033] font-bold focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">Auto-Assign / Default Group</option>
                      {combined.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name} (Capacity: {g.capacity || 16})
                        </option>
                      ))}
                    </select>
                  );
                })()}
              </div>
            </div>

            {/* Presets and Quick Actions Bar */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#667085] uppercase tracking-wider">
                  Quick Qualification Presets:
                </span>
                <span className="text-xs font-bold text-[#172033]">
                  Selected: <strong className="text-[#2563EB] text-sm">{selectedTeamIds.size}</strong> teams
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => applyPresetOverall(16)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border ${
                    advancementPreset === "round_total" && selectedTeamIds.size === 16
                      ? "bg-[#2563EB] text-white border-[#2563EB] shadow-xs"
                      : "bg-white text-[#172033] hover:bg-slate-50 border-[#E4E7EC]"
                  }`}
                  title="Pick top 16 performing teams across all 8 districts"
                >
                  <Trophy className="w-3.5 h-3.5" />
                  Top 16 Overall (from 128)
                </button>

                <button
                  type="button"
                  onClick={() => applyPresetPerDistrict(2)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border ${
                    advancementPreset === "per_district"
                      ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                      : "bg-white text-[#172033] hover:bg-slate-50 border-[#E4E7EC]"
                  }`}
                  title="Pick top 2 teams from each of the 8 districts = 16 teams"
                >
                  <Users className="w-3.5 h-3.5" />
                  Top 2 from Each District (16 Teams)
                </button>

                <button
                  type="button"
                  onClick={() => applyPresetOverall(8)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white text-[#475467] hover:bg-slate-50 border border-[#E4E7EC] transition"
                >
                  Top 8 Overall
                </button>

                <button
                  type="button"
                  onClick={() => applyPresetOverall(32)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white text-[#475467] hover:bg-slate-50 border border-[#E4E7EC] transition"
                >
                  Top 32 Overall
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const allIds = new Set((advancementStandings?.overallStandings || []).map((t) => t.team_id).filter(Boolean));
                    setSelectedTeamIds(allIds);
                    setAdvancementPreset("manual");
                  }}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white text-[#475467] hover:bg-slate-50 border border-[#E4E7EC] transition ml-auto"
                >
                  Select All
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedTeamIds(new Set());
                    setAdvancementPreset("manual");
                  }}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-200 transition"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Filter by District & Search */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              {/* District Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full scrollbar-thin">
                <button
                  type="button"
                  onClick={() => setAdvancementDistrictFilter("all")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                    advancementDistrictFilter === "all"
                      ? "bg-slate-800 text-white"
                      : "bg-[#F8FAFC] text-[#667085] hover:text-[#172033] border border-[#E4E7EC]"
                  }`}
                >
                  All Districts ({advancementStandings?.totalTeams || 0})
                </button>
                {(advancementStandings?.districts || []).map((d) => (
                  <button
                    key={d.district_id || d.district_name}
                    type="button"
                    onClick={() => setAdvancementDistrictFilter(d.district_name)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                      advancementDistrictFilter === d.district_name
                        ? "bg-[#2563EB] text-white"
                        : "bg-[#F8FAFC] text-[#667085] hover:text-[#172033] border border-[#E4E7EC]"
                    }`}
                  >
                    {d.district_name} ({(d.teams || []).length})
                  </button>
                ))}
              </div>

              {/* Search input */}
              <div className="relative min-w-[200px] flex-1 sm:flex-initial">
                <Search className="w-3.5 h-3.5 text-[#98A2B3] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search registered team..."
                  value={advancementSearch}
                  onChange={(e) => setAdvancementSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#E4E7EC] rounded-lg text-xs text-[#172033] focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Scrollable Teams Table / List */}
            <div className="flex-1 overflow-y-auto border border-[#E4E7EC] rounded-xl divide-y divide-[#E4E7EC] min-h-[220px] max-h-[360px] bg-white">
              {advancementLoading ? (
                <div className="p-12 text-center text-[#667085] space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#2563EB]" />
                  <p className="text-xs font-medium">Loading standings and registered teams...</p>
                </div>
              ) : (() => {
                const query = (advancementSearch || "").toLowerCase().trim();
                let list = advancementStandings?.overallStandings || [];

                if (advancementDistrictFilter !== "all") {
                  list = list.filter((t) => (t.district_name || "").toLowerCase() === advancementDistrictFilter.toLowerCase());
                }

                if (query) {
                  list = list.filter((t) =>
                    (t.team_name || "").toLowerCase().includes(query) ||
                    (t.district_name || "").toLowerCase().includes(query)
                  );
                }

                if (list.length === 0) {
                  return (
                    <div className="p-8 text-center text-xs text-[#667085]">
                      No registered teams found matching current filters.
                    </div>
                  );
                }

                return list.map((team, tIdx) => {
                  const isChecked = selectedTeamIds.has(team.team_id);
                  const isAdvanced = Boolean(team.is_advanced);

                  return (
                    <div
                      key={team.team_id || tIdx}
                      onClick={() => !isAdvanced && toggleSelectTeam(team.team_id)}
                      className={`p-3 flex items-center justify-between gap-3 hover:bg-[#F8FAFC] transition cursor-pointer select-none ${
                        isChecked ? "bg-blue-50/50" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isAdvanced}
                          onChange={() => !isAdvanced && toggleSelectTeam(team.team_id)}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 pointer-events-none"
                        />
                        <div className="w-7 h-7 rounded-lg bg-slate-100 text-[#172033] font-bold text-xs flex items-center justify-center shrink-0">
                          #{team.rank || tIdx + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs sm:text-sm text-[#172033]">
                              {team.team_name}
                            </span>
                            {isAdvanced && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-[#16A34A] border border-emerald-200">
                                Already Advanced
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#667085] flex items-center gap-2">
                            <span>{team.district_name}</span>
                            {team.district_rank && (
                              <span className="text-[#2563EB] font-semibold">
                                (District #{team.district_rank})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-xs font-mono text-right shrink-0">
                        <div>
                          <div className="text-[#172033] font-bold">{team.total_points || 0} pts</div>
                          <div className="text-[10px] text-[#667085]">{team.kill_points || 0} kills • {team.matches_played || 0} m</div>
                        </div>
                        <div className="w-6 text-center">
                          {isChecked && <Check className="w-4 h-4 text-[#2563EB]" />}
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Modal Actions Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#E4E7EC]">
              <div className="text-xs text-[#667085]">
                Advancing <strong className="text-[#172033] font-bold">{selectedTeamIds.size} teams</strong> to{" "}
                <strong className="text-[#2563EB] font-bold">
                  {rounds.find((r) => r.id === advancementTargetRoundId)?.name || "Target Round"}
                </strong>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={advancingExecuting}
                  onClick={() => setShowAdvancementModal(false)}
                  className="px-4 py-2 bg-white hover:bg-slate-50 text-[#344054] font-semibold text-xs rounded-lg border border-[#D0D5DD] shadow-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={advancingExecuting || selectedTeamIds.size === 0 || !advancementTargetRoundId}
                  onClick={handleExecuteAdvancement}
                  className="flex items-center gap-2 px-5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-bold text-xs rounded-lg shadow-xs transition"
                >
                  {advancingExecuting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Promoting Teams...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Confirm & Advance {selectedTeamIds.size} Teams</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM / GRAND FINALS DISTRICT CREATION MODAL */}
      {showCustomDistrictModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setShowCustomDistrictModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E4E7EC] space-y-4 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 border border-purple-200 flex items-center justify-center shrink-0">
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#172033]">
                  Add District / Finals Group
                </h3>
                <p className="text-xs text-[#667085]">
                  Create a new group for Round {rounds[customDistrictRoundIdx]?.round_number || customDistrictRoundIdx + 1}
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[#172033] font-bold mb-1.5">District / Group Name</label>
                <input
                  type="text"
                  value={customDistrictName}
                  onChange={(e) => setCustomDistrictName(e.target.value)}
                  placeholder="e.g. Grand Finals, Championship District, Group Final"
                  className="w-full px-3 py-2 bg-white border border-[#E4E7EC] rounded-lg text-sm text-[#172033] font-bold focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#172033] font-bold mb-1.5">Team Capacity</label>
                <input
                  type="number"
                  min="2"
                  max="64"
                  value={customDistrictCapacity}
                  onChange={(e) => setCustomDistrictCapacity(Number(e.target.value) || 16)}
                  className="w-full px-3 py-2 bg-white border border-[#E4E7EC] rounded-lg text-sm text-[#2563EB] font-bold focus:border-blue-500 focus:outline-none"
                />
                <span className="text-[11px] text-[#667085] mt-1 block">
                  Typically 16 teams for Grand Finals Battle Royale matches.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E4E7EC]">
              <button
                type="button"
                onClick={() => setShowCustomDistrictModal(false)}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-[#344054] font-semibold text-xs rounded-lg border border-[#D0D5DD] shadow-xs transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCreateCustomDistrict}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs rounded-lg shadow-xs transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create & Schedule District</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (onClose) {
    return (
      <div
        className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs overflow-y-auto p-3 sm:p-6 lg:p-8 flex items-start sm:items-center justify-center"
        onClick={onClose}
      >
        <div
          className="w-full max-w-6xl my-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {mainBuilderContent}
        </div>
      </div>
    );
  }

  return mainBuilderContent;
}

