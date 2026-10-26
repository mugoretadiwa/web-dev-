# Davipel Sales Data System

## Run locally

Requires Node.js 22.5 or newer. The server uses Node's built-in SQLite support and has no npm dependencies.

In PowerShell, set the initial administrator credentials and a staff registration key, then start the server:

```powershell
$env:DAVIPEL_BOOTSTRAP_ADMIN_EMAIL = "admin@example.com"
$env:DAVIPEL_BOOTSTRAP_ADMIN_PASSWORD = "replace-with-a-long-unique-password"
$env:DAVIPEL_REGISTRATION_KEY = "replace-with-a-private-invite-key"
npm.cmd start
```

Open <http://127.0.0.1:3000>. The bootstrap administrator is created if the database has no executive account; you can set the bootstrap variables later and restart if no executive has been provisioned yet. Set a new registration key whenever staff access changes. Store production secrets in the hosting provider's secret manager, serve over HTTPS through a reverse proxy, and set `NODE_ENV=production`.

The SQLite database is created at `data/davipel.sqlite`. That folder is excluded from source control. Back it up regularly and restrict access to the server host and database file.

## API

All endpoints are served from the same origin as the dashboard. Authenticated requests use an HttpOnly, SameSite session cookie.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Server and database health |
| `POST` | `/api/auth/register` | Register a cashier, merchant, or merchandiser using the configured registration key |
| `POST` | `/api/auth/login` | Sign in and create a server session |
| `POST` | `/api/auth/logout` | Revoke the current session |
| `GET` | `/api/auth/me` | Return the current session's account |
| `GET` | `/api/accounts` | List accounts (executive only) |
| `POST` | `/api/accounts` | Create an account with any role (executive only) |
| `DELETE` | `/api/accounts/:id` | Remove an account and revoke its sessions (executive only; cannot remove self or the last executive) |
| `GET` | `/api/shops` | List active shops (authenticated); executive may request `?includeInactive=true` |
| `POST` | `/api/shops` | Add a shop and automatically allocate its department ID (executive only) |
| `DELETE` | `/api/shops/:id` | Remove a shop from active use while retaining its order history (executive only; assigned users must be reassigned or removed first) |
| `POST` | `/api/shops/:id/restore` | Restore a removed shop (executive only) |
| `GET` | `/api/orders` | List orders visible to the signed-in account |
| `POST` | `/api/orders` | Place a validated order |
| `PATCH` | `/api/orders/:id/status` | Update status for an order (dispatch/management accounts) |

Executive accounts can manage staff through **Manage → User management** in the dashboard. They can create accounts with roles and department/shop assignments, and remove accounts. The signed-in executive and last remaining executive are protected from deletion. The self-registration endpoint intentionally cannot grant management roles.

## Existing browser data

Existing accounts and orders in browser localStorage are not imported automatically. Create accounts on the server and retain a backup of the browser data before removing the old version. Illustrative demo orders remain visible in the dashboard but are not stored in SQLite.
