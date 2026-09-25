---
title: "Dude, Where's My Response? Cutting 600ms from Every Voice AI Turn with Local VAD"
description: "Replacing OpenAI Realtime API server-side turn detection with local VAD cut perceived latency by 689ms per substantive turn in a controlled 100-turn test over production telephony."
date: 2026-03-21T02:45:02Z
lastmod: 2026-03-21T02:45:02Z
tags: ["latency", "voice-ai", "openai", "websockets"]
draft: false
---

If you're building voice AI on OpenAI's Realtime API, your agent is slower than it needs to be — the main bottleneck is certainly inference but there's additional overhead to cut.

I spent the past week instrumenting a production telephony voice pipeline, measuring where latency actually lives, and testing whether local voice activity detection (VAD) could meaningfully reduce response time. The answer is yes — by **689ms per turn on substantive responses** — and the methodology is cleaner than I expected.

Here's what I found, how I measured it, and why it matters for anyone building conversational AI on the Realtime API.

## The Hidden Latency Tax

When you build a voice agent on OpenAI's Realtime API — whether you're using the OpenAI Agents SDK, a custom WebSocket implementation, or any orchestration framework — the audio pipeline follows the same path:

1. The user speaks, and your telephony provider (Twilio, in my case) streams audio frames to your server
2. Your server forwards every audio frame to OpenAI's Realtime API via WebSocket (`input_audio_buffer.append`)
3. OpenAI's server-side VAD (`semantic_vad`, the default) processes the audio and decides when the user has stopped talking
4. Only after the server-side VAD commits the audio buffer does the LLM begin generating a response
5. The generated audio streams back to your server and out to the caller

The problem is step 3. Every VAD decision requires a network round-trip. The audio has to travel to OpenAI's server, get processed by their turn detection model, and the commit decision happens server-side. Your code doesn't even participate — if you look at the OpenAI Agents SDK source, `input_audio_buffer.speech_stopped` is handled as an informational notification. The server has already committed and started response generation by the time your code hears about it.

This adds an irreducible network latency plus server-side model deliberation time on every single turn. And in a conversational AI system, latency after the user stops speaking is the most perceptible kind — it's the moment they're actively waiting.

## The Approach: Local VAD + Manual Turn Control

The Realtime API supports disabling server-side turn detection entirely. When you set `turn_detection` to `null`, the server stops making autonomous commit decisions, and you take control of when to send `input_audio_buffer.commit` and `response.create`.

This means you can run a VAD model locally on your server, process the same audio frames as they arrive from Twilio — before they're even sent to OpenAI — and commit the turn the moment *you* detect silence. The audio is already on your machine. There's no round-trip to wait for.

I used [TEN VAD](https://huggingface.co/TEN-framework/ten-vad) (by Agora) as the local model, running via ONNX Runtime. More on why TEN VAD below.

## Why Not Just Use Silero?

I evaluated three tiers of VAD before settling on TEN VAD:

**Energy-based VAD** (WebRTC VAD, fast-vad) uses signal processing — energy levels, spectral characteristics, zero-crossing rates — to make binary speech/no-speech decisions. Extremely fast, but can't distinguish speech energy from background noise. WebRTC VAD misses roughly 1 out of every 2 speech frames at a 5% false positive rate. Not viable for production turn detection.

**Silero VAD** is the industry-standard ML-based VAD — an LSTM-based architecture trained on 6,000+ languages, available as an ONNX model. Significantly more accurate than energy-based approaches. But it has a meaningful limitation for conversational AI: it suffers from a multi-hundred-millisecond delay when detecting speech-to-silence transitions. The recurrent architecture needs several silence frames to shift its internal state, which translates directly to turn detection delay.

**TEN VAD** (by Agora) is purpose-built for real-time conversational AI turn detection. Agora has 10+ years of experience in real-time voice infrastructure, and it shows. In my testing, TEN VAD detected speech-to-silence transitions with a median head start of **722ms** over OpenAI's server-side VAD, compared to **342ms** for Silero under the same conditions. It also achieves a 32% lower Real-Time Factor and 86% smaller library footprint than Silero, which matters when you're running VAD alongside everything else in a voice pipeline.

The key advantage for turn detection is transition speed. TEN VAD operates on 16kHz audio with 10ms frame hops, giving it finer temporal resolution than Silero's minimum 32ms chunks. It correctly identifies short silent durations between adjacent speech segments that Silero misses entirely.

## Test Methodology

Measuring this correctly turned out to be the hardest part. The naive approach — comparing "local VAD detected silence at time X" vs "server sent speech_stopped at time Y" — has a fundamental bias: the server's `speech_stopped` event arrives *after* the server has already begun processing, so it makes server-side VAD look artificially fast.

The solution: **use local VAD as a passive timestamp observer in both configurations.** In the server-side VAD test runs, TEN VAD runs locally but doesn't commit or trigger responses — it only records when it detects silence. This gives both configurations the same "true speech end" anchor point.

The test protocol:

- **50 turns per configuration** — local VAD + commit vs server-side `semantic_vad`
- **Scripted test calls** from a cell phone through production Twilio PSTN infrastructure (8kHz µ-law audio)
- **Common measurement anchor**: both configurations measure perceived latency from the true moment speech ends, as detected by the passive local TEN VAD observer
- **Controlled quiet-room environment** to isolate the VAD comparison from acoustic variability
- **Perceived latency** defined as: true speech end → first audio byte emitted to the caller

### Filler Response Segmentation

An important methodological consideration: the LLM non-deterministically generates "filler" responses (e.g., "Let me look that up for you") that respond in under 1 second. Server-side VAD received 44% fillers vs 32% for local VAD in my test runs, which biases the unsegmented comparison. I present results segmented by response type to control for this.

## Results

### Non-Filler Turns (Primary Comparison)

These are substantive AI responses where the LLM performs real inference. LLM latency is closely matched between configurations, isolating the VAD effect.

| Metric | Local VAD | Server VAD | Delta |
|--------|-----------|------------|-------|
| Sample size | 34 turns | 28 turns | |
| **Perceived latency (median)** | **2,412ms** | **3,101ms** | **-689ms** |
| Perceived latency (mean) | 2,396ms | 3,216ms | -820ms |
| LLM latency (median) | 2,183ms | 2,263ms | ~equal |
| Cohen's d | **1.04 (large)** | | |
| Significance | **p < 0.001** | t = 3.93 | |

**22% reduction in perceived latency** with closely matched LLM latency, confirming the improvement is attributable to the VAD change, not LLM variance.

### Filler Turns (Cleanest Proof of VAD Effect)

Filler turns provide the cleanest isolation because LLM latency is virtually identical — the entire improvement is pure VAD overhead.

| Metric | Local VAD | Server VAD | Delta |
|--------|-----------|------------|-------|
| Sample size | 16 turns | 22 turns | |
| **Perceived latency (median)** | **679ms** | **1,134ms** | **-454ms** |
| LLM latency (mean) | 519ms | 517ms | ~equal |
| Cohen's d | **1.74 (very large)** | | |
| Significance | **p < 0.001** | t = 5.81 | |

**40% reduction.** With LLM latency at 519ms vs 517ms (effectively identical), the entire 454ms improvement is pure VAD overhead eliminated. This is the irreducible cost of server-side turn detection made visible.

### Response Time Distribution

The distribution shift tells the most compelling story:

| Threshold | Local VAD | Server VAD |
|-----------|-----------|------------|
| Under 1 second | **28%** | 4% |
| Under 1.5 seconds | 42% | 36% |
| Under 2.5 seconds | **78%** | 54% |
| Under 3 seconds | **92%** | 70% |

**28% of local VAD turns respond in under 1 second vs essentially 0% for server-side VAD.** Sub-second response time is a qualitatively different user experience — it's the difference between a conversation that feels like talking to a person versus waiting for a system.

Over a 10-turn call, the cumulative improvement is approximately **5–7 seconds**.

## How to Implement This

The Realtime API makes this straightforward. The key is setting `turn_detection` to `null` in your session configuration, which puts you in manual turn control mode:

```python
# Disable server-side VAD
session_update = {
    "type": "session.update",
    "session": {
        "type": "realtime",
        "audio": {
            "input": {
                "turn_detection": None  # Manual turn control
            }
        }
    }
}
await websocket.send(json.dumps(session_update))

# When your local VAD detects end of speech:
await websocket.send(json.dumps({
    "type": "input_audio_buffer.commit"
}))
await websocket.send(json.dumps({
    "type": "response.create",
    "response": {"output_modalities": ["audio"]}
}))
```

If you're using the OpenAI Agents SDK (Python), the same mechanism works through the session's manual turn control:

```python
await session.send_audio(audio_bytes, commit=True)
```

The approach works identically regardless of your orchestration framework — it's all the same Realtime API WebSocket protocol underneath.

For the local VAD model, [TEN VAD](https://github.com/TEN-framework/ten-vad) is available on Hugging Face with ONNX weights and Python bindings. [Silero VAD](https://github.com/snakers4/silero-vad) is the more established alternative if you want a simpler setup, though you'll see slower transition detection.

## What's Next: Speculative Response Generation

With local VAD handling turn detection, the remaining bottleneck is LLM inference (~2.2s median on non-filler turns). The next optimization I'm exploring is **speculative response generation** — using the local VAD's early silence detection to trigger LLM inference *before* we're fully certain the user has finished speaking. This allows for super tight local VAD configuration that wouldn't fly in production without OpenAI's server-side VAD confirmation. 

The generated audio would be buffered rather than played immediately. If the user continues speaking, we discard the speculative response. If they're done, the response is already generated and plays almost instantly.

The Realtime API supports a hybrid configuration for this: set `turn_detection.create_response = false` and `turn_detection.interrupt_response = false`. This keeps semantic_vad running as a signal while leaving response timing under your control — the best of both worlds.

Early prototyping suggests this could save an additional 200–300ms, potentially bringing total response latency consistently under 2 seconds. But the edge cases are real — still working through the interplay between local VAD and OpenAI's server-side VAD.

## Methodology Details

For those who want to reproduce this or poke holes in it:

**Perceived latency** is defined as the interval from true speech end (local TEN VAD detection) to first audio byte emitted to the telephony provider. Both configurations are measured from the same anchor point — this eliminates the measurement bias inherent in using the server's `speech_stopped` event.

**Commit latency** (local VAD mode only): true speech end → server acknowledgment of `input_audio_buffer.committed`. Median 122ms — this is the WebSocket round-trip overhead that local VAD adds. A small price for a large gain.

**LLM latency**: server commit acknowledgment → first audio delta from OpenAI. This is the model inference time, independent of VAD choice.

**Filler segmentation threshold**: LLM latency < 1000ms. Filler responses are non-deterministic LLM behavior (e.g., "Let me find that for you") and are not controllable by VAD configuration.

**Statistical tests**: Welch's two-sample t-test (unequal variances), Cohen's d for effect size. All p-values are two-tailed.

**Environment**: Controlled quiet-room conditions. Scripted test calls from cell phone through production Twilio PSTN infrastructure (8kHz µ-law, ~20ms frames). Test dates: March 20–21, 2026.

---

*I build real-time AI voice systems — telephony pipelines, streaming audio, LLM orchestration. If you're working on similar problems, I'd love to hear what latency challenges you're seeing. Reach out on [LinkedIn](https://www.linkedin.com/in/lackmannicholas).*
