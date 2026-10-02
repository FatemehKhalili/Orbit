# Orbit product specification

**Tagline:** Keep life in orbit.

## Concept

Orbit is a personal life management system: a Personal Life Operating System. The user
is at the centre, and each area of life is a module orbiting them. Orbit is open source
and self-hostable, so a person's life data stays under their control.

## MVP modules

| Module    | Purpose (one line, to be detailed in its own phase)          |
| --------- | ------------------------------------------------------------ |
| Dashboard | The centre: a summary of what matters across all modules.    |
| Finance   | Track money in and out.                                      |
| Calendar  | See and plan time.                                           |
| Habits    | Build and track routines.                                    |
| Shopping  | Keep shopping lists.                                         |
| Wishlist  | Collect things you want, for yourself or as gift ideas.      |

## Principles

- **User at the centre.** Every module relates back to the person, not the other way round.
- **Private by default.** No real personal data in the repository, seeds or tests.
- **Minimal.** Add a dependency or abstraction only when a feature needs it.

## Out of scope for the MVP

- AI features
- External authentication providers
- Background workers and queues (no Redis)

## Phases

| Phase | Scope                                                                 | Status      |
| ----- | --------------------------------------------------------------------- | ----------- |
| 1     | Scaffolding: repo structure, apps, database, Compose, health, docs    | Complete    |
| 2+    | To be defined                                                         | Not started |

Phase 1 delivers no product features. The web app shows a placeholder with the six
modules and the backend's health.

Phase 1 checkpoint: tag `v0.1.0-phase1`, commit `9a555fd`, CI passing.
