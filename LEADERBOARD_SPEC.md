# MatchDistrict — Leaderboard System Documentation

**Document Type:** Functional & Workflow Documentation
**Module:** Tournament Leaderboard, Scoring, Qualification & Publication
**Audience:** Developers, Administrators, Tournament Organizers

---

## 1. Overview

The MatchDistrict Leaderboard System manages tournament scoring, team rankings, qualification to subsequent rounds, and publication of results.

The system follows the tournament roadmap configured by the organizer. The roadmap defines the rounds, districts, match structure, qualification method, team capacity, and advancement rules.

The leaderboard has five primary responsibilities:

1. Display teams according to the configured tournament structure.
2. Allow authorized organizers to enter, edit, and save scores.
3. Calculate team points and rankings.
4. Qualify teams according to the configured advancement method.
5. Publish the leaderboard when the organizer is ready.

**Important:** Saving scores, qualifying teams, and publishing the leaderboard are three separate operations.

## 2. Roadmap and Tournament Structure

The roadmap is the source of truth for the leaderboard's structure.

It defines:

- Number of rounds.
- Number of districts or groups in each round, where applicable.
- Team capacity and match allocation.
- Qualification method.
- Number of teams advancing.
- Target-round structure.
- Grand Final configuration.

The leaderboard must load this configuration dynamically. It must not assume that every tournament has the same number of districts, teams, or rounds.

### Example tournament

Suppose a tournament has 128 teams distributed across eight districts in Round 1.

| Round | Structure | Teams |
| --- | --- | --- |
| Round 1 | 8 districts, 16 teams each | 128 |
| Round 2 | Configured according to the roadmap | Qualified teams |
| Grand Final | Configured final-stage matches | Finalists |

This is an illustrative configuration. The actual tournament structure must always come from its saved roadmap.

## 3. Leaderboard Views

The leaderboard should support the following views.

### 3.1 Overall Standings

Displays teams together in a single overall ranking.

- No District column.
- No permanent district-based grouping.
- Teams are ranked using the applicable total-points calculation and tie-break rules.
- Authorized organizers can edit scores.
- The organizer can qualify teams according to the configured overall qualification method.

Original district assignments remain in the database for historical and round-specific purposes.

### 3.2 Round-Specific Standings

Displays standings for the selected round.

- Shows the matches and teams associated with that round.
- Displays district selectors only when the selected round has districts.
- Uses the selected round's scoring data.
- Supports round-specific qualification.

### 3.3 District-Specific Standings

For rounds divided into districts, the organizer can select a district to view its teams and scores.

For example:

- Round 1 — District 1
- Round 1 — District 2
- Round 1 — District 3

Selecting a district must load the correct teams from the tournament's registration and allocation data.

The district selector count must match the number of eligible teams displayed in the scoring table.

A missing or failed data request must not silently appear as a genuinely empty district.

## 4. Team Registration and Round Allocation

Registration and match participation are different concepts.

The system should distinguish:

- **Registered:** The team has registered for the tournament.
- **Payment pending:** Payment proof has been submitted and awaits review.
- **Payment approved:** The payment has passed the required verification process.
- **Registration approved:** The registration has been accepted according to tournament rules.
- **Allocated:** The team has been assigned to a round, district, or match.
- **Scored:** Scoring data has been recorded for the team.
- **Qualified:** The team has been selected and confirmed for advancement.
- **Published:** The relevant standings have been made visible to participants.

The exact registration and payment statuses must follow the existing MatchDistrict workflow.

A team must not disappear from the leaderboard merely because the leaderboard API checks an unrelated status field or an incorrectly linked allocation record.

If a required match assignment is missing, the system should identify the problem and use the existing allocation workflow to resolve it.

It must not fabricate match participation or results.

## 5. Scoring System

### 5.1 Scoring inputs

The leaderboard should support the scoring inputs configured for the tournament, including:

- Placement points.
- Total kills.
- WWCD count or status, where applicable.
- Matches played, derived from match records.

The organizer enters or corrects the scoring inputs through the existing scoring interface.

### 5.2 Total points calculation

In the current scoring model, each kill contributes one point.

Therefore:

**Total Points = Placement Points + Total Kills**

Example:

| Team | Placement Points | Total Kills | Total Points |
| --- | --- | --- | --- |
| Team Alpha | 12 | 8 | 20 |
| Team Bravo | 15 | 3 | 18 |
| Team Charlie | 10 | 5 | 15 |

The Total Kills column replaces the redundant Kill Points column when both represent the same scoring input.

If a tournament supports a different configured kill multiplier or scoring rule, the calculation must follow that configuration rather than applying the formula above universally.

### 5.3 Leaderboard columns

The overall leaderboard should display:

| Column | Purpose |
| --- | --- |
| Rank | Team's current position |
| Team | Team name and relevant captain information |
| Played | Number of matches recorded as played |
| Placement Points | Points earned through match placement |
| Total Kills | Total recorded eliminations |
| WWCDs | Number of applicable wins |
| Total Points | Calculated score used for ranking |

The District column should not appear in the overall leaderboard.

District information can remain available in district-specific standings and historical match records.

### 5.4 Ranking and tie-breakers

Teams are ranked by total points, highest first.

When teams have equal points, the system applies the tournament's configured tie-break hierarchy.

The existing MatchDistrict hierarchy may include:

1. WWCDs.
2. Placement points.
3. Elimination points, if separately defined by the scoring rules.
4. Latest match placement.

The actual canonical hierarchy in the existing application must be preserved. Redundant scoring fields must not be counted twice.

## 6. Score Entry and Saving

The organizer manages scores district by district whenever the roadmap defines districts.

### Workflow

1. Open the leaderboard.
2. Select the required round.
3. Select a district.
4. View the teams assigned to that district.
5. Enter or edit scoring inputs.
6. Save the district's scores.
7. Move to another district and repeat.

Each district must have its own accurate save status.

### District states

- **Unsaved:** Changes have not yet been persisted, or no saved score state exists.
- **Saved:** The current scoring data has been persisted successfully.
- **Modified:** Previously saved scoring data has been changed and needs to be saved again.
- **Error:** The save operation failed.

The implementation may use different internal state names, but the displayed state must reflect actual persistence.

Saving one district must not require all other districts to be saved first.

The organizer must be able to revisit a district and correct its scores.

### Score editing

Only authorized administrators and organizers may edit scores.

When a score is saved:

- Persist the scoring inputs.
- Recalculate derived totals and ranks.
- Update the affected district standings.
- Update overall standings where applicable.
- Preserve historical records and existing scoring rules.

A failed save must not be displayed as a successful save.

## 7. Qualification System

Qualification determines which teams advance from one round to the next.

The roadmap defines the qualification method and the number of teams that should advance.

The organizer initiates qualification using the Qualify to Next Round action.

The system calculates the eligible teams based on saved scores, configured rules, and the selected source-round scope.

### 7.1 Method A — Top N Teams Per District

This method qualifies a configured number of teams separately from each district.

Example:

- Eight districts in Round 1.
- Four teams qualify from each district.
- Total expected qualifiers: 32 teams.

The system:

1. Loads the saved standings for each included district.
2. Ranks eligible teams separately within each district.
3. Selects the configured top N teams from each district.
4. Identifies unresolved ties at the qualification cutoff.
5. Presents the qualification result to the organizer.
6. Persists the confirmed qualification decisions.

The organizer must not have to select every qualifying team manually when the roadmap already defines the top N per district.

### 7.2 Method B — Top N Teams Overall

This method qualifies a configured number of teams from the combined eligible source-round standings.

Example:

- 128 teams in Round 1.
- The roadmap specifies 32 overall qualifiers.
- The system ranks the eligible teams across the applicable districts.
- The top 32 qualify, subject to unresolved cutoff ties and the configured rules.

The system must not apply the top N rule separately to each district when the roadmap specifies an overall qualification method.

### 7.3 Qualification configuration

The system must obtain the following from the saved roadmap:

- Qualification method.
- Source round.
- Target round.
- Number of teams advancing.
- Per-district advancement count, if applicable.
- Target-round capacity.
- Applicable ranking and tie-break rules.

These values must not be hardcoded.

## 8. Partial District Saving and Qualification

MatchDistrict allows qualification to proceed even when some districts have not yet been saved.

However, partial qualification must be explicit.

### Per-district qualification

The organizer can qualify districts whose scores are saved and sufficiently complete.

For example:

- District 1: saved.
- District 2: saved.
- District 3: unsaved.

The organizer may qualify the eligible teams from Districts 1 and 2 while leaving District 3 for later.

The system must clearly identify which districts were included and which remain unprocessed.

### Overall qualification

If the roadmap specifies overall top N qualification, the system must warn when some districts have not been saved.

The organizer may proceed with the available eligible data, but the result must be identified as partial or provisional.

The system must not silently exclude unsaved districts and present the result as a complete tournament-wide ranking.

Missing scores must not automatically be treated as zero unless the configured scoring rules explicitly require that behavior.

## 9. Ties at the Qualification Cutoff

If a tie affects the qualification cutoff and the configured tie-break rules do not resolve it, the system must require manual organizer resolution.

Example:

The top four teams qualify from a district, but teams ranked fourth and fifth remain tied after all configured tie-break rules.

The system must:

1. Detect the unresolved tie.
2. Identify the tied teams and affected qualification slots.
3. Show the relevant scoring information.
4. Allow an authorized organizer to resolve the tie explicitly.
5. Record the decision.
6. Recalculate the qualification result.
7. Require confirmation before finalizing the affected qualification decision.

The system must not arbitrarily choose one team or automatically exceed the configured capacity.

A tie is different from incomplete scoring data; the interface must distinguish the two.

## 10. Qualification and Next-Round Allocation

Qualification and allocation are related but distinct operations.

- **Qualification:** The team has been selected and confirmed to advance.
- **Next-round allocation:** The team has been assigned to the appropriate target-round structure.

After qualification, the system must use the existing MatchDistrict progression and allocation services to handle the target round.

### District handling

Round 1 districts determine the source-round scoring and per-district qualification scope.

They do not permanently determine the team's district in later rounds.

For example, a team qualifying from Round 1 District 1 must not automatically be restricted to District 1 in Round 2.

The target round must follow its own roadmap configuration. If it has districts, groups, or matches, use those configured structures. If it has no districts, do not invent a district selector.

### Advancement eligibility

The backend must check the actual tournament, source-round eligibility, saved scoring data, and qualification decision.

It must not reject a legitimate team merely because the leaderboard and advancement service use mismatched identifiers or inconsistent data sources.

The system must not fabricate match participation or bypass legitimate allocation requirements.

Duplicate qualification and conflicting allocations must be prevented.

## 11. Saving, Qualifying, and Publishing Are Separate

MatchDistrict must maintain three independent organizer actions.

### Action 1 — Save Scores

Purpose:

- Persist scoring inputs.
- Recalculate standings.
- Update saved states.

Saving scores does not qualify teams and does not publish standings.

### Action 2 — Qualify to Next Round

Purpose:

- Apply the configured qualification method.
- Resolve or flag ties.
- Confirm eligible teams.
- Persist qualification decisions.

Qualification does not automatically publish the leaderboard.

### Action 3 — Publish Leaderboard

Purpose:

- Make the intended standings visible to participants.
- Publish the appropriate round results and finalized qualification information.
- Reflect the authoritative saved data.

Publication must not independently change scores or invent qualification decisions.

### Publication states

The system should distinguish:

- **Draft / Unpublished:** Results are not yet publicly available.
- **Published:** The intended standings are visible to participants.
- **Updated after publication:** Saved changes require the existing publication or revision workflow, where applicable.

The exact implementation must follow MatchDistrict's existing publication model.

## 12. Organizer Workflow

The complete workflow is:

1. Configure the tournament roadmap.
2. Register teams and process required payment and registration approvals.
3. Allocate eligible teams according to the configured round structure.
4. Open the leaderboard and select Round 1.
5. Select a district.
6. Enter or edit scores for its teams.
7. Save that district's scores.
8. Repeat for other districts as needed.
9. Review district and overall standings.
10. Click Qualify to Next Round.
11. Let the system apply the configured qualification method.
12. Resolve unresolved ties and confirm qualification.
13. Review the saved qualification results and target-round allocations.
14. Publish the leaderboard when ready.

The organizer can save and qualify eligible subsets before every district is complete, provided the interface clearly communicates the scope and incompleteness of the results.

## 13. Participant Experience

Participants should see the appropriate published leaderboard and round information through the existing tournament interfaces.

- Unpublished draft changes must not automatically appear as finalized public results.
- Published standings must reflect the saved data that was published.
- Qualification status must come from the authoritative backend.
- A qualified team must not be displayed as qualified merely because it ranks highly.
- A registered team must not be presented as having played a match unless the relevant participation record supports that claim.
- Original district assignments must not be incorrectly carried into later rounds.

Participant-facing views must respect existing visibility, registration, and authorization rules.

## 14. Error Handling

The system must distinguish between:

- Missing registration data.
- Missing district or match assignment.
- Unsaved scores.
- Incomplete district results.
- Unresolved cutoff ties.
- Invalid qualification requests.
- Target-round capacity conflicts.
- Duplicate qualification attempts.
- Database or API failures.
- Publication failures.

For example, the existing error:

> Team "TEAM-390555-171be7" did not play in source round "Round 1" and cannot be advanced.

must be investigated at its actual source.

If the team is eligible under the roadmap and has valid source-round scoring and qualification records, the advancement service must recognize it.

If a required assignment genuinely is missing, the system must explain the specific problem and use the existing allocation workflow to resolve it where supported.

User-facing messages should display the actual team name instead of an internal identifier. Internal identifiers can remain available in sanitized diagnostic logs.

## 15. Permissions and Data Integrity

- Only authorized administrators and organizers can edit scores, qualify teams, resolve ties, or publish results.
- Backend authorization must enforce these permissions.
- Scoring inputs and qualification decisions must be validated server-side.
- Registration and payment verification must remain separate from scoring and qualification.
- Existing match results and historical assignments must be preserved.
- Duplicate requests must not create duplicate qualification records or allocations.
- Related database updates must remain consistent.
- The database remains the authoritative source of persisted state.
- Existing architecture, APIs, and services should be reused wherever possible.

## 16. UI/UX Requirements

The leaderboard should follow the global MatchDistrict design system.

- Clear round and district selectors.
- Accurate team counts.
- Readable scoring tables.
- Clear score-saving indicators.
- Separate qualification and publication controls.
- Visible qualification counts and cutoff ties.
- Clear draft and published states.
- Responsive layouts on mobile and desktop.
- Appropriate loading, empty, and error states.
- Consistent light and dark themes.

A district showing zero teams must not automatically be interpreted as empty if the backend request failed or the data mapping is incorrect.

## 17. Core Rules Summary

1. The roadmap defines the tournament structure.
2. District-specific scoring uses the teams assigned to the selected district.
3. Total points are calculated from the configured scoring rules.
4. Kill Points must not duplicate Total Kills.
5. The overall leaderboard ranks teams globally without a District column.
6. Per-district qualification selects the configured top N from each eligible district.
7. Overall qualification selects the configured top N across the eligible source-round scope.
8. Partial qualification is permitted, but incomplete scope must be visible.
9. Unresolved ties at the qualification cutoff require manual organizer resolution.
10. Original districts are not permanent assignments for subsequent rounds.
11. Qualification and target-round allocation remain distinct where required by the architecture.
12. Save Scores, Qualify to Next Round, and Publish Leaderboard are separate actions.
13. Participant-facing standings reflect published data and authoritative qualification state.
14. Existing registration, payment verification, authorization, and match history must remain intact.

---

## 18. Roadmap-Based Qualification Controls and Selection UI

### 18.1 Current Issue

The Round 1 · District 1 leaderboard displays team rankings and scoring inputs, and manual team qualification is already functioning.

However, the organizer does not currently see an appropriate roadmap-based action to qualify a configured number of teams into the next round.

A second issue occurs when selecting teams for manual qualification: an unwanted tick/checkmark appears in the selection interface. The selection UI must be corrected without breaking the existing manual qualification workflow.

### 18.2 Roadmap-Based Qualification Action

The authorized organizer interface must provide a clearly visible **Qualify to Next Round** action when the selected source round has a valid target round and the required configuration is available.

The action must use the tournament's saved roadmap and existing backend qualification services.

Before confirming the operation, display:

- Source round.
- Target round.
- Selected qualification method.
- Configured qualification count.
- Number of eligible teams expected to advance.
- Whether the results are complete or provisional.
- Any unresolved ties, missing scores, or allocation constraints that affect qualification.

The action must not be hidden merely because the organizer is viewing an individual district if the configured workflow supports round-wide qualification. Its scope must be explicit.

### 18.3 Method A — Top Teams From Each District

The organizer can configure how many eligible teams advance from each district.

For example, if a round contains eight districts and four teams qualify from each district, the expected total is 32 teams.

The system must:

1. Rank eligible teams independently within each included district.
2. Use saved scores and the configured ranking and tie-break rules.
3. Select the configured number of qualifiers per district.
4. Identify districts that are ready, incomplete, or not yet processed.
5. Allow the organizer to process one eligible district or all applicable districts, depending on the existing workflow.
6. Present the resulting qualification decisions before confirmation.

When only one district is processed, the interface must not imply that the entire round has been qualified.

The actual district count, capacity, and advancement count must come from the saved roadmap rather than hardcoded values.

### 18.4 Method B — Top Teams Overall

The organizer can configure a total number of teams to advance from the entire eligible source round.

For example, if 128 teams are eligible and the organizer sets the qualification count to 64, the system selects the top 64 eligible teams across the source round.

The system must:

1. Combine the eligible standings from all relevant districts in the source round.
2. Rank teams globally using the applicable scoring and tie-break rules.
3. Select the configured overall qualification count.
4. Identify missing or unsaved district results.
5. Warn the organizer when the available data is incomplete.
6. Prevent a partial result from being presented as a complete round-wide decision.
7. Persist confirmed qualification decisions using the existing backend workflow.

The overall method must not accidentally select the top N teams from each district. It selects the configured total across the entire source round.

### 18.5 Qualification Configuration and Roadmap Integration

The system must use the actual saved configuration for:

- Qualification method.
- Source round.
- Target round.
- Per-district advancement count, when applicable.
- Overall advancement count, when applicable.
- Target-round capacity and structure.
- Ranking and tie-break rules.

If the roadmap already stores these values, reuse them rather than introducing conflicting configuration fields.

If a required setting is missing, provide an appropriate configuration or error state instead of silently applying an arbitrary default.

Qualification and target-round allocation must remain distinct where the existing architecture treats them as separate operations. Qualified teams must be handled by the existing allocation service and the target round's roadmap.

### 18.6 Tie Handling and Confirmation

When a tie at the qualification cutoff remains unresolved after applying the configured tie-break hierarchy:

- Identify the affected teams and qualification slots.
- Show the relevant scoring information.
- Require an authorized organizer to resolve the tie.
- Record the organizer's decision through the existing supported workflow.
- Recalculate the qualification result before final confirmation.

The system must not arbitrarily select a tied team or exceed the configured advancement count.

### 18.7 Preserve Manual Qualification

The existing manual qualification workflow is working and must remain available.

Roadmap-based qualification must complement, not replace, manual selection.

Both workflows must use consistent backend qualification records, eligibility rules, and allocation services. They must not create duplicate qualification records or conflicting target-round assignments.

### 18.8 Team Selection UI Correction

The leaderboard currently exhibits an unwanted tick/checkmark when the organizer selects teams for qualification.

The implementation must identify and correct the component, state handling, or styling responsible for this behavior.

Requirements:

- Preserve legitimate selection indicators and checkbox functionality.
- Keep multi-selection working.
- Ensure selection state is visually distinct from qualification status.
- Do not mark a team as qualified merely because it has been selected.
- Do not change a team's persisted qualification status before confirmation.
- Preserve the existing MatchDistrict visual theme and responsive layout.
- Avoid unrelated leaderboard redesigns.

### 18.9 Acceptance Criteria

The qualification interface is considered functionally complete when:

1. The organizer can choose between top N per district and top N overall, subject to the roadmap's supported configuration.
2. The organizer can configure the relevant number of qualifiers.
3. Per-district qualification ranks each included district independently.
4. Overall qualification ranks the eligible teams across the full source-round scope.
5. The source and target rounds are derived from the saved roadmap.
6. Incomplete results and unresolved ties are clearly identified.
7. Qualification decisions persist through the existing backend workflow.
8. Target-round allocation respects the target roadmap and its capacity.
9. Manual qualification continues to work.
10. The unwanted selection tick/checkmark issue is corrected without breaking team selection.

---

*End of Document*
