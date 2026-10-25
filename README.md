# pomonote v2

Focus timer + tasks + notes in one keyboard-first, local-first app. No account, no database, no dependencies.

    npm start      # http://localhost:3000  (Node 18+)

Data lives in your browser (localStorage). Use **Export/Import** in the command palette (Ctrl/Cmd+K) to back up or move it.

- **Quick-add tasks:** `Review draft tomorrow #work !1 ~3` (list, priority 1-3, estimated sessions, today/tomorrow/mon..sun)
- **Keys:** Ctrl/Cmd+K palette · Space start/pause · 1-4 switch views · Ctrl/Cmd+E note preview
- **Notes:** nested, pinned, full-text search, safe Markdown preview (`- [ ]` checklists, code fences)
- **Sub-notes:** collapsible dropdown in the sidebar and listed inside the parent note. Max 10 per note; a sub-note cannot have its own sub-notes.
- **Install (no login, data stays on the device):** serve `public/` over HTTPS (localhost also works), then use the Install button, the browser menu, or "Add to Home Screen" on iOS. Works offline after the first load.

Not in v2 (were in v1): Google sign-in, cross-device sync, share-by-link. They need a server data model; see the review notes.
