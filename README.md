# Journey Masterz Website

A multi-page, enquiry-based travel website focused on Indian domestic holidays, especially North India, with international package listings, a backend, an admin dashboard, database-backed content and a versioned public API.

## Easiest Windows setup

1. Extract this ZIP (do not run it from inside the ZIP preview).
2. Install Node.js LTS from https://nodejs.org/en/download (Node 20+).
3. Double-click `SETUP-WINDOWS.bat`. Set a private admin email, strong password, and random session secret when Notepad opens `.env`.
4. Wait for package installation to finish.
5. Double-click `START-WEBSITE.bat`.
6. Open http://localhost:3000. Admin: http://localhost:3000/admin/login.

Read `FIXES-AND-INSTALL-GUIDE.md` for step-by-step instructions and troubleshooting.

## Technology

- Node.js + Express + EJS templates
- `sql.js` (SQLite compiled to WebAssembly; avoids native `node-gyp` compilation for the database)
- File-backed session storage
- Password hashing with bcryptjs
- Helmet security headers, rate limiting, server-side validation and CSRF checks

The local SQLite file is normally `data/journey-masterz.sqlite`; uploads are stored in `public/uploads` unless `UPLOADS_DIR` is changed.

## Pages

Home, packages and package details, destinations and destination details, pilgrimage tours, custom trip planner, About, Contact, privacy and terms pages, admin dashboard, and API documentation.

## Public API

- `GET /api/v1/packages`
- `GET /api/v1/packages/:slug`
- `GET /api/v1/destinations`
- `GET /api/v1/destinations/:slug`
- `GET /api/v1/faqs`
- `POST /api/v1/enquiries`
- OpenAPI JSON: `/openapi.json`

Only published content is exposed through public listing APIs. Enquiries are stored privately and are not returned by public endpoints.

## No online payments

This project intentionally does not include payment gateways, checkout, UPI, payment QR codes, payment processing, or payment links. Calls to action are enquiries, phone calls and WhatsApp chats.

## Production deployment

Use a Node.js host with persistent storage mounted for the database, uploads and session files. Set `NODE_ENV=production`, a strong `SESSION_SECRET` (32+ characters), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and an HTTPS `BASE_URL`. Verify the host's persistent storage paths match `DATABASE_PATH`, `UPLOADS_DIR`, and `SESSIONS_DIR`. Back up the database and uploads.

The bundled `render.yaml` is a starting point; review and test the service configuration before deploying. This SQLite + sql.js implementation is for a small, single-instance site. Use managed PostgreSQL and persistent object storage before scaling to multiple instances.

## Important

Sample packages are templates and must be reviewed before advertising them as actual offers. Verify prices, availability, itinerary, inclusions, permissions and advisories before publishing.
