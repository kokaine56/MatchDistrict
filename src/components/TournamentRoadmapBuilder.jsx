import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  Map as MapIcon,
  Check,
  Search,
  SlidersHorizontal,
  Filter,
  Medal,
} from "lucide-react";
import { getAuthToken } from "../utils/getAuthToken";
import { isRoadmapPublished } from "../utils/roadmapStatus";
import OrganizerRoadmapEditor from "./roadmap/OrganizerRoadmapEditor";
import RoadmapAdvancementModal from "./roadmap/RoadmapAdvancementModal";
import ParticipantRoadmapViewer from "./roadmap/ParticipantRoadmapViewer";
import { addCalendarDays } from "../utils/roadmapDays";

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
  return addCalendarDays(dateStr, daysToAdd);
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
    const clean = String(dateStr).slice(0, 10);
    const parts = clean.split("-").map(Number);
    if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return dateStr;
    const [y, m, d] = parts;
    const dayOfWeek = getDayOfWeek(dateStr);
    const dd = String(d).padStart(2, "0");
    const mm = String(m).padStart(2, "0");
    const formatted = `${dd}/${mm}/${y}`;
    return dayOfWeek ? `${dayOfWeek}, ${formatted}` : formatted;
  } catch {
    return dateStr;
  }
}

import { getPrizePositions } from "../utils/prizePool";
export { getPrizePositions };


export default function TournamentRoadmapBuilder({
  tournamentId,
  tournamentTitle = "Tournament Roadmap",
  isOrganizer = false,
  registrationCloseDate = null,
  onClose = null,
  onApproved = null,
  onNavigateToLeaderboard = null,
}) {
  const [serverIsOrganizer, setServerIsOrganizer] = useState(false);
  const effectiveOrganizer = Boolean(serverIsOrganizer === true && isOrganizer === true);

  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
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
  const [myDistrictIds, setMyDistrictIds] = useState([]);
  const [myMatchIds, setMyMatchIds] = useState([]);

  // Min selectable date derived from meta or prop (registration close date + 1 day)
  const minSelectableDate = useMemo(() => {
    const rawDate = meta?.registration_close_date || registrationCloseDate;
    return computeMinSelectableDate(rawDate);
  }, [meta?.registration_close_date, registrationCloseDate]);

  // Derive effective tournament districts: combines canonical database registration districts (for Round 1)
  // and any explicit custom district allocations in Round 1, preventing other rounds' districts from leaking into Round 1.
  const effectiveDistricts = useMemo(() => {
    const map = new globalThis.Map();
    const slotsTotalNum = parseInt(meta?.slotsTotal || meta?.total_slots || 0, 10);
    const tpgNum = parseInt(meta?.teams_per_group || meta?.teams_per_district || 16, 10) || 16;
    const maxR1Count = slotsTotalNum > 0 ? Math.ceil(slotsTotalNum / tpgNum) : 0;

    // 1. Canonical registration districts from database
    if (Array.isArray(districts)) {
      districts.forEach((d, idx) => {
        if (d && (d.id || d.name)) {
          // If maxR1Count is known, only take up to maxR1Count from DB unless has assigned teams or explicit conflict
          if (maxR1Count > 0 && idx >= maxR1Count && !(d.registered_teams_count > 0 || d.team_count > 0 || d.has_conflict)) {
            return;
          }
          const key = d.id || d.name;
          map.set(key, {
            ...d,
            id: d.id || key,
            name: d.name || `District ${d.group_index || key}`,
            registered_teams_count: d.registered_teams_count ?? d.team_count ?? 0,
            capacity: d.capacity || tpgNum,
          });
        }
      });
    }

    // 2. Any explicit custom district referenced in Round 1 allocations
    const r1 = rounds[0];
    if (r1 && Array.isArray(r1.days)) {
      r1.days.forEach((d) => {
        (d.allocations || []).forEach((a) => {
          const distId = a.district_id || a.id;
          if (distId && !map.has(distId)) {
            const hasData = (a.matches && a.matches.length > 0) || (a.registered_teams_count > 0) || a.is_custom;
            if (hasData) {
              map.set(distId, {
                id: distId,
                name: a.district_name || a.name || `District ${distId}`,
                registered_teams_count: a.registered_teams_count ?? a.team_count ?? 0,
                capacity: a.capacity || tpgNum,
                is_custom: true,
              });
            }
          }
        });
      });
    }

    return Array.from(map.values());
  }, [districts, rounds, meta?.slotsTotal, meta?.total_slots, meta?.teams_per_group, meta?.teams_per_district]);

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
  const fetchRoadmap = useCallback(async ({ background = false } = {}) => {
    if (!tournamentId) return;
    if (!background && !hasLoadedOnceRef.current) {
      setLoading(true);
    }
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

      const published = isRoadmapPublished(data);
      setIsPublished(published);

      const myDistIds = Array.isArray(data.my_district_ids)
        ? data.my_district_ids
        : (data.participant?.my_district_ids || []);
      const myMtchIds = Array.isArray(data.my_match_ids)
        ? data.my_match_ids
        : (data.participant?.my_match_ids || []);
      setMyDistrictIds(myDistIds);
      setMyMatchIds(myMtchIds);

      const serverOrg = data?.viewer_is_organizer === true;
      setServerIsOrganizer(serverOrg);

      if (!serverOrg && !published) {
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
      if (!background) setError(err.message);
    } finally {
      hasLoadedOnceRef.current = true;
      if (!background) {
        setLoading(false);
      }
    }
  }, [tournamentId, isOrganizer]);

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
          const matchingDist = effectiveDistricts.find((d) => d.id === a.district_id || d.name === a.district_name);
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
  }, [rounds, effectiveDistricts, effectiveOrganizer]);

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

  const handleConfirmMasterDelete = async (options = {}) => {
    if (options && options.optimistic) {
      setRounds([]);
      setIsPublished(false);
      setSelectedRoundIdx(0);
      setExpandedMatches(new Set());
      setPublishErrors([]);
      return { success: true };
    }

    if (options && options.restore) {
      setRounds(options.snapshot || []);
      return { success: true };
    }

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
      return { success: true };
    } catch (err) {
      setError(err.message || "Failed to delete entire roadmap.");
      return { success: false, error: err.message };
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
    if (roundIdx > 0) return; // Later rounds auto-generate districts and do not allow custom districts
    setCustomDistrictRoundIdx(roundIdx);
    setCustomDistrictDayIdx(dayIdx);
    const round = rounds[roundIdx];
    const isFinalOrGrand = (round?.name || "").toLowerCase().includes("final") || roundIdx === rounds.length - 1;
    setCustomDistrictName(isFinalOrGrand ? "Grand Finals" : `District ${effectiveDistricts.length + 1}`);
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
      } else if (Array.isArray(data.standings) || Array.isArray(data.overallStandings)) {
        const standingsList = data.standings || data.overallStandings;
        const topCount = Number(sourceRound.teams_advancing) || 16;
        standingsList.slice(0, topCount).forEach((t) => {
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
    const standingsList = advancementStandings?.standings || advancementStandings?.overallStandings;
    if (!standingsList) return;
    const n = Math.max(1, Number(count) || 16);
    const set = new Set();
    standingsList.slice(0, n).forEach((t) => {
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
          source_round_id: advancementSourceRound?.id,
          target_round_id: advancementTargetRoundId,
          target_group_id: advancementTargetGroupId || undefined,
          team_ids: Array.from(selectedTeamIds),
          advancement_type: advancementPreset,
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
    const selectedDist = effectiveDistricts.find((d) => d.id === districtId || d.name === districtId);
    const distName = selectedDist ? selectedDist.name : `District ${districtId}`;
    const actualDistId = selectedDist ? selectedDist.id : districtId;
    const game = meta?.game || "bgmi";
    const mapRoster = getMapOptions(game);

    setRounds((prev) => {
      const updated = [...prev];
      const round = { ...updated[roundIdx] };
      const days = [...round.days];
      const day = { ...days[dayIdx] };
      const allocations = [...(day.allocations || [])];

      // Check if already added to this day
      if (allocations.some((a) => a.district_id === actualDistId)) {
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
        district_id: actualDistId,
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
        const distName = effectiveDistricts.find((d) => d.id === newDistrictId)?.name || `District ${newDistrictId}`;
        alert(`${distName} is already scheduled on Day ${day.day_number || dayIdx + 1}. Please choose another district.`);
        return prev;
      }

      const selectedDist = effectiveDistricts.find((d) => d.id === newDistrictId);
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
    const nextAvailable = effectiveDistricts.find((d) => !scheduledDistIds.has(d.id));
    if (nextAvailable) {
      handleAddDistrictToDay(roundIdx, dayIdx, nextAvailable.id, 1);
    } else if (effectiveDistricts.length > 0) {
      alert(`All ${effectiveDistricts.length} tournament districts are already scheduled on Day ${day.day_number || dayIdx + 1}. You can edit or increase their match counts directly.`);
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
  const handleSaveDraftWithRounds = async ({ rounds: newRounds } = {}) => {
    const roundsToSave = newRounds || rounds;
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
        body: JSON.stringify({ roadmap: { rounds: roundsToSave } }),
      });
      const data = await res.json();
      if (!data.success) {
        const isValidation = Array.isArray(data.errors) && data.errors.length > 0;
        const rawMsg = data.serverError || data.message || data.error;
        const isSql = /column|relation|syntax|SELECT|INSERT|UPDATE|pg_|Postgres|database error|42\d{3}|23\d{3}/i.test(String(rawMsg || ''));
        const msg = isSql || !rawMsg ? "Could not save roadmap: server error" : rawMsg;
        setError(msg);
        return {
          success: false,
          errors: isValidation ? data.errors : [],
          serverError: !isValidation ? msg : null,
          warnings: data.warnings || [],
        };
      }
      setRounds(roundsToSave);
      setSuccess("Roadmap draft saved to database successfully.");
      await fetchRoadmap({ background: true });
      return { success: true, warnings: data.warnings || [] };
    } catch (err) {
      setError("Could not save roadmap: server error");
      return { success: false, errors: [], serverError: "Could not save roadmap: server error", warnings: [] };
    } finally {
      setSaving(false);
    }
  };

  // Persistence: Publish Roadmap
  const handlePublishWithRounds = async ({ rounds: newRounds } = {}) => {
    const roundsToPublish = newRounds || rounds;
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
        body: JSON.stringify({ roadmap: { rounds: roundsToPublish } }),
      });
      const data = await res.json();
      if (!data.success) {
        const isValidation = Array.isArray(data.errors) && data.errors.length > 0;
        const rawMsg = data.serverError || data.message || data.error;
        const isSql = /column|relation|syntax|SELECT|INSERT|UPDATE|pg_|Postgres|database error|42\d{3}|23\d{3}/i.test(String(rawMsg || ''));
        const msg = isSql || !rawMsg ? "Could not publish roadmap: server error" : rawMsg;
        setError(msg);
        if (isValidation) {
          setPublishErrors(data.errors);
        } else {
          setPublishErrors([]);
        }
        return {
          success: false,
          errors: isValidation ? data.errors : [],
          serverError: !isValidation ? msg : null,
          warnings: data.warnings || [],
        };
      }
      setIsPublished(true);
      setRounds(roundsToPublish);
      setSuccess("Roadmap published successfully! Participants can now view the tournament schedule.");
      if (onApproved) onApproved();
      await fetchRoadmap({ background: true });
      return { success: true, warnings: data.warnings || [] };
    } catch (err) {
      setError("Could not publish roadmap: server error");
      return { success: false, errors: [], serverError: "Could not publish roadmap: server error", warnings: [] };
    } finally {
      setPublishing(false);
    }
  };

  const handleGenerateFromSetup = async (genOptions) => {
    setGeneratingRoadmap(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getAuthToken();
      const payload = {
        mode: "regenerate_all",
        draft_only: true,
        ...(genOptions || {}),
      };
      const res = await fetch(`/api/tournaments/${tournamentId}/roadmap/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) {
        const errorMsg = data.message || data.error || "Failed to generate roadmap.";
        if (import.meta.env?.DEV) {
          console.warn("[Roadmap Generation Error] Step: server_validation_or_rejection", errorMsg);
        }
        return { success: false, error: errorMsg };
      }

      const structuredRounds = data.roadmap?.structured_rounds;
      if (Array.isArray(structuredRounds) && structuredRounds.length > 0) {
        setSuccess("Roadmap draft generated! You can now review, customize, and save or publish.");
        if (onApproved) onApproved();
        return { success: true, structured_rounds: structuredRounds, meta: data.roadmap?.meta };
      }

      // If draft_only wasn't returned as structured_rounds for some reason, fallback to fetch
      setSuccess("Roadmap generated successfully! You can now review, customize, and publish.");
      await fetchRoadmap();
      if (onApproved) onApproved();
      return { success: true };
    } catch (err) {
      const errorMsg = err.message || "Failed to generate roadmap.";
      if (import.meta.env?.DEV) {
        console.warn("[Roadmap Generation Error] Step: network_or_execution_exception", errorMsg);
      }
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setGeneratingRoadmap(false);
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
  if (loading && !hasLoadedOnceRef.current) {
    return (
      <div className="w-full max-w-6xl mx-auto my-8 p-12 bg-white border border-[#E4E7EC] rounded-2xl text-[#667085] shadow-xs flex flex-col items-center justify-center text-center">
        <RefreshCw className="w-8 h-8 animate-spin text-[#2563EB] mb-3" />
        <p className="font-semibold text-[#172033] text-sm">Loading Tournament Roadmap...</p>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // RENDER: Participant View (Before/After Publication) OR Organizer Preview
  // ─────────────────────────────────────────────────────────────
  if (!effectiveOrganizer || previewMode) {
    return (
      <ParticipantRoadmapViewer
        tournamentTitle={tournamentTitle}
        rounds={rounds}
        meta={meta || {}}
        districts={effectiveDistricts}
        isPublished={isPublished}
        cardColor={meta?.card_color || meta?.cardColor || "white"}
        previewMode={Boolean(effectiveOrganizer && previewMode)}
        onExitPreview={() => setPreviewMode(false)}
        myDistrictIds={myDistrictIds}
        myMatchIds={myMatchIds}
      />
    );
  }

  // ─────────────────────────────────────────────────────────────
  // RENDER: Full Manual Dynamic Roadmap Builder (Organizer View)
  // ─────────────────────────────────────────────────────────────
  const game = meta?.game || "bgmi";
  const mapOptions = getMapOptions(game);

  const mainBuilderContent = (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      <OrganizerRoadmapEditor
        tournamentId={tournamentId}
        tournamentTitle={tournamentTitle}
        rounds={rounds}
        meta={meta || {}}
        districts={effectiveDistricts}
        minSelectableDate={minSelectableDate}
        game={meta?.game || "bgmi"}
        cardColor={meta?.card_color || meta?.cardColor || "white"}
        isPublished={isPublished}
        onSaveDraft={handleSaveDraftWithRounds}
        onPublish={handlePublishWithRounds}
        onUnpublish={handleUnpublish}
        onGenerate={handleGenerateFromSetup}
        saving={saving}
        publishing={publishing}
        generating={generatingRoadmap}
        onClose={onClose}
        previewMode={previewMode}
        onTogglePreview={() => setPreviewMode(!previewMode)}
        onDeleteRoadmap={handleConfirmMasterDelete}
        deleting={deletingRoadmap}
      />

      {showAdvancementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 max-w-md w-full text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center mx-auto text-xl">
              🏆
            </div>
            <h3 className="text-base sm:text-lg font-black text-slate-900">Stage Qualification Moved</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Team qualification and stage advancement is now managed on the official <strong className="text-slate-900">Leaderboard</strong> tab with verified standings, tie detection, and snake-seeding district placement.
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAdvancementModal(false)}
                className="w-full sm:flex-1 px-4 py-2.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors min-h-[38px]"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAdvancementModal(false);
                  if (typeof onNavigateToLeaderboard === 'function') {
                    onNavigateToLeaderboard();
                  } else {
                    const el = document.querySelector('[data-tab="leaderboard"]');
                    if (el) el.click();
                  }
                }}
                className="w-full sm:flex-1 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all shadow-md shadow-blue-600/25 min-h-[38px]"
              >
                Go to Leaderboard
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

