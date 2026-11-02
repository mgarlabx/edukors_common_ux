---
name: edukors-challenge-create
description: Design a challenge-based student project that develops a specific competency (its knowledge, skills, and attitudes), tailored to a given teacher-and-student profile. Use this whenever the user wants to create, draft, or plan a project, challenge, or challenge-based-learning activity for students around a competency — even if they only give a competency statement and a class profile and say "build me a project". Also trigger when the user mentions designing a challenge, a project deliverable/artifact, or a project broken into student-produced stages for a competency. The output is a fully structured project (title, three-paragraph context, objective, and a user-defined number of staged artifacts) with strict character counts.
---

# Competency Project Designer

Design a **challenge-based project** for students to complete, whose purpose is to develop one specific **competency**. This skill follows the edukors methodology, where a competency is the capacity to *mobilize* **knowledge, skills, and attitudes (KSA)** to act effectively in a real situation, and where that mobilization happens by facing a concrete **challenge** and producing **artifacts** (staged deliverables) along the way.

Your job: take a competency and a teacher/student profile, invent a rich, contextualized challenge, choose a deliverable, and output a project in the exact structure defined below.

## Output language

Write the project in the **same language the user used** for the competency and the profile. Do not translate their inputs to English. This SKILL.md is in English, but the deliverable follows the user's language.

## Step 1 — Gather the required inputs

You need all of the following before designing:

1. **The competency to be developed.** A competency statement begins with an action verb (mobilization: analyze, build, develop, plan, produce, solve, design…) and may carry a *condition* (how) and a *context* (where). If the user gives only a raw competency, use it as-is. If it is missing entirely, ask for it.
2. **A set of knowledge, skills, and attitudes (KSA).** These are the KSA that the student must mobilize to solve the challenge. If the user gives only a raw competency, ask for the KSA. If they give a competency with KSA, use them as-is.
3. **The teacher-and-student profile.** Where the teacher lives/teaches (city/region), the students' age and school level, and the project's operating conditions (see "Rules for artifacts"). This drives the context research in Step 2 and the constraints in Step 4.
4. **The number of stages (artifacts).** How many staged artifacts the project should be broken into. If the user specifies a number, use exactly that many. If they do not, ask; if they have no preference, default to **five**. Accept any number of two or more (a project needs at least a couple of stages to build toward the final delivery).

Ask the user for any missing inputs. If they provide a competency but no KSA, ask for the KSA. If they provide a competency and KSA but no profile, ask for the profile. If they provide a profile but no competency or KSA, ask for those. If they have not stated how many stages they want, ask (defaulting to five if they have no preference).

## Step 2 — Build context to inspire the challenge

The challenge is the heart of the project. A good challenge is close to the students' reality — that is what drives engagement. 

Web-search the city where the teacher lives/teaches for something the challenge can hook into: a major event (festival, fair), a relevant regional/cultural trait, or a serious local problem to solve. Real, local hooks (and external "clients" like the city government, a neighborhood association, a local business, an NGO) make challenges vivid.

Use what you find to build a three-paragraph context for the project, but DO NOT include the source or URLs.

Consider also the students' age and school level informed by the user. The challenge should be something they can relate to and feel motivated to solve.

## Step 3 — Design the challenge and the deliverable

- **Challenge:** conceive it so that solving it genuinely *requires* mobilizing the target competency's knowledge, skills, and attitudes (KSA). It should read as a real situation with stakes, not a generic exercise.

- **Deliverable (final artifact):** pick the format that best fits the competency and challenge. Options include a report, article, work of art, song, video, game, experiment, research study, prototype, model, plan, program, project, exposition, fair, competition, computer app/system, or website, among others.

## Step 4 — Produce the project in this EXACT structure

Follow this template exactly, in the user's language. **Character counts are requirements, not suggestions — count them and stay in range.** Aim within ±5% for the ~400 and ~200 targets; respect hard ranges strictly.

The template below shows the shape with placeholder stages. Produce **exactly the number of stages the user requested** (see Step 1, input 4) — no more, no fewer. The last stage, whatever its number, is always the final delivery.

Render the section headers in the output language (the labels below are in English; translate them to the user's language):

```
# [Project title]
<A short phrase summarizing the project. 100–120 characters.>

## Project context
<Paragraph 1 — presents the PROBLEM. ~400 characters.>

<Paragraph 2 — shows FACTS, DATA and/or STATISTICS about the problem. ~400 characters.>

<Paragraph 3 — explains the BENEFITS of solving the problem for the surrounding community (not for the students). ~400 characters.>

## Project objective
<A single paragraph describing what the student must produce (the deliverable) to solve the project. ~400 characters.>

## Project stages (deliverables)

Artifacts are partial deliverables that build toward the final project. Each artifact is a concrete thing the student must produce and hand in at that stage, not an abstract activity or process. The last artifact is always the final delivery.

1. **[Artifact title — 20–30 characters]**

   <Description of the ARTIFACT — the concrete thing produced and handed in at this stage, a part of the final deliverable. Describe WHAT must be produced and delivered, not the activity done to make it. ~200 characters in a single paragraph, don't use bullets or lists.>
2. **[Artifact title — 20–30 characters]**

   <Description of the deliverable produced at this stage. ~200 characters in a single paragraph, don't use bullets or lists.>

<... continue numbering for as many stages as the user requested ...>

N. **[Artifact title — 20–30 characters]**

   <Description of the deliverable produced at this stage. ~200 characters, don't use bullets or lists. THE LAST STAGE IS THE FINAL DELIVERY.>
```

### Rules for artifacts

Every artifact must be produceable under this project's operating conditions, as informed by the user. Design each stage so it can be completed within these constraints:

- **No off-site field activities.** Everything happens inside the classroom — do not require visits, field trips, or on-location data gathering.
- **No at-home work.** Students have no time for homework or take-home tasks, so each artifact must be fully completable during class sessions.
- **Screens allowed.** Students may use smartphones, tablets, or computers, so digital artifacts are fine.
- **Internet access available.** Online research, reference material, and web-based tools can be part of the work.
- **AI assistants allowed.** Students may use AI tools, so design artifacts that use AI as a productive aid rather than ones an AI can trivially complete on its own.

If a constraint is set to "no", never propose an artifact that depends on it.

### Using AI to build the artifacts

When AI assistants are allowed (see the constraint above), the deliverables **may be produced with the help of AI** — the student may use AI as a productive tool, remaining the author who directs, judges, and finalizes the work. Design each artifact so AI accelerates or enriches it without replacing the student's own thinking; the student must still make the decisions, adapt the output to the local context, and validate the result.

**Always phrase AI use as optional, never mandatory.** Whenever the text (in this guidance and, above all, in the artifact descriptions you write in the output) recommends using AI, use permissive wording that includes "may"/"can" — in Portuguese, always include "pode" (e.g. "O aluno pode usar a IA para…" rather than "O aluno usa a IA para…"). AI is an aid the student is free to use, not a required step.

How AI can help the student, with examples:

- **Research and synthesis:** ask the AI to summarize a topic, compare viewpoints, or explain a concept in simpler terms, then the student verifies and selects what is relevant (e.g. summarizing local statistics into a briefing).
- **Idea generation:** brainstorm angles, titles, or approaches the student then chooses among and refines (e.g. generating ten campaign slogans to pick and rework one).
- **Drafting and rewriting:** produce a first draft the student edits, corrects, and personalizes (e.g. drafting a script, a report section, or interview questions to revise).
- **Structuring and planning:** turn loose notes into an outline, storyboard, or schedule the student adjusts (e.g. organizing findings into a report structure).
- **Media and prototypes:** generate images, mockups, code, or audio the student curates and integrates (e.g. creating a poster image or a working prototype of an app screen).
- **Review and feedback:** act as a critic that points out gaps, errors, or unclear passages, which the student decides whether to accept (e.g. reviewing a draft for clarity and coherence).

When the artifact's description makes AI help natural, phrase it so the AI is a means, not the author — the student still produces and owns the deliverable. Avoid artifacts an AI could complete on its own with no meaningful student judgment.


### Rules for the structure

- **Title:** one sentence, 100–120 characters, capturing the project's essence (not a generic label).
- **Context:** exactly three paragraphs, ~400 characters each, in the fixed order problem → data/statistics → benefits. Statistics should be realistic and, where possible, grounded in what you found searching the city/topic. If you infer or approximate a figure, phrase it honestly (e.g. "it is estimated that…") rather than fabricating precise false numbers.
- **Objective:** exactly one paragraph, ~400 characters, and it must name the concrete deliverable the student will build.
- **Deliverables:** exactly the number of artifacts the user requested (see Step 1, input 4). Each stage is an artifact — a concrete thing the student must actually produce and hand in at that point, not an abstract activity, process, or phase label. It must be something tangible (a document, prototype, recording, dataset, design, script, model, etc.), and it is usually a component or part of the final delivery, not a separate side task. Together the artifacts build toward the final deliverable, which is the last stage. Each has a 20–30-character title and a ~200-character description. Make the artifacts a logical progression (e.g. research → analysis → draft/prototype → refinement → final delivery), each genuinely exercising part of the competency's KSA. Scale the progression to the requested count: with few stages keep each step broad, and with many stages break the work into finer, non-overlapping increments.
- **The artifact description must describe the deliverable, not the activity.** Write what the student must *produce and hand in* — the concrete artifact and what it contains — as a part of the final project, not the steps or activities done to make it. Prefer a noun-first, product-focused phrasing ("A one-page dossier containing…", "A storyboard with…", "A working prototype that…") over an activity-focused one ("Students research…", "The class discusses…"). If the sentence describes an action being performed rather than an object being turned in, rewrite it.

## Character-count discipline

Before returning the project, verify each field's length. If the title is 96 or 131 characters, fix it. If a context paragraph is 250 or 600 characters, rewrite it to ~400. This is the most common failure mode — the counts are part of the deliverable's correctness. Do not print the character counts in the final output unless the user asks; just make them correct.

## Worked mini-example (abbreviated — illustrates shape, not full length)

Competency: "Produce audiovisual content for cultural promotion."
Profile: technical high school in a rural region; teacher reports low student engagement; city research surfaces a large regional harvest festival.

- **Title:** a ~110-char phrase tying the harvest festival to an audiovisual campaign that promotes local culture.
- **Context P1:** the local culture is under-documented and losing visibility among youth.
- **Context P2:** figures on tourism/attendance and youth media consumption in the region.
- **Context P3:** benefits — cultural preservation, local economy, student portfolio and civic pride.
- **Objective:** students produce a short promotional video (the deliverable) for the festival.
- **Deliverables** (shown here as five, but use however many the user requested): (1) Cultural research → (2) Script & storyboard → (3) Filming → (4) Editing & soundtrack → (5) Final video published.

Note: the mini-example fields are written in English here for illustration, but a real project follows the user's language (this profile would be produced in Portuguese). Use this only as a shape reference; always write full-length fields to spec.

## Writing Style

- Do not use emoticons
- Do not separate words with dashes
- Use academic and formal language
- Do not make puns or jokes
- Avoid the construction "negation/affirmation," for example, "this is not what it seems, but that which...". Do not do this.
- Do not include websites (URLs)