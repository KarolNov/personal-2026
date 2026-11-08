---
title: Don't be a meat proxy
description: AI made writing cheap, but reading still costs the same. Why pasting LLM output into a thread hurts your team, why showing beats telling, and how to use AI to make the showing cheap.
pubDate: 2026-11-08
tags: [ai, communication, async]
draft: true
---

You've probably seen this happen. Someone asks a question in a thread. A colleague pastes it into an LLM, copies
the answer and posts it back: eight paragraphs, three headings, a bulleted list of "key considerations" and a
neat summary at the end. It looks thorough. Nobody reads it.

It isn't that the text is wrong. It might be fine. The problem is that nobody can tell which parts the person
posting it actually thinks, which parts they checked and which they never read, or what they want anyone to do
next. They passed a message between two machines and added nothing on the way. They acted as a meat proxy.

A lot of organisations have run into this in the last year or two. It's easy to do, and it feels like being
helpful.

## Writing got cheap. Reading didn't.

Writing used to cost the writer something, and that cost worked as a filter. If you spent an hour on a design
doc, you had already decided it was worth an hour of your time, and usually that it was worth the reader's time
too. The length of a message said something about how much thought went into it.

AI took that cost away from the writer and none of it away from the reader. A wall of text now takes seconds to
make and as long as ever to read, understand and check. So the cost hasn't gone. It has moved from the person
writing to every person reading, and there are more readers than writers.

It's the same trap as shipping code faster than anyone can review it. Arron Woods wrote about the
engineering side of this in [More than writers of code](https://www.arronwoods.com/blog/2026/01-more-than-writers-of-code):
code should be proven, and something you'd be proud of, before it goes to someone else for review, however
quickly it was produced. The same holds for words. Volume isn't progress if someone else has to do the thinking you
skipped.

> **TODO:** check the wording against Arron's post (Pride Test, False Velocity, Author's Checklist) and decide
> how much of it to name here. I couldn't load the page while drafting, so the summary above is from your notes.

## What worked for us: show, don't tell

On our team the fix wasn't a rule about AI. It was something we already did: work asynchronously and show things
instead of describing them. In practice that mostly means [Loom](https://www.loom.com).

A two-minute video of you clicking through a change says things a written summary can't. People can see what you
actually tried, not what you say you tried. They hear how sure you are: "this part's solid", "this bit I'm not
happy with yet". They see your judgment in what you choose to show and what you skip. And it's very hard to fake
with AI, because the thing you're showing is your own understanding.

> **TODO:** add one or two real examples from the team. For example a PR whose Loom answered the review before
> anyone asked, or a bug report where a 30-second recording replaced a long thread.

## The catch: showing is expensive

So why doesn't everyone do this all the time? Because it takes time. A good Loom needs a working build, test data
that makes sense and a couple of takes. A prototype takes a day. A proper demo or a tutorial takes longer. "Just
record more" sounds good in a retro and rarely survives a busy week.

That's the part AI can help with, as long as it's pointed at the right job.

## Use AI to make the showing, not the talking

The useful split I've found: don't use AI to write *your message*. Use it to produce the *things that let you
show your work*, quickly enough that you'll actually do it.

> **TODO:** this section needs the skill itself. Points to cover:
>
> - How it grew out of `/brag` (what `/brag` did, and what was missing).
> - What it outputs: e.g. a script for a Loom, a seeded demo environment, a before/after screenshot set, a
>   click-through prototype. Be concrete.
> - Where the human stays in the loop: you still record, you still decide what matters.
> - One before/after example: the wall of text someone would have posted, next to what they shared instead.
> - Link to the open-sourced skill (blocker: publish it first, ideally to the Claude plugin marketplace).

The point isn't that AI should stay out of how you communicate. It's that the parts people need from you, what
you think, what you checked and what you want, have to come from you. AI is very good at everything around that:
setting up the demo, cleaning up the data, drafting the steps you'll click through. Let it do that work so you
have time left for the part only you can do.

## Before you hit send

A short checklist I now run through before posting anything AI helped with:

- **Did I add my own judgment?** If I removed everything the AI wrote, would anything of mine be left?
- **Did I check it?** Do I know which parts I verified and which I'm taking on trust, and have I said so?
- **Can I show it instead of describing it?** A screenshot, a recording, a link to the running thing.
- **Is it as short as it can be?** The reader's time is the expensive part now.
- **Would I be happy if they asked me about it live?** If I'd have to go and read my own message first, it isn't
  ready.

None of this is new. Good teams worked this way before AI. What changed is that skipping it got much easier, and
the people paying for it are everyone else.

Next time: the same idea from the other side. Not how you talk to people, but how you talk to the AI, and why
it does its best work when you give it something solid to lean on instead of a long prompt.
