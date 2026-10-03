# Ghars

Ghars is a multi-tenant web platform designed for managing and tracking dental implant cases throughout the complete treatment journey — from surgery and implant placement to follow-ups, prosthetic stages, financial tracking, and medical attachments.

The platform helps dental professionals manage patient records, implant cases, individual implants, surgical procedures, prosthetic events, appointments, payments, follow-ups, reports, and clinical documents in one centralized system.

Built with a scalable modular architecture, Ghars supports multiple clinics with strict tenant isolation, role-based permissions, secure server-side authentication, audit logging, and private medical file storage.

### Tech Stack

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- TanStack Query
- Wouter
- Recharts
- Node.js
- Express.js
- PostgreSQL
- Drizzle ORM
- Zod

### Architecture

Ghars follows a modular multi-tenant architecture with clear separation between:

- Presentation Layer
- API Layer
- Business Logic
- Data Access Layer
- Authentication & Authorization
- Private File Storage
- Audit & Security Controls

Tenant context is derived from authenticated server-side sessions, and clinical data is isolated at the backend level.

The system is designed for future scalability, including advanced analytics, integrations, mobile applications, external APIs, automation, and white-label deployments.
