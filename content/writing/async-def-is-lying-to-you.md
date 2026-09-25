---
title: "Your `async def` is lying to you"
description: "Blocking work hiding inside async Python, and what it costs a real-time voice path."
date: 2026-09-24
lastmod: 2026-09-24
tags: ["python", "latency", "voice"]
draft: true
---

<!--
DRAFT SCAFFOLD. This won't publish until `draft: false`.
Replace every section with your own writing; delete this comment.
-->

TODO: open with the symptom: latency on the voice path that no single span explained.

## The symptom

TODO: what the traces showed, and why the event loop didn't look busy.

## What `async def` does and doesn't promise

An `async def` only yields at an `await`. Anything synchronous inside it holds the event loop, and every other coroutine waits:

```python
import asyncio
import time

async def handle_turn():
    time.sleep(0.2)            # blocks the whole event loop
    await asyncio.sleep(0.2)   # yields; other calls keep flowing
```

TODO: the less obvious offenders you found (sync SDK calls, CPU-bound audio work, logging, JSON on large payloads).

## Finding it in production

TODO: how you detected it: loop lag metrics, `asyncio` debug mode, profiling.

| Signal | What it tells you |
|---|---|
| Event-loop lag | Something is holding the loop |
| Per-call latency variance | Calls are waiting on each other |

## The fix, and the number

TODO: what you changed, and the measured before/after.

> TODO: the one-line takeaway you want people to remember.
