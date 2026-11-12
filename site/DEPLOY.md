# Deploying the showcase site

The showcase page (this `site/` folder) is a static build (`dist/`) hosted on **S3 behind CloudFront**, at **log-triage.kylewillett.com**:

- **Bucket:** `kylewillett.com`, objects under the `log-triage/` prefix (`s3://kylewillett.com/log-triage/`)
- **Region:** `us-east-1`
- **Served at a subdomain root** (`log-triage.kylewillett.com`). CloudFront's
  **Origin Path** is set to `/log-triage`, so the app sees itself at `/` — that's
  why Vite's `base` stays the default `/` and no path rewriting is needed.
- Bucket stays **private**; CloudFront reads it via an **Origin Access Control (OAC)**.

## One-time setup

1. **Install & configure the AWS CLI** with credentials that can deploy:
   ```bash
   aws configure
   ```
   Use the shared deployer IAM user's credentials (one user deploys all sites in
   the bucket). It needs `s3:PutObject`, `s3:DeleteObject` and `s3:ListBucket` on the
   bucket, and `cloudfront:CreateInvalidation` on this site's distribution. The policy
   is in [`deploy/iam-policy.json`](deploy/iam-policy.json). See
   [IAM permissions](#iam-permissions) below.

2. **Provide your CloudFront distribution ID.** Copy the example config and fill it in
   (the real file is gitignored, so the ID never gets committed):
   ```bash
   cp scripts/deploy.config.local.example scripts/deploy.config.local
   # edit scripts/deploy.config.local and set CLOUDFRONT_DISTRIBUTION_ID
   ```
   Alternatively, export it in your shell instead of using the file:
   ```bash
   export CLOUDFRONT_DISTRIBUTION_ID=EXXXXXXXXXXXXX
   ```

## Deploy

From `site/`:

```bash
npm run deploy
```

The build reads `site/.env.local` for the PostHog key (gitignored; see `.env.example`), so deploy from a machine that has it. Without it the site builds and works, with analytics off.

The numbers and replays on the page come from `site/src/data/generated/`, which `npm run export:site` (at the repo root) writes from the committed eval runs. Re-run it after new eval runs and commit the result before deploying.

That runs [`scripts/deploy.sh`](scripts/deploy.sh), which:

1. **Builds** the site (`npm run build` → `site/dist/`).
2. **Syncs assets** to `s3://kylewillett.com/log-triage/` with a 1-year immutable
   cache. Filenames are content-hashed, so they can be cached forever; `--delete`
   prunes old bundles.
3. **Uploads `index.html`** with `Cache-Control: no-cache` so new deploys are
   picked up immediately (it's the one file whose name never changes).
4. **Invalidates CloudFront** (`/*`) so edge caches serve the new `index.html`.

## Config overrides

The script reads these from the environment or `scripts/deploy.config.local`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `CLOUDFRONT_DISTRIBUTION_ID` | *(required)* | Distribution to invalidate |
| `DEPLOY_BUCKET` | `kylewillett.com` | Target bucket |
| `DEPLOY_PREFIX` | `log-triage` | Key prefix within the bucket |
| `DEPLOY_REGION` | `us-east-1` | Bucket region |

## IAM permissions

All sites in the `kylewillett.com` bucket (portfolio, quiz, solar-system,
archery-blitz, log-triage, …) deploy with **one shared deployer IAM user**. Its policy is in
[`deploy/iam-policy.json`](deploy/iam-policy.json) and grants exactly what the
deploy scripts call:

- `s3:ListBucket` on `kylewillett.com` (so `s3 sync` can diff)
- `s3:PutObject` / `s3:DeleteObject` on the **whole bucket** (`kylewillett.com/*`).
  This is intentional, because the same user deploys every site's prefix.
- `cloudfront:CreateInvalidation` on each site's distribution

Before attaching it, replace the placeholders in the CloudFront statement:

- `ACCOUNT_ID`: your 12-digit AWS account ID
- `DIST_ID`: the CloudFront distribution ID (same one as `CLOUDFRONT_DISTRIBUTION_ID`)

**Adding a new site:** don't create a new user. Add the new distribution's ARN
(`arn:aws:cloudfront::ACCOUNT_ID:distribution/<DIST_ID>`) to the `Resource` list of
the deployer's `InvalidateCloudFront` statement. If you skip this, the S3 sync
succeeds but the invalidation fails with AccessDenied.

If `s3 sync` ever reports a permission error, add `s3:GetObject` on
`arn:aws:s3:::kylewillett.com/*`. Some sync comparisons use it.

Still don't deploy with your root account or an admin identity. Keep the deployer
scoped to this bucket and these distributions, and rotate its access key periodically.

## Notes

- **If you ever serve the site under a URL path** (e.g. `kylewillett.com/log-triage/`
  instead of a subdomain root), set `base: '/log-triage/'` in `vite.config.ts` and
  rebuild — otherwise the hashed assets will 404.
- The CloudFront invalidation uses `/*`. If you want to minimize invalidation cost,
  you can narrow it to `/index.html` since the hashed assets are immutable and never
  need invalidating.
