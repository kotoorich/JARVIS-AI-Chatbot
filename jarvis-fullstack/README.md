# JARVIS AI — Full-Stack Assistant

A futuristic AI chat assistant. **FastAPI + SQLite** backend with JWT auth and
WebSocket streaming; **React + Vite + Tailwind v4 + shadcn/ui** frontend.
The AI runs fully offline (no API keys required).

```
jarvis-fullstack/
├── backend/      FastAPI app, SQLite DB, requirements
└── frontend/     React + Vite app
```

## Prerequisites
- Python 3.10+
- Node.js 18+ and npm

## 1. Backend

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt

# Optional config — defaults work without it:
# copy .env.example to .env and edit SECRET_KEY etc.

python app.py
```

Backend runs at **http://localhost:8000** (interactive API docs at `/docs`).

## 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at **http://localhost:5173**.

## Using the app
1. Open http://localhost:5173
2. Click **Sign up**, create an account (password ≥ 8 chars, letter + number)
3. Start chatting — responses stream in live
4. Use the **avatar in the top-right** or the **gear icon** to open Settings

## Features (Phase 1)

### Authentication & security
- JWT-based auth with bcrypt password hashing
- Password strength validation (length, letter, digit)
- Account lockout after 5 failed attempts (15-minute cooldown)
- Per-IP and per-email rate limiting on login/register
- Security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
- `last_login_at` tracking
- Logout clears history so the browser **Back** button can't bypass auth

### Profile & account management
- Edit full name and unique username (Settings → Profile)
- Upload, replace, and remove avatar (JPEG/PNG/WEBP/GIF, ≤ 2 MB)
- Change email (requires current password)
- Change password (requires current password)
- Download account data as JSON (Settings → Data)
- Permanently delete account (requires password + typed confirmation)
- Avatar appears in the sidebar **and** the top-right corner

### Chat management
- **Smart auto-titles**: AI-friendly titles like "Capital of Ghana" or "What is 12 × 8?"
  derived from the first message (no more dumb 30-char truncation)
- Rename, pin, archive, and delete any chat from a dropdown menu
- Pinned chats stick to the top with a pin icon
- **Active / Archived** tab toggle
- **Server-side search** by title *or* message body, debounced 250 ms
- Recent and pinned sections in the sidebar

### Themed authentication pages
- Animated arc-reactor logo (`JarvisLogo`) across all auth pages
- Gradient background with drifting cyan orbs and a faint circuit grid
- Glassmorphic card, smooth entry animation, password-strength indicator
- Mobile-responsive (full-width card on phones, max-w-md on desktop)
- All four pages: Login, Register, Forgot Password, Reset Password

### Admin & support (Phase 2A)
- **Roles**: every user has a `role` of `user` or `admin`. Non-admins are
  bounced from `/admin` to `/chat`, and admin API endpoints return 403.
- **Admin dashboard** at `/admin` with live counters (users, admins, locked
  accounts, failed sign-ins, conversations, tickets) and a recent-activity
  feed that auto-refreshes.
- **User management** at `/admin/users` — search by email/username/full name,
  filter by role, drill in to a user detail page where admins can:
  - Promote / demote (you can't demote yourself)
  - Lock / unlock (you can't lock yourself)
  - Delete (cascades the user's chats and tickets; you can't self-delete here)
- **Activity log** — every login (success, failure, lockout), password change,
  email change, profile update, and admin action is recorded with IP and
  user-agent. Surfaced two ways:
  - Per-user: **Settings → Activity** tab shows the signed-in user's own events
  - System-wide: `/admin/activity` shows everyone, filterable by event type
- **Support tickets**:
  - Users open tickets from `/support` (subject, body, priority).
  - Tickets have statuses **open → in_progress → resolved → closed**.
  - When staff (admin) replies to an open ticket, status auto-flips to
    *in_progress*. A user reply on a *resolved* ticket re-opens it. A *closed*
    ticket hides the reply box.
  - Admins manage all tickets at `/admin/tickets` (filterable by status) and
    change status / priority from the ticket detail page.

#### Seeding the first admin
There's no UI to bootstrap the first admin — set env vars in
`backend/.env` on first run:

```dotenv
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=ChangeMe123!
```

- If the account doesn't exist, it's **created** with that password.
- If it already exists, it's **promoted** to admin (idempotent on each start).
- Existing admins are never demoted.
- Use a real-looking domain (`.test`, `.local`, etc. are rejected).

After the first start you can remove `INITIAL_ADMIN_PASSWORD`; leaving
`INITIAL_ADMIN_EMAIL` keeps re-promoting that account harmlessly. To make
more admins later, sign in as the first one and promote them from
`/admin/users`.

### Knowledge modules (Phase 2B)
- **Modules** are topic areas (e.g. "Productivity Tips", "First Aid Basics")
  that contain canned **questions** — a *prompt* the user might ask and an
  *answer* JARVIS will reply with.
- **Admin manages modules** at `/admin/modules`:
  - Create a module (name, description, optional Lucide icon name)
  - Edit metadata, including the URL slug, in the module detail page
  - Add, edit, delete, and show/hide questions inline
  - Toggle a whole module active/inactive (deactivating hides it from users)
  - Delete cascades all questions
- **Users browse modules** at `/modules`:
  - Grid of active modules with description and question count
  - Click into a module to see its questions and canned answers
  - Click a question → lands on `/chat` with the prompt pre-filled in the
    composer, ready to send
- **AI integration**: when the user sends a message, the backend first
  checks active questions across all active modules for a match before
  falling back to the offline engine. The matcher uses:
  1. Exact (case-insensitive) match → immediate win
  2. Substring containment (either direction) → +0.5 boost
  3. Jaccard similarity of content tokens (stop-words filtered)

  A combined score ≥ 0.5 wins. No match → the existing offline engine
  answers as before.

### Categories & drag-to-reorder (Phase 2C)
- **Categories** are an optional grouping layer between a module and its
  questions. A module can have zero categories (questions render flat) or
  many (questions render under collapsible category headers).
  - Admins add categories on the module edit page; each gets a slug
    auto-generated from its name, with `-2`, `-3`, … suffixes if a name
    collides inside the same module.
  - Questions can either belong to a category or be **uncategorized**. The
    user view shows uncategorized questions under an "Other questions"
    section if there's also at least one categorized question; otherwise
    they render as a flat list with no header.
- **Drag rows to reorder** modules, categories within a module, and
  questions within a module. Grab the **grip handle** at the left of any
  row and drop on the row you want to sit before/after. The UI updates
  optimistically and rolls back if the save fails.
  - Modules: drag on `/admin/modules`.
  - Categories & questions: drag on the module edit page.
  - Questions are ordered across the whole module (the server stores one
    `sort_order` per row); the category headers in the UI just group them
    visually.
  - Drag-to-reorder is desktop/mouse only — mobile users can still edit
    rows but can't yet drag.
- **Deleting a category** does **not** delete its questions — they become
  uncategorized and appear in "Other questions" on the user view.
- **Migration**: an existing v0.4 database (modules + questions but no
  category column) auto-migrates on first startup. The new
  `category_id` column is added to `module_questions`, all existing rows
  keep their data with a null category, and the migration is idempotent
  on subsequent restarts. No manual SQL needed.

### Email verification, password recovery & notifications (Phase 3)
- **Email verification**: new accounts get an `email_verified` flag and
  a verification email on registration. A dismissible amber banner shows
  across the top of the app while a user is unverified, with a "Resend
  link" button. Visiting `/verify-email?token=...` flips the flag and
  clears the banner immediately. Unverified users can still log in and
  use the app — the flag is informational for now.
  - Verification tokens expire in `VERIFY_TOKEN_TTL_HOURS` (default 48).
  - Changing your email re-arms the flag and triggers a fresh verification
    mail to the new address.
- **Password recovery**: the `/forgot-password` and `/reset-password`
  pages are now wired to real endpoints.
  - `POST /api/auth/forgot-password` returns the **same generic message
    whether or not the email exists** — we don't leak account existence.
    Per-IP rate limited.
  - Reset tokens are SHA-256-hashed at rest, single-use, expire in
    `RESET_TOKEN_TTL_MINUTES` (default 30), and successfully resetting
    also unlocks the account if it was locked from failed logins.
  - Re-using the same new password as the current one is rejected.
- **In-app notifications**: a bell icon in the top header with an unread
  badge, dropdown, and per-event icons. Click to mark one as read; "Mark
  all read" clears the lot. Auto-refreshes every 60s and on window focus.
  - Events surfaced as notifications: welcome on register, password
    changed (whether via Settings or the reset flow), email changed,
    email verified, role changed by an admin, and reply received on a
    support ticket.
  - The bell endpoint is rate-friendly: one query returns up to 20 items
    plus the global unread count.
- **Email backend**: pluggable via the `EMAIL_BACKEND` env var.
  - `console` (default) prints the full email to stdout — great for dev,
    demos, and tests. You can copy the link straight out of the terminal.
  - `smtp` uses stdlib `smtplib`. Configure `SMTP_HOST`, `SMTP_PORT`,
    `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_USE_TLS`, and `EMAIL_FROM`.
  - Email sending is best-effort: a flaky mail server will never block
    sign-up or a password reset (the token is still created, the user can
    request another email).
- **Migration**: an existing v0.5 database auto-migrates on first v0.6
  startup. `users.email_verified` is added (defaulting to `false` for
  existing users — they see the banner and can verify on their next
  visit). Migration is idempotent on subsequent restarts.

### LLM providers, import/export & structured logging (Phase 4)
- **Pluggable LLM provider**: the AI layer is no longer offline-only.
  Select via the `LLM_PROVIDER` env var:
  - `offline` (default) — the local rule-based engine. **The app works
    with zero external dependencies.**
  - `openai` — OpenAI Chat Completions API (`OPENAI_API_KEY`,
    `OPENAI_MODEL`, `OPENAI_BASE_URL` for OpenAI-compatible hosts).
  - `anthropic` — Anthropic Messages API (`ANTHROPIC_API_KEY`,
    `ANTHROPIC_MODEL`).
  - `ollama` — local Ollama server (`OLLAMA_MODEL`, `OLLAMA_BASE_URL`).
  - Missing API keys or upstream errors **fall back to the offline
    engine automatically** — JARVIS never goes dark because an LLM is
    having a bad day. Failures are logged as structured warnings.
  - The WebSocket chat does **real token-by-token streaming** when the
    provider supports it; the chunked typing animation is preserved for
    the offline path.
- **Per-module system prompts**: each `Module` now has an optional
  `system_prompt` column. When a user's message mentions the module's
  name (case-insensitive) and no canned question matches, that module's
  prompt is prepended to the LLM call. Canned-question matches still
  short-circuit the LLM — they're free and instant.
- **Module import / export (JSON)**: admins can download a module as
  a portable JSON file (module metadata, system prompt, categories, and
  questions with category references by name) from the module edit page,
  and re-import via the **Import** button on `/admin/modules`. Import
  never overwrites — it always creates a new module, suffixing the slug
  if there's a collision. Questions referencing a category name that
  isn't in the import payload land uncategorized instead of failing the
  whole import. Format is versioned (`format_version: 1`).
- **Markdown in answers**: user-facing question previews now render
  markdown — bold, lists, code blocks, links. Same renderer the chat
  uses, so write answers exactly as you'd write a message.
- **Postgres compatibility**: set
  `DATABASE_URL=postgresql+psycopg2://USER:PASS@HOST:5432/jarvis` and
  install `psycopg2-binary`. The engine config switches to a pooled
  connection (`DB_POOL_SIZE`, `DB_MAX_OVERFLOW`) and all migrations use
  dialect-aware SQL (`ADD COLUMN IF NOT EXISTS` on Postgres). Note: the
  shipped test suite is SQLite-only.
- **Structured logging**: every request gets a unique `X-Request-ID`
  header (echoed back; clients can supply their own). One structured
  JSON log line is emitted per HTTP request with `method`, `path`,
  `status`, `duration_ms`, `ip`, and `request_id`. Set
  `LOG_FORMAT=text` for human-readable output during local dev, or
  `LOG_LEVEL=DEBUG` for verbose tracing.
- **Migration**: an existing v0.6 database auto-migrates on first v0.7
  startup. `modules.system_prompt` is added; existing modules keep
  working unchanged (with no system prompt). Idempotent.

## Notes
- A starter `jarvis.db` is included; it is created automatically if missing.
- For production, set a strong `SECRET_KEY` in `backend/.env`.
- To plug in a real LLM later, replace `get_ai_response()` in `backend/app.py`.

## Build for production
```bash
cd frontend && npm run build   # outputs to frontend/dist
```
