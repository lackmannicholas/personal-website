---
title: "Your Voice Agent Passed Every Eval. The Caller Hung Up."
description: "Why transcripts miss voice AI failures, and how to evaluate acoustic quality, conversational timing, and human experience without a labeling army."
date: 2026-10-08
lastmod: 2026-10-08
tags: ["voice-ai", "evals", "architecture"]
draft: true
---

Your voice agent passed every eval you have. The transcript looks perfect. The tool calls all fired. And the caller hung up on it.

I've spent two years building production voice AI, and this is the failure that took me longest to get a handle on — not because it's rare, but because our entire evaluation stack was structurally incapable of seeing it.

The transcript said the agent handled the call. What actually happened was four seconds of dead air, a robotic monotone, and the agent talking over the caller mid-sentence. None of that is in the transcript. None of it could be.

This post is about why evaluating voice is a fundamentally different problem than evaluating text, what you can actually do about it without a labeling army, and why the same problem is waiting for anyone building video, robotics, or anything else where the output is something a human experiences rather than reads.

The reference implementation is open source: [voice-evals](https://github.com/lackmannicholas/voice-evals).

## The transcript is a lossy projection

Here's the core of it. When you evaluate a voice agent on its transcript, you're evaluating a projection of the thing your caller actually heard — and the projection destroys exactly the information you need.

Consider the line "Sure, I can help with that."

That string is character-identical whether the agent said it warmly or in a flat robotic monotone. Whether it came back in 400ms or after four seconds of silence. Whether it was spoken cleanly or over the top of the caller, who was still mid-sentence. Whether it was clipped by a codec into something that sounds like a drive-thru speaker.

Four completely different caller experiences. One identical transcript. Every text-based eval scores all four the same.

![One transcript, four caller experiences: a warm, prompt response; four seconds of dead air; talking over the caller; and robotic, clipped audio. All four pass transcript evaluation, but only the first keeps the caller satisfied.](/images/writing/one-transcript-four-experiences.png)

And it gets worse in the exact case that matters most. Our number one production failure mode is the agent freezing — background noise jams its turn detection, it can't tell the caller stopped speaking, and it just sits there. Silent. The caller says "hello? …hello?" and hangs up.

What does that failure look like in a transcript? Nothing. It's an absence. There's no bad output to flag, no wrong answer to catch, no hallucination to grade. The worst thing your agent does is invisible to the tooling everyone uses to check whether it's working.

That's the shape of the problem: the failure is perceptual, not logical.

## No reference, no labeling army

The obvious response is: fine, evaluate the audio then. Which runs directly into the second wall.

For text, you can usually construct a reference. Expected output, golden answer, rubric with a right answer behind it. For audio there is no correct waveform. There's no "here's what this response should have sounded like" to diff against. Two takes of the same sentence, both perfectly good, are completely different at the byte level.

So the instinct is to label. Get humans to rate clips, build a labeled corpus, train or validate against it.

I tried this. We wanted a labeled clip corpus to tune turn detection, and it died — not from lack of will, but from labeling overhead. Every clip needs a human to listen to it in real time. You can't skim audio the way you skim text. A thousand clips at thirty seconds each is over eight hours of somebody's undivided attention, and you need that again every time the model, the voice, or the pipeline changes.

That failure taught me the real constraint: when supervision is structurally unavailable, the eval strategy has to change shape. Not try harder. Change shape.

The unlock was going fully reference-free. Every scorer in the pipeline had to answer "how does this sound / behave" without anything to compare against. No golden set, no labels, no per-clip ground truth. That one constraint made the whole thing tractable, and it's the single most important design decision in the framework.

## Timing is part of the output

The third thing that makes voice different is the one I see people miss most often, including experienced engineers.

In a text system, latency is a UX property that sits outside the output. The response is the response; how long it took is a separate concern you track on a separate dashboard.

In voice, timing is part of the output. A two-second gap isn't slow delivery of a good answer — the gap is what the caller experienced. It's what made them think the agent died. It's what made them repeat themselves. It's what made them hang up before the answer ever arrived.

You cannot separate the what from the when. An answer that arrives late is a different answer.

This has a direct consequence for how you build the eval: some things must be measured deterministically from instrumentation, not judged from the artifact. Which brings me to the part I did not expect.

## A judge perceives artifacts. Users have experiences.

Modern native-audio models can listen to a call and grade it. That's genuinely useful — it catches prosody, tone, whether the agent sounded like it cared when the caller was angry. Things no signal-processing metric will ever get.

But here's what I found, and it's the most important thing in this post:

An audio model does not experience duration.

It processes a recording as an artifact. It can rate responsiveness a confident 5 out of 5 on a call containing twenty seconds of dead air, because it never sat through those twenty seconds. It saw a gap in a waveform. You and I experienced an eternity of silence wondering if the line dropped.

That's not a prompt engineering problem. You can't rubric your way out of it. It's a structural property of how the judge relates to the artifact:

A judge perceives artifacts. Users have experiences.

Which is why the framework has a deterministic layer that owns everything the judge structurally cannot perceive — latency, stall rate, barge-in timing — measured from event logs and audio, never from the judge's opinion. The judge is explicitly forbidden from gating responsiveness.

I'd generalize this beyond audio: any time you use a model as a judge, ask what your users experience that the model merely observes. That gap is where your judge will confidently lie to you.

## From vibe checks to repeatable comparisons

Here's where this stopped being an interesting problem and became an urgent one.

We knew our voice agent wasn't good enough. The outcomes were fine — calls resolved, tools fired, nothing was wrong — but it didn't feel good, and everyone could hear it. So we did the reasonable thing and started evaluating other providers: Grok, Vapi, Gemini, a couple of our own POCs.

Every one of those discussions ended the same way. Someone would listen to a few calls and say: "I think this one feels better."

And that was the entire basis for a decision that would shape the product for a year. Not because anyone was lazy — because we had no way to compare. Which one was actually better? Better at what? Where did each one fail, and did they fail in the same places? "Feels better" was all we had, and "feels better" is unfalsifiable, unrepeatable, and changes depending on which three calls you happened to listen to.

That's the moment I understood that the eval problem wasn't academic. Without a way to measure, every provider decision is a vibe check with a budget attached.

So I built the framework below and ran every candidate through the same gauntlet: the same scenarios, the same noisy callers, the same interruptions, scored on the same instruments. It wasn't the only input into the decision — cost, integration effort, and vendor risk all mattered — but for the first time the conversation had data in it. We could say "this one stalls under background noise and that one doesn't" instead of "I like this one." We could point at the failure modes of each. The decision got made on information instead of impressions.

That's the actual value of a voice eval framework. Not a score. A shared, repeatable basis for arguing about which one is better.

## Three layers, three kinds of evidence

The framework that came out of this splits into three layers, deliberately separated by what kind of question each one can honestly answer.

Layer A — Acoustic quality. Did it sound good? Reference-free MOS predictors (DNSMOS, NISQA, UTMOS, SQUIM) score perceptual audio quality with no reference and no labels. These catch robotic synthesis, artifacts, dropouts, codec damage. Runs locally, no network, no API key, free.

Layer B — Conversational dynamics. Did it behave right? Latency percentiles, stall rate, longest silence, barge-in success rate and stop-latency, turn-taking rhythm, talk-ratio. Deterministic, computed from event logs where available and VAD where not. This is the layer that catches the freezing failure — the one the transcript can't see. Also local and free.

Layer C — Audio LLM-as-judge. Did it sound human? A native-audio model scores naturalness, prosody, pace, emotional alignment, frustration handling, and conversational flow — on the audio itself, not a transcript. Costs a few cents per call, and it's the only layer that needs a key.

The layering isn't organizational tidiness. Each layer exists because the others are structurally blind to something. Layer A can't tell you the agent froze — silence is acoustically pristine. Layer B can't tell you the agent sounded like a robot. Layer C can't tell you how long anything took. Any one of them alone gives you a confidently wrong picture.

And the human labeling that killed the earlier attempt? It survives in exactly one place: a small optional calibration set — thirty to fifty clips — used once, not to train anything, but to check whether the judge agrees with humans before you let it gate anything. Measured with weighted Cohen's kappa. If a dimension doesn't clear the bar, it's advisory, not a gate. Labeling as validation, not as fuel.

## The same problem beyond voice

Here's why I think this matters beyond voice.

The thing that makes voice hard to evaluate isn't sound. It's a structural property that voice happens to have, and it belongs to a whole class of systems:

- The output is continuous and time-extended, not discrete.
- It's experienced, not read — perceived in real time by a human.
- Failure is perceptual, not logical. Nothing is factually wrong. It just felt bad.
- There's no reference to compare against. No correct waveform, no correct trajectory.

Anything with that shape has this problem. Video generation: temporal coherence, flicker, physically implausible motion — no ground truth frame to diff. Robotics: was the motion smooth, did it hesitate, was it legible to the human standing next to it — none of which is captured by "did it complete the task." Autonomous vehicles: ride comfort as distinct from ride safety; the jerky-but-technically-safe stop that makes passengers never use the service again. Embedded and real-time control, animation, music generation, haptics.

And the three-layer pattern transfers directly, because it's not really about audio either:

1. Signal-level, reference-free perceptual metrics — the domain's equivalent of MOS. Smoothness and jerk for robotics; temporal consistency for video.
2. Deterministic temporal metrics from instrumentation — the things the judge can't perceive. Reaction time, hesitation, timing against deadlines, all read from telemetry rather than the artifact.
3. A native-modality model as judge — a VLM watching the robot or the generated video, doing what MOS can't: rating whether it looked natural, comfortable, safe, human.

Same skeleton. Different sensors.

If you're building in any of these areas and your eval strategy is "check the output was correct," you're in the same position I was: passing every test you have while your users quietly leave.

## Next: manufacture the failures

There's a piece I've deliberately left out of this post, because it's a second thesis and deserves its own: you can't wait around for bad calls to happen. Sampling production for failures is slow, unrepresentative, and gets slower the better your agent gets.

So the framework also manufactures them — a persona caller-bot that places real phone calls to the agent, plays difficult callers, interrupts mid-sentence, and pipes intelligible café babble onto the line to jam its endpointing. Not a load test. An emotional stress test. That's the next post.

The framework is at [github.com/lackmannicholas/voice-evals](https://github.com/lackmannicholas/voice-evals): three layers, reference-free, Layers A and B run with no API key and no network.

If you take one thing from this: your evals are not measuring what your users experienced. Go find out how far apart those two things are.

Part of a series on building production voice AI. Previously: [Local VAD](https://nicklackman.com/writing/local-vad/) · [Responder-Thinker](https://nicklackman.com/writing/responder-thinker/) · [WebRTC vs WebSockets](https://nicklackman.com/writing/websockets-vs-webrtc/) · [Python Is Lying to You](https://nicklackman.com/writing/python-is-lying-to-you/) · [The Audio Gateway](https://nicklackman.com/writing/the-audio-gateway/).
