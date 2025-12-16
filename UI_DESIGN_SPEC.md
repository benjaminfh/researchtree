# UI Design Spec — Chat Assistant UI

Observations distilled from the provided Gemini and ChatGPT screenshots. Use this as a pattern library when designing or evaluating chat UIs.

## Layout & Structure
- Three zones: left rail (navigation), main conversation canvas (dominant), and bottom-aligned composer spanning the main canvas width.
- Left rail fixed width (~260–280px), tinted background for separation; main canvas on white.
- Top bar spans the main canvas: brand at left, centered chat title with a subtle chevron, contextual actions (copy/share/edit/shortcut chip) at right.
- Conversation content sits on generous whitespace with a relaxed top margin; no hard containers around system messages.
- Composer floats above the page edge with a pill shape and shadow; stays docked to bottom with breathing room.

## Navigation Rail
- Minimal icon set at the top: menu/burger, search, settings; icons are simple strokes at medium weight.
- Primary CTA: “New chat” row uses icon + text, medium weight, neutral color; no heavy fill.
- “My stuff” section uses horizontally scrollable tiles (rounded cards, soft shadow) with two-line truncation and small inline icons indicating type.
- Chat list uses a quiet, single-column list; active chat uses a soft, pill highlight in a slightly stronger tint; text stays medium weight (not bold).
- Utility rows (Settings/help, profile) sit at the bottom with subdued icons and labels.

## Main Conversation Canvas
- System identity chip or mark near the first response (e.g., small diamond icon for Gemini).
- Intro section is left-aligned text with ample line spacing; headings use a clear hierarchy (H4/H5 scale) and light emphasis rather than heavy color.
- Inline “Show thinking” caret near the assistant identity; treat as a low-contrast toggle.
- Message action bar (like, dislike, regenerate, copy, overflow) lives just below messages; icons are outline and evenly spaced.
- Use whitespace to separate messages instead of borders.

## Message Styling
- User prompts appear as rounded bubbles with a light neutral fill and left alignment in the main area; keep tone neutral (no borders).
- Assistant responses are plain text on white, relying on typography for structure (bold for emphasis, bullets, numbered items).
- Support rich text blocks: headings, bold phrases, italicized inline notes, horizontal rules for major section breaks.
- Tables use light rules and clear column headers; align numerical content where relevant.
- Inline status cues (e.g., “Show thinking”, drop-down for model mode) remain unobtrusive and small.

## Composer
- Pill-shaped container with subtle shadow; height ~64px; large horizontal padding.
- Left side: “+” button for add-ons/attachments, followed by tool selector chip (icon + label) with a light tint fill.
- Center: placeholder text like “Ask anything” or “Ask Gemini” in medium-gray; body text around 15–16px.
- Right side: mode selector chip (e.g., “Thinking” with caret) plus mic button in a circular, faintly tinted background.
- Attachment menu appears above the composer with rounded corners and soft shadow; items are icon + label, comfortable line height.

## Iconography & Micro-Interactions
- Outline icons with consistent stroke weight; small hover fills or tinted backgrounds for feedback.
- Carets and overflow menus are minimal; active states rely on subtle background tint rather than strong color shifts.
- Reactions row under messages is evenly spaced; click targets are generous (at least 36px).

## Color, Typography, Spacing
- Palette: white canvas; navigation tint ~#e9eef9–#eef3ff; primary accent a calm blue (~#1a73e8); neutrals from #444 text to #6b6b6b secondary; dividers in very light gray.
- Type: modern sans (Google Sans/Inter/Helvetica equivalents); sizes: 15–16px body, 18–20px subtitles, 22–24px small headings; medium weight for labels, bold reserved for semantic emphasis.
- Radii: large rounding on pills and tiles (~12–18px); cards and bubbles use consistent curvature.
- Spacing: generous vertical rhythm (12–20px between rows), roomy paddings (composer ~16–20px horizontal).

## Responsiveness & States
- On smaller widths, collapse rail to icons (hamburger to reopen). Preserve composer width with side gutters.
- Maintain top bar actions in a compact cluster; allow chat title truncation with ellipsis and tooltip.
- Hover: light tint on clickable rows and pills; focus states with thin outline for accessibility.
- Scroll areas: chat list scrolls independently from main canvas; main canvas keeps large margins and avoids edge-to-edge text.

## Writing & Content Patterns
- Lead with concise summaries; use bold phrases to anchor key facts.
- Break up responses with bullets, numbered lists, and table rows to maintain scannability.
- Include inline clarifiers in italics for nuance; avoid heavy colored highlights.
- Keep system safety notes small and muted at the very bottom (e.g., “can make mistakes…” line).

## What to Reuse
- Calm, low-contrast surfaces with a single accent color.
- Spacious pill composer with clear entry points for tools, mode, and voice.
- Left rail that favors clarity over density; selected state as a soft pill.
- Message actions that are always visible but visually quiet.
- Typographic hierarchy doing most of the visual work instead of boxes or borders.
