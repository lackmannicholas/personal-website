# Infrastructure

nicklackman.com is a Hugo site on S3 + CloudFront, with DNS in Route 53.

```
browser → Route 53 alias → CloudFront (TLS, nicklackman-router function) → private S3 bucket (OAC)
```

| Piece | Value |
|---|---|
| Canonical host | `nicklackman.com` |
| S3 bucket | `nicklackman.com` (private; REST origin with OAC; website hosting off) |
| CloudFront | `E37HOY2EC40ION` → `d2txy1ixth378i.cloudfront.net` |
| Function | `nicklackman-router` on the default behavior, viewer request |
| Error pages | 403 and 404 → `/404.html`, response code 404 |

`infra/cloudfront-function.js` does two things: 301-redirects every hostname
other than `nicklackman.com` to it, and serves `/dir/` as `/dir/index.html`.
Edit it in the console, then **Publish** (saving alone doesn't go live).

---

## Adding a hostname that redirects to nicklackman.com

Applies to `lackman.dev` today and any of lackman.io / .me / .info later.
No code changes: the function already redirects any non-canonical host.

1. **Certificate.** In ACM **us-east-1**, request a new certificate covering every
   name the distribution serves, e.g. `nicklackman.com`, `www.nicklackman.com`,
   `lackman.dev`. DNS validation → **Create records in Route 53**. Wait for *Issued*.
2. **Distribution.** Add the hostname under alternate domain names and switch
   the distribution to the new certificate. Wait for *Deploying* to finish.
3. **DNS.** In that domain's hosted zone, create `A` and `AAAA` alias records at
   the apex → *Alias to CloudFront distribution* → `d2txy1ixth378i.cloudfront.net`.

Order matters: DNS before steps 1–2 produces TLS errors for visitors.

When lackman.dev becomes a consulting site, give it its own bucket and
distribution and remove it from this one.

---

## Email on lackman.dev

`nick@lackman.dev` is the contact address on the site (`hugo.toml` → `email`).

1. Add `lackman.dev` at your mail provider (Fastmail, Google Workspace, or iCloud+).
2. In the `lackman.dev` hosted zone, create exactly what the provider lists:
   - `MX` at the apex
   - `TXT` at the apex for SPF, e.g. `v=spf1 include:<provider> ~all`
   - DKIM records (usually 2–3 CNAMEs under `._domainkey`)
   - `TXT` at `_dmarc`: `v=DMARC1; p=none; rua=mailto:nick@lackman.dev`
3. Send a test to another account → *Show original* → SPF, DKIM, and DMARC all **PASS**.
4. After a few weeks of clean reports, tighten DMARC to `p=quarantine`.

Mail records and the website alias records live side by side in the same zone
without conflict.

---

## Cleanup

- **`www.nicklackman.com` hosted zone:** not delegated, so it's unused. Route 53
  only deletes empty zones: delete every record except the default NS and SOA,
  then delete the zone. The live `www` records are in the `nicklackman.com` zone.

## Checks

```
curl -sI https://nicklackman.com/ | head -1                 # 200
curl -sI https://www.nicklackman.com/ | grep -i location    # https://nicklackman.com/
curl -sI https://lackman.dev/ | grep -i location            # https://nicklackman.com/
curl -sI https://nicklackman.com/for/netflix/ | head -1     # 200
curl -sI https://nicklackman.com/nope | head -1             # 404
```

If `dig` resolves but `curl` fails: a TLS error means the name isn't on the
certificate; a 403 "Bad request" means it isn't in the alternate domain names.
