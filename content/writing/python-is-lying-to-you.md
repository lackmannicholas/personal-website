---
title: "Python Is Lying to You: Async Pitfalls in Real-Time Audio Pipelines"
description: "Why async def doesn't mean non-blocking: CPU-bound guardrails, blocking loggers, and GIL contention that degrade production voice AI audio, and the fixes."
date: 2026-06-12T04:14:07Z
lastmod: 2026-06-12T04:14:07Z
tags: ["python", "latency", "voice-ai"]
draft: false
---

If you're building voice AI with async Python, your audio quality is probably worse than it needs to be — and the bottleneck isn't where you think it is.

I've spent the last two years building production voice AI systems — real-time pipelines handling thousands of calls per day over PSTN telephony. The stack is what you'd expect: STT, LLM reasoning, TTS, Speech-to-Speech, guardrails, tool calls, all wired together with async Python and streaming over websockets.

Along the way I've hunted down a specific category of bug that I think is more common than people realize: code that works correctly, passes every test, and makes the AI sound terrible. Not wrong answers — terrible *audio*. Stutters, gaps, unnatural pauses. The kind of artifacts that make callers hang up even though the AI gave the right answer.

These often traces back to the same root cause: Python's async model doesn't actually guarantee what most developers think it guarantees. And in a domain where timing matters at the millisecond level, those gaps in the guarantee become audible.

Here's what I found, what caused it, and how I fixed it.

---

## The Promise

Here's the setup: you've built a voice AI pipeline. S2S or STT feeds into an LLM, the LLM reasons and calls tools, TTS converts the response to speech or S2S response, and guardrails — PII detection, content filtering, maybe sentiment analysis — run alongside everything because responsible AI isn't optional. It's all `async def`. It's all `await`ed properly. The demo sounds great.

Python's async model feels like it was built for this. Non-blocking I/O, coroutines, event-driven architecture. You've got ML inference, LLM calls, NLP guardrails, and audio streaming all sharing the same event loop, and it maps cleanly onto a streaming voice pipeline.

Then you go to production with real concurrent call volume and the audio quality falls apart. Not immediately, and not on every call — but enough that it's a problem.

What follows are the specific issues I've tracked down, the code that caused them, and the fixes that brought audio quality back to where it needed to be.

---

## "But I Thought It Was Async"

This one cost me real debugging time and it's the most important concept in this entire post: `async def` does not mean non-blocking. It's a contract that Python does not enforce.

### The PII Guardrail That Killed Audio Quality

We have an inline guardrail that runs NLP analysis for PII detection on every transcript chunk. It's a compliance requirement — you can't skip it. The method is `async def`. It's being `await`ed correctly. Everything looks right.

But the NLP inference inside that method is CPU-bound. It's doing regex matching and model inference on every chunk of transcribed text. It never yields back to the event loop because there's nothing to yield *to* — it's doing computation, not I/O. Meanwhile, the audio frames that need to ship on a 20ms cadence are sitting in a queue, waiting for the event loop to come back around to them.

The guardrail runs, returns `True` — no PII detected, everything's fine — and in the 80-200ms it took to reach that conclusion, the caller heard dead air where smooth audio should have been.

```python
# BEFORE: Looks async. Isn't.
async def check_pii(self, transcript_chunk: str) -> bool:
    # All CPU-bound work. No awaits, no yields.
    # The event loop is frozen while this executes.
    patterns = self._compile_patterns()
    matches = self._scan_patterns(transcript_chunk, patterns)
    if matches:
        return True

    # NLP model inference — the expensive part
    result = self.nlp_model.predict(transcript_chunk)
    return result.contains_pii
```

The mental model most Python developers carry is: "I used `await`, so it's non-blocking." But `await` only yields control if the called coroutine actually *suspends* — meaning it hits a real I/O wait or an explicit yield point. An `async def` that does CPU work without any suspension points is functionally synchronous. Python won't stop you from writing it. Python won't warn you. The only thing that tells you something is wrong is the audio quality.

The important constraint here: you can't remove the guardrail. It's compliance. You can't make the NLP inference faster — it takes what it takes. The fix is getting it off the audio hot path entirely:

```python
# AFTER: Actually non-blocking. CPU work moves to a thread.
async def check_pii(self, transcript_chunk: str) -> bool:
    result = await asyncio.to_thread(self._detect_pii_sync, transcript_chunk)
    return result

def _detect_pii_sync(self, text: str) -> bool:
    """Runs in a thread pool, not on the event loop."""
    patterns = self._compile_patterns()
    matches = self._scan_patterns(text, patterns)
    if matches:
        return True
    result = self.nlp_model.predict(text)
    return result.contains_pii
```

`asyncio.to_thread()` moves the CPU-bound work to a thread and yields control back to the event loop immediately. The PII check still runs. Compliance is still met. But the event loop is free to keep shipping audio frames while the NLP model does its work in the background.

One line changed the call signature. The caller stopped hearing gaps.

What makes this worth writing about is the irony: the guardrail protecting the user experience was the thing degrading it. In a typical web application, 80-200ms of CPU work means a slightly slower HTTP response. Nobody notices. In a streaming audio pipeline, it means the event loop can't service the coroutines responsible for sending audio frames on time, and the caller hears it.


![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/19egnk4nc97rqxr1ro06.png)


---

## Your Logger Is in the Hot Path

This one is subtle enough that I think most Python developers don't know about it.

Python's standard `logging` module uses `StreamHandler` by default. Here's what actually happens every time you call `logger.info()`:

1. `StreamHandler.emit()` acquires a threading lock — `self.lock.acquire()`
2. It calls `self.stream.write()` — a blocking I/O operation
3. Even writing to stdout is blocking in CPython

That's a lock acquisition plus a synchronous write on every log call. In a web server, this is noise — your response already takes 50-200ms, and a few microseconds of lock contention doesn't register. On an audio hot path where frames need to ship every 20ms, you've added synchronous I/O to the critical timing loop.

During development you add `logger.debug()` throughout the audio path because you need visibility into what's happening. Reasonable. But every one of those calls is synchronous I/O that can introduce jitter. In a REST API, it doesn't matter. In a streaming audio pipeline, it does.

Logging isn't the only thing hiding in plain sight either. On the audio hot path, nothing is safe to assume is free:

- **`json.dumps()` / `json.loads()`** on large payloads — CPU-bound, holds the GIL the entire time
- **DNS resolution inside aiohttp** — can block if the system resolver is slow
- **File I/O that looks async but isn't** — many "async" wrappers delegate to a thread pool, and if that pool is saturated, you wait
- **Python's string interpolation with file reads** — we hit this one loading AI tool definitions dynamically in our orchestration package. Trying to be clever about caching actually introduced synchronous file I/O on a path that needed to be fast

The fix is two-fold:

**First, audit your log levels.** Production doesn't need `DEBUG` on the hot path. You'd be surprised how many `logger.debug()` calls survive into production with a permissive log level config. Remove what you don't need, bump the rest to levels that won't fire in production. This is free.

**Second, replace `StreamHandler` with `QueueHandler`:**

```python
import logging
from logging.handlers import QueueHandler, QueueListener
from queue import Queue

log_queue = Queue()

# Drops log records into the queue and returns immediately
queue_handler = QueueHandler(log_queue)

# Separate thread drains the queue and writes at its own pace
stream_handler = logging.StreamHandler()
listener = QueueListener(log_queue, stream_handler)
listener.start()

logger = logging.getLogger("voice_pipeline")
logger.addHandler(queue_handler)
logger.setLevel(logging.INFO)
```

`QueueHandler` drops the log record into an in-memory queue and returns immediately. A `QueueListener` on a separate thread drains the queue at its own pace. The hot path never blocks on I/O. The log still gets written — just not synchronously.

Neither of these fixes requires rearchitecting anything. Together they remove synchronous I/O from every frame of your audio pipeline.

---

## The GIL Doesn't Care About Your Deadlines

Even if you get your async discipline perfect — every CPU-bound operation offloaded to a thread, every logger swapped, every stdlib call audited — the GIL is still there.

The Global Interpreter Lock means only one thread executes Python bytecode at a time. Most Python concurrency advice hand-waves past this because for web workloads it genuinely doesn't matter much. Threads spend most of their time waiting on I/O, the GIL is released during I/O waits, and everyone gets a turn.

Real-time audio is different. You have CPU-bound work happening in threads (we just moved PII detection to a thread). You have the event loop on the main thread scheduling audio frame callbacks. The GIL means these take turns, not run in parallel. When the PII thread is holding the GIL for NLP inference, the event loop thread can't run. When the event loop can't run, audio frames don't ship.


![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/swkfzvt7mvt5upv10rs2.png)


What this looks like in production:

- Latency spikes that only appear under load — one concurrent call is fine, fifty and you see jitter
- Symptoms look identical to network jitter in your metrics, but it's scheduling contention inside your own process
- Doesn't reproduce locally because your dev machine isn't running fifty concurrent sessions
- The p50 and p99 look acceptable. The p99.9 is bad. And in voice, the p99.9 is what callers remember

The honest answer is that the GIL makes Python fundamentally limited for work where sub-millisecond scheduling guarantees matter. But "rewrite it in Rust" isn't practical for most teams, and the rest of the stack — orchestration, LLM integration, business logic — is genuinely well-served by Python. The practical approach is knowing the constraint exists and designing around it.

### Free-Threaded Python: The Light at the End of the Tunnel

Python is finally making the GIL optional. PEP 703 introduced a free-threaded build, and as of Python 3.14 it's officially supported — though still opt-in, not the default.

In practice: you can build CPython with `--disable-gil` and get true multi-threaded parallelism. The PII detection thread could run in parallel with the event loop thread instead of taking turns. Several items on the fix hierarchy below could potentially collapse.

The caveats are real though. The ecosystem is still catching up — C extensions that assumed the GIL would protect shared state may not be thread-safe without it. Libraries that haven't been updated may re-enable the GIL automatically. And race conditions that the GIL was silently preventing will surface the moment you remove it.

For real-time audio, this is genuinely promising. But it's a migration measured in years, not a weekend upgrade. Your STT clients, TTS clients, LLM SDKs, and orchestration frameworks all need to support it before you can flip the switch in production. Worth tracking closely and something I look for experimenting with.

---

## "Just Use Threads" — The Trap

At this point the instinct is obvious: `ThreadPoolExecutor` is right there, move everything off the event loop.

Sometimes that's the right call — `asyncio.to_thread()` fixed the PII guardrail cleanly. But "just use threads" as a general strategy is a trap:

**Shared state becomes a problem.** Audio pipelines have state — playback buffers, conversation context, agent state, connection metadata. Threading means reasoning about what's shared. Race conditions in audio manifest as once-in-a-thousand glitches: a frame sent out of order, a buffer read during a write, piping audio into a different user's websocket, a state update that arrives late. Nearly impossible to reproduce in testing.

**Thread safety overhead can reintroduce latency.** Locks fix shared state problems but introduce contention, which reintroduces the timing issues you were trying to solve.

**The GIL means threads aren't truly parallel** for CPU-bound work anyway. You've added complexity without gaining real concurrency where it matters most.

### What Actually Works

When I find something blocking the audio hot path, my first questions are about the product, not the code:

**"Do we need this on the hot path at all?"** This is the question that junior engineers skip. They go straight to "how do I make this faster" when the answer is often "don't do it here." Can this work happen after the audio frame ships? Before the call starts? Does it need to run on every chunk, or can it batch?

**"Where else can I put it?"** If it needs to happen during the call, can it move to a background task without breaking anything? Often the answer is yes.

**"If I have to move it, who do I talk to about feature parity?"** Sometimes moving work off the hot path changes how a feature behaves. That's a product conversation, not just an engineering one.

Then the technical options, in order of preference:

1. **Background tasks** — fire-and-forget with `asyncio.create_task()` if you don't need the result immediately. Lowest cost.
2. **Threads** — `asyncio.to_thread()` for isolated CPU work like the PII guardrail. Keep the surface area small.
3. **Multiprocessing** — escapes the GIL, but IPC overhead adds its own latency. Worth it for heavy, long-running work.
4. **Separate process** — full isolation. Hot path and heavy processing don't share a GIL or memory. Real architectural cost, but real isolation guarantees.
5. **Event loop inversion** — give the audio hot path its own dedicated event loop. Nothing else runs on it, so nothing can starve it. This is the nuclear option.

The right choice depends on how close the work is to the audio stream. A guardrail that doesn't gate playback? Background task. Audio pacing logic that controls frame timing? Might need its own event loop.

---

## The Free Lunch: uvloop

After all of the above, here's something you can do in five minutes that actually helps.

[uvloop](https://github.com/MagicStack/uvloop) is a drop-in replacement for asyncio's event loop, written in Cython on top of libuv — the same library that powers Node.js. It's faster at everything the event loop does: iterating, dispatching callbacks, resolving timers, handling I/O.

```python
import uvloop
uvloop.install()
# That's it.
```

In a real-time audio pipeline where the event loop drives frame timing, faster iteration means tighter scheduling means smoother audio. With the default asyncio event loop, I was seeing event loop congestion of 10 ms - 3 seconds. Meaning, the event loop was stuck for that long, unable to do anything else. After switching to uvloop, that number stayed down to single digit ms. Still some congestion, but much better than waiting 2 seconds for the event loop to run the next scheduled operation.

What it doesn't fix: the GIL, blocking code, CPU-bound coroutines that starve the loop. Every problem from the previous sections still applies. uvloop makes a healthy event loop faster — it can't fix a broken one.

But after spending hours tracking down blocking calls and refactoring thread strategies, a one-line change that measurably improves scheduling is a nice win.

---

## The Takeaway

Python is the right language for building voice AI systems. The orchestration, the LLM integration, the business logic, the rapid prototyping — the ecosystem is unmatched - though TypeScript is becoming more and more robust AI ecosystem by the day.

But the audio hot path operates under timing constraints that Python's async model wasn't designed for. The issues I've described here aren't Python bugs — they're assumption gaps. Assumptions that `async def` means non-blocking, that the stdlib is fast enough to be invisible, that the GIL only matters for batch processing, that threads give you parallelism.

Every one of those assumptions is reasonable in the context of a web application. Every one of them will degrade your production audio quality in a voice AI pipeline.

The fix isn't rewriting everything in Rust/C++ or abandoning Python. It's knowing where the constraints are, designing around them, keeping CPU-bound work off the path where milliseconds are audible, and architecting your system with these constraints in mind.

More on that in the next blog post: The Audio Gateway.

---

*This is part of a series on building production voice AI systems. Previously: [Dude, Where's My Response? Cutting 700ms from Every Voice AI Turn with Local VAD](/writing/local-vad/) | [Your Voice Agent Needs Two Brains: Building Multi-Thinker on OpenAI's Realtime API](/writing/responder-thinker/) | [I Tested Our WebSocket Audio Pipeline with WebRTC. Here's Why I Switched It Back.](/writing/websockets-vs-webrtc/)*
