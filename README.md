# Match District

Match District is an esports tournament discovery and management platform for players, teams, tournament organizers, and administrators in the Indian gaming community.

The platform brings tournament discovery, team registration, payment review, match planning, results, and standings together in one place. Its goal is to make it easier for players to find competitions and for organizers to run them with clear schedules, fair processes, and useful communication.

## What Match District offers

### Discover tournaments

Players can browse tournaments, review their details, and decide which events fit their game, team, and schedule. Tournament information can include:

- Game and match format
- Total team slots and team-size expectations
- Entry fee and prize information
- Rules, maps, and other event details
- Registration opening and closing dates
- Tournament schedule and roadmap
- Organizer information and updates

The tournament pages are intended to give participants the information they need before they commit to an event.

### Register a team

The team leader completes registration for the tournament and provides the squad details required for its match type. The leader then follows the tournament’s payment instructions and submits payment proof for review.

Registration status is communicated through clear participant-facing states:

| Status | What the participant sees |
| --- | --- |
| Not registered | Join Now |
| Payment proof not submitted | Complete payment |
| Proof submitted and awaiting review | Verification pending |
| Registration approved | Registered successfully |
| Registration rejected | A rejection state with the option to submit proof again |

Approval by the tournament administrator confirms the team’s place. Participants should only be shown the status of their own registration.

### Review payments

Payment verification is handled manually by administrators through the website. Participants submit proof with their registration, and an authorized reviewer checks it before approving or rejecting the payment.

Payment proof is expected to come from approved HTTPS storage locations. A unique amount suffix may be used to help match a payment to a registration during manual review.

### Create and manage tournaments

Organizers can create tournament listings and manage the details needed to run an event. Their work may include:

- Setting tournament information, game, format, and team capacity
- Writing rules and providing event details
- Configuring registration and payment information
- Planning match days, times, and districts
- Publishing updates for participants
- Recording match results and managing standings
- Reviewing tournament registrations and team details

Administrative controls are intended for the tournament’s organizer and site administrators.

### Plan the tournament roadmap

The roadmap is the event’s planned structure before competition begins. It helps participants understand how the tournament is expected to progress and when matches are scheduled.

A district represents one lobby of teams. A tournament may have several districts in a round. If the expected number of advancing teams is too large for the final lobby, the roadmap can include additional rounds before the Grand Final.

The roadmap is a plan based on tournament capacity and the configured district size. It is not a live bracket that changes whenever registrations, results, standings, or disqualifications change. Qualification is handled separately after results are available.

Organizers can assign a district to each match, schedule multiple matches on a day, and set the dates and times for each round. Schedule information is presented in Indian Standard Time.

### Record results and follow standings

Organizers can enter and verify match results. The leaderboard presents team standings using tournament scoring rules.

When teams have equal total points, ranking follows these tie-breakers in order:

1. Total Winner Winner Chicken Dinners (WWCDs)
2. Total placement points
3. Total elimination points
4. Best placement in the most recent match

If teams remain tied after all of these criteria, the organizer makes the final decision.

### Qualify teams for later rounds

After a round’s results are ready, the organizer can use the qualification process to move eligible teams forward. Later rounds regroup qualified teams into new districts based on the number of teams advancing.

Qualification does not rewrite the published pre-tournament roadmap. The roadmap remains the schedule and structure that was planned for the event; qualification records which teams have advanced.

The Grand Final is the last stage. It has no further advancement rule, and the final standings determine the outcome of the tournament.

### Manage teams and invitations

Match District includes team-management and invitation experiences for tournament squads. The intended participant flow is for teammates to join through an invitation link or QR code and to use registered Match District accounts.

The squad size comes from the team leader’s tournament registration. Teammates are associated with the roster slots they occupy. Team changes such as leaving, removing a member, or transferring captaincy are intended to happen before allocation.

The strict team-access rule is that room credentials remain hidden from everyone, including the leader, until every roster slot is linked to a real registered account. Organizers may waive this requirement for an individual team with a reason. Teams allocated before this rule is introduced are treated as grandfathered.

### Protect match-room information

Room IDs and passwords are sensitive event information. They should not appear in public tournament details or the general roadmap. Participants receive them through the dedicated, access-controlled credential flow when the applicable release conditions are met.

The detailed design for how each teammate will see match credentials is still to be specified.

### Support organizers and administrators

Organizers have pages for managing their profile, tournaments, and event operations. Administrators have separate tools for reviewing payments, managing organizers, and overseeing platform operations.

The platform’s role boundaries are intended to keep organizer controls limited to the tournament owner and site administrators, with payment review available only to authorized reviewers.

## Who Match District is for

### Players and team leaders

Use Match District to explore events, understand their requirements, register a squad, submit payment proof, follow the review status, and check the tournament schedule and standings.

### Teammates

Join a squad through its invitation and connect your account to the correct roster slot. Registered accounts help organizers identify the people participating in an event.

### Tournament organizers

Use Match District to publish events, organize registrations, plan rounds and match schedules, communicate event details, record results, and qualify teams.

### Administrators and payment reviewers

Use the administrative workflows to review submitted payment proof, manage platform operations, and support organizers and participants.

## Principles behind the experience

- **Clear participation status:** Players should understand what they need to do next and whether their registration is awaiting review or approved.
- **Accountable teams:** Squad members are associated with registered player accounts and roster slots.
- **Private match credentials:** Room IDs and passwords are shared through a controlled participant flow.
- **Planned schedules:** The published roadmap communicates the event plan; later results and qualification are tracked separately.
- **Consistent standings:** Ranking follows published scoring and tie-break rules, with organizers resolving true ties.
- **Organizer ownership:** Tournament management controls belong to the organizer and site administrators.
- **Indian gaming context:** Tournament communication and scheduling are designed for the platform’s Indian market, including IST schedule display.

## Current scope

Match District focuses on tournament discovery and operations: event pages, registration, manual payment review, team management, roadmaps, match results, leaderboards, and qualification.

The former PGV companion Android integration has been removed. Payment verification takes place through the website’s manual review process.

Some team-management requirements are still being developed or verified. The intended rules described above should be treated as the product direction where a workflow is not yet fully available.

## Project status and contributions

This repository contains the Match District application and supporting project documentation. The detailed project context, product decisions, known issues, and working guidelines are maintained in the private OVERVIEW.md file for authorized project collaborators.

Before changing participant, organizer, payment, roadmap, qualification, or credential behavior, review the existing project decisions and confirm the current workflow in the application.
