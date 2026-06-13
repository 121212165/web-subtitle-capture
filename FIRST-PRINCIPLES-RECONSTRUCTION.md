# First-Principles Reconstruction: web-subtitle-capture

> Applied Elon Musk's first-principles thinking: break to fundamental truths, rebuild from zero.

## Core Problem

Users need subtitle text from web videos saved as timestamped Markdown files.

## First Principles Breakdown

1. Subtitles are existing text — the video player already displays them
2. Observation is solved — MutationObserver watches DOM changes
3. File writing is trivial — no framework needed
4. User cares about: the text, when it was said, where it's saved
5. Localhost needs no security

## Essential Features

| P0 | MutationObserver on subtitle DOM elements |
| P0 | Save as timestamped Markdown |
| P0 | Session isolation |
| P1 | Platform-specific selectors (YouTube, Bilibili, etc.) |
| P1 | Extension popup with status |

## Reconstruction Blueprint

Day 1: ~200 lines / 4 files. Add complexity only when validated by real usage.

## Musk's Razor

Delete 87% of code (~4,000 lines → ~500). Cut Hono, monorepo, 16 adapters, ASR pipeline, localhost security theater.
