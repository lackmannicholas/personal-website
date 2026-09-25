# nicklackman.com

Personal site and writing. Built with [Hugo](https://gohugo.io): Markdown in, static HTML out.
No JavaScript framework and no node_modules, so it keeps building for years.

## Writing a post

```
hugo new content writing/my-post-name.md   # file name becomes the URL: /writing/my-post-name/
hugo server -D                             # preview at http://localhost:1313, drafts included
```

Front matter:

| Field | Purpose |
|---|---|
| `title` | Headline. Markdown allowed, e.g. `` `async def` `` |
| `description` | One sentence for lists, search results, and link previews |
| `date` | Publication date |
| `lastmod` | Bump when you revise; the article shows "Updated" |
| `tags` | First tag shows in lists; each tag gets `/tags/<tag>/` |
| `draft` | `true` until ready. Drafts are never deployed |

Rules that keep links working for a decade:

- **Never rename a published file.** The file name is the URL. Retitling is fine.
- Revise evergreen posts in place and bump `lastmod`, rather than writing "part 2" replacements.
- Cross-post to dev.to or LinkedIn with the canonical URL set to the nicklackman.com article.

## Deploy

```
brew install hugo   # once
BUCKET=nicklackman.com DISTRIBUTION_ID=E37HOY2EC40ION ./infra/deploy.sh
```

## Layout

```
content/writing/     posts (Markdown)
layouts/             page templates (home, list, article, 404)
static/css/site.css  all styles
static/for/          company-specific pages (gitignored, deployed from your machine)
hugo.toml            site settings: email, GitHub, LinkedIn, permalinks
infra/               CloudFront Function and deploy script
```

The Writing link in the nav and the Writing section on the home page appear
automatically once the first non-draft post exists.

First-time AWS setup is in [DEPLOY.md](DEPLOY.md).
