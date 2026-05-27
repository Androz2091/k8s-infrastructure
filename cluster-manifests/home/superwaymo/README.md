# superwaymo

Personal Waymo fare-pricing app — a node **API** and a static **UI** (React/Radix), fronted
by Caddy at `superwaymo.androz2091.fr`.

> **Auth:** SuperWaymo does **not** handle authentication itself. Access is gated entirely at
> the reverse proxy — the `superwaymo.androz2091.fr` block in the repo-root `Caddyfile`
> imports `(personal_auth)` (HTTP basic auth), so only you reach the API or the UI.

## Pieces
- `deployment.yaml` — `superwaymo-api` (node, :8787) + `superwaymo-ui` (nginx, :80)
- `service.yaml` — ClusterIP Services on :80 for each
- `sealed-secrets.yaml` — (you generate this) the master-token credentials for the API
- Caddy routing lives in the repo-root `Caddyfile`: `/api/*` → api Service, everything else → ui Service

## Images
Built & pushed to Harbor by the SuperWaymo repo's GitHub Action (`.github/workflows/build-images.yml`):
`harbor.androz2091.fr/superwaymo/api` and `harbor.androz2091.fr/superwaymo/ui`.
The `home` namespace must have a `regcred` pull secret (the manifests reference it). If it
doesn't yet, copy/seal one as you do elsewhere, or make the Harbor `superwaymo` project public-read.

## Secret (the master token)
The API mints short-lived Waymo tokens from a Google **master token** — full account access.
Keep it sealed, never plaintext in git.

```sh
cp secret.example.env secret.env && $EDITOR secret.env       # fill in your 3 values
# make a Secret manifest, then seal it with the repo cert (namespace-wide, like the others):
kubectl create secret generic superwaymo-secrets -n home --from-env-file=secret.env \
  --dry-run=client -o yaml \
  | kubeseal --scope namespace-wide --cert ../../../sealed-secrets.crt -o yaml > sealed-secrets.yaml
rm secret.env
```
The Deployment reads it via `envFrom` (`optional: true`), so the app boots even before the
secret exists — pricing just returns an auth error until you seal it in.

## Deploy
1. Push the SuperWaymo repo → CI builds & pushes both images to Harbor.
2. Seal the secret (above) and commit `sealed-secrets.yaml`.
3. Add the `superwaymo.androz2091.fr` block to the root `Caddyfile` (already in this PR) and `caddy reload`.
4. Commit & push this directory. The `home-cluster-manifests` ApplicationSet auto-creates the
   `superwaymo` ArgoCD app; sync it (or wait for auto-sync).
