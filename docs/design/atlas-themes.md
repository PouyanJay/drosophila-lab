# Atlas themes and selected-cell visibility

Use the **sun/moon button in the atlas toolbar** to switch themes. The preference persists locally and survives Reset view. This setting themes the entire workspace, including the sidebar, conversation, discovery cards, evidence, portaled menus and dialogs, atlas overlays, and exported image. The preference applies to both atlas and workspace chrome.

## Rendering changes

- Dark mode uses richer midtone categorical hues, restrained fill/rim lighting and stronger depth contrast to separate overlapping strands without pastel glare.
- Light mode uses a white canvas, saturated source-cell colors, neutral gray translucent compartments and light controls. It follows the supplied EveryNeuron screenshots' visual hierarchy.
- Compartment opacity is strongest at grazing angles and lighter across faces. Quiet context bypasses colored scene lighting so neutral anatomy does not become a blue cloud.
- Selecting any neuron now explicitly enters isolation, leaving quiet anatomical compartments around it. Dense dimmed neurons no longer hide the selected cell by default. **Show context** restores them; the context brightness slider is disabled while isolated.
- Clearing the neuron or selecting a compartment clears neuron isolation. Membrane and skeleton picking retain the same identities across themes.
- PNG export uses the chosen background and legible attribution text. The theme switch remains available in the 2D fallback.

## Validation

`make lint`, the Node suite (40 tests at the full-suite run, plus the subsequently added palette luminance test), production build, real-GPU renderer fixture, existing app exploration fixture and the new theme browser fixture passed. The theme fixture checks identical selected-cell views, actual context restoration, light export, preference reload/reset and mobile settings bounds. Screenshots were inspected for both themes and the exported light image.

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/browser/atlas-themes.mjs
```

The app must be running; `ATLAS_TEST_URL` can override localhost:3000. No paid calls are made. Evidence files: `.validation/atlas-theme-dark.png`, `atlas-theme-light.png`, `atlas-theme-mobile.png`, and `atlas-light-export.png`.

Independent web review caught a hidden-isolation mismatch and a compartment-selection transition; both were fixed. Existing lint debt was not increased.

## Reference fidelity

The light appearance matches the reference direction (white background, gray transparent anatomy, vivid foreground cells), but is not pixel-identical to EveryNeuron. Current region meshes are simplified and true cell surfaces are still available for three curated cells. The rest use source-radius skeleton geometry. Themes do not add missing source geometry or change biological data.

## Workspace light-theme second pass

The surrounding UI uses off-white workspace surfaces, white cards, slate text and blue primary actions. Selected controls use pale blue; success, warning and error states retain distinct semantic colors. OpenAI icons, toolbar buttons, focus rings, switches, discovery progress and provider menus receive explicit light treatment. Atlas materials and neuron colors are unchanged by this pass.

The optional browser regression `tests/browser/workspace-theme.mjs` checks computed text/control contrast, portal menus, discovery configuration, spending, saved conversations, theme persistence and mobile bounds. Run with the same Playwright module environment as above. It does not submit messages or launch campaigns.
