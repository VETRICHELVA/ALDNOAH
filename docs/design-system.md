# Design System

The product is a decision workspace for finance reviewers. Design priorities: clarity → speed →
trust → explainability → action. No decoration that does not carry information.

## Type

| Role | Font | Size / weight |
|---|---|---|
| Page title | IBM Plex Sans | 24 / 600 |
| Section | IBM Plex Sans | 18 / 600 |
| Body | IBM Plex Sans | 14 / 400 |
| Table, secondary | IBM Plex Sans | 13 / 400 |
| Labels (uppercase section labels) | IBM Plex Sans | 11 / 600, letter-spacing .06em |
| Risk score | IBM Plex Sans | 28 / 600, tabular |
| IDs, receipt IDs, tally | IBM Plex Mono | 13 / 400 |

Why Plex: engineered for dense technical/financial reading, true tabular figures
(`font-variant-numeric: tabular-nums` on all amounts), and not the default AI-template face.

## Colour tokens

| Token | Value | Use |
|---|---|---|
| `--bg` | #F7F8FA | page background |
| `--surface` | #FFFFFF | tables, panels (data surfaces only) |
| `--border` | #E5E7EB | 1px hairlines |
| `--text` | #111827 | primary text |
| `--muted` | #6B7280 | secondary text (≥ 4.5:1 on both backgrounds) |
| `--primary` | #2563EB | actions, links, focus ring |
| `--success` | #15803D | approved, legitimate, within policy |
| `--warning` | #B45309 | medium severity, evidence requested |
| `--danger` | #B91C1C | high severity, rejected, policy violation |
| `--info` | #0369A1 | informational notes, low severity |

Status colour is always paired with a shape or word. No gradients. Shadow only on modals/menus.

## Spacing & shape

8-pt system: 4 / 8 / 12 / 16 / 24 / 32 / 48. Radius: inputs 6, panels 8, modals 10.
Table row height 36 (compact); cell padding 8×12.

## Motifs

**Tally** — the risk score as an itemised list (mono, right-aligned points, rule line, total).
Used on Investigation, Expense Detail, queue row hover preview.

**Amount ruler** — one horizontal axis (0 → max(current, limit)·1.1) with ticks for employee
median, category median, policy limit (dashed) and the current amount (solid marker + label).
Labels are text, not legend colours.

**Severity marks** — ◆ High · ▲ Medium · ● Low, always followed by the word and score:
`◆ High · 91`.

## Components

Button (primary / secondary / danger / quiet), Input, Select, DateRange (native `<input type=date>`),
Table (sortable headers with `aria-sort`, sticky header, checkbox column, column menu,
pagination), FilterBar (URL-backed), Tabs (with counts), RiskMark, Tally, AmountRuler,
EvidenceSection, AuditList, Metric (label, value, delta vs previous period), Toast
(`role=status`), Skeleton, EmptyState, ErrorState (what happened / why / what to do).

No icon library. Text labels; the few glyphs used are typographic (◆ ▲ ● ← › ✓ ✕).

## Layout

- Desktop ≥ 1200: 216px sidebar (text nav), top bar (title, date range, user), content max 1440.
- Tablet 768–1199: sidebar collapses behind a "Menu" button; tables keep columns, scroll
  horizontally inside their container.
- Mobile < 768: Overview shows alerts list; Investigation stacks verdict → why → evidence, with a
  sticky bottom decision bar. Tables become two-line rows (not cards).

## Accessibility

WCAG AA contrast; visible 2px `--primary` focus ring; semantic landmarks (`nav`, `main`);
`<table>` with `<th scope>` and captions; form errors linked via `aria-describedby`;
keyboard shortcuts on Investigation (J/K next/prev, A approve, R reject, L legitimate,
E request evidence) with a visible shortcut hint and no conflict with text inputs.

## Copy

Use "Potential issue", "Unusual transaction", "Requires review", "Policy violation",
"High-risk finding". Never "fraud". Dates `07 Oct 2026`. Money `₹18,500` (Indian grouping:
`₹1,25,000`).

## States

Loading: skeletons shaped like the content. Empty: plain statement + next step
("No anomalies detected for this period."). Error: what happened, why, what to do.
Import partial failure: "17 of 1,248 records could not be processed." + "Download error report".
