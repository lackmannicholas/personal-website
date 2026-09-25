---
title: "I Tested Our WebSocket Audio Pipeline with WebRTC. Here's Why I Switched It Back."
description: "A production proof-of-concept comparing WebSocket and WebRTC transport for PSTN voice AI: same latency, same audio quality, and why the boring pipeline won."
date: 2026-03-11T04:01:01Z
lastmod: 2026-03-11T04:01:01Z
tags: ["webrtc", "websockets", "voice-ai", "telephony"]
draft: false
---

There's a prevailing assumption in the voice AI space that WebRTC is inherently better than WebSockets for real-time audio. Better latency, better quality, better everything. I built a full proof-of-concept to test that assumption on an enterprise scale production AI voice system.

I found a few things surprising.

## The Setup

Our system takes inbound phone calls, pipes the audio through an AI agent (OpenAI Realtime API), and sends the response back to the caller. The current architecture uses Twilio Programmable Voice with WebSocket media streams — G.711 μ-law audio at 8kHz using WebSocket protocol.

The hypothesis was straightforward: replace the WebSocket media path with WebRTC via LiveKit, and we'd get lower latency (UDP instead of TCP, no WebSocket framing overhead) and better audio quality (Opus codec at 48kHz instead of G.711 at 8kHz).

I built the full integration — LiveKit Cloud as the media server, Twilio Elastic SIP Trunking for the PSTN connection, a transport abstraction layer so both paths could run side by side, and a real-time audio pacer to handle frame timing. The key here was adding this new transport path without changing any of the LLM orchestration or Agent configuration and tools. It should work the exact same as production with the exception of using Livekit/SIP/WebRTC rather than Twilio/ProgrammableVoice/Websockets.

Measuring the delta was necessary to take any meaningful insights from this proof-of-concept.

## The Latency Result

Median response latency (time from when the caller stops speaking to when the AI starts responding):

**WebSocket path: ~1,920ms
WebRTC path: ~2,060ms**

Essentially identical. The theoretical 50–150ms savings from eliminating WebSocket overhead is real, but invisible against 2+ seconds of LLM response time. The transport layer accounts for less than 5% of total conversational latency. The bottleneck is the model, not the pipe. The thing I found interesting about this is the conversation around websockets vs WebRTC for real-time AI. "WebRTC is always better" is the general consensus. While WebRTC is the superior transport mechanism for real-time communications - literally in the name, the efficiency benefits are hard to see when model inference is 500ms-4s. 

## The Audio Quality Result

Both paths delivered the same audio quality — because both paths carry the same audio. When a caller dials from a phone, the audio enters the PSTN as G.711 μ-law at 8kHz. That's a hard ceiling imposed by the telephone network. It doesn't matter whether those bytes travel over a WebSocket or a WebRTC connection; the frequency content is identical. You can't recover information that was never captured at the source. Said a different way, you can go from low quality audio encoding to high quality audio encoding and expect a better sounding output. 

### Spectral Analysis

![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/l3z2wnzo225n7nni7ss7.png)

## The Surprise: WebRTC Sounded Worse at First

The initial WebRTC implementation actually sounded worse than WebSocket — choppy audio, dropped words, audible artifacts. It took real debugging to figure out why.

WebRTC's jitter buffer is designed for network jitter. It smoothing out packets that arrive with variable timing from a remote peer over UDP. It is not designed to handle an application dumping large bursts of AI-generated audio into the WebRTC stack all at once.

When the LLM generates a response, the audio arrives in variable-sized chunks — sometimes 50ms of audio, sometimes 500ms, delivered as fast as the model can produce it. The OpenAI Realtime API delivers fairly consistent audio chunks, but it's not exact and not in the way that is expected for PSTN. Our WebSocket implementation had a strict real-time pacer that metered these chunks out at exactly one frame per 20ms with prebuffering and underrun detection. Without that same pacer on the WebRTC path, the audio sounded terrible.

The fix was porting the same pacer architecture to the WebRTC path. Once both paths had identical frame-level timing discipline, the audio quality matched. The lesson: application-level pacing of AI-generated audio is your responsibility regardless of transport. WebRTC handles network timing, not application timing.

## Where WebRTC Actually Wins

I also tested a WebRTC-native path with no PSTN involved — a browser client connecting directly to the AI agent via LiveKit with Opus at 24kHz. The difference was dramatic:

- 99% audio bandwidth: 8,438 Hz (vs. ~3,969 Hz for PSTN paths)
- 2x+ frequency content — you can hear breathiness, sibilants, natural voice texture
- Fewest signal artifacts of all three paths
- Same latency as the other paths (still LLM-bound)

WebRTC is transformatively better when the caller isn't on a phone. The technology delivers on its promise — just not for PSTN calls.

## The Takeaway

The right question isn't "should we use WebRTC?" It's "where is the bottleneck?" For PSTN-based AI voice calls today, the telephone network limits quality, and the LLM limits speed. Changing the transport layer between those two bottlenecks doesn't move the needle.

WebRTC becomes the right answer when one of these changes: callers move to VoIP/browser/app clients (removing the PSTN quality ceiling), LLM response times drop by an order of magnitude (making transport latency a meaningful fraction of total latency), or wideband codecs become available end-to-end on SIP trunks.

While WebRTC is the de facto real-time communication protocol, we have millions of phone numbers and deeply ingrained Twilio Programmable Voice integrations. Switching would mean setting up new infrastructure, changing the call routing logic, additional overhead of managing a media server ourselves or paying for a cloud service like livekit. SIP/WebRTC needed to be a significant improvement over Twilio/Websockets to justify the migration, and it was about the same.

If you are already deeply integrated with Twilio and their Programmable Voice, the boring WebSocket pipeline with a well-tuned audio pacer is the right architecture. Sometimes the best engineering decision is knowing when not to ship.
