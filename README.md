# WTP-SQMS

نظام مراقبة جودة الخدمة في محطات معالجة المياه — Service Quality Monitoring System for Water Treatment Plants.

## Run it locally

Requirements: Node 24+, Docker.

```bash
npm install
cp .env.example .env
npm run db:up        # PostgreSQL 16 on localhost:54329, Mailpit inbox on http://localhost:54326
npm run db:migrate
npm run db:seed
npm run dev          # http://localhost:3100
```

Tests:

```bash
npm test             # evaluation rules (no database)
npm run test:db      # row-level security, reference data access, seed
```

The specification is in [docs/handoff/HANDOFF.md](docs/handoff/HANDOFF.md). Stack, commands and conventions are in [CLAUDE.md](CLAUDE.md).
