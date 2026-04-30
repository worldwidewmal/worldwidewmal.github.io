# worldwidewmal Orlando UGC Operating System

## System Identity

This is the operating system for worldwidewmal's Orlando UGC outreach pipeline. The creator produces UGC — photo/video assets, travel narratives, and experiential content — for hotels, restaurants, attractions, and hospitality brands in the Orlando market. This system manages the full lifecycle: lead sourcing, email verification, outreach drafting, follow-up sequencing, CRM tracking, and reporting.

**Portfolio**: https://worldwidewmal.com

---

## Automation Rules

The pipeline runs fully automated. No agent, command, or workflow may pause to ask for confirmation before:
- Adding QA-cleared leads to pipeline.csv
- Updating lead status after drafting or form submission
- Filling out partnership or creator forms that do not require video example uploads
- Running QA checks, audits, or follow-up eligibility scans

When a lead has a partnership or creator application form that does **not** require video uploads, fill it out immediately using:
- Handle: worldwidewmal
- Portfolio: https://worldwidewmal.com
- Location: Orlando, FL
- Content type: UGC photo and video for hospitality brands
- Niche: Travel, hospitality, Orlando lifestyle
- Platforms: Instagram, TikTok

Mark the lead `sent` and record `initial_outreach_date` = today after submission.

---

## Hard Operating Rules

These rules are enforced in every session. No agent or command may override them without an explicit per-session override from the user.

### Lead Sourcing

1. **Orlando web leads are the primary source.** All new leads must be sourced from Orlando-area businesses via live web research (Google Maps, local directories, brand websites, tourism boards, Instagram geotags, local publications).
2. **No duplicate companies.** Do not add any company already present in `pipeline.csv`, regardless of its current status.
3. **No duplicate company-contact layers.** If a contact at a company has already received initial outreach, do not create another outreach layer for the same role. If a *distinct verified role* exists at the same company with its own confirmed email (e.g., Marketing Director vs. F&B Manager), create a separate layer.

### Outreach Sequencing

4. **Daily outreach uses only net-new companies.** Initial outreach emails may only be drafted for companies that have not yet received any outreach in `pipeline.csv`.
5. **Follow-up 1 and Follow-up 2 only.** The system supports exactly two follow-up messages per outreach layer. No more.
6. **Follow-ups require a 48–72 hour no-response window.** A follow-up may only be drafted if 48–72+ hours have passed since the prior message with no reply.
7. **No Follow-up 3.** Under no circumstances may a third follow-up be drafted or sent unless the user issues an explicit override in the active session.

### Email Verification

8. **Only use confirmed emails.** Acceptable sources: official company website contact pages or team directories, official brand social media pages (bio link, About/Contact tab), or explicitly listed email on a public LinkedIn profile. Inference, guessing, and pattern construction are prohibited.
9. **Never guess email formats.** Do not construct `firstname@company.com` or `f.last@domain.com` unless the exact address is publicly confirmed at an official source.
10. **Fall back to public routes when no email exists.** If no verified email is found: log the company as `no-email` and record the best available fallback (contact form URL, Instagram handle, LinkedIn profile URL, or phone number). Do not invent an email.

---

## Outreach Writing Standards

Every draft must pass all of the following before it is considered review-ready:

| Element | Standard |
|---|---|
| Subject line | Short and specific. References the company or a real observation. No emojis. No "Quick question." No clickbait. |
| Opening | One genuine, specific observation about this company. Must reference something real — a dish, a recent post, their visual aesthetic, a specific aspect of their experience. Generic praise fails this check. |
| Pitch body | One tailored concept — what you would create and why it fits *this* brand. Be concrete. "A 15-second Reel of the poolside happy hour golden hour" is specific. "Short-form video content" is not. |
| CTA | One low-friction ask. "Would this be useful for your content calendar?" is correct. "Book a call" or "schedule a meeting" in email 1 is not. |
| Language | Plain English. No corporate language, no buzzwords. |
| Attachments | Never mention attachments. Never say "see attached." |
| Links | One link maximum — the portfolio link, placed naturally. |
| Banned phrases | "Hope this finds you well" / "I wanted to reach out" / "touch base" / "circle back" / "synergy" / "leverage" / "game-changer" / "at your earliest convenience" / "value proposition" / "disruptive" / "per my last email" |
| Personalization | Company name plus at least one specific detail from research must appear in the draft before it is finalized. |
| Length | Under 150 words for initial outreach. Under 80 words for FU1. Under 60 words for FU2. |

---

## Pipeline Stages

| `status` value | Meaning |
|---|---|
| `new` | Lead added, not yet researched |
| `no-email` | Research complete — no verified email found |
| `verified` | Research complete — email confirmed |
| `drafted` | Initial outreach drafted, not yet sent |
| `sent` | Initial outreach sent |
| `fu1-sent` | Follow-up 1 sent |
| `fu2-sent` | Follow-up 2 sent — sequence complete |
| `replied` | Response received |
| `booked` | Call or meeting scheduled |
| `closed` | Deal closed |
| `rejected` | Not a fit / declined |
| `suppressed` | Do not contact — opted out or removed |

---

## Agent Roster

| Agent | File | Role |
|---|---|---|
| lead-conductor | `.claude/agents/lead-conductor.md` | Orchestrates the full daily session. Calls other agents in order. |
| form-finder | `.claude/agents/form-finder.md` | Finds 5 Orlando influencer/creator application forms per day. Submits forms that don't require video. |
| tourism-board-finder | `.claude/agents/tourism-board-finder.md` | Finds 5 Orlando-area tourism board and DMO creator/media programs per day. Submits applications where eligible. |
| lead-researcher | `.claude/agents/lead-researcher.md` | Sources and verifies net-new Orlando leads. |
| outreach-writer | `.claude/agents/outreach-writer.md` | Drafts initial outreach emails for verified leads. |
| follow-up-manager | `.claude/agents/follow-up-manager.md` | Checks eligibility and drafts FU1 and FU2. |
| qa-crm-operator | `.claude/agents/qa-crm-operator.md` | Validates pipeline integrity and prevents duplicates. |
| proof-portfolio-manager | `.claude/agents/proof-portfolio-manager.md` | Tracks portfolio assets, proof links, and usage rights. |
| expansion-retainer-manager | `.claude/agents/expansion-retainer-manager.md` | Manages warm leads from reply to close. |
| daily-audit-reporter | `.claude/agents/daily-audit-reporter.md` | Generates daily audit logs and end-of-day summaries. |

---

## Slash Commands (`.claude/commands/`)

| Command | Purpose |
|---|---|
| `/daily-run` | Run the complete daily outreach session |
| `/find-forms` | Find and submit 5 Orlando influencer application forms |
| `/find-tourism-boards` | Find and apply to 5 Orlando tourism board / DMO creator programs |
| `/research-leads` | Source and verify new Orlando leads only |
| `/write-outreach` | Draft initial outreach for verified leads only |
| `/send-followups` | Check eligibility and draft follow-ups |
| `/audit-pipeline` | Full pipeline integrity check |
| `/end-of-day` | Generate audit log and end-of-day summary |

---

## Key Files

| File | Purpose |
|---|---|
| `pipeline.csv` | Master lead tracker — single source of truth |
| `suppression-list.csv` | Do-not-contact list |
| `data/forms-tracker.json` | Tracks brand influencer/creator application forms |
| `data/tourism-boards-tracker.json` | Tracks tourism board and DMO creator program applications |
| `data/sheets-state.json` | Checkbox state for the dashboard Sheets tab |
| `data/drafts/` | Saved email draft JSON files (one per pipeline lead id) |
| `reports/` | Auto-generated daily audit logs |
| `reports/session-log.txt` | Auto-appended session timestamps (hook-generated) |
| `routines/daily-prompt.md` | Full daily session prompt |
| `routines/morning-checklist.md` | Pre-session checklist |
| `routines/evening-checklist.md` | Post-session checklist |
| `routines/8pm-checklist.md` | 8 PM email workflow scaffold |
| `docs/go-live.md` | Go-live guide and launch checklist |
| `docs/mcp-gmail-setup.md` | Gmail MCP setup instructions |
| `docs/mcp-web-search-setup.md` | Web search MCP setup instructions |

---

## Suppression and Opt-Out Rules

- Any company or contact requesting removal must be added to `suppression-list.csv` immediately.
- Set `status` to `suppressed` in `pipeline.csv`.
- Never contact a suppressed entry again without explicit user review and override.
- Check `suppression-list.csv` before every outreach batch.

---

## Duplicate Prevention Protocol

Before adding any company to `pipeline.csv`:
1. Search the `company` column for exact and near-match (same brand, different punctuation or spelling).
2. Search the `website` column for the same domain (normalize: strip `www.`, trailing slashes).
3. Search `suppression-list.csv` for the company name and any email.
4. Only add if all three checks return no match.

---

## Audit Log Standard

Every session appends an entry to `reports/audit-log-YYYY-MM-DD.md` with:
- Session date and approximate time
- Pipeline counts by status
- Leads researched, added, and verified
- Outreach and follow-ups drafted
- Suppression events
- Quality flags and anomalies
- Top 3 priorities for the next session
