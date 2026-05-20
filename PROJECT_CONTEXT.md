# SlideBot — Project Context

Project Name:
SlideBot

Product Category:
Collaborative Multiplayer Presentation Platform

Core Vision:
SlideBot transforms passive screen sharing into synchronized real-time collaborative presentations.

Instead of streaming presentation pixels/video like traditional meeting platforms, SlideBot synchronizes:

- presentation state
- annotations
- presenter actions
- navigation
- collaboration events

This enables:

- multiplayer presentations
- low-latency collaboration
- synchronized annotations
- presenter handoff
- independent exploration mode
- collaborative meeting workflows

SlideBot works alongside:

- Google Meet
- Zoom
- Microsoft Teams

via:

- browser extension
- web collaboration platform
- real-time synchronization engine

---

# Core Problem

---

Traditional online presentations are inefficient because:

- one presenter controls everything
- users constantly ask:
  - "next slide"
  - "previous slide"
- annotations are weak
- screen sharing is laggy
- blurry presentations
- presenter handoff is painful
- collaboration is passive
- users cannot independently inspect slides

Current meeting platforms optimize:

- video communication

NOT:

- collaborative presentation workflows

---

# Core Product Idea

---

SlideBot IS:

- collaborative presentation infrastructure
- multiplayer presentation engine
- synchronized presentation layer

Positioning:
"Figma for live presentations."

---

# MVP Goal

---

The MVP should ONLY focus on:

1. synchronized presentations
2. multiplayer collaboration
3. presenter handoff
4. annotations
5. exploration mode

---

# MVP Features

---

## 1. PDF Upload

Users upload PDF presentations.
Flow: PDF Upload → Slide Extraction → Synchronized Viewer

## 2. Synchronized Slide Navigation

- presenter controls slides
- viewers stay synchronized
- real-time next/previous updates
- websocket-based synchronization
- reconnect recovery

## 3. Collaborative Annotations

- drawing, highlighting, laser pointer
- multi-user cursors
- collaborative markers
- real-time sync

## 4. Presenter Handoff

- instant presenter switching
- preserve presentation state
- preserve annotations

## 5. Personal Exploration Mode

- independently inspect slides
- zoom, revisit older slides
- snap back to presenter anytime

---

# Product Philosophy

---

Priority order:

1. reliability
2. low latency
3. simplicity
4. collaboration quality
5. scalability
6. beautiful UX
7. advanced features

---

# Technical Philosophy

---

Avoid: overengineering, premature microservices, unnecessary AI

Prefer: modular architecture, scalable patterns, typed systems, simple maintainable code

---

# Recommended MVP Stack

---

Frontend: React + TypeScript + TailwindCSS + Zustand + Konva.js
Backend: Node.js + Express + Socket.IO
Database: Supabase/PostgreSQL
Extension: Chrome Extension Manifest V3

---

# Architecture Direction

---

Hybrid Browser Extension + SaaS Platform

---

# Real-Time Synchronization

---

The MOST critical engineering problem is synchronization consistency.
All synchronization systems should prioritize: consistency, reliability, recovery, low latency.

---

# Browser Extension Role

---

Extension should:

- detect Google Meet sessions
- inject lightweight overlay
- open SlideBot controls
- connect meeting with collaboration room

Keep extension lightweight.

---

# UI/UX Philosophy

---

The UX should feel: frictionless, collaborative, modern, minimal, multiplayer-aware.
Inspired by: Figma, Miro, Linear, Notion.

---

# Coding Standards

---

Requirements:

- TypeScript everywhere
- strongly typed websocket events
- modular architecture
- reusable components
- clean folder structure
- scalable patterns
- avoid duplication

---

# Development Workflow

---

Phase approach: research → architecture → implementation → testing → cleanup → Git commit
Never attempt entire product generation in one step.

---

# Current Priority

---

Current focus:

- MVP collaboration engine
- synchronized presentations
- annotations
- presenter handoff
- exploration mode

---

# Long-Term Vision

---

SlideBot becomes collaborative presentation infrastructure and multiplayer presentation OS.

---

# Important Instructions For Antigravity

---

Always:

- follow existing architecture
- preserve modularity
- avoid unnecessary complexity
- optimize for scalability and maintainability
- keep UX smooth and minimal

At the end of every completed task:

- commit changes
- push to GitHub
- use meaningful commit messages
- maintain version history
