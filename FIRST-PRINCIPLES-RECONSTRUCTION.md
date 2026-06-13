# First-Principles Reconstruction: web-subtitle-capture

> Applied Elon Musk's first-principles thinking: break to fundamental truths, rebuild from zero.

## Core Problem

Users need subtitle text from web videos saved as timestamped Markdown files.

## First Principles Breakdown

1. Subtitles are existing text. The video player already displays them.
2. Observation is solved. MutationObserver watches DOM changes for free.
3. File writing is trivial. No framework needed.

## Essential Features

| Priority | Feature |
|----------|---------|
| P0 | MutationObserver on subtitle DOM elements |
| P0 | Save as timestamped Markdown |
| P1 | Platform-specific selectors |

## Reconstruction Blueprint

Day 1: ~200 lines / 4 files.

## Musk\'s Razor

Delete 87% of code (~4,000 lines to ~500). Ship same user value.
