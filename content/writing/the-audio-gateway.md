---
title: "The Audio Gateway: The Production Pattern for Real-Time Voice AI"
description: "Split voice AI into a media plane that owns the real-time audio path and a business plane that owns meaning, joined by a small typed gRPC contract."
date: 2026-07-16T22:30:48Z
lastmod: 2026-07-16T22:30:48Z
tags: ["architecture", "voice-ai", "python"]
draft: false
---

If your voice agent stutters under load, talks over callers, or freezes mid-sentence while a tool call runs — the fix probably isn't a better model. It's an architectural split.

In my last post, [Python Is Lying to You](/writing/python-is-lying-to-you/), I walked through every way Python's async model quietly sabotages a real-time audio pipeline: the async-looking guardrail that froze the event loop, the logger doing blocking I/O on every frame, GIL contention that looks exactly like network jitter. The fixes worked. But they are all *defensive*. Move this off the hot path. Offload that to a thread. Audit every innocent-looking call. You're playing whack-a-mole against your own process.

There's a point where defense stops scaling. The real fix isn't defending the hot path inside one process; it's removing everything else from the process entirely.

This post is about that architecture: an **audio gateway** that owns the media hot path, a **business plane** that owns everything else, and a small gRPC contract between them. It's the pattern we're building right now and has been utilized across the realtime voice industry. I've built a full, runnable, open-source reference implementation you can clone and watch work, no API key required - but OpenAI key strongly suggested: [ai-audio-gateway](https://github.com/lackmannicholas/ai-audio-gateway).

## Two workloads that should never have shared a process

A voice AI system contains two workloads with opposite requirements:

The **audio path** is hard real time. A 20ms frame every 20ms, forever, or the caller hears a glitch. It can't retry, can't batch, can't hide latency behind a spinner. Its scheduling requirements are measured in single-digit milliseconds.

**Reasoning** is the opposite. Slow, bursty, variable. An LLM call might take 500ms or five seconds. A tool call hits a database, an internal API, another service. Multi-step agent loops fan out unpredictably. This work is, by nature, slow. At least until we can do deep reasoning at lightning speed, but we're not there yet.

Put both in one process and the slow thing janks the fast thing. Every bug in my previous post is a specific instance of this one collision: CPU-bound guardrail work starving the event loop, an LLM SDK blocking at the wrong moment, a checkpoint write landing mid-frame. You can fix each instance individually running on process, or you can partition them by their workload characteristics.

The production answer is to split the system into two planes:

- A **media plane** — the audio gateway — that owns hard real-time work: telephony or WebRTC audio I/O, VAD, playback pacing, barge-in, codec handling.
- A **business plane** that owns meaning: prompts, tools, orchestration, multi-step reasoning, data access.

Between them, a bidirectional gRPC stream carrying a small, typed contract.

![Two Planes](https://media2.dev.to/dynamic/image/width=800%2Cheight=%2Cfit=scale-down%2Cgravity=auto%2Cformat=auto/https%3A%2F%2Fdev-to-uploads.s3.us-east-2.amazonaws.com%2Fuploads%2Farticles%2Fx55jxblflx2ogmt1m5vj.png)

One rule governs the whole design: **audio timing never waits on business work.** The business plane can delay a tool result. It cannot block barge-in, response cancellation, VAD, or an outbound audio frame. Everything else in this post is a consequence of that rule.

## You don't have to take my word for it

This split is what the serious voice AI shops converge on, independently, because production pushes everyone to the same place.

[LiveKit](https://docs.livekit.io/agents/) — the infrastructure OpenAI used to ship ChatGPT's Advanced Voice Mode, now serving billions of calls a year — is the cleanest example. Their media server is an SFU that forwards audio packets without ever decoding them; agents run as entirely separate processes that join a room like any other participant. Their own framing: media transport and AI inference are independent layers. LiveKit stays deliberately dumb about meaning; everything related to understanding, reasoning, or storage lives outside the media layer.

[Vapi](https://docs.vapi.ai/quickstart) describes itself, verbatim, as "an orchestration layer" — and their data-flow documentation draws exactly this boundary: endpointing, interruption detection, and backchanneling run exclusively on Vapi's infrastructure, while your custom LLM and tools run on *your* servers, reached by webhook. Vapi is, functionally, a media/orchestration plane sold as a service, with your server URL as the business plane.

[Pipecat](https://docs.pipecat.ai/) (Daily's open-source framework) is built on the same separation — transports on one side, frame processors on the other.

And the deepest precedent predates all of them: telephony has separated signaling from media since SIP existed. The industry keeps rediscovering this split because real-time media and application logic have never belonged in the same process. The pattern isn't novel. That's the point: it's convergent. What this post adds is what the boundary looks like when the thing behind it is an *agent*: how tools, reasoning, and interruption coordination cross the wire.

## The contract: two enums you can read in a minute

There's no `.proto` in the reference implementation. The wire format is Pydantic envelopes serialized as JSON over a gRPC `stream_stream` with identity serializers. This gives you HTTP/2 multiplexing and bidirectional streaming, with a payload you can log and read. For an example repo, that's perfect to demonstrate the concept.

Two enums are the contract:

```python
class GatewayEventType(str, enum.Enum):
    """Gateway -> Business. Things that *happened* in the media plane."""
    CALL_STARTED = "call.started"
    USER_SPEECH_STARTED = "user.speech_started"
    USER_SPEECH_STOPPED = "user.speech_stopped"
    TOOL_CALL_REQUESTED = "tool_call.requested"
    BARGE_IN = "barge_in"
    RESPONSE_DONE = "response.done"
    # ...

class GatewayCommandType(str, enum.Enum):
    """Business -> Gateway. Things the business plane asks the media plane to do."""
    SESSION_CONFIGURE = "session.configure"
    TOOL_CALL_OUTPUT = "tool_call.output"
    RESPONSE_CREATE = "response.create"
    RESPONSE_CANCEL = "response.cancel"
    # ...
```

Events are past tense where the media plane owns reality and reports it. Commands are imperative where the business plane owns meaning and directs the media plane through a small vocabulary. When the vocabulary is this small, the boundary stays legible; when a new capability doesn't fit either enum cleanly, that's usually a sign it's on the wrong side of the wire.

## Hollow proxy tools: the schema crosses, the behavior doesn't

The realtime model needs tools. The tools need databases, internal APIs, and business logic. None of which belongs on the audio hot path. The mechanism that reconciles this is the piece of the architecture I like most.

A tool has two halves that usually live together: a *schema* (name, description, JSON parameters. The stuff the model needs to decide to call it) and an *implementation* (the code that does the work). This architecture splits them across the wire.

At call setup, the business plane sends the gateway a list of tool specs — schema only, no behavior:

```python
class ToolSpec(BaseModel):
    name: str
    description: str
    params_json_schema: dict[str, Any]
    strict_json_schema: bool = True
    # Note what's absent: invoke().
```

The gateway builds one **proxy** per spec: an object the realtime model can call, whose entire body is "relay this call across the wire and await the result."

```python
async def _relay_tool_call(self, name: str, arguments: dict) -> Any:
    tool_call_id = "tc_" + uuid.uuid4().hex[:10]
    fut = asyncio.get_running_loop().create_future()
    self._pending[tool_call_id] = fut          # correlate by id

    await self._send_event(GatewayEvent(
        type=GatewayEventType.TOOL_CALL_REQUESTED,
        payload={"name": name, "tool_call_id": tool_call_id,
                 "arguments_json": json.dumps(arguments),
                 "turn_id": self._turn_id},    # more on this below
    ))
    return await fut                            # resolved by the read loop
```

The model believes it has local tools. It calls them the way it natively wants to — no special-casing. But strip the business plane away and the proxies relay to nothing. The gateway holds *shapes*, not behavior.

## The proof: two agents, one gateway, zero gateway changes

The reference repo ships two agents against the identical gateway, because the directory listing alone makes the argument:

The **single agent** exposes the four café tools (`get_menu`, `place_order`, ...) directly. The gateway builds four proxies. Every tool call crosses the wire. Flat.

The **responder–thinker agent** exposes *one* tool: the thinker. The gateway builds a single proxy. When the model calls it, one envelope crosses the wire, and then the thinker — a hand-rolled agent loop running in the business plane — fans out into its own tool calls: `get_menu`, validate, `place_order`. None of those nested calls cross back. The gateway sees one envelope out and one envelope back; behind it, a whole tree executed that the gateway is blind to.

![Two Agents](https://media2.dev.to/dynamic/image/width=800%2Cheight=%2Cfit=scale-down%2Cgravity=auto%2Cformat=auto/https%3A%2F%2Fdev-to-uploads.s3.us-east-2.amazonaws.com%2Fuploads%2Farticles%2Fuacxwpv4s40a4xt3fb5b.png)

That blindness into tool execution is the entire point of where the boundary sits. The media plane relays shapes; whether resolving a request takes one round trip or a dozen nested calls is the business plane's business. This is also why the architecture survived swapping agent patterns without a gateway deploy.

If you've read my [Responder-Thinker post](/writing/responder-thinker/), this is that pattern, now with the plane boundary drawn through it: the responder lives with the realtime model behind the gateway, and the thinker's entire fan-out is invisible to the media plane.

## Barge-in and turn staleness: coordinating two processes with one integer

This is one of the more difficult pieces of a natural sounding conversation. When the caller interrupts, two things have to happen fast: the assistant must stop talking, and any reasoning already in flight for the old turn must not come back and speak over the new one.

The first problem lives entirely in the gateway. The gateway paces assistant audio out at real time even though the model streams it much faster, which means the outbound queue *is* the backlog of not-yet-heard speech. Barge-in clears that queue instantly. It also has to fire while audio is still draining, not just while the model is generating, because a fast model finishes generating long before the caller finishes hearing. In OpenAI mode the gateway additionally cancels the response, drops in-flight deltas from the cancelled response, and truncates the model's conversation item to roughly what was actually played so the next turn isn't grounded in words the caller never heard.

The second problem crosses the wire, and the mechanism is small but impactful. The gateway owns a `turn_id` that increments on every barge-in. That integer rides on every `tool_call.requested` frame. The business plane mirrors it, snapshots it before slow work, and checks it after:

```python
# In the thinker's loop, between every step:
if is_stale(snapshot_turn_id):
    return {"stale": True}   # abandon; don't speak over a moved conversation
```

Two processes. No shared memory. Coordinating real-time state through one integer on the wire.

(If that mechanism feels familiar, it's a degenerate [Lamport clock](https://en.wikipedia.org/wiki/Lamport_timestamp). A monotonic counter establishing happened-before across processes is one of the oldest tools in distributed systems, and it's a good reminder that a well-placed integer often beats a clever protocol.)

In the reference implementation this is threaded through a `ToolContext` handed to *every* tool invocation with call id, turn id, a live `is_stale()` and the thinker passes the same context down into its nested calls. A barge-in detected three levels deep into the fan-out abandons the whole tree.

### The bug that proved the point

While building the reference implementation, I hit a bug. It's the same lesson as the entire previous article, recurring one layer up.

My first business-plane handler processed inbound events sequentially — one `async for` loop, handle each event, move on. Tool calls were awaited inline, looks clean, and totally broken: while the handler awaited a slow thinker run, it couldn't receive the `barge_in` event. The staleness check could never fire because the message that creates staleness was stuck behind the work it needed to invalidate.

The fix was to run tool execution as concurrent tasks so the event pump never blocks. Which is, of course, "don't block the loop" except this time the loop being blocked was a gRPC stream handler instead of an audio callback. The failure mode follows you across process boundaries. I know this seemed like you almost didn't need to care about async discipline in your business plane, but the discipline is still needed. Just isolated to a few distinct places rather than the entire process.

## Endpointing: one clock, one authority

A component of barge-in. Deciding *when the caller stopped talking* is where responsiveness is won or lost, and the operating rule is that exactly one component owns that decision.

In the reference implementation, the preferred authority is local VAD in the gateway (TEN VAD – the same local-VAD approach I benchmarked in [an earlier post](/writing/local-vad/), worth roughly 600ms per turn against OpenAI server-side semantic VAD). When local VAD is active, the gateway disables the realtime provider's server-side turn detection entirely; its own VAD commits the audio buffer and requests the response. Run both authorities at once and every utterance triggers duplicate responses. Just fyi, you don't want to do that.

The critical tuning knob in the whole system lives here: the hangover. No, not your post-weekend headache or the movie. It's how much trailing silence must accumulate before the utterance is committed. It's a hard floor on response latency, and it's the parameter that background noise attacks: noise holds the gate open and the agent appears to stall. To make it measurable rather than vibes-based, the gateway emits a `turn_latency` event per turn (utterance commit → first assistant audio). If you take one operational idea from this post, it's that metric: latency per turn, measured at the boundary you control.

## "But what if one good model makes all this obsolete?"

This is the most compelling objection I've heard that makes me question the validity of this approach. Speech-to-speech models are getting dramatically better. If one model can eventually handle the conversation *and* the reasoning then there's no need for a responder-thinker split, and no separate text-model calls. Doesn't this whole gateway become overhead?

The objection has two claims. Let's review each.

Claim one: a capable-enough audio model collapses the responder-thinker pattern into one model. Plausibly true, eventually (likely already here with duplex architectures. See [https://openai.com/index/introducing-gpt-live/](https://openai.com/index/introducing-gpt-live/), and [https://docs.x.ai/developers/model-capabilities/audio/voice-agent](https://docs.x.ai/developers/model-capabilities/audio/voice-agent)). That's the direction the frontier is moving and the multi-model *pattern* may well be transitional.

Claim two: therefore you don't need the gateway. This doesn't follow, because the gateway and the agent pattern solve different problems at different layers. The gateway is about *where audio is processed*; the agent pattern is about *how many models reason behind it*. Collapse the brain count to one, and you still have: telephony or WebRTC I/O, jitter buffering, pacing, VAD and endpointing, barge-in and queue-clearing, codec handling, reconnection, and tool execution, which still needs databases and internal APIs that don't belong in the media plane. The proxy relay is completely indifferent to how many models sit behind it. One model calling tools through hollow proxies is the same architecture as two.

And there's a second argument that consolidation actually *strengthens*: betting your entire audio experience on a single external model means you want an abstraction layer more, not less. **The gateway is what lets you swap providers, fall back during an outage, or A/B a new model without touching business logic.** The two-agents-one-gateway demo is exactly this. We changed the entire reasoning topology based on a configuration parameter passed in by the UI and the gateway didn't change. The layer that survives your architectural bets is the layer worth building.

Keep the agent patterns as ever changing and the hard physical realities as an invariant. They're independent decisions, and conflating them is how you end up rebuilding the coupling we've just escaped.

## Where MCP fits

If your organization is moving tools to MCP servers the question becomes: who holds the MCP connections?

Two options:

You can hand MCP server configs to the gateway and let the media plane connect directly. This has the fewest hops, but now the process with 20ms deadlines owns tool-infrastructure connections, auth, and failure handling. We just added non-realtime concerns to our realtime voice gateway. The exact coupling this architecture exists to prevent, and you lose the policy/observability control point.

You can treat the business plane as a passthrough proxy to MCP (works, but framing it as "an extra proxy" invites the why-not-go-direct objection). Rephrased slightly: **business plane is the MCP host**: it owns the MCP client connections, aggregates tools across servers, and presents one unified toolset. The gateway never learns MCP exists. The proxies relay to the agent service exactly as before; whether the tool behind the interface is a local function or an MCP call is an implementation detail of the meaning plane.

The clean test of the boundary: we could swap the entire tool layer from local functions to MCP servers, and the gateway contract wouldn't move an inch. When a tool-strategy migration doesn't touch your media plane, the planes are actually decoupled.

**The same fork exists even if you never build a gateway.** Blackbox voice providers offer both topologies, and which one you configure determines who holds your credentials. Vapi's server-URL model inverts the auth: when the model calls a tool, *Vapi calls your server* — authenticating to you with an API key or OAuth2 client credentials that your endpoint validates. Your plane stays the host; your internal secrets never leave. Their native MCP client is the other topology: you hand Vapi your MCP server URL — which their own docs say to treat as a credential — and Vapi connects at call start, discovers your tools, injects the schemas into the model, and invokes your MCP server directly on every tool call. That's the vendor's plane becoming your MCP host, with a credentialed doorway into your tool infrastructure. Neither is wrong; but the decision framework above applies to buy exactly as much as build. That decision shouldn't be made by accident.

## What else lives in the business plane

Tools are the flashiest wire-crossers, but they're not the reason the boundary earns its keep. The stronger examples are the responsibilities that *can't* be an MCP server — the ones that need the conversation itself.

Guardrails are the sharpest case. A policy check on what the agent is about to say — off-limits topics, compliance language, PII — is business logic that must observe every transcript in near-real-time and occasionally veto audio. It cannot live in the hot path (it's exactly the CPU-bound work my last post was about), and it can't be a tool the model politely decides to call. The architecture's answer: transcripts already cross the wire as events, the guardrail runs in the business plane, and the small command vocabulary (`response.cancel`) is its veto. Decision in the meaning plane, mechanism in the media plane. The same concept as everything else here.

The same applies to post-call processing, pushing transcripts to analytics, conversation summarization, CRM writes. None of it belongs within a mile of a 20ms frame deadline, all of it needs the conversation stream, and the event side of the contract is how it gets fed without the gateway knowing any of it exists.

## What it costs

None of this is free, and not addressing the cost is bad engineering.

You now run two services instead of one: two deploys, two failure domains, distributed debugging. (Mitigation: propagate trace context across the gRPC stream so business-plane tool spans nest under the gateway spans that requested them — one trace per call, both planes visible.) Every wire-crossing tool call pays serialization and a network hop; keep the planes network-close and this is small against LLM latency, but measure it. The dev loop changes: engineers iterating on prompts and tools shouldn't need the audio stack running, so the gRPC seam has to be testable from both sides. The reference repo ships harnesses for exactly this. The same seam that a skeptic might call overhead is what makes each plane independently testable. The contract becomes a real interface you have to version and maintain with the discipline of a public API, because that's what it is now.

### An aside: "why gRPC, though?"

Because this is the question I have gotten right after "why two services," here's the receipts version.

Typed streaming RPC between planes is exactly how LiveKit coordinates internally: they built [psrpc](https://github.com/livekit/psrpc) — protobuf service definitions with bidirectional streaming — and use it for signaling relay, room management, and agent job dispatch across their mesh. They chose a message-bus transport (Redis/NATS) instead of point-to-point HTTP/2 because their problem is a global multi-node mesh that needs topics, fan-out, and affinity routing. Ours is two co-located services, so point-to-point gRPC is the correct simplification of the same invariant: a **typed, bidirectional-streaming contract between planes**. The invariant is the contract; the transport follows the topology.

If the skepticism is "but gRPC can't handle real-time audio," let's review some use-cases: NVIDIA Riva ships its entire speech stack as gRPC streaming microservices running thousands of parallel streams, and Google Cloud Speech-to-Text's streaming recognition is a bidirectional gRPC stream, audio chunks in, interim transcripts back mid-sentence. That said, note what this architecture actually does: **audio never crosses the bridge.** The gRPC stream carries events, commands, and tool relays; audio flows gateway↔caller and gateway↔model. LiveKit makes the same move — media rides WebRTC, psrpc carries control. The bridge is a control plane, and control planes are exactly what gRPC is for.

(What the closed shops like Vapi, Deepgram, ElevenLabs run internally isn't public. Their WebSocket-heavy edges are a browser-and-telephony compatibility choice, not an internal architecture statement.)

Worth it? At demo scale, probably not. One process is simpler and the collisions haven't started. At production call volume, where one CPU spike in business logic becomes audible artifacts across every concurrent call on the box, the split stops being optional. We learned the workload-collision lesson the hard way at GA and fixed it with a cruder separation under pressure; the gateway is the deliberate version of that lesson, built before the next fire instead of during it.

## The takeaway

The bugs in my last post were all one bug: two workloads with incompatible timing requirements sharing a process. You can defend the hot path forever — or you can give it its own process, its own event loop, its own deploy, and a small typed contract to the plane where slowness is allowed.

The whole reference implementation — both agents, the mock realtime model, the barge-in and staleness machinery, the browser demo — is at [github.com/lackmannicholas/ai-audio-gateway](https://github.com/lackmannicholas/ai-audio-gateway). It runs with no API key: `docker compose up`, open the browser, order a coffee, and watch the wire.

---

*Part of a series on building production voice AI. Previously: [Local VAD](/writing/local-vad/) · [Responder-Thinker](/writing/responder-thinker/) · [WebRTC vs WebSockets](/writing/websockets-vs-webrtc/) · [Python Is Lying to You](/writing/python-is-lying-to-you/).*
