# ProjectVerse — University Research & Innovation Marketplace

**Project type:** Academic group project (5 members)  
**Codebase:** Collaborative full-stack implementation  
**My contribution area:** React frontend and marketplace interfaces

This repository shares the available, sanitized group source code for a university project. **It is not claimed as work completed by one person.** Individual file authorship has not been established from the supplied archive, and no individual ownership of the backend or database is claimed here.

## Project overview
ProjectVerse explores how students and researchers can publish academic work and connect with businesses and investors. This implementation includes project publication workflows, discovery, collaboration requests, role-based dashboards, and a marketplace.

**An AI recommendation model is not included in this source version.**

## Technology
- **Frontend:** React 18, Vite, JavaScript and CSS
- **Backend:** Node.js, Express REST API
- **Database:** MySQL
- **Authentication:** JWT and role-based access controls

## Repository structure
- `client/` — React frontend
- `server/` — Express backend/API
- `database/01_schema.sql` — MySQL schema
- `database/03_security_migration.sql` — migration for existing installations

## Local setup
1. Install Node.js and MySQL.
2. **Use a disposable test database.** Review `database/01_schema.sql` before running it: it contains `DROP DATABASE IF EXISTS projectverse;` and will delete an existing database of that name.
3. Review and apply `database/01_schema.sql` in MySQL. `03_security_migration.sql` is intended for upgrading an older database and should **not** be run against a freshly created schema that already has its changes.
4. Copy `server/.env.example` to `server/.env`. Supply your own database values, `JWT_SECRET` (at least 32 random characters), and any optional email settings. Do **not** commit `.env`.
5. In `server/`, run `npm ci`, then `npm start`.
6. In `client/`, run `npm ci`, then `npm run dev`.
7. Use the local URL reported by Vite. The app may require demo records or setup that are not included in this archive.

## Publishing and security notes
- This archive omits the earlier test seed records, hardcoded demo credentials, and local environment files.
- JWT signing now requires a configured `JWT_SECRET`; the insecure development fallback has been removed.
- Do not upload real database credentials, personal information, database dumps, `.env` files, or group content you do not have permission to publish.
- This repository has **not** been verified end-to-end with a running MySQL database, and is not production-ready or security-audited.
- Team members retain attribution for their respective work. No license is provided here; do not assume permission for third-party reuse.

## Project status
Academic project source shared for portfolio review. Features and run instructions should be confirmed locally before demonstrating or deploying.
