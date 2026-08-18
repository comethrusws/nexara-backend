# Nexara API

NestJS modular monolith for the Nexara payment orchestration MVP.

Fineract is the live financial ledger. DigiLocker KYC and bank payouts are adapter ports. KYC defaults to **mock** until DigiLocker credentials exist. Bank routing is decided in the database, not by rewriting merchant APIs.

## Hierarchy

```
ADMIN
 └── SUPER_DISTRIBUTOR
      └── DISTRIBUTOR
           └── MERCHANT
```

Admin may also attach distributors or merchants directly. Super-distributors may attach distributors or merchants. Distributors may attach merchants only.

Each node can inherit features from its parent, or use a custom allow-list. A child cannot receive a feature the parent does not have.

Feature catalog: `WALLET`, `STATEMENT`, `PAYOUT`, `PAYOUT_IMPS`, `PAYOUT_NEFT`, `PAYOUT_RTGS`, `PAYOUT_UPI`.

Bank catalog: `MOCK`, `YESBANK`, `HDFC`, `KOTAK`, `ICICI`. A node may inherit the parent bank or override it. If nobody overrides, the platform default bank is used. Switching YES Bank → HDFC → Kotak → ICICI is an admin config change; merchant payout APIs stay the same.

HDFC / Kotak / ICICI adapters are registered but unconfigured until credentials exist. Enable a bank, then set it as default (or on an organization) before sending live traffic to it.

## Run locally

```bash
docker compose up -d postgres
cp .env.example .env
npm install
npm run start:dev
```

API base: `http://localhost:3000/v1`

Swagger UI: `http://localhost:3000/docs`

End-to-end architecture, flows, and API catalog: [docs/END-TO-END.md](docs/END-TO-END.md)

Fineract must already be running at `https://localhost:8443`.

## Provider switches

| Env | Default | Notes |
|---|---|---|
| `KYC_PROVIDER` | `mock` | Set `digilocker` later |
| `BANK_PROVIDER` | `mock` | Used only to seed the first platform default (`mock` → MOCK, `yesbank` → YESBANK). After that, `PUT /v1/ops/banks/default` is the source of truth. |

Leave DigiLocker / YES Bank client id and secret empty until issued. Keep the platform default on **MOCK** for local payouts.

Auth is required on every route except `/v1/health` and `/v1/auth/*` and `POST /v1/onboarding`. Send `Authorization: Bearer <token>`.

Seeded staff:

- `admin@nexara.com` / `NexaraAdmin#2026` (`ADMIN`)
- `ops@nexara.com` / `NexaraAdmin#2026` (`OPS`)

Merchant OTP in development is always `123456`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/auth/login` | Email + password |
| POST | `/v1/auth/otp/request` | Send mobile OTP |
| POST | `/v1/auth/otp/verify` | Verify OTP, return JWT |
| POST | `/v1/onboarding` | Self-service merchant + user |
| GET | `/v1/me` | Current user (+ merchant if linked) |
| GET | `/v1/me/wallet` | Merchant wallet |
| GET | `/v1/me/activity` | Unified wallet activity (replaces statement + transactions) |
| POST | `/v1/me/funding` | Add money (`CASH` posts now; UPI/bank/card stay pending) |
| GET/POST | `/v1/me/payouts` | Merchant payouts |
| GET/POST | `/v1/me/beneficiaries` | Saved payees for Pay again |
| GET | `/v1/me/notifications` | In-app inbox |
| GET/POST | `/v1/me/webhooks` | Merchant webhooks |
| GET | `/v1/health/ready` | Postgres + Fineract + default bank |
| GET | `/v1/ops/catalog` | Feature, bank, and hierarchy catalog |
| GET | `/v1/ops/merchants/network` | Org tree with merchant wallets |
| GET/PATCH | `/v1/ops/merchants` | List / update status, limits, fees, tier |
| POST | `/v1/ops/merchants/:id/kyc/documents` | Aadhaar/PAN/selfie images |
| POST | `/v1/ops/wallets/:merchantId/funding` | Ops add-money by channel |
| GET | `/v1/ops/audit` | Audit log |
| POST | `/v1/ops/notifications/broadcast` | Notify ALL / SD / Dist / Merchant |

Mock bank: account numbers ending in `0000` fail; IFSC starting with `UNKN` stays `UNKNOWN`.

Restrict a merchant to UPI only:

```json
PUT /v1/ops/organizations/{merchantOrgId}/features
{ "features": ["WALLET", "STATEMENT", "PAYOUT", "PAYOUT_UPI"] }
```

Switch the whole platform from MOCK to YES Bank (after credentials exist):

```json
PUT /v1/ops/banks/default
{ "bankCode": "YESBANK" }
```
