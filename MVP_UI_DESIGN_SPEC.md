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

## Implementation Plan
- Theme setup: extend `tailwind.config.js` with `fontFamily.sans` (Inter, "Helvetica Neue", system), color tokens (`primary: #1a73e8`, `rail: #eef3ff`, `surface: #ffffff`, `text: #1f2937`, `muted: #6b7280`, `divider: #e5e7eb`), radii (`md: 12px`, `lg: 16px`, `xl: 18px`), shadows for cards/composer, and a focus ring (`focus-visible:outline-primary/60 outline-2 outline-offset-2`). Enable `@tailwindcss/typography` and tune `prose` to stay low-contrast.
- Base layout shell: body `bg-white text-slate-800 antialiased`, container `min-h-screen grid md:grid-cols-[270px_1fr]` with `bg-rail/60` on the rail and `bg-white` canvas. Keep main column `max-w-4xl mx-auto px-6` with `pt-6 pb-28` to leave room for the floating composer.
- Navigation rail: `w-[270px] border-r border-divider/60 bg-rail/80 backdrop-blur flex flex-col gap-3 p-4`. Top icon cluster `flex gap-2` with `rounded-full hover:bg-primary/10`. “New chat” row `flex items-center gap-2 px-3 py-2 rounded-full text-slate-700 hover:bg-primary/10`. “My stuff” uses `grid-flow-col auto-cols-[200px] overflow-x-auto gap-3 pb-2` and cards `rounded-xl shadow-sm bg-white/80 border border-divider/60 px-3 py-3`. Chat list `space-y-1` with active item `bg-primary/10 text-primary rounded-full`.
- Top bar: `sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-divider/80 px-6 py-3 flex items-center justify-between gap-3`. Title uses `text-lg font-medium truncate` with a chevron icon. Action cluster uses ghost icon buttons `rounded-full hover:bg-primary/10 text-slate-600`.
- Conversation canvas: intro stack `space-y-3` with `text-base leading-relaxed`. Identity chip `inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-sm px-3 py-1`. Messages live in `space-y-4` with ample white space; no boxed containers.
- Message styling: user bubble `self-start inline-block max-w-[80%] bg-slate-50 text-slate-800 rounded-2xl px-4 py-3 shadow-sm`. Assistant content `prose prose-slate max-w-none leading-relaxed` with `prose-headings:font-semibold prose-hr:border-divider prose-table:border-divider`. Actions row `flex items-center gap-2 text-sm text-slate-500` with icon buttons `hover:bg-primary/10 rounded-full p-2`. Status chips (thinking/mode) `text-xs bg-slate-100 text-slate-600 rounded-full px-2.5 py-1`.
- Composer: wrapper `fixed inset-x-0 bottom-0 pb-4 md:pb-6 bg-gradient-to-t from-white via-white/70 to-transparent pointer-events-none`. Inner `max-w-3xl mx-auto px-4 pointer-events-auto` holding a pill `flex items-center gap-3 rounded-full bg-white border border-divider shadow-lg px-4 py-3`. Left: `+` button `h-10 w-10 rounded-full hover:bg-primary/10`, tool chip `rounded-full bg-primary/10 text-primary text-sm px-3 py-2`. Center input `flex-1 bg-transparent text-base placeholder:text-slate-400 focus:outline-none`. Right: mode chip `rounded-full bg-slate-100 text-slate-700 text-sm px-3 py-2` and mic `h-10 w-10 rounded-full bg-primary/10 text-primary hover:bg-primary/15`.
- Attachment menu and menus: position above composer `absolute bottom-16 left-0 w-64 rounded-xl border border-divider shadow-lg bg-white p-2 space-y-1`, items `flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-primary/10 text-slate-700`.
- States: focus-visible ring on all interactive elements; hover uses `bg-primary/10`, active `bg-primary/15`, disabled `opacity-50 cursor-not-allowed`. Streaming indicator `flex items-center gap-2 text-primary text-sm animate-pulse`. Error/retry banners `rounded-xl bg-red-50 border border-red-200 text-red-800 px-3 py-2 flex items-center gap-2`. Skeletons `animate-pulse bg-slate-100 h-4 rounded` in message placeholder blocks.
- Responsiveness: below `md`, collapse rail to icons-only `w-14` with tooltip labels; allow a hamburger to open full rail overlay. Top-bar actions reduce to icon buttons; chat title `truncate`. Composer keeps full width with side gutters and safe-area padding `pb-[calc(env(safe-area-inset-bottom)+1rem)]`. Reactions and toolbars `flex-wrap gap-y-1` to avoid overflow.
- Implementation checklist: configure Tailwind theme and typography plugin; add global base styles (body, focus ring). Build shared components (Rail, TopBar, Message, Composer, AttachmentMenu) with classnames above. Add layout shell with sticky top bar and floating composer; wire message list with `prose` styling and action bars; verify mobile behavior and keyboard-safe spacing; add storybook or visual tests for rail states, composer focus, and message actions.


### Refinements

- Product name: SideQuest (show it on the home page where we currently have "ResearchTree
Projects" and make that pill 2x bigger, on the project page, smaller pil top left within the main frame)
- The left hand rail should be on every page:
    - For the home page, it should contain the project history + a collapse button (very top - stable position regardless open/collapsed)
    - For the project page:
        - We can remove the white "home" button / div (it's duplicative with the projects button just below it): [<div class="px-4 py-4 md:px-8"><a class="inline-flex items-center gap-2 text-sm font-semibold text-slate-800 hover:text-primary" href="/"><span aria-hidden="true">←</span>Home</a></div>]
        - The "new message" button doesn't do anything and should be removed (weird place for a new message button!)
        - the left hand rail should be collapsible 
        - the main frame should scroll independently from the rail (which ideally shouldn't scroll!)
        - the hints section should be a collapsible pill (default collapsed)
        - the floating message textarea and send button design is awesome!
        - conversation and artefacts should fill the vertical height (ending just above the message text area)

### Refinements 2
- home page
    - side rail
        - contents should be hidden when collapsed (only toggle button stays in all views)
        - project pills should have an archive button. on click, it goes red and requires a second confirmation click to archive
        - clicking project pill navigates to that project page
    - main projects view
        - default hide this now, in favour or side bar view
- project page
    - top banner div is still there - should be removed altogether!!
    - textarea in artefact should always fill parent height (with margin)
    - sidebar
        - hints section is now two divs - must be only one - toggles size/view on click
    - conversation/artefact parent container - too big right now, causing it to scroll. should not scroll.

### Refinements 3
- project page
    - we lack a way to navigate to home now - suggestions on where a button could go? very bottom of rail when collapsed + top right of rail when expanded?
    - conversation + artefact container doesn't fill VH properly again (too short)
- home 
- remove node count from side bar project pills
- remove main frame project view completely
- Text:
    - SideQuest Projects -> SideQuest
    - Git-backed reasoning sessions -> Branchable Chat for Deep Research Sessions
    - Spin up a workspace, branch thinking safely, and keep artefacts alongside the chat history. -> Spin up a workspace, branch your train of thought and context, and work on a canvas
    - artefact -> canvas (in all user-facing contexts)
    - project -> workspace (in all user-facing contexts)
        
### Work completed in UI glowup sprint
- **Global structure**: Added collapsible rail shared across home and workspace pages, sticky top bar, and floating composer with pill styling and safe-area padding so content never collides with the input.
- **Workspace rail**: Active branch chip, branch list with trunk badge, create-branch form, collapsible Session Tips pill, and home shortcut anchored to the footer in both collapsed/expanded states.
- **Home rail**: Replaced main grid with SideQuest-branded rail showing recent workspaces (grid cards), archive affordance, and consistent collapse behavior; copy now reflects “SideQuest” + “Branchable Chat for Deep Research Sessions”.
- **Conversation canvas**: Fully responsive layout with two-column split (chat + canvas), sticky summary header, branch-specific merge button, shared-history divider, merge modal, edit modal, and artefact rename to “Canvas”.
- **Composer & chat UX**: Floating composer with attachment button, branch indicator, thin gray textarea outline, thinking chip, stop control, and streaming indicator; message bubbles updated with edit affordance, reaction row, and merge/state badges.
- **Canvas editor**: Trunk-only markdown editor (textarea) with Save/Reset actions, disabled view on branches, and UI copy explaining the constraint; artefact PUT route + trunk guard wired through.
- **Branch/edit plumbing**: Edit flow now branches from the edited node’s parent commit, uses server-side lock, and keeps branch metadata/hooks aware of the active ref; merge route plumbed with `applyArtefact` flag for future UI surfacing.
- **Testing alignment**: Client tests updated to new labels/placeholders (“Workspace”, “Ask anything”, collapse rail), branch-aware provider selector, stop control, and artefact editor states; server tests cover edit route changes.
