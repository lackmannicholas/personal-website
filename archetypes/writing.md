---
title: "{{ replace .File.ContentBaseName "-" " " | title }}"
description: ""        # one sentence; used for the list, search results, and link previews
date: {{ .Date }}
lastmod: {{ .Date }}   # bump when you revise; shows "Updated" on the article
tags: []               # e.g. ["voice", "latency", "python"]; first tag shows in lists
draft: true            # set to false to publish
---

Opening paragraph: the problem, and why it matters.

## Section

Body.
