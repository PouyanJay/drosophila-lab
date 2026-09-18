# Completed

- Removed duplicate camera settings. Added accessible theme toggle and GitHub link to the top toolbar.
- Container-based composer layout: labels collapse below 390px composer width; smaller 16px icons, compact controls and a single muted prompt.
- Display uses expandable class filters, close-ups, depth/motion, scientific notes and geometry controls. Common color/view controls remain directly visible.
- Source count aligns with toolbar; loading/failure and membrane status remain visible. Successful descriptive metadata stays accessible to screen readers.
- Browser validation: workspace-controls (actual sidebar resizing, menus, filters, theme, mobile, alignment), workspace-theme (contrast/persistence/portals/mobile), atlas-exploration (picking, filters, views, export/reset) passed. Desktop/light/dark/mobile screenshots inspected.
- make lint and make build passed. Independent web review caught hidden warning text; corrected. No renderer materials, biological data, numerical code or paid operations changed.
- Uncommitted for user review.

## Slider regression follow-up

Grouped geometry sliders with 32px hit areas, label spacing and inset handles. Removed inline explanatory paragraphs; retained concise help in About this view and the WebGL fallback notice. Browser checks verify keyboard adjustments, zero endpoints, spacing and screenshot; make lint passed.

## Unified source footer

Moved representative morphology status into the existing source footer through a React portal. Labels distinguish total neurons from the loaded sample; filters can show fewer sampled cells. Preserved hover, loading, partial-failure and membrane messages. Removed the separate top badge. Footer wraps on narrow views and keeps Source & method available. Lint and browser footer containment checks passed.
