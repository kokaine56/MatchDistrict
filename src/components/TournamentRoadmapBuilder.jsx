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

function formatDateDisplay(dateStr) {
  if (!dateStr) return "Date TBD";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

export default function TournamentRoadmapBuilder({
  tournamentId,
  tournamentTitle = "Tournament Roadmap",
  isOrganizer = false,
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
            rm.rounds.map((r, i) => ({
              id: r.id || `RND-${i + 1}`,
              round_number: r.round_number || i + 1,
              name: r.name || `Round ${i + 1}`,
              round_type: r.round_type || "qualifier",
              status: r.status || "configured",
              advancement_type: r.advancement_type || "per_district",
              teams_advancing: r.teams_advancing || 16,
              teams_advancing_per_district: r.teams_advancing_per_district || 2,
              days: Array.isArray(r.days) && r.days.length > 0 ? r.days : [
                { id: `DAY-${i + 1}-1`, day_number: 1, date: "", allocations: [] }
              ],
            }))
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

      if (round.advancement_target_round_id) {
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
      const rNum = round.round_number || rIdx + 1;
      const rName = (round.name || `Round ${rNum}`).trim();
      (round.days || []).forEach((day, dIdx) => {
        const dNum = day.day_number || dIdx + 1;
        (day.allocations || []).forEach((a) => {
          const matchingDist = districts.find((d) => d.id === a.district_id || d.name === a.district_name);
          const regCount = matchingDist?.registered_teams_count ?? matchingDist?.team_count ?? 0;
          const mCount = Number(a.match_count) || (a.matches ? a.matches.length : 0);
          if (regCount === 0 && mCount > 0) {
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
    const newRound = {
      id: `RND-${Date.now()}-${nextNum}`,
      round_number: nextNum,
      name: `Round ${nextNum}`,
      round_type: "qualifier", // fallback for legacy DB schema compatibility
      status: "configured",
      advancement_type: "per_district",
      teams_advancing_per_district: 2,
      days: [], // requirement: "Initialize only the required empty round configuration. Do not automatically add match days, district allocations, matches, or a Grand Final."
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
      updated[idx] = { ...updated[idx], [field]: value };
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
      days.push({
        id: `DAY-${Date.now()}-${nextDayNum}`,
        day_number: nextDayNum,
        date: "",
        allocations: [],
      });
      round.days = days;
      updated[roundIdx] = round;
      return updated;
    });
  };

  const handleUpdateDay = (roundIdx, dayIdx, field, value) => {
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

  // Helper calculating total advancing teams
  const calculateTotalAdvancing = (round) => {
    if (!round) return 0;
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
              <div className="flex-1 min-w-[240px]">
                <label className="block text-xs font-semibold text-[#667085] mb-1.5">Round Name</label>
                <input
                  type="text"
                  value={activeRound.name}
                  onChange={(e) => handleUpdateRound(selectedRoundIdx, "name", e.target.value)}
                  className="w-full sm:w-96 px-3.5 py-2.5 bg-white border border-[#E4E7EC] rounded-xl text-[#172033] font-bold text-sm sm:text-base placeholder:text-[#98A2B3] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition shadow-2xs"
                  placeholder="e.g. Round 1, Qualifier 1, Semifinal, Grand Final"
                />
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

                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5 text-xs text-[#667085]">
                            <label className="font-semibold text-[#172033]">Date:</label>
                            <input
                              type="date"
                              value={day.date || ""}
                              onChange={(e) => handleUpdateDay(selectedRoundIdx, dIdx, "date", e.target.value)}
                              className="px-2.5 py-1.5 bg-white border border-[#E4E7EC] rounded-lg text-[#172033] text-xs font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition shadow-2xs"
                            />
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
                                        {alloc.district_name} — <strong className={registeredCount === 0 ? "text-amber-600 font-bold" : "text-[#16A34A] font-bold"}>{registeredCount}</strong> registered team{registeredCount === 1 ? "" : "s"}
                                      </span>

                                      {registeredCount === 0 && alloc.match_count > 0 && (
                                        <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0" title="This district has 0 registered teams">
                                          <AlertCircle className="w-3 h-3 text-amber-600" /> 0 registered teams
                                        </span>
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

                      {/* [+ Add District] button */}
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => handleAddNextDistrictToDay(selectedRoundIdx, dIdx)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-xs sm:text-sm rounded-lg shadow-xs transition"
                        >
                          <Plus className="w-4 h-4" /> Add District
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

            {/* 5. ROUND PROGRESSION & ADVANCEMENT SETTINGS */}
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

              {/* Advancement summary calculation */}
              <div className="p-3 bg-white border border-[#E4E7EC] rounded-lg text-xs flex flex-wrap items-center justify-between gap-2 text-[#667085]">
                <span>
                  Calculated Advancement: <strong className="text-[#2563EB] font-bold">{calculateTotalAdvancing(activeRound)} teams</strong> will advance from this round.
                </span>
                {activeRound.advancement_target_round_id && (
                  <span className="text-[#16A34A] font-semibold flex items-center gap-1">
                    <ArrowRight className="w-3.5 h-3.5" /> Next stage capacity validated
                  </span>
                )}
              </div>
            </div>
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

