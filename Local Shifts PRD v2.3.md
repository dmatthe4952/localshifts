# Local Shifts
## Self-Hosted Volunteer Shift Signup System
### Product Requirements Document | v2.3 | April 14, 2026

---

## 1. Purpose & Scope

Local Shifts is a lightweight, self-hosted web application that replaces commercial services like SignupGenius for organizations that recruit volunteers for time-slotted events. It is designed to run in Docker on a standard VPS and targets a single organization that manages events on behalf of themselves and partner organizations.

Local Shifts is developed for and by Indivisible Upstate SC (IUSC) and its Voter Engagement Team (VET), but is architected generically so any similar organization can self-host it.

**Scope policy:** This platform is intended exclusively for PUBLIC activities — canvassing events, phone banks, food bank signups, protest marshaling, river cleanups, and similar open civic activities. It is NOT intended for private, members-only, or operationally sensitive events where volunteer lists would create legal or safety risk if subpoenaed.

**Core design principles:**

- **Security-first:** no WordPress, no plugin ecosystem attack surface; minimal dependencies
- **Frictionless volunteer experience:** sign up with only a name and email — no account creation, no login
- **Privacy by default:** first name + last initial only; volunteers may use aliases; data purged automatically after events
- **Operator control:** all data stays on your server; no third-party SaaS dependency
- **Low maintenance:** containerized, auto-updating reminder emails, straightforward backup

---

## 2. User Roles

### 2.1 Role Overview

| Role | Description | Authentication |
|------|-------------|----------------|
| Admin | Single system owner. Creates Event Manager accounts, manages global settings, and has full manager capabilities — can create and manage events directly and can impersonate any Event Manager to view their perspective. | Username + password + optional 2FA |
| Event Manager | Assigned by Admin. Creates and manages their own events, views volunteer signups, sends broadcasts. | Username + password |
| Volunteer | Any member of the public. Signs up for shifts using only first name + last initial. No account required. Aliases are explicitly permitted. | None (token-based cancel links only) |

### 2.2 User Narratives

**Volunteer**

I want to find volunteering opportunities near me. I visit the homepage and the app detects my approximate location from my IP address and shows a banner: "Showing events near Greenville, SC." If that's wrong, I click it and type in my zip code, then pick a radius — maybe 10 miles, maybe 20. The event list updates to show only what's nearby.

I browse events sorted by date, with any featured ones pinned at the top. Each card shows the event name, organization, date, location, and tags like 'Canvassing' or 'Food Bank.' I can filter by tag if I'm looking for something specific.

I click into an event and see the full description, the location with a map link, and a list of shifts with their roles, times, and how many slots are still open. I find a shift that works and click 'Sign Me Up.' A small form asks for my first name, last initial, and email address. A note tells me I can use a nickname or alias — no one's checking. I submit and immediately get a confirmation email with all the details.

Before my shift I get reminder emails. If something comes up and I need to cancel, there's a one-click cancel button right in the email — no login, no hunting around. If I want to see everything I'm currently signed up for across all events, there's a link in any email that says 'View all my signups.' I click it, enter my email, and get a link sent to me. I click the link and see everything at a glance, with the option to cancel any of them from that same page.

**Event Manager**

I manage events for a local organization. I log in and my dashboard shows me everything at once: upcoming shifts, open slots, and any alerts about shifts that are running low on volunteers.

Creating a new event is quick. I pick my organization from a dropdown and its logo and color scheme are automatically applied — all my events have the same look without any extra work. I fill in the event details, upload an image if I have one, and add shifts using role templates I've saved: 'Setup Crew,' 'Check-In,' 'Distribution.' I set a minimum and maximum volunteer count per shift. Before I publish, I set up two reminder emails using the default templates — one 24 hours out, one 2 hours before — and customize the text slightly.

Once the event is live, I get an email every time someone signs up or cancels. If a cancellation drops a shift below my minimum, the notification flags it as urgent. I can check the full roster at any time, manually add someone who signed up by phone, or remove someone if needed. If I need to send a last-minute update to everyone, I use the broadcast feature.

If I have to cancel the whole event, I enter a message explaining why, confirm, and the system emails everyone who's signed up. I don't have to send individual emails or go find their addresses.

**Admin**

I set up the platform once and mostly stay out of the way. I configure the SMTP connection, set the system-wide default for how long volunteer data is kept after an event, and create the organizations with their logos and brand colors. When a new manager joins, I create their account, assign them to an organization, and they're ready to go.

From my dashboard I can see everything happening across all managers and events. I can access any event directly — I don't need to impersonate anyone just to fix a typo or check a roster. If I want to see exactly what a manager sees, I can enter their view with one click; a banner reminds me whose view I'm in and I can exit any time. Those sessions are logged.

When someone submits a public event request via the website form, I get an email with their details already filled in. I decide what to do with it: forward it to the right manager, create a new organization and manager account and invite the submitter to take over, or set it aside. There's no approval queue — I handle it however makes sense for that situation.

---

## 3. Recommended Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Language | TypeScript (compiled to Node.js) | Type-safe development; catches schema mismatches at compile time; minimal runtime overhead |
| Runtime | Node.js 20 LTS | Excellent async I/O for email + web; huge ecosystem; LTS stability |
| Web Framework | Fastify | Faster than Express; built-in schema validation; low overhead |
| Templating | Nunjucks (server-rendered HTML) | No client-side framework needed; simpler security model; fast page loads |
| Database | PostgreSQL 16 | Relational model fits events/shifts/signups perfectly; ACID; excellent Docker image |
| ORM / Query | Kysely | Type-safe SQL query builder; no magic; easy to audit; no heavy ORM abstraction |
| Email | Nodemailer + SMTP | Works with PurelyMail or any SMTP relay; no vendor lock-in |
| Job Scheduler | pg-boss | Postgres-backed job queue for reminder emails; no separate Redis needed |
| File Storage | Local filesystem (Docker volume) | Event images stored on disk; simple; no S3 complexity for small scale |
| CSS | Tailwind CSS (CDN build) | Utility-first; no build step needed at CDN scale; clean responsive UI |
| Reverse Proxy | Traefik v3 | Automatic HTTPS via Let's Encrypt; label-based Docker routing; actively maintained. The Docker image is reverse-proxy-agnostic; Traefik is the reference deployment configuration. |
| Containerization | Docker Compose | Single compose file; easy deploy; reproducible environment |
| IP Geolocation | MaxMind GeoLite2 (local DB) | Free offline database; no external API call; queried locally for IP-to-city lookup on homepage. Updated via periodic download. Requires a free MaxMind account and license key — see deployment guide. |
| Address Geocoding | Nominatim (OpenStreetMap API) | Free geocoding API; called at event save time to resolve location_name to lat/lng. Rate limit: 1 req/sec — sufficient for event creation. |

Traefik handles TLS termination automatically via Let's Encrypt. The Node app listens on an internal port (3000) and is never exposed directly to the internet.

---

## 4. Data Model

### 4.1 Organizations

An Organization represents a named entity (your org or a partner org) under which events can be grouped. It provides customizable branding per event context.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| name | varchar(120) | e.g. 'Greenville Food Bank' |
| slug | varchar(60) | URL-safe identifier, e.g. 'greenville-food-bank' |
| logo_url | varchar(255) | Optional logo image path |
| primary_color | char(7) | Hex color for event page theming, e.g. '#2E86C1' |
| contact_email | varchar(120) | Default reply-to for this org's events |
| created_by | UUID (FK → users) | Admin or Event Manager who created it |
| created_at | timestamptz | |

### 4.2 Events

| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| organization_id | UUID (FK → organizations) | Which org this event belongs to |
| manager_id | UUID (FK → users) | Event Manager responsible |
| title | varchar(200) | |
| description | text | Rich text (HTML); shown on public event page |
| location_name | varchar(200) | Human-readable address, e.g. '123 Main St, Greenville SC' |
| location_lat | decimal(9,6) (nullable) | Latitude, geocoded from location_name at save time via Nominatim. Null if geocoding fails. |
| location_lng | decimal(9,6) (nullable) | Longitude, geocoded from location_name at save time via Nominatim. Null if geocoding fails. |
| location_map_url | varchar(500) | Full Google Maps URL (copy-paste from browser) |
| image_path | varchar(255) | Path to uploaded event image on server |
| event_date | date | The date of the event |
| is_published | boolean | false = draft, not shown on public listing |
| is_archived | boolean | true = hidden from listings, data retained |
| is_featured | boolean | true = shown prominently at top of homepage. Default: false |
| cancelled_at | timestamptz (nullable) | Set when manager cancels the event. Null = active. |
| cancellation_message | text (nullable) | Required message entered by manager when cancelling; sent to all active signups. |
| confirmation_email_note | text (nullable) | Optional extra note appended to the signup confirmation email for this event. Useful for parking instructions, what to wear, etc. |
| purge_after_days | integer (nullable) | Days after last shift to purge volunteer PII. Null = use system default. Can be set or changed by Event Managers or Admin at any time before or after publication. |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### 4.3 Shifts

A Shift is one time slot within an event. An event can have many shifts.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| event_id | UUID (FK → events) | |
| role_name | varchar(120) | e.g. 'Set Up' — drawn from Role Templates or entered freely |
| role_description | varchar(500) | Optional: e.g. 'Arrange tables and chairs, bring gloves' |
| duration_minutes | integer | e.g. 120 for a 2-hour shift |
| shift_date | date | The calendar date of this shift |
| start_time | time | |
| end_time | time | Derived from start_time + duration, or set manually |
| min_volunteers | integer | Soft minimum; shown to manager as 'understaffed' warning |
| max_volunteers | integer | Hard cap; signup blocked when reached |
| is_active | boolean | Manager can pause a shift without deleting it |

### 4.4 Signups

| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| shift_id | UUID (FK → shifts) | |
| first_name | varchar(80) | |
| last_initial | char(1) | Volunteer's last initial. Aliases explicitly permitted — noted in UI. |
| email | varchar(120) | Stored; never shown publicly |
| cancel_token_hash | varchar(64) | HMAC-SHA256 hash of the cancel token sent in the email. Raw token never stored. |
| cancel_token_expires_at | timestamptz | Tokens expire 7 days after the event date |
| cancelled_at | timestamptz | Null = active signup; not-null = cancelled |
| cancellation_note | text | Optional note from volunteer when cancelling |
| created_at | timestamptz | Signup timestamp |

No password, no account, no login. The cancel token embedded in each email is the volunteer's only credential.

### 4.5 Tags

Tags are short labels applied to events for categorization and public filtering. Multiple tags can be applied to a single event. Both Admin and Event Managers can create tags. System-reserved tags are automatically managed by the application and cannot be deleted by users.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| name | varchar(50) | Display name, e.g. 'Understaffed', 'Canvassing', 'Food Bank' |
| slug | varchar(50) | URL-safe, lowercase identifier, e.g. 'understaffed', 'canvassing' |
| is_system | boolean | true = reserved tag managed automatically by the application. Cannot be deleted by users. Default: false. |
| created_by | UUID (FK → users) | Admin or Event Manager who created it; null for system tags |
| created_at | timestamptz | |

### 4.6 EventTags

Junction table linking Tags to Events. An event can have many tags; a tag can be applied to many events.

| Field | Type | Notes |
|-------|------|-------|
| event_id | UUID (FK → events) | Composite primary key |
| tag_id | UUID (FK → tags) | Composite primary key |

### 4.7 Role Templates

Role Templates are reusable shift definitions managed by an Event Manager. When creating an event, managers can pick from their templates to pre-fill shift fields rather than typing from scratch each time.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| manager_id | UUID (FK → users) | Templates are per-manager (not global) |
| role_name | varchar(120) | e.g. 'Set Up' |
| role_description | varchar(500) | e.g. 'Arrange tables and chairs' |
| duration_minutes | integer | Default duration in minutes |
| default_min_volunteers | integer | |
| default_max_volunteers | integer | |

### 4.8 Reminder Rules

Each event can have up to 3 reminder rules. A background job evaluates these and sends emails to active (non-cancelled) signups for upcoming shifts.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| event_id | UUID (FK → events) | |
| send_offset_hours | integer | Hours before shift start to send reminder. e.g. 24 = 1 day before, 4 = morning-of |
| subject_template | varchar(300) | Email subject with merge tags |
| body_template | text | Email body with merge tags (HTML supported) |
| is_active | boolean | Manager can disable a rule without deleting it |

### 4.9 Notification Sends (email audit log)

A unified outgoing email log. Every email the system sends — confirmations, reminders, cancellations, broadcasts, and event cancellation notices — is recorded here. Provides deduplication, delivery status tracking, and a full audit trail.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| kind | text | e.g. 'signup_confirmation', 'reminder', 'cancellation_confirm', 'event_cancelled', 'broadcast' |
| event_id | UUID (FK → events, nullable) | Set for event-level notifications (e.g. event cancellation notice) |
| signup_id | UUID (FK → signups, nullable) | Set for signup-level notifications (confirmations, reminders, cancellations) |
| reminder_rule_id | UUID (FK → reminder_rules, nullable) | Set when kind = 'reminder'. Required for per-rule deduplication. |
| to_email | varchar(120) | Recipient address |
| subject | text | Email subject as sent |
| body | text | Email body as sent |
| status | text | 'queued' \| 'sent' \| 'failed' |
| error | text (nullable) | SMTP error message if status = 'failed' |
| created_at | timestamptz | When the send was attempted |
| sent_at | timestamptz (nullable) | When the send succeeded |

**Deduplication:** For non-reminder kinds, a unique index on `(kind, signup_id)` prevents duplicate sends if the job runs twice in the same window. For reminders, the unique index is on `(signup_id, reminder_rule_id)` — this allows multiple distinct reminder rules (e.g. 24-hour and 2-hour) to each send once per signup without blocking one another.

### 4.10 Impersonation Log

Records when Admin enters and exits 'View As Manager' mode. Only session boundaries are logged — individual actions taken during impersonation are not recorded.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| super_admin_id | UUID (FK → users) | The Admin who initiated impersonation |
| impersonated_manager_id | UUID (FK → users) | The Event Manager being viewed as |
| started_at | timestamptz | When the impersonation session began |
| ended_at | timestamptz (nullable) | When the session ended. Null if session is still active. |

### 4.11 Manager Organizations

The junction table that controls which organizations each Event Manager can create events under. There is only one manager role — this table is how admin controls scope. A manager can be assigned to one org or many; an org can have one manager or many. Both relationships are fully flexible and admin-controlled, and assignments can be added or removed at any time as organizations grow and find their own people.

**Multiple managers per organization are explicitly supported.** IUSC, for example, has multiple teams and may need several managers operating under the IUSC organization simultaneously. Each manager sees only their own events on their dashboard, but all can create new events under the shared org.

| Field | Type | Notes |
|-------|------|-------|
| manager_id | UUID (FK → users) | Composite primary key |
| organization_id | UUID (FK → organizations) | Composite primary key |
| assigned_by | UUID (FK → users) | The Admin who created this assignment |
| assigned_at | timestamptz | When the assignment was created |

**Access control rules:**
- A manager's org dropdown during event creation shows only their assigned orgs. Admin sees all orgs.
- Multiple managers can be assigned to the same org and can all create events under it. Each manager sees only their own events and rosters on their dashboard — org assignment controls creation rights only, not cross-manager visibility.
- Removing a manager from an org removes their ability to create new events under it, but does not affect their existing events. Ownership of an event (via `manager_id` on events) is separate from org assignment.

### 4.12 Volunteer Email Tokens

Short-lived tokens used to authenticate the 'My Signups' magic-link flow. When a volunteer requests their signups page, the server generates a token, emails it as a link, and stores a hash here. The token expires one hour after issuance.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| email | varchar(120) | The volunteer's email address used for lookup |
| token_hash | varchar(64) | SHA-256 hash of the raw token sent in the email. Raw token never stored. |
| created_at | timestamptz | When the token was issued |
| expires_at | timestamptz | One hour after created_at |
| first_used_at | timestamptz (nullable) | Set on first page load. Does not invalidate the token — recorded for audit purposes. |

Tokens are scoped to an email address, not a specific signup. One token gives access to all active signups for that email. The token remains valid for its full one-hour window regardless of how many times the page is loaded or how many signups are cancelled during that session. It expires naturally at `expires_at`.

---

## 5. Public-Facing Features (Volunteer Experience)

### 5.1 Event Listing Page

- Up to 3 featured events (`is_featured = true`) are displayed first, with a 'Featured' visual badge, before all other events. If more than 3 events are marked featured, the 3 most recently updated are shown.
- Below featured events: all other published, non-archived events with upcoming shifts, in chronological order by date
- Events where all shifts have passed are automatically hidden from this listing (cron job runs daily)
- 'View Past Events' link available to access archived events
- Each event card shows: event image, title, organization name, date(s), location, tags, approximate distance from the visitor's detected location (e.g. '4 miles away'), and open volunteer slots remaining
- Events with zero remaining slots across all shifts are visually marked as 'Full' but remain visible
- Events where `location_lat`/`location_lng` could not be geocoded show without a distance label
- Filter bar: filter by tag (e.g. 'Canvassing', 'Food Bank', 'Urgent'); filter by organization (if multiple orgs present)
- Fully responsive for mobile

> **Design touchpoint (Tim):** The public event listing is the highest-visibility page. Tim will finalize card layout, typography, tag pill styling, the 'Full' badge, the 'Featured' badge, distance label, and overall spacing. Build the functional markup first; keep CSS minimal and easily overridable. See §17.

This page lives at the root of the domain, e.g. `https://localshifts.org/`

### 5.2 Location Detection & Proximity Filtering

On first visit, the server reads the visitor's IP address and queries the local MaxMind GeoLite2 database to determine their approximate city and coordinates. No data is logged or stored — this is a real-time query used only to pre-filter the event list.

- A dismissible location banner appears at the top of the listing page: "Showing events near Greenville, SC — change location?"
- If GeoLite2 cannot resolve the IP (e.g. private network, VPN), the default falls back to showing all events with no distance filter
- The visitor can click 'change location' at any time to open the location picker:
  - Zip code field: visitor types a US zip code
  - Radius dropdown: 5 miles / 10 miles / 20 miles / 50 miles / Show all
  - 'Use my current location' button (HTML5 Geolocation API — browser asks permission)
- The chosen location and radius are stored in a session cookie and applied to all subsequent page loads during the session
- The URL updates to reflect the filter (e.g. `/?zip=29601&radius=20`) so the filtered view is shareable and bookmarkable
- The proximity filter is applied via Haversine formula in the PostgreSQL query — no PostGIS extension required
- Events with null lat/lng are always shown at the bottom of the list regardless of filter, with no distance label
- The GeoLite2 `.mmdb` database file is bundled in the Docker image or mounted as a volume. Admin is responsible for periodic updates (MaxMind releases twice monthly). A helper script is provided in the repo to re-download it. **Note: a free MaxMind account and license key are required to download GeoLite2 databases — the deploy guide walks through account setup.**

### 5.3 Event Detail Page

- Shows full event description, date/time details, location name with a linked 'View on Google Maps' button
- Displays the event image prominently
- Displays all tags applied to the event
- Lists all shifts in a table/card layout. Each shift shows:
  - Role name and description
  - Date, start time, end time
  - Slots remaining (e.g. '3 of 5 slots open') — or a 'Full' badge when `max_volunteers` reached
  - A 'Sign Me Up' button (disabled/greyed when full)
- Shifts are ordered by date and start time

> **Design touchpoint (Tim):** The event detail page has the most visual complexity: hero image sizing and cropping, event description prose rendering, shift table vs. card layout, the 'Full' badge, and the 'Sign Me Up' button state. The org's `primary_color` should be applied here as an accent. Tim will make calls on these before launch. See §17.

### 5.4 Signup Flow

Clicking 'Sign Me Up' opens a simple inline form (no page redirect) with fields:

- First Name
- Last Initial (single character)
- Email Address

A note beneath the name fields reads: "Any name is fine — you can use a nickname or alias."

- On submit, server validates inputs: required fields, valid email format, valid single character for last initial, not already signed up with same email for same shift
- If `max_volunteers` is already reached (race condition check), the form rejects with a friendly message and refreshes slot counts
- On success, a confirmation email is sent to the volunteer immediately
- The page updates to show the volunteer's slot as filled — no page reload required
- No account is created. No password is set. The volunteer's only 'credential' is the cancel token in their email.

> **Design touchpoint (Tim):** The inline signup form is a key conversion moment. Tim will refine the form field styling, the alias note treatment, the success state, and the slot-count update. Keep the markup clean and avoid tightly coupled inline styles. See §17.

### 5.5 Cancellation Flow

- Every confirmation email and reminder email contains a unique, one-click cancellation link
- The link format is: `https://localshifts.org/cancel/{cancel_token}`
- Clicking the link shows a simple confirmation page with the shift details and a 'Yes, Cancel My Signup' button
- An optional text area allows the volunteer to leave a brief cancellation note for the manager
- On confirmation, the signup is marked cancelled (soft delete — data is retained until scheduled purge)
- The shift slot count is immediately updated (the slot reopens)
- A cancellation notification email is sent to the Event Manager immediately
- Tokens expire 7 days after the event date; expired token links show a friendly expiry message

> **Design touchpoint (Tim):** The cancellation confirmation page and the expiry message page are small but volunteer-facing. Tim will review the layout and messaging treatment. See §17.

### 5.6 Past Events Archive

- Accessible at `/events/past` — disabled by default; enabled by Admin in system settings
- When enabled: shows event title, organization, date(s), location, and tags — no volunteer data ever shown
- Events appear here once all their shifts have passed
- When disabled: `/events/past` returns 404 and no link to it appears on the homepage

### 5.7 Public Event Request Form

A simple contact form at `/add-event` for partner organizations or individuals who want to list an event. It is not linked from homepage navigation — shared as a direct URL when needed.

- Form fields:
  - Event title (required)
  - Proposed date (required)
  - Proposed start time (required)
  - Organization name (required — free text)
  - Event description (optional)
  - Your name (required)
  - Your email (required)
  - Your phone number (optional)
- On submit: an email is sent to the Admin with all the above details. No database record is created. No account is created.
- The submitter sees: "Thanks! We received your event request and will follow up at [email]."
- Admin decides what to do with the request manually: forward to an existing manager, create a new organization and manager account and invite the submitter, or set it aside. There is no in-app review queue.
- **Rate limiting:** 5 submissions per hour per IP to prevent spam abuse.

### 5.8 My Signups

A magic-link-based page that lets a volunteer see and manage all their active signups across all events without creating an account. Every confirmation and reminder email includes a 'View all my signups' link that triggers this flow.

- Accessible at `/my` — a simple form with one field: email address
- **Rate limiting:** 5 requests per hour per IP to prevent email enumeration and spam abuse.
- On submit: the server looks up all active (non-cancelled) signups for that email across all events
  - If any are found: a magic link is generated and emailed to that address. The link points to `/my/:token` and is valid for one hour from issuance.
  - If none are found: the same 'check your email' response is shown — no confirmation either way whether the email is in the system (prevents enumeration)
- Clicking the magic link opens `/my/:token` which shows a list of all active signups for that email:
  - Each row shows: event title, shift date and time, role name, location, and a 'Cancel This Signup' button
  - Events are sorted chronologically — soonest first
  - Cancelled or past signups are not shown
- Clicking 'Cancel This Signup' follows the same cancellation flow as the single-signup cancel link: shows a brief confirmation with an optional note field, then cancels the signup and notifies the manager
- **Token lifetime:** the token remains valid for its full one-hour window from issuance. It is NOT invalidated on first page load. A volunteer can cancel multiple signups in a single session without requesting a new link. The token expires naturally at one hour regardless of activity.
- Every confirmation and reminder email includes a secondary link labeled 'View all my signups' that goes to `/my` with the volunteer's email pre-filled
- The `/my` page itself does not require a token — it's just a form. Only `/my/:token` requires authentication.

> **Design touchpoint (Tim):** The My Signups list is volunteer-facing and should feel as polished as the public event pages. Tim will review the row layout, cancel button treatment, and the empty/expired state pages. See §17.

---

## 6. Admin & Manager Features

### 6.1 Admin Dashboard

- Overview cards: total events, total upcoming shifts, total signups this month, understaffed shifts
- User management: create, edit, deactivate Event Manager accounts
- Organization management: create, edit, delete Organization schemes (name, logo, color, contact email)
- Tag management: create, edit, delete any tag (including tags created by Event Managers); view a count of events using each tag; system tags are listed but cannot be deleted
- System settings: SMTP configuration, default email templates, timezone, application name/branding, and `default_purge_days` (system-wide default purge window; recommended: 7)
- View all events across all managers
- Direct event management: Admin can access all Event Manager screens (`/manager/*`) and create or manage events directly — no need to act as a specific manager
- 'View As [Manager]' mode: click any Event Manager's name in the user list to enter impersonation view. A persistent banner ('Viewing as [Manager Name] — Click to exit') is displayed throughout. Admin retains full permissions in this mode. Session start and end times are recorded in the Impersonation Log (section 4.10).

### 6.2 Event Manager Dashboard

- My Events list: cards for each event with quick stats (shifts, filled slots, open slots)
- Upcoming shifts panel: a chronological feed of the next 14 days of shifts with live fill status
- Understaffed alerts: banner/badge when any upcoming shift has fewer signups than `min_volunteers`
- Quick-create button for new events

> **Design touchpoint (Tim):** The manager dashboard is internal-facing but sets the tone for the manager experience. Tim will review the event card layout, the upcoming shifts panel, and the understaffed alert styling. See §17.

### 6.3 Event Creation & Editing

A multi-step form (or single long form) with the following sections:

**Step 1 — Basics:** Title, Organization (dropdown), Description (rich text editor), Event Image upload (JPEG/PNG, max 5 MB, auto-resized to 1200px wide), Tags (multi-select from available tags — checkboxes or typeahead chip selector), Featured checkbox ("Show this event at the top of the homepage"), Data Retention override ("Purge volunteer data [X] days after last shift — leave blank for system default").

**Step 2 — Date & Location:** Single date picker. Location name text field. Google Maps URL field (with helper: 'Paste the full URL from your browser's address bar while viewing the location on Google Maps').

**Step 3 — Shifts:** Add one or more shifts per event. Each shift can be added from a Role Template or created from scratch. Fields: role name, description, date (pre-filled from event date), start time, duration, min volunteers, max volunteers. Drag-to-reorder shifts.

**Step 4 — Reminders:** Configure up to 3 reminder rules. For each: offset (hours before shift), email subject, email body. Default templates are pre-filled from system defaults but fully editable. Available merge tags shown as clickable chips: `{{volunteer_first_name}}`, `{{event_title}}`, `{{shift_date}}`, `{{shift_start_time}}`, `{{shift_role}}`, `{{location_name}}`, `{{location_map_url}}`, `{{cancel_url}}`

**Preview & Publish:** Review all settings. Save as Draft or Publish immediately.

> **Design touchpoint (Tim):** The multi-step event creation form is manager-facing. Tim will review step indicator styling, form field layout, the reminder template editor, and the merge tag chip display. Lower priority than public-facing pages but should feel consistent. See §17.

### 6.4 Role Template Management

- A dedicated 'Role Templates' section in the manager's settings
- Create, edit, delete templates: role name, description, default duration, default min/max volunteers
- Templates are personal to each Event Manager (not shared globally unless Admin creates global templates in a future version)

### 6.5 Signup Management

- Per-event signup roster: a table of all signups grouped by shift, showing name (first name + last initial), email, signup time, status (active/cancelled)
- Manager can manually remove a signup (treated as cancellation; notification sent to volunteer)
- Manager can manually add a signup (useful for phone/in-person signups): enter first name, last initial, and email; system sends confirmation email
- Export to CSV: all signups for an event, or all upcoming signups across events
- Broadcast email: compose and send an ad-hoc email to all active signups for a specific event or shift (useful for last-minute updates)

### 6.6 Cancellation Notifications to Manager

- When a volunteer cancels, the assigned Event Manager receives an email immediately
- Email contains: volunteer first name + last initial, event title, shift role, shift date/time, optional cancellation note, and a link to the signup roster
- If the cancellation drops the shift below `min_volunteers`, the notification is flagged as urgent in the subject line

### 6.7 Tag Management

- Both Admin and Event Managers can create tags from the tag management screen or inline during event creation
- Admin can edit or delete any tag (including tags created by Event Managers). Deleting a tag removes it from all events.
- Event Managers can edit or delete tags they created, but not tags created by Admin or other managers
- System-reserved tags (`is_system = true`) are listed for reference but cannot be edited or deleted by any user — they are managed automatically by the application

**System-reserved tags in V1:**

'Understaffed' — automatically applied to an event when any upcoming shift has fewer signups than `min_volunteers`; automatically removed when all upcoming shifts meet or exceed their `min_volunteers` threshold. This check runs immediately on every volunteer signup and every cancellation, including manager-initiated removals.

Tag names must be unique (case-insensitive). Attempting to create a duplicate tag name shows an error.

### 6.8 Event Cancellation

An Event Manager (or Admin) can cancel an entire event at any time before or after it starts. Cancellation is a distinct, irreversible action — it is not the same as archiving or unpublishing.

- A 'Cancel This Event' button is available on the event detail/edit screen for published and draft events
- Clicking the button opens a confirmation dialog that:
  - States clearly that cancellation cannot be undone
  - Requires the manager to enter a cancellation message (required, not optional) explaining why the event was cancelled
  - Shows a count of active signups that will be notified
- On confirmation, the server sets `cancelled_at = now()` and stores the `cancellation_message` on the event record
- The event is immediately hidden from the public listing and event detail page (or shows a 'Cancelled' banner if a direct URL is visited)
- An Event Cancellation Notice email is sent immediately to all active (non-cancelled) signups for every shift of the event
- The cancellation email includes: event title, original date/time, cancellation message from the manager, and the manager's contact email
- No further reminder emails are sent for cancelled events (the reminder scheduler checks `cancelled_at` before sending)
- Cancelled events remain in the database with all shift and signup records intact until the normal purge window elapses
- The event appears in the manager's event list with a 'Cancelled' badge for reference

Cancellation is permanent. There is no 'uncancel' — to restore a cancelled event, create a new one.

---

## 7. Email System

### 7.1 Email Types

| Email Type | Trigger | Recipient | Cancel Link Included? |
|------------|---------|-----------|----------------------|
| Signup Confirmation | Volunteer submits signup form | Volunteer | Yes — plus 'View all my signups' link |
| Reminder | pg-boss job, per Reminder Rule offset | Volunteer (active signups only) | Yes — plus 'View all my signups' link |
| Cancellation Confirmation | Volunteer cancels via token link | Volunteer | No |
| Cancellation Alert | Volunteer cancels via token link | Event Manager | No |
| Event Cancellation Notice | Manager cancels entire event | All active signups (all shifts of the event) | No |
| Manager Broadcast | Manager sends ad-hoc message | All active signups (event or shift) | Yes (appended automatically) |
| Manual Removal Notice | Manager removes a signup | Volunteer | No |
| My Signups Magic Link | Volunteer requests their signups page at /my | Volunteer | N/A (the email IS the link) |
| Event Request Notification | Someone submits /add-event form | Admin | No |

### 7.2 SMTP Configuration

- Configured by Admin in System Settings
- Fields: SMTP host, port, secure (TLS/STARTTLS), username, password, 'From' name, 'From' address
- PurelyMail.com is the recommended default (standard SMTP, port 587 STARTTLS)
- A 'Send Test Email' button on the settings page sends a test message to the admin's own address
- SMTP credentials stored encrypted at rest in the database (AES-256)

### 7.3 Reminder Scheduling

- A pg-boss job runs every 15 minutes
- It queries for shifts where: shift start time is within `(now + offset_hours)` AND a `notification_sends` record does not already exist for this `(signup_id, reminder_rule_id)` combination
- Sends the reminder and writes to `notification_sends` to prevent duplicates
- Cancelled signups are excluded from all reminder sends
- If SMTP delivery fails, the job retries up to 3 times with exponential backoff before logging an error

### 7.4 Email Merge Tags

All email templates (system defaults and per-event overrides) support the following merge tags:

| Tag | Resolves To |
|-----|-------------|
| `{{volunteer_first_name}}` | Volunteer's first name |
| `{{volunteer_last_initial}}` | Volunteer's last initial |
| `{{event_title}}` | Title of the event |
| `{{event_description_plain}}` | Plain-text version of event description |
| `{{organization_name}}` | Name of the organization |
| `{{shift_role}}` | Role name of the shift |
| `{{shift_date}}` | Date of the shift (formatted, e.g. 'Saturday, April 12, 2026') |
| `{{shift_start_time}}` | Start time (e.g. '9:00 AM') |
| `{{shift_end_time}}` | End time (e.g. '11:00 AM') |
| `{{shift_duration}}` | Duration in plain English (e.g. '2 hours') |
| `{{location_name}}` | Location name string |
| `{{location_map_url}}` | Google Maps URL (full hyperlink) |
| `{{cancel_url}}` | Full URL with unique cancel token |
| `{{event_url}}` | Public URL of the event detail page |
| `{{manager_name}}` | Event Manager's display name |
| `{{manager_email}}` | Event Manager's email (for reply-to) |

---

## 8. Security Requirements

### 8.1 Admin Authentication

- Single login endpoint at `/login` — there are no separate `/admin/login` or `/manager/login` URLs. After successful login, the server redirects based on the user's role: Admin → `/admin/dashboard`, Event Manager → `/manager/dashboard`.
- The login link is NOT shown in the public homepage navigation. It is accessed by direct URL only (e.g. bookmark, back-channel link). This reduces visibility of the admin surface to casual site visitors.
- Passwords hashed with bcrypt (cost factor 12 minimum)
- Session management via secure, httpOnly, sameSite=strict cookies with server-side session store (Postgres-backed)
- Session expiry: 8 hours of inactivity; 24-hour absolute maximum
- Rate limiting on login endpoint: 10 attempts per 15 minutes per IP, then temporary lockout
- Optional TOTP-based 2FA for Admin account (QR code enrollment in settings)
- No password reset via email link (to avoid account takeover via email compromise); Admin resets manager passwords directly from the user management panel

### 8.2 Volunteer Token Security

- Cancel tokens generated with 32 bytes of cryptographically secure random data (`crypto.randomBytes`), encoded as hex (64 chars)
- Only a HMAC-SHA256 hash of the token is stored (`cancel_token_hash`); the raw token lives only in the email and is never written to the database
- Cancel tokens expire 7 days after the event date
- Volunteer Email Tokens (for My Signups magic links) are similarly stored as SHA-256 hashes only; they expire one hour after issuance

### 8.3 CSRF Protection

All state-mutating POST/PUT/DELETE requests from authenticated manager and admin sessions must include a valid CSRF token.

- The server generates a per-session CSRF token on login and stores it server-side
- The token is injected as a hidden field in all rendered HTML forms (Nunjucks global helper)
- AJAX/fetch requests from manager UI must include the token as an `X-CSRF-Token` request header
- Requests with a missing or mismatched CSRF token are rejected with HTTP 403
- Public volunteer-facing forms (signup, cancel confirmation, /my email entry) do not require CSRF tokens — they are stateless and unauthenticated by design

### 8.4 Input Validation & Sanitization

- All form inputs validated server-side with Fastify schema validation (JSON Schema)
- HTML in description fields sanitized with DOMPurify (server-side via jsdom) to prevent stored XSS
- File uploads: type checked by magic bytes (not just extension), size limited to 5 MB, stored outside web root with randomized filenames
- Parameterized queries throughout (Kysely enforces this by default — no raw string interpolation)

### 8.5 Rate Limiting

- Login endpoint: 10 attempts per 15 minutes per IP, then temporary lockout (section 8.1)
- `/my` (My Signups email entry): 5 requests per hour per IP — prevents email enumeration and outbound email spam
- `/add-event` (Public Event Request Form): 5 submissions per hour per IP — prevents spam abuse
- Rate limiting state is stored in memory (or Redis if available); acceptable to reset on restart given the low-stakes context

### 8.6 Infrastructure

- Node.js process runs as a non-root user inside the container
- Traefik handles all TLS termination; internal traffic is HTTP only (not exposed outside Docker network)
- Database port not exposed outside Docker internal network
- Environment variables (DB credentials, SMTP password, session secret) passed via `.env` file, never committed to source control
- Fail2ban or similar recommended at VPS level for SSH protection (out of app scope, but documented in deploy guide)

### 8.7 Impersonation Audit Log

- When Admin enters 'View As Manager' mode, the session is recorded in the `impersonation_log` table (section 4.10)
- The log records: which Admin entered impersonation, which manager was impersonated, session start time, and session end time
- Individual actions taken during an impersonation session are NOT recorded — only session boundaries
- Admin can view the impersonation log from the admin dashboard
- Log entries are retained indefinitely (not subject to the volunteer data purge policy)

---

## 9. Deployment Architecture

### 9.1 Docker Compose Services

| Service | Image | Purpose |
|---------|-------|---------|
| app | Custom Node.js 20 Alpine | Main web application + pg-boss scheduler |
| db | postgres:16-alpine | Primary data store |
| traefik | traefik:v3-alpine | Reverse proxy + automatic TLS via Let's Encrypt |

All services communicate on an isolated Docker bridge network. Only Traefik exposes ports 80 and 443 to the host.

### 9.2 Volumes

- `postgres_data` — persistent PostgreSQL data
- `uploads` — event images and other uploaded assets
- `traefik_data` — Traefik's TLS certificate store (persists across restarts)
- `geoip` — MaxMind GeoLite2 `.mmdb` database file, mounted into the app container

### 9.3 Environment Configuration

A single `.env` file at the project root configures all services:

- `DATABASE_URL` — Postgres connection string
- `SESSION_SECRET` — 64-character random string
- `CSRF_SECRET` — 32-character random string used to sign per-session CSRF tokens
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_NAME`, `SMTP_FROM_EMAIL`
- `APP_URL` — Public base URL (e.g. `https://localshifts.org`)
- `APP_TIMEZONE` — IANA timezone (e.g. `America/New_York`)
- `UPLOAD_MAX_BYTES` — Default 5242880 (5 MB)
- `DEFAULT_PURGE_DAYS` — System-wide default days after last shift to purge signup PII (recommended: 7)
- `GEOIP_DB_PATH` — Absolute path to the MaxMind GeoLite2-City.mmdb file inside the container (e.g. `/geoip/GeoLite2-City.mmdb`)
- `MAXMIND_LICENSE_KEY` — License key from your free MaxMind account, used by the GeoLite2 update helper script

### 9.4 Database Migrations

- Migrations managed with a simple migration runner (e.g. node-pg-migrate or Kysely's built-in migrator)
- Migrations run automatically on app startup before accepting connections
- Each migration is a numbered SQL file in `/migrations`; never modified after creation

### 9.5 Backups

- A companion cron job script (`pg_dump | gzip`) is documented and optionally included as a docker-compose profile
- Recommended: daily dump to a mounted volume or rsync to off-server storage

---

## 10. Data Retention Policy

### 10.1 Philosophy

Local Shifts is scoped to public civic activities only. Even so, volunteer PII (first name, last initial, email address) should be retained only as long as operationally necessary. This policy exists to minimize legal and privacy risk from data subpoenas, breaches, or server compromise.

### 10.2 Purge Behavior

Each event has a `purge_after_days` value. Admin and Event Managers can set or change this at any time — at event creation, during editing, or after publication. If left blank, the system-wide `DEFAULT_PURGE_DAYS` value is used (recommended: 7).

A daily cron job evaluates all events: if `(last_shift_date + purge_after_days) < today` AND the event has not already been purged, the purge executes automatically.

**What gets purged:** all Signup records for that event are hard-deleted — `first_name`, `last_initial`, `email`, `cancel_token_hash`, and all associated `notification_sends` rows are permanently removed.

**What is retained:** Event and Shift records are kept after purge for historical reference and reporting. Only volunteer PII is deleted.

Purge is idempotent: running it on an already-purged event (with no remaining signups) is a no-op.

Admin can manually trigger an immediate purge for any specific event from the admin dashboard.

Once purged, signup data cannot be recovered. This is intentional.

### 10.3 Public Listing Behavior

Events are automatically hidden from the main public listing (`/`) once all of their shifts have passed. This is handled by the same daily cron job (or a combined job).

Past events are accessible at `/events/past` — a public archive page showing event title, organization, date(s), location, and tags only (no volunteer data shown publicly at any time).

This page is DISABLED by default. Admin must explicitly enable it in system settings. When disabled, `/events/past` returns 404 and no 'View Past Events' link appears on the homepage.

### 10.4 Manager Visibility

Event Managers can see the purge window setting for their own events and can change it at any time, before or after publication. Admin can adjust the purge window for any event at any time.

---

## 11. Screen Inventory

| Route | Name | Access |
|-------|------|--------|
| `/` | Public Event Listing (with location detection) | Public |
| `/events/past` | Past Events Archive | Public (toggleable by Admin) |
| `/events/:slug` | Public Event Detail + Signup | Public |
| `/cancel/:token` | Volunteer Cancellation Confirmation | Public (token required) |
| `/my` | My Signups — Email Entry | Public |
| `/my/:token` | My Signups — Active Signups List | Public (magic link token required) |
| `/add-event` | Public Event Request Form | Public |
| `/login` | Login (role-based redirect) | Public |
| `/admin/dashboard` | Admin Dashboard | Admin |
| `/admin/users` | User Management | Admin |
| `/admin/organizations` | Organization Management | Admin |
| `/admin/tags` | Tag Management | Admin |
| `/admin/settings` | System Settings (SMTP, defaults, purge window) | Admin |
| `/admin/impersonation-log` | Impersonation Log | Admin |
| `/admin/view-as/:userId` | View As Manager (impersonation) | Admin |
| `/manager/dashboard` | Event Manager Dashboard | Event Manager + Admin |
| `/manager/events` | My Events List | Event Manager + Admin |
| `/manager/events/new` | Create Event (multi-step) | Event Manager + Admin |
| `/manager/events/:id/edit` | Edit Event | Event Manager + Admin |
| `/manager/events/:id/signups` | Signup Roster | Event Manager + Admin |
| `/manager/events/:id/broadcast` | Broadcast Email Compose | Event Manager + Admin |
| `/manager/templates` | Role Template Management | Event Manager + Admin |
| `/manager/settings` | Manager Profile & Preferences | Event Manager + Admin |

---

## 12. Non-Functional Requirements

- **Performance:** page load under 500ms for all public pages on a 1 vCPU / 1 GB RAM VPS (expected traffic is low, <100 concurrent users)
- **Availability:** no specific SLA required; Docker restart policies handle crashes automatically
- **Browser support:** all modern browsers (Chrome, Firefox, Safari, Edge); no IE11 requirement
- **Mobile:** fully responsive, optimized for volunteer sign-up on mobile phones
- **Accessibility:** semantic HTML, ARIA labels on forms, sufficient color contrast (WCAG AA)
- **Logging:** structured JSON logs (Fastify's built-in Pino logger); log to stdout for Docker log collection
- **Codebase:** well-commented, flat structure, no unnecessary abstraction layers; easy for a single developer to maintain

---

## 13. Out of Scope (V1)

- Recurring events (V2 candidate — one-time events only in V1)
- OAuth / social login for volunteers
- Volunteer hour tracking or history across events
- Waitlist management (V2 candidate)
- SMS reminders
- Payments or liability waivers
- Calendar (.ics) export (V2 candidate)
- Multi-language / i18n
- White-label per-organization subdomain routing
- Mobile native app
- Scheduled (future-dated) broadcast emails (V2 candidate)
- Subdomain-based routing (e.g. `greenville.localshifts.org` → filtered event list) — V2 candidate; V1 uses URL parameters
- Admin global Role Templates shared across all managers (V2 candidate)
- Tag-based email segmentation (broadcast to volunteers with a specific tag)
- Per-volunteer signup history or repeat-volunteer recognition

---

## 14. Resolved Questions

| # | Question | Decision |
|---|----------|----------|
| 1 | Should Role Templates be per-manager only, or should Admin be able to define global templates that all managers can use? | Per-manager only for V1. Admin global templates deferred to V2. |
| 2 | Should recurring events be supported in V1? | No. One-time events only. Recurring event support deferred to V2. |
| 3 | Should the broadcast email feature allow scheduling (send at a future time) or only immediate sends? | Immediate sends only for V1. Scheduled sends deferred to V2. |
| 4 | Should volunteers be able to sign up for multiple shifts within the same event (e.g., set-up AND clean-up)? | Yes, allowed. No restriction on signing up for multiple shifts per event. |
| 5 | Is there a need for a public-facing 'My Signups' page where a volunteer can see all their active signups by entering their email address? | Yes, included in V1. Implemented as a magic-link flow at /my (section 5.8). |
| 6 | Should cancellations reopen the slot immediately and silently, or should the manager have the option to approve the reopening? | Immediate silent reopen. Waitlist/approval flow deferred to V2. |
| 7 | Who can create and manage tags — Admin only, or also Event Managers? | Both Admin and Event Managers can create tags. Admin can edit/delete any tag; managers can only edit/delete their own. System tags cannot be deleted by anyone. |
| 8 | Should any tags be system-reserved and auto-applied by the system? | Yes. 'Understaffed' is a system-reserved tag, automatically applied and removed on every signup and cancellation event. |
| 9 | Should Event Managers be able to override the purge window for their own events? | Yes. Managers and Admin can set or change `purge_after_days` at any time, before or after publication. |
| 10 | Should there be a cap on simultaneously featured events on the homepage? | Cap at 3. If more than 3 events are marked featured, the 3 most recently updated are displayed. |
| 11 | Should Admin 'View As Manager' impersonation sessions be recorded in an audit log? | Yes, session boundaries only (start/end times). Individual actions within a session are not logged. |
| 12 | Should the /events/past public archive page be enabled or disabled by default? | Disabled by default. Admin must explicitly enable it in system settings. |

---

## 15. Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | PurelyMail SMTP: confirm actual sending rate limits (hourly/daily caps) to ensure large reminder batches won't be throttled for high-signup-count events. | Reminder send rate limiting logic; may need batching or send-window spreading. Action: verify before production deployment. |

---

## 16. Glossary

| Term | Definition |
|------|------------|
| Event | A volunteer opportunity with one or more shifts. One-time only in V1. |
| Shift | A specific time slot within an event, with a role, start/end time, and volunteer capacity. |
| Signup | A record of a volunteer committing to a shift. Created without a user account. |
| Organization | A named entity (your org or a partner org) used to group and brand events. |
| Tag | A short label applied to events for categorization and public filtering. Multiple tags can be applied to a single event. |
| EventTag | A junction record linking a Tag to an Event. |
| Featured Event | An event with `is_featured = true`, displayed prominently at the top of the public event listing. Maximum 3 shown at once. |
| Role Template | A saved shift definition that can be reused across multiple events by a specific manager. |
| Reminder Rule | A per-event rule that triggers automated reminder emails at a configurable time before a shift. |
| Cancel Token | A unique, cryptographically secure token embedded in emails; allows a volunteer to cancel without logging in. Only a HMAC-SHA256 hash is stored in the database. |
| Event Manager | A staff or volunteer account that can create and manage events. Created by Admin. |
| Admin | The single system owner account with full access to all system settings, data, and manager capabilities. |
| Purge Window | The number of days after an event's last shift before volunteer PII (signup records) is automatically hard-deleted. Set per-event by any manager or Admin at any time; inherited from system default if not set. |
| Past Event | An event whose last shift date has passed. Hidden from the main public listing but accessible via the Past Events archive (when enabled). |
| System Tag | A tag with `is_system = true`, automatically applied and removed by the application on signup/cancel events. Cannot be deleted by users. Example: 'Understaffed'. |
| Impersonation Log | An audit record of when Admin entered and exited 'View As Manager' mode, stored in the `impersonation_log` table. |
| Event Cancellation | An irreversible manager action that marks an entire event as cancelled, hides it from the public listing, and immediately notifies all active signups via email. |
| Event Request | A submission from the public `/add-event` form. Triggers an email to the Admin with the proposed event details. The Admin handles it manually — no in-app approval queue. |
| Notification Sends | A unified email audit log table recording every outgoing email (confirmation, reminder, cancellation notice, broadcast, etc.) with its delivery status and error details. |
| My Signups | A magic-link-based page (`/my`) where a volunteer can view all their active signups across all events and cancel any of them, without logging in. Triggered by a link in any confirmation or reminder email. The magic link token is valid for one hour from issuance and is not invalidated on page load. |
| Volunteer Email Token | A short-lived token stored in the `volunteer_email_tokens` table, used to authenticate access to the My Signups page. Valid for one hour. Emailed as a clickable link. Not single-use — remains valid for the full hour window. |
| Location Detection | IP-based geolocation on the homepage using the MaxMind GeoLite2 local database. Determines the visitor's approximate city and coordinates to pre-filter nearby events. Requires a free MaxMind account and license key. |
| Proximity Filter | The zip code + radius filter on the event listing page, allowing visitors to view events within a specified distance (5, 10, 20, or 50 miles) from a given location. |
| Haversine Formula | A mathematical formula for calculating the great-circle distance between two lat/lng coordinates. Used in the PostgreSQL query to filter events by proximity. No PostGIS extension required. |
| CSRF Token | A per-session secret injected into all manager/admin HTML forms and verified server-side to prevent cross-site request forgery. Not required on public volunteer-facing forms. |

---

---

## 17. Design & Visual Polish (Tim)

Tim is a volunteer graphic designer / coder who will apply a final visual polish pass to the public-facing and manager-facing pages before launch. He's waiting for the core functionality to be functionally complete before working through the templates.

**Coordination approach:** Once Phases 1–5 of Dave's compliance plan are complete and the app is running end-to-end (events, signups, reminders), Tim gets access to the repo and works through the Nunjucks templates and CSS. Dave and Tim should plan to overlap for at least one working session to walk through the template structure before Tim digs in.

**What Tim will own:**
- Overall typography, spacing, and color system in `layout.njk`
- Organization `primary_color` application across event detail and card components
- Event card design on the public listing (§5.1)
- Event detail page layout including hero image treatment and shift display (§5.3)
- Inline signup form and success state (§5.4)
- Cancellation confirmation and expiry pages (§5.5)
- My Signups list layout and empty/expired states (§5.8)
- Manager dashboard card and alert styling (§6.2)
- Manager event creation form steps and merge tag chip display (§6.3)

**What Tim won't touch:**
- Route logic, data queries, or server-side code
- Email templates (separate design concern, lower priority)
- Admin-only screens (lower priority — internal tool)

**Build guidance for Dave:** Keep CSS in easily overridable utility classes. Avoid tightly coupled inline styles on public-facing templates. Use semantic HTML with clear class names so Tim can restyle without restructuring the markup. A design review checkpoint is planned before production deployment.

Sections in this PRD that include a **Design touchpoint (Tim)** note indicate specific layout decisions Tim will make or refine during his pass.

---

## 18. Changelog: v2.2 → v2.3

The following changes were made during the v2.3 revision based on a structured review of v2.2.

**1. My Signups confirmed as V1 (§5.8, §14 Q5)**
Resolved Question #5 in v2.2 incorrectly marked My Signups as out of scope for V1, but the feature was already fully specified in §5.8 and referenced in the volunteer narrative. The resolved questions table has been corrected to reflect the confirmed V1 decision.

**2. Reverse proxy clarified: Traefik is the reference deployment (§3, §8.6)**
v2.2 listed Traefik in the tech stack and Docker Compose table, but §8.4 referred to "Caddy" — a different tool. The reference to Caddy has been removed. §3 now clarifies that the Docker image is reverse-proxy-agnostic but Traefik v3 is the reference deployment configuration.

**3. Notification deduplication index fixed (§4.9, §7.3)**
v2.2 specified a unique index on `(kind, signup_id)` to prevent duplicate email sends. This would incorrectly block multiple distinct reminder rules from sending to the same signup — e.g., the 24-hour reminder and the 2-hour reminder share the same `signup_id` and `kind = 'reminder'`, so the second would be silently dropped. Fixed by adding a `reminder_rule_id` column to `notification_sends` and specifying a separate unique index on `(signup_id, reminder_rule_id)` for reminder deduplication. The `(kind, signup_id)` index is retained for all other email kinds.

**4. Cancel token field renamed to `cancel_token_hash` (§4.4, §8.2)**
v2.2 named the field `cancel_token` in the Signups table, which implied raw token storage. The security spec (§8.2) correctly stated only a HMAC-SHA256 hash is stored. The field has been renamed `cancel_token_hash` to match the Volunteer Email Tokens table pattern and eliminate ambiguity.

**5. Purge window editable by managers at any time (§4.2, §6.3, §10.2, §10.4)**
v2.2 was internally contradictory: §10.4 said managers could not change the purge window after publication, while §6.3 and Resolved Question #9 said they could. Resolved in favor of full manager flexibility — both managers and Admin can set or change `purge_after_days` at any time, before or after publication.

**6. Recurring events removed from V1 (§4.2, §6.3, §13, §14)**
Recurring event support has been deferred to V2. All references to `event_type`, `recurrence_rule`, and `end_date` have been removed from the Events data model. Step 2 of the event creation form has been simplified to a single date picker. Recurring events are now listed explicitly in §13 (Out of Scope) and noted in the Glossary update to Event definition.

**7. Rate limiting added to `/my` and `/add-event` (§5.7, §5.8, §8.5)**
v2.2 only specified rate limiting on the login endpoint. Both `/my` (My Signups email entry) and `/add-event` (Public Event Request Form) accept unauthenticated input that triggers outbound email sends, making them viable spam and enumeration vectors. Both are now rate-limited at 5 requests per hour per IP. Rate limiting behavior is consolidated in the new §8.5.

**8. CSRF protection added (§8.3, §9.3)**
CSRF protection was absent from v2.2 despite the app using session cookies for manager authentication. §8.3 now specifies per-session CSRF tokens injected as hidden fields in all manager/admin forms, with `X-CSRF-Token` header required on fetch/AJAX requests. Public volunteer-facing forms are explicitly exempted. A `CSRF_SECRET` environment variable has been added to §9.3.

**9. MaxMind license key requirement documented (§3, §9.3)**
v2.2 mentioned a "helper script to re-download" the GeoLite2 database but did not note that a free MaxMind account and license key are required. This is now called out in §3 (tech stack rationale), §5.2 (location detection), and §9.3 (environment configuration via `MAXMIND_LICENSE_KEY`).

**10. Understaffed tag now runs on every signup/cancel event (§6.7)**
v2.2 did not specify when the Understaffed tag check runs. It has been clarified to run immediately on every volunteer signup and every cancellation (including manager-initiated removals), rather than only via cron. This ensures the tag reflects current staffing status in real time.

**11. "Plain text" qualifier removed from notification log body field (§4.9)**
v2.2 described the `body` field in `notification_sends` as "plain text," which conflicted with the fact that email templates support HTML. The qualifier has been dropped — the field stores the full body as sent.

**12. My Signups token is no longer single-use on page load (§4.11, §5.8)**
v2.2 specified that the Volunteer Email Token was invalidated on first page load, which would force volunteers to request a new magic link to cancel a second signup in the same session. The token now remains valid for its full one-hour window from issuance. The `used_at` field has been renamed `first_used_at` and is retained for audit purposes only — it does not invalidate the token. The Glossary entries for My Signups and Volunteer Email Token have been updated accordingly.

**13. Design & Visual Polish section added (§17)**
Tim's pre-launch design role is now documented in the PRD. Design touchpoint callouts added inline at §5.1, §5.3, §5.4, §5.5, §5.8, §6.2, and §6.3, flagging the specific pages and components he will refine. Build guidance for Dave included: keep markup semantic and CSS overridable so Tim's pass doesn't require restructuring templates.

*End of Document — Local Shifts PRD v2.3*
