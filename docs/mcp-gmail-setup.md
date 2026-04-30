# Gmail MCP Setup

Connect worldwidewmal@gmail.com to Claude Code so that every drafted outreach email is saved directly into Gmail Drafts — and so the system can check Gmail Sent before drafting to prevent re-contacting anyone already emailed.

---

## What This Enables

- **Save to Drafts**: Every approved outreach draft is pushed to your Gmail Drafts folder automatically. You review and send from Gmail — nothing sends without your action.
- **Sent folder dedup**: Before each drafting session, the system checks Gmail Sent to skip any company that has already received an email from your account, even if pipeline.csv is not up to date.
- **No auto-send**: The system never sends email on its own. All sends are manual from your Gmail inbox.

---

## Prerequisites

- Google account: worldwidewmal@gmail.com
- Claude Code installed and this project open
- Node.js v18 or later
- A Google Cloud project (free tier is fine)

---

## Step 1 — Enable the Gmail API

1. Go to https://console.cloud.google.com/
2. Create a new project or select an existing one
3. Go to **APIs & Services → Library**
4. Search "Gmail API" → click **Enable**
5. Go to **APIs & Services → OAuth consent screen**
   - Choose **External** user type
   - Fill in app name (e.g., "worldwidewmal Claude Code") and your email
   - Add scope: `https://www.googleapis.com/auth/gmail.modify` (read + draft + send)
   - Add yourself as a test user
6. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Desktop app**
   - Name: "Claude Code UGC OS"
   - Click **Create** and download `credentials.json`
   - Store it at: `~/.config/ugc-gmail/credentials.json` (never inside this repo)

---

## Step 2 — Install the Gmail MCP Server

```bash
npm install -g @gongrzhe/server-gmail-autoauth-mcp
```

This is the actively maintained Gmail MCP with auto-authentication support. It handles the OAuth token flow automatically on first use.

---

## Step 3 — Add to Claude Code MCP Settings

The project `.claude/settings.json` already includes this config. If you need to add it to your global `~/.claude/settings.json` instead, use:

```json
{
  "mcpServers": {
    "gmail": {
      "command": "npx",
      "args": ["-y", "@gongrzhe/server-gmail-autoauth-mcp"],
      "env": {
        "GMAIL_OAUTH_PATH": "~/.config/ugc-gmail/credentials.json"
      }
    }
  }
}
```

Store your `credentials.json` (downloaded from Google Cloud Console) at `~/.config/ugc-gmail/credentials.json`.

---

## Step 4 — Authorize on First Use

Start Claude Code in this project, then type:

```
Use the Gmail MCP to check my Gmail Drafts folder and list the 3 most recent drafts.
```

A browser window will open for Google OAuth. Sign in as worldwidewmal@gmail.com and grant the requested permissions. A `token.json` file is saved at the path you configured — keep it secure.

---

## Step 5 — Test Save-to-Drafts

Test that the Drafts workflow works:

```
Use Gmail MCP to create a draft email:
- To: worldwidewmal@gmail.com
- Subject: Claude Code Draft Test
- Body: This is a test draft from the UGC OS system.
```

Open Gmail and verify the draft appears in your Drafts folder.

---

## Step 6 — Test Sent-Folder Check

Test the dedup check:

```
Use Gmail MCP to search my Gmail Sent folder for emails sent to any @celeste-hotel.com address.
```

This is the query the system runs before drafting — if a matching sent email is found, that company is skipped.

---

## How the Draft Workflow Operates

### When the outreach-writer agent drafts an email:

1. Agent drafts the email and outputs it for review
2. Agent saves draft JSON to `data/drafts/<id>.json`
3. Agent calls Gmail MCP to create a Gmail Draft with the same content
4. Agent updates `pipeline.csv` status to `drafted`

### Before any drafting session:

1. System queries Gmail Sent: `from:worldwidewmal@gmail.com`
2. Extracts all recipient domains from sent emails
3. Compares against companies in the current outreach batch
4. Any company whose domain matches a sent email is flagged — skip or confirm before drafting

### When you are ready to send from Gmail:

1. Open Gmail → Drafts
2. Review each draft
3. Click Send from Gmail directly
4. After sending, update pipeline.csv status to `sent` and record `initial_outreach_date`
   - You can do this in Claude Code: "Mark [Company] as sent in pipeline.csv with today's date"

---

## Security Rules

- Never commit `credentials.json` or `token.json` to this repo
- Both files are in `.gitignore` — verify before any push
- If you revoke access in Google, delete `token.json` and re-authorize
- The OAuth token only grants access to your Gmail — no other Google services

---

## Troubleshooting

| Issue | Fix |
|---|---|
| "MCP server not found" | Verify the package is installed globally: `npm list -g \| grep gmail` |
| "Invalid credentials" | Re-download `credentials.json` from Google Cloud Console |
| "Token expired" | Delete `token.json` and re-authorize in Claude Code |
| "Quota exceeded" | Gmail API free tier allows 1B quota units/day — drafts use very few; check Google Cloud Console quotas |
| "Access blocked: app not verified" | Add yourself as a test user in OAuth consent screen during development |
| "Scope insufficient" | Re-authorize after adding `gmail.modify` scope in consent screen |

---

## MCP Not Yet Available?

If you cannot get the Gmail MCP working yet, the fallback workflow is:
1. Drafts are saved to `data/drafts/<id>.json`
2. Open the draft file and copy the content manually into Gmail
3. Save as a Gmail Draft from there
4. Mark the lead as `drafted` in pipeline.csv via Claude Code

The system supports both workflows — Gmail MCP saves the manual step.
