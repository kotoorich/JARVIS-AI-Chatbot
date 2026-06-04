# JARVIS AI — User Guide & Testing Walkthrough

A complete chat-and-knowledge app you run locally. This document walks you
through what's in the app, how to start it, and how to verify every
feature works by clicking through it yourself.

If something in this guide doesn't match what you see on screen, that's a
bug — note it down and come back.

---

## Part 1 — What's in the app

JARVIS is a full-stack AI chat app with admin tooling for managing
knowledge content. Built over several iterations; current version is
**v0.7.0**.

### The user-facing app
- **Auth** — register, sign in, sign out. Forgot password and email
  verification via emailed links.
- **Chat** — conversational interface with streaming responses. Each
  conversation auto-titles from the first message. You can pin
  important chats, archive old ones, rename, search, share, and delete.
- **Modules** — browseable knowledge categories. Each module has
  categorized question/answer pairs. Clicking a question pre-fills the
  chat composer so the user can ask it.
- **Notifications** — bell icon in the top header. New events (welcome,
  password changed, email changed, ticket reply, role change) show as
  unread; click to mark read or "Mark all read."
- **Support tickets** — users can open a ticket from the Settings sidebar,
  describe the problem, exchange messages with staff, and see status
  updates (open / in progress / resolved / closed).
- **Settings** — profile (full name, username, avatar), account (email
  + password change, email verification status), appearance (dark/light
  theme), activity (recent security events on this account), and data
  (download JSON of all your account data, delete account).

### The admin panel (`/admin`)
- **Dashboard** — eight live stat tiles: users / admins / active 24h /
  conversations / open tickets / etc.
- **Users** — search, filter by role/locked status, drill into any
  user's account, promote/demote, lock/unlock, delete. Self-action
  guards built in (you can't demote yourself).
- **Tickets** — view all support tickets, filter by status/priority,
  reply as staff. The user gets an in-app notification when staff
  replies.
- **Activity** — security audit log: who registered, who logged in or
  failed, who changed what, who locked/unlocked.
- **Modules** — full CRUD over knowledge modules. Each module has
  metadata, optional categories, questions with markdown answers, a
  system prompt for the LLM, and Import/Export buttons.

### The AI layer
- **Offline by default** — works with zero API keys. The bundled rule-
  based engine handles greetings, capability questions, etc.
- **Pluggable** — set `LLM_PROVIDER` in the backend `.env` to `openai`,
  `anthropic`, or `ollama` to route through a real model. If the
  upstream fails, the offline engine takes over automatically.
- **Module-aware** — a user message that matches a canned question
  returns the curated answer instantly (no LLM call). If a user mentions
  a module name and no canned answer matches, that module's system
  prompt gets sent to the LLM.

---

## Part 2 — First-time setup

You need: Python 3.10+ and Node 18+.

### 1. Unzip and prepare the backend
```bash
unzip jarvis-fullstack.zip
cd jarvis-fullstack/backend

python -m venv venv
# Linux/macOS:
source venv/bin/activate
# Windows:
venv\Scripts\activate

pip install -r requirements.txt
cp .env.example .env
```

Open `.env` in a text editor and set these two lines (replace the placeholder password):
```
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=AdminPw123
```

Leave the rest of `.env` alone for now — defaults work.

### 2. Start the backend
```bash
python app.py
```

You should see something like `[seed] created initial admin: admin@example.com` and a Uvicorn listening message on port 8000.

**Keep this terminal open** — it also prints all outgoing emails (verification, password reset) so you can grab the links during testing.

### 3. Prepare and start the frontend
Open a **second terminal** in the project root:
```bash
cd jarvis-fullstack/frontend
npm install
npm run dev
```

When you see `Local: http://localhost:5173/`, open that URL in your browser.

---

## Part 3 — Testing walkthrough

Work through these in order. Each step has a **What to do** and a **What you should see**.

### Test 1 — Register a new (regular) user

1. Open `http://localhost:5173`. You'll see the home/login page.
2. Click **Sign up** (or go to `/register`).
3. Fill in: Full name "Alice", Email `alice@example.com`, Password `AliceSecret1`, confirm.
4. Click **Create account**.

**What you should see:** You're auto-signed-in and redirected to the chat page. Across the top of the app, an **amber banner** says "Confirm your email so we can keep your account secure."

**Also check:** Switch to the backend terminal. You'll see a printed email block addressed to `alice@example.com` containing a `verify-email?token=...` link. Copy that link.

### Test 2 — Verify the email

1. Paste the link from the backend terminal into your browser address bar.
2. You'll land on a page that says "Email verified".
3. Click **Open JARVIS**.

**What you should see:** Back in the app, the amber banner is gone. Open the bell icon (top-right of the header) — there should be both a "Welcome to JARVIS" and an "Email verified" notification.

### Test 3 — Use the chat (offline AI)

1. Type "hello" and press Enter.
2. Try "what can you do".
3. Try a follow-up message.

**What you should see:** Streaming responses (text appearing in chunks). The conversation auto-titles in the sidebar based on your first message. Refresh the page — your messages persist.

### Test 4 — Conversation management

1. Hover over the chat in the sidebar. You'll see actions: pin (📌), rename (✏️), archive (📁), share, delete.
2. Click pin. The chat moves to the top.
3. Start a new chat (the **+** button), send a message, then archive it.
4. Use the search bar above the chat list to find chats by title.

**What you should see:** Pinned conversations stay at the top. Archived ones move to a separate section. Search filters live.

### Test 5 — Profile and Settings

1. Click your avatar (top-right) → Settings.
2. **Profile tab**: upload an avatar image, change your full name, save.
3. **Account tab**: see your verified status. Change password (current: `AliceSecret1`, new: `AliceNew2025`).
4. Try to change your email to `alice2@example.com`. Confirm with the new password.

**What you should see:** Each save shows a success toast. After changing the email, the verification banner returns (the new address is unverified) and a fresh verification email appears in the backend terminal.

### Test 6 — Forgot password

1. Sign out (the chevron next to your name in the sidebar → Sign out).
2. On the login page, click **Forgot password?**.
3. Enter `alice@example.com` (the old email, or new one if you changed it).
4. Click **Send reset link**.

**What you should see:** "Check your inbox" page. In the backend terminal, a password reset email appears with a `reset-password?token=...` link. Open it, choose a new password, sign in with the new one.

**Also test:** Try Forgot password for `nobody@example.com` — you should get the same generic "if it's registered" message (we don't leak account existence).

### Test 7 — Open a support ticket

1. Signed in as Alice, go to Settings → Support tab → **New ticket** (or sidebar → Support).
2. Subject "Cannot do X", priority normal, write the body.
3. Submit.

**What you should see:** Ticket appears with status "Open". You can post replies inside it.

### Test 8 — Sign in as admin

1. Sign out.
2. Sign in with `admin@example.com` / `AdminPw123` (or whatever you set in `.env`).
3. You'll see a new "Admin" link in the sidebar.

### Test 9 — Admin: see Alice in user list

1. Click **Admin** → **Users**.
2. You should see two users (Alice + the admin). Click Alice's row.
3. See her conversation count, ticket count, last login, etc.
4. Try the **Lock account** button, then **Unlock**.

### Test 10 — Admin: reply to Alice's ticket

1. Admin → **Tickets**.
2. Click Alice's open ticket.
3. Post a staff reply.

**What you should see:** Ticket status auto-changes from "Open" to "In progress."

Sign back in as Alice — the bell icon now has an unread badge, and the notification is "Support replied to your ticket." Click it to open the ticket.

### Test 11 — Admin: promote Alice to admin

1. Sign back in as admin.
2. Admin → Users → Alice → **Make admin**.

Sign in as Alice again — she now has an "Admin" link too, plus a "Role updated" notification.

### Test 12 — Admin: create a module

1. Signed in as admin, go to **Admin → Modules**.
2. Click **New module**.
3. Name: "Cooking". Description: "Kitchen wisdom." Create.
4. On the module edit page you can:
   - Edit the name/slug/description/icon
   - Fill in the **System prompt** textarea (e.g. "You are an expert chef. Be concise, use metric units."). Save.
   - Add **Categories** (Add category → "Basics", then "Techniques").
   - Add **Questions**. Click Add question:
     - Prompt: "How long do I boil an egg?"
     - Answer (this supports **markdown**, try it):
       ```
       Depends on what you want:

       - **Soft-boiled**: 6 minutes
       - **Medium**: 8 minutes
       - **Hard-boiled**: 10 minutes

       Start in *cold* water, bring to a boil, then start your timer.
       ```
     - Category: Basics
     - Save question.
   - Add a second question: "How do I sear steak?" / answer with markdown, category Techniques.
   - Add a third question with **no category** (leave as "Uncategorized").

### Test 13 — User view of the module

1. Sign out, sign back in as Alice (now an admin, but she'll see the user view via the sidebar).
2. Click **Modules** in the sidebar. You should see Cooking with a question count.
3. Click Cooking.

**What you should see:**
- Three collapsible sections: Basics, Techniques, "Other questions" (the uncategorized one).
- Each question shows its prompt + a preview of the answer with **bold rendered as bold** and **lists rendered as lists** (not raw `**` and `-` characters).
- Clicking a question pre-fills the chat composer.

### Test 14 — Drag to reorder

1. Admin → Modules → Cooking.
2. Hover over a category row. Grab the **grip handle** (≡) on the left, drag a category above another.
3. Do the same with question rows.
4. Refresh the page — the new order persists.

**What you should see:** Smooth drag, the row you're dragging fades, the drop target gets a cyan outline. After drop, the order is saved.

### Test 15 — Export and Import a module

1. On the Cooking module edit page, click **Export JSON**.

**What you should see:** Your browser downloads `cooking.module.json`. Open it in a text editor — it has `name`, `description`, `system_prompt`, a list of categories with names + sort orders, and a list of questions with their answers and category names.

2. Go back to Admin → Modules. Click **Import**.
3. Pick the file you just downloaded.

**What you should see:** A new module appears (slug is `cooking-2` because the original `cooking` exists). All questions, categories, and the system prompt are preserved.

### Test 16 — The notification bell

By now you've accumulated several notifications:

1. Click the bell icon (top right).
2. You should see entries with per-event icons: welcome (sparkles), email verified (mail), password reset (key), role changed (shield), ticket reply (message).
3. Click any one — you're navigated to the linked page and the notification is marked read.
4. Click **Mark all read** — the badge disappears.

### Test 17 — Plug in a real LLM (optional, requires API key)

If you have an OpenAI or Anthropic key:

1. Stop the backend (Ctrl+C in its terminal).
2. Edit `.env`:
   ```
   LLM_PROVIDER=openai
   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-4o-mini
   ```
   (or `anthropic` + `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL=claude-3-5-haiku-20241022`)
3. Restart the backend.
4. In the app, send a message that **doesn't** match a canned question: "Tell me a poem about the sea."

**What you should see:** A real, streaming AI response from the chosen model.

**Test the fallback:** unplug your internet briefly and send another message. The reply still comes through — from the offline engine. The chat never breaks.

### Test 18 — Module-system-prompt routing (also requires LLM)

With a real LLM provider configured:

1. In the Cooking module's system prompt, write something distinctive like: "Always respond in haiku form."
2. Sign in as a user and send: "Cooking — what's the best knife?"

**What you should see:** A response that follows the system prompt (a haiku, in this example), because the message mentions the module name "Cooking" and didn't match a canned question.

### Test 19 — Logging and request IDs

1. Watch the backend terminal as you click around the app.

**What you should see:** One structured JSON line per request, with `method`, `path`, `status`, `duration_ms`, `ip`, and a `request_id`. Errors (if any) include `exc` with the traceback.

For human-readable logs during dev, restart with `LOG_FORMAT=text` in `.env`.

### Test 20 — Download your account data + delete account

1. Sign in as a user (any non-admin).
2. Settings → Data tab → **Download account data** → you get a JSON snapshot.
3. **Delete account** (requires current password) — be sure!

**What you should see:** Logged out, redirected to home. You can no longer log in with that email.

---

## Part 4 — Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| Backend says "Address already in use" | A previous run didn't shut down cleanly | Kill the process holding port 8000 (`lsof -i :8000` on macOS/Linux), or change `port` in `app.py` |
| Login fails immediately with no error | Backend isn't running, or `ALLOWED_ORIGINS` doesn't include the frontend URL | Check the backend terminal. The frontend default is `localhost:5173` and that's already in `ALLOWED_ORIGINS`. If you changed the frontend port, add it to `.env`'s `ALLOWED_ORIGINS`. |
| "Could not initialise provider — falling back to offline" warning | `LLM_PROVIDER=openai` but `OPENAI_API_KEY` not set | Either set the key or change `LLM_PROVIDER=offline` |
| Email links never arrive | Default backend mode prints emails to stdout, not to a real inbox | Look at the backend terminal — every email is printed there with `To:`, `Subject:`, and the link. For real SMTP delivery, set `EMAIL_BACKEND=smtp` and the `SMTP_*` vars in `.env`. |
| Migration warnings on startup | First run with an older database file | This is normal — the app auto-migrates. Look for `[migrate] added …` lines. |
| Frontend can't reach backend | `VITE_API_URL` set wrong | The default uses `http://localhost:8000` — don't override `VITE_API_URL` unless you actually moved the backend. |

---

## Part 5 — What you DON'T need to do for testing

- You don't need an OpenAI / Anthropic key — the app works offline by default.
- You don't need to configure SMTP — emails print to the backend terminal.
- You don't need Postgres — the app uses SQLite by default (the `jarvis.db` file in `backend/`).
- You don't need Docker, a domain name, or HTTPS to run locally.

---

## Part 6 — When you're done

Stop the frontend (Ctrl+C in its terminal), then the backend (Ctrl+C in its terminal). To start again later, just `python app.py` in one terminal and `npm run dev` in the other. Your data (users, chats, modules, notifications) persists in `backend/jarvis.db`.

To start fresh, delete `backend/jarvis.db` and restart the backend — the admin will be re-seeded automatically.

---

If you find anything that doesn't work as described above, write down the exact step number, what you saw, and what the backend terminal showed. That's the report you bring back.
