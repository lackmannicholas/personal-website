---
title: "Voice AI: Fast and Dumb or Slow and Smart — Why Not Fast and Smart?"
description: "The Responder-Thinker pattern for production voice AI: a realtime model that stays present, specialist thinkers that get it right, backend mediation, and local VAD."
date: 2026-04-06T23:26:29Z
lastmod: 2026-04-06T23:26:29Z
tags: ["voice-ai", "architecture", "openai", "python"]
draft: false
---

Many voice AI demos connect the browser directly to a real-time audio model API and lets the server decide when you've stopped talking. That's a demo architecture with a built-in latency tax that quickly breaks down in production. Here's the production alternative: a backend-mediated, multi-thinker voice system with local voice activity detection that owns the entire audio pipeline end-to-end.

I spent the last year and half building production voice AI systems that handle thousands of calls per day. This post covers the architecture I wish someone had documented when I started: how to make your voice AI product fast and smart, what the Responder-Thinker pattern is, why single-thinker breaks, how to build multi-thinker with your backend in the middle, and why local VAD is the key to making it feel instant.

The companion repo is fully functional — clone it, run it, talk to it (OpenAI API Key Required): [github.com/lackmannicholas/responder-thinker](https://github.com/lackmannicholas/responder-thinker)

---

## The Latency Budget You Can't Meet

Before the Realtime API existed, voice AI meant chaining three models in series: speech-to-text, an LLM, then text-to-speech. The math doesn't work.

STT endpointing and recognition eats 500-1000ms. The LLM's time-to-first-token adds another 500-1500ms. TTS synthesis takes 200-500ms. You're at **1.2-3 seconds minimum** before the caller hears a single syllable — and conversational turn-taking breaks down around 800ms of silence.

In [my previous post](/writing/local-vad/), I showed that server-side voice activity detection alone adds 500ms+ of unnecessary overhead to every turn. But even after fixing that, the serial pipeline architecture is the bottleneck. You can't engineer your way to natural conversation speed with a pipeline. The architecture has to change.

## The Realtime API: Fast, But Not Smart Enough

OpenAI's Realtime API collapses the STT → LLM → TTS pipeline into a single api call. Latency drops to sub-second. The conversation finally feels naturalish.

But there's a tradeoff. The realtime model is conversational and fast, but compared to text-based models like GPT-5.4, it struggles with complex multi-step instructions, structured tool use, and domain-specific accuracy. It hallucinates more. Its instruction-following degrades as the system prompt grows.

A voice agent that responds instantly but gives wrong information is worse than one that takes two seconds and gets it right. **The Realtime API solved the latency problem and created an intelligence problem.**

## Enter Responder-Thinker

The Responder-Thinker pattern resolves this by splitting responsibilities:

The **Responder** (Realtime API) is "always on". It handles conversational flow — greetings, acknowledgments, stalling, turn-taking. It's fast and socially intelligent. When the user asks something that needs real data or complex reasoning, the Responder classifies the intent and hands off to a Thinker.

The **Thinker** (text-based model) runs in the background. It has a focused system prompt, domain-specific tools, and the reasoning capability to get the answer right. When it's done, the result is injected back into the Realtime API conversation, and the Responder delivers it naturally.

The insight: **you don't need your real-time voice to be smart. You need it to be *present* while the smart thing works in the background.**

This pattern comes from OpenAI — their [openai-realtime-agents](https://github.com/openai/openai-realtime-agents) repo calls it "Chat-Supervisor." The concept isn't new. Making it production-grade is the hard part.

## Why Single-Thinker Breaks

The simplest implementation has one generalist Thinker handling everything — weather, stocks, news, FAQ, escalation. In my experience, this breaks fast.

The system prompt grows to accommodate every domain, and quality degrades across all of them. A weather lookup and a complex knowledge question go through the same agent with the same overhead. You can't tune one domain without risking regressions in the others. You can't use a cheaper model for simple lookups and a smarter model for hard reasoning — it's one model for everything. You have to vertically scale the model capability based on the your most complex task. Lighter tasks are "over-provisioned" in terms of model usage.

**Single-thinker is a monolith. Multi-thinker is microservices.** The voice AI industry is learning the same architectural lessons backend engineering learned fifteen years ago.

In a multi-thinker architecture, each Thinker owns a domain with a focused prompt and its own tools. Weather uses `gpt-5.4-mini` with a live weather API. News uses `gpt-5.4` because summarization requires more reasoning. Each can be tested, cached, and optimized independently.

## The Realistic Production Architecture

Here's where this implementation diverges from most tutorials you'll find.

Many demos connect the browser directly to OpenAI's Realtime API via WebRTC. The browser gets an ephemeral token, establishes a peer connection, and audio flows between the user and OpenAI with nothing in between. **It's not how production voice systems work.**

In production — Twilio, SIP trunks, contact centers — audio always flows through your backend. This architecture puts your backend in the middle:

```plaintext
Browser ←—WebRTC—→ Python Backend ←—WebSocket—→ OpenAI Realtime API
                        │
                   Thinker Agents
```

The browser connects to a FastAPI server via WebRTC (using [aiortc](https://github.com/aiortc/aiortc) for server-side WebRTC). The backend opens a WebSocket to OpenAI's Realtime API and streams audio bidirectionally, resampling between 48kHz (WebRTC) and 24kHz (Realtime API) using `libswresample` for proper anti-aliased conversion.

What this gives you that direct connection doesn't:

- **Interception**: the backend sees every event between the user and the model. Tool calls route to your server-side agents, not browser JavaScript. This is important for conservation aggregation, metrics, and downstream analytics
- **State management**: Redis-backed conversation history, cross-session user memory, per-domain result caching.
- **Local VAD**: your backend owns turn detection, not OpenAI's servers. This is where hundreds of milliseconds live.
- **Security**: API keys never touch the browser.
- **Transport flexibility**: the same backend works for WebRTC browsers and telephony SIP trunks.

## Local VAD: Owning Turn Detection End-to-End

This is the piece that makes the architecture feel instant.

Most implementations of the OpenAI Realtime API use `semantic_vad` or `server_vad` in the session config and let OpenAI decide when the user stopped talking. That means every audio frame travels to OpenAI's servers, their VAD processes it, they decide the turn is over, and only *then* does the model start generating a response. That round-trip is hundreds of milliseconds you're paying on every single turn.

My implementation replaces this entirely with **local voice activity detection**. The backend runs a [TEN VAD](https://github.com/AgoraIO/ten_vad) model that processes audio locally and makes the turn detection decision on your own hardware, with zero network round-trip:

```python
# When local VAD is active, server-side turn detection is completely disabled.
# The backend owns the full pipeline: detect speech end → commit buffer → trigger response.

if self._vad_gate is not None:
    result = self._vad_gate.process(pcm16_bytes)

    # Speech onset: interrupt if audio is still playing
    if result.speech_started:
        if self._response_active or has_queued_audio:
            await self._handle_interrupt()

    # Speech end: commit and request response immediately
    if result.speech_ended:
        asyncio.create_task(self._commit_and_respond())
else:
    chunks_to_send = [pcm16_bytes]  # fallback: send everything, let OpenAI decide
```

The VAD gate uses a three-state machine — SILENCE, SPEECH, and HANGOVER — with a pre-roll buffer that preserves audio from just before speech onset. When speech ends, the backend immediately commits the audio buffer and sends `response.create`. No server-side VAD involved. No round-trip. The Realtime API starts generating the instant it receives the committed buffer.

The `_commit_and_respond` method uses the same `_response_create_lock` that protects thinker result injection and idle nudges, because all of them compete for the same `response.create` API constraint:

```python
async def _commit_and_respond(self):
    await self._realtime_ws.send(json.dumps({"type": "input_audio_buffer.commit"}))
    async with self._response_create_lock:
        await self._response_done.wait()
        if self._running:
            await self._realtime_ws.send(json.dumps({"type": "response.create"}))
```

The result: it feels like the agent starts responding before you've finished talking. It isn't really, but the gap between end-of-speech and first audio byte is so small that it feels that way. This is [the same VAD research I published previously](/writing/local-vad/) — 689ms improvement measured in controlled testing — now integrated into a full production architecture.

## Routing: The Dumbest Model Makes the Most Important Decision

The Responder classifies intent via a single tool call — `route_to_thinker(domain, query)`. The domain is constrained to a fixed enum:

```python
ROUTE_TO_THINKER_TOOL = {
    "type": "function",
    "name": "route_to_thinker",
    "parameters": {
        "type": "object",
        "properties": {
            "domain": {
                "type": "string",
                "enum": ["weather", "stocks", "news", "knowledge", "research"],
            },
            "query": {
                "type": "string",
                "description": "The user's question, rephrased for the specialist.",
            },
        },
    },
}
```

This is architecturally interesting because **your dumbest model is making the most important decision**. And that's the right tradeoff. Routing needs to be fast — 100ms, not 2 seconds. The Responder already has full conversational context. And "what kind of question is this?" is a dramatically simpler task than "what's the answer?" Constraining routing to a fixed enum makes misclassification rare and fallback trivial: unknown domains go to the Knowledge Thinker.

The bridge intercepts the tool call and dispatches the Thinker concurrently so the Responder keeps talking:

```python
case "response.function_call_arguments.done":
    asyncio.create_task(self._handle_tool_call(event))
```

## Production Failure States and Three Guards Against Them

When the Thinker returns a result, you can't just inject it and call `response.create`. Three things can go wrong when handling real users:

**Guard 1: The user interrupted.** While the Thinker was working, the user barged in with a new question. The Thinker's result is stale. You still submit the tool output (the API requires it), but you don't ask the Responder to speak a stale answer.

```python
dispatched_turn_id = self._turn_id  # snapshot before dispatch

# ... thinker runs ...

if self._turn_id != dispatched_turn_id:
    return  # stale — user moved on
```

**Guard 2: The Responder is still talking.** The Realtime API silently drops `response.create` while it's already generating a response — like the "let me check on that" filler. This is the primary cause of the "thinker came back but nothing happened" bug. You have to wait, and you have to serialize all callers:

```python
async with self._response_create_lock:
    await asyncio.wait_for(self._response_done.wait(), timeout=10.0)
```

The lock serializes every `response.create` caller — thinker results, the local VAD commit path, idle nudges, and disconnect goodbyes — because they all compete for the same API constraint.

**Guard 3: The user interrupted during the wait.** After Guard 2 releases, check staleness again. The user could have barged in while you were blocked.

```python
    if self._turn_id != dispatched_turn_id:
        return  # stale after wait

    await self._realtime_ws.send(json.dumps({"type": "response.create"}))
```

Real callers interrupt, change their minds, and don't wait politely for the AI to finish thinking. You need to handle each one to have a system that feels as close to a human conversation as possible.

## Barge-In Handling

When local VAD detects speech onset while the Responder is outputting audio, the bridge does three things:

```python
async def _handle_interrupt(self):
    # 1. Invalidate in-flight thinker tasks
    self._turn_id += 1

    # 2. Cancel the active response
    if self._response_active:
        await self._realtime_ws.send(json.dumps({"type": "response.cancel"}))
        self._response_active = False
        self._response_done.set()

    # 3. Flush queued audio so the speaker stops immediately
    if self.audio_track:
        self.audio_track.output_track.clear()
```

Incrementing `_turn_id` is the key move. Every in-flight thinker task holds a snapshot of the turn ID from when it was dispatched. When it returns, Guard 1 catches the mismatch and discards the result. No stale answers, no race conditions, no complex cancellation logic.

With local VAD, barge-in detection is also local — the backend sees speech onset in the VAD state machine before any audio reaches OpenAI. The interrupt fires faster than server-side detection could.

## Context Is Not Just Conversation History

A caller asking "is a two-bedroom available?" means nothing without property context. "Same unit as last time" means nothing without user context. In production, managing multiple types of structured context beyond raw conversation history is paramount to giving your conversation a personal feel as well as better model performance.

The repo demonstrates this with a typed `UserContext` model persisted in Redis — preferences, memory facts, conversation summaries, and behavioral signals — keyed by browser fingerprint for cross-session persistence:

```python
class UserContext(BaseModel):
    preferences: Preferences       # name, location, temp unit, watched tickers
    memory: MemoryStore            # inferred facts, deduped, capped at 20
    summary: Summary               # rolling LLM-generated conversation summary
    signals: Signals               # topic counts, session count, last active
```

Thinkers return a `ThinkResult` that includes an optional `ContextUpdate` — a class describing what the thinker learned. The router applies updates after the thinker returns:

```python
class ThinkResult(BaseModel):
    response: str
    context_update: ContextUpdate | None = None
```

The Weather Thinker persists the user's location. The Knowledge Thinker picks up on it without being told. Context isn't trapped in a single agent's conversation. It's a shared, typed resource that any thinker can read from and contribute to. When context changes, the Responder's system prompt is updated mid-session via `session.update` so it immediately knows what the thinkers learned.

## What I Learned

**The cost of implementing your own turn detection with a local VAD is well worth it.** The latency improvement isn't incremental — it's the difference between "this feels like talking to a computer" and "this feels like talking to someone." Owning the turn detection pipeline means you control the most latency-sensitive decision in the entire system. If you're building on the Realtime API and not doing local VAD, you're leaving hundreds of milliseconds on the table on every turn.

**The routing decision matters more than the reasoning quality.** A perfectly accurate Thinker routed to the wrong domain produces a wrong answer. A slightly less accurate Thinker routed correctly produces a useful one. Invest in your routing prompt and your domain enum. Simple and strict rules help the dumb realtime model perform routing well. An additional consideration is using a separate LLM call to classify, but with only a handful of potential tool calls, the realtime API can do that just fine.

**Stalling is a prompt engineering problem, not a code problem.** The Realtime API naturally acknowledges the user before executing the tool call. Your system prompt just needs to tell it how. The Research Thinker in the repo simulates a 30-second delay specifically to stress-test this.

**Multi-thinker is worth the complexity.** Independent prompts, independent model tiers, independent caching TTLs, independent testing. The overhead of managing multiple agents is far less than the quality cost of a bloated single-thinker prompt.

**Backend mediation is not optional for production.** Direct browser-to-OpenAI works for demos. The moment you need state, security, observability, local VAD, or telephony support, your backend has to be in the middle. The upfront work will save you time in the long run.

**The three guards make it feel alive.** The "thinker returned but nothing happened" bug (Guard 2) is a frustrating one to try to debug in production and ensures the user isn't left hanging no matter what. The stale-result-after-interrupt bug (Guards 1 and 3) only manifested when callers talked fast and gives them the answer with the fullest context. These are things I wish I had known or discovered without the pain of production issues.

---

The full implementation — local VAD, multi-thinker routing, typed user context, LangSmith observability, Docker deployment, and a 30-second research thinker for stress-testing stalling behavior — is at [github.com/lackmannicholas/responder-thinker](https://github.com/lackmannicholas/responder-thinker). Clone it, run it, talk to it.

*Previously: [Cutting 600ms from Every Voice AI Turn with Local VAD](/writing/local-vad/)*
*Coming next: Adding guardrails and voice quality evals to the Responder-Thinker pattern.*
