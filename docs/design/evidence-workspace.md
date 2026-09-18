# Evidence workspace

## Research and decisions

- [Carbon dashboard guidance](https://carbondesignsystem.com/data-visualization/dashboards/): prioritize the result, limit headline metrics, keep chart colors consistent and put secondary detail behind disclosure.
- [W&B workspaces](https://docs.wandb.ai/models/track/workspaces): panel-based experiment exploration informed the chart/comparison grid.
- [MLflow Tracking](https://www.mlflow.org/docs/latest/ml/tracking): keep runs, measurements and artifact provenance connected.

Applied within the existing lab workspace: a concise outcome, four metrics, full-width chart/table grid, persistent header export, and expandable confirmation/provenance. Two-column desktop layout becomes a single column on narrow evidence panels. No new UI library.

## Scientific boundaries

Pilot accuracy and full validation accuracy are separate columns, not mixed rankings. Missing measurements show a dash. The held-out difference is called “Held-out gain” even when acceptance fails; only accepted results say “Improvement confirmed”. Current best is distinct from the finalist. Confirmation intervals, scenario averages and the scientific caveat remain available. No synthetic measurements are inserted into product data.

## Verification

Browser fixtures use synthetic campaigns, never real training or paid inference. They exercise accepted/unconfirmed results, active/failed states, missing curves, pilot-only candidates, confirmation means/intervals, light/dark styling and mobile bounds. Screenshots in .validation/evidence-redesign-\*.png are test fixtures, not scientific results.
