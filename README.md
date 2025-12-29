# Feature Flag Manager (Prototype)

A lightweight, browser-based Feature Flag Manager built for Product Managers to quickly track and control feature flags across environments and audiences.

This is a **local-only prototype**: everything is stored in your browser via **localStorage** (no backend).

## What it does

- Maintain a list of feature flags (name, key, description, tags)
- Toggle feature enablement per environment:
  - **Dev, Test, Ops, Stage, Prod**
- Target audiences for each feature:
  - **All clients**
  - **Specific clients**
  - **Groups** (custom client groups, e.g., beta participants)
- Manage client groups:
  - Create groups
  - Assign clients to groups
- Basic change log:
  - **who / when / what** for key actions (local-only)

## Tech / Notes

- Static site version: `index.html`, `styles.css`, `app.js`
- Data persists in `localStorage`
- Designed to stay clean, minimal, and fast

## Getting started

### Option A: Run locally (recommended)
1. Download/clone the repo
2. Open `index.html` in your browser

That’s it.

### Option B: Run with a simple local server (best for consistency)
Some browsers restrict local file storage or module behavior when opening `file://...`.

If you have Python installed:

```bash
python -m http.server 5173
