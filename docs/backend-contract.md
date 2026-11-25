# Backend contract needed by the web frontend

**Status: proposal.** The web app is built against these endpoints, but none has
been confirmed by the backend yet. Every endpoint here also has an in-browser
mock (`src/api/mocks/`, enabled with `VITE_USE_MOCKS=true`). If the real API
differs, tell the web frontend owner. The changes are limited to `src/api/*.ts`.

Each section is marked with the frontend feature that needs it.

---

## Conventions (apply to every endpoint)

| Topic | Expectation |
|---|---|
| Format | JSON request and response bodies, `Content-Type: application/json`. File uploads are `multipart/form-data` (see below). |
| Auth | Session cookie set by the auth endpoints; the web app sends `credentials: include`. CORS must allow credentials if the API is on another origin. |
| Dates | ISO 8601 strings with offset or `Z`, e.g. `"2026-10-12T14:00:00Z"`. |
| Money | Numbers in **KZT** (whole tenge, or two decimals for tiyn). The server calculates every total, fee and discount. The web app only displays them. |
| Language | The web app sends `Accept-Language: kk`, `ru` or `en`. Human-readable `message` fields should use that language when possible. |
| Errors | Non-2xx responses return `{ "code": "snake_case_code", "message": "Human readable text" }`. The web app reacts to `code` and shows `message`. |
| Not found / forbidden | `404` with code `*_not_found`; `401` when not signed in; `403` when signed in without permission. |

### Multipart uploads

For create/update with images: part `data` is a JSON blob (`application/json`)
with the same fields as the JSON request, and each image is a separate `images`
part. Omitting `images` on update keeps the event's current images.

---

## Events (organizer) — needed by: Create event, Edit event, My events

### Event object (`EventDto`)

```json
{
  "id": "evt_123",
  "title": "Almaty Nights — Vol. 4",
  "description": "Plain text, blank lines separate paragraphs.",
  "category": "Music | Tech | Arts | Education | Sport",
  "imageUrls": ["https://cdn…/cover.jpg"],
  "format": "physical",
  "venue": { "name": "Almaty Arena", "address": "Momyshuly Ave 1", "city": "Almaty" },
  "startsAt": "2026-10-12T14:00:00Z",
  "endsAt": "2026-10-12T18:00:00Z",
  "timeZone": "Asia/Almaty",
  "visibility": "public | unlisted | private",
  "registrationOpensAt": "2026-09-25T05:00:00Z",
  "registrationClosesAt": "2026-10-12T12:00:00Z",
  "capacity": 1200,
  "refundPolicy": "Free text, may be empty",
  "status": "draft | published | cancelled"
}
```

- `timeZone` is an IANA zone name. The web app enters and shows every time of
  the event in that zone (default `Asia/Almaty`, which is UTC+5 for all of
  Kazakhstan since 2024). Instants are still sent as UTC ISO strings. Calendar
  exports should use the same zone (SRS 4.11, 7).
- `endsAt` must be after `startsAt`. `registrationClosesAt` must be after
  `registrationOpensAt` and no later than `startsAt`.
- `refundPolicy` is optional, up to 2000 characters. It's shown on the event page and at checkout (SRS 4.9).
- `cancelled` events are read-only in the organizer UI. The cancel action itself
  arrives with the organizer dashboard (Phase 2); its endpoint will be added here then.

Open question:
- What does `private` mean if there's no invite list?

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/organizer/events` | — | `EventDto[]`, only events the signed-in organizer manages |
| GET | `/api/events/:id` | — | `EventDto` |
| POST | `/api/events` | multipart: `data` = event fields without `id`, `status`, `imageUrls`; `images` files | `201` `EventDto` with `status: "draft"` |
| PATCH | `/api/events/:id` | multipart, same as create | `EventDto` |
| POST | `/api/events/:id/publish` | — | `EventDto` (`status: "published"`); `409` with a `code` if it can't be published, e.g. `no_ticket_types` when no visible ticket type exists |
| POST | `/api/events/:id/unpublish` | — | `EventDto` (`status: "draft"`) |

---

## Ticket types — needed by: wizard step 2, the per-event Tickets page, the event preview

The create-event wizard saves the event as a draft after step 1 (`POST /api/events`).
Ticket types are then saved one by one against that draft.

### Ticket type object (`TicketTypeDto`)

```json
{
  "id": "tt_1",
  "eventId": "evt_123",
  "name": "General admission",
  "description": "Standing floor, entry from 18:00",
  "kind": "free | paid",
  "price": 6500,
  "quantity": 800,
  "salesStartAt": "2026-09-25T05:00:00Z",
  "salesEndAt": "2026-10-12T12:00:00Z",
  "maxPerOrder": 10,
  "hidden": false,
  "counts": { "available": 214, "reserved": 0, "sold": 586, "refunded": 0, "checkedIn": 0 }
}
```

- `price` is whole KZT. It is `0` for `free` types, and the server should force 0 for free types.
- `counts` are computed by the server from orders, holds, refunds and check-ins (SRS 4.3).
  The UI shows them as-is. **Sold out = `available` is 0**, and the UI never computes it.
- `hidden` types aren't offered to attendees, but their sold tickets stay valid and they still count in reports.
- Paid types can be created before paid-sales activation. They must not be purchasable unless the
  event's paid sales are `active` (SRS 4.5; see "Paid sales activation" below). Free types are unaffected.

| Method | Path | Request | Response | Error codes the UI handles |
|---|---|---|---|---|
| GET | `/api/events/:eventId/ticket-types` | — | `TicketTypeDto[]` including hidden ones (organizer view) | — |
| POST | `/api/events/:eventId/ticket-types` | `{ name, description, kind, price, quantity, salesStartAt, salesEndAt, maxPerOrder }` | `201` `TicketTypeDto` | `422` validation |
| PATCH | `/api/events/:eventId/ticket-types/:id` | same body as POST, **or** `{ "hidden": true \| false }` | `TicketTypeDto` | `409 quantity_below_sold` when `quantity` < sold + reserved |
| DELETE | `/api/events/:eventId/ticket-types/:id` | — | `204` | `409 ticket_type_has_sales` when anything is sold or reserved (hide instead) |

Validation the UI applies, which the server should also apply:
- name: 1–80 characters
- description: up to 300 characters
- paid price: 1 to 10,000,000
- quantity: 1 to 100,000
- `salesEndAt` after `salesStartAt` and no later than the event's `endsAt`
- `maxPerOrder`: 1 to 50 and no more than `quantity`

---

## Paid sales activation — needed by: wizard step 3, the per-event Paid sales page, ticket statuses, the event preview

Activation is **per event** (SRS 4.5). In the academic MVP every check is a **simulation**: no identity
provider, bank or card network is called, and the fee is recorded, not charged. While `simulated` is
`true` the UI labels the whole checklist SIMULATION and asks organizers to use test data only.

### Status object (`PaidSalesStatusDto`)

```json
{
  "eventId": "evt_123",
  "state": "not_started | in_progress | active | suspended",
  "simulated": true,
  "activationFee": 9900,
  "termsVersion": "2026-09",
  "checklist": {
    "identity": { "done": true, "verifiedName": "Aigerim Sadykova" },
    "payout":   { "done": true, "accountLast4": "4417" },
    "fee":      { "done": true, "paidAt": "2026-09-20T08:00:00Z", "reference": "SIM-9900-0001" },
    "terms":    { "done": true, "acceptedAt": "2026-09-20T08:05:00Z" }
  },
  "activatedAt": "2026-09-20T08:06:00Z",
  "suspension": { "reason": "Shown to the organizer", "suspendedAt": "2026-10-01T10:00:00Z" }
}
```

- `GET` for an event that never started returns `state: "not_started"` with every item `done: false`, not 404.
- `activationFee` is KZT and set by the server; the UI only displays it.
- The server must store the IBAN but **return only `accountLast4`**. Don't echo the IIN back either.
- `fee.reference` must make it obvious the record is simulated (e.g. a `SIM-` prefix). SRS 4.6: demo payment
  records must never look like real transactions, in the UI or in exports.
- `suspension` is present only while `state` is `suspended`.
- **Enforcement is server-side**: checkout must reject paid ticket types unless `state` is `active`.

| Method | Path | Request | Response | Error codes the UI handles |
|---|---|---|---|---|
| GET | `/api/events/:eventId/paid-sales` | — | `PaidSalesStatusDto` | — |
| POST | `/api/events/:eventId/paid-sales/identity` | `{ "fullName", "iin" }` | `PaidSalesStatusDto` | `422 invalid_iin`, `409 paid_sales_suspended` |
| POST | `/api/events/:eventId/paid-sales/payout` | `{ "accountHolder", "iban" }` (IBAN without spaces, upper case) | `PaidSalesStatusDto` | `422 invalid_iban`, `409 paid_sales_suspended` |
| POST | `/api/events/:eventId/paid-sales/fee` | `{}` | `PaidSalesStatusDto`, records the simulated payment | `409 paid_sales_suspended` |
| POST | `/api/events/:eventId/paid-sales/terms` | `{ "termsVersion" }` | `PaidSalesStatusDto` | `409 paid_sales_suspended` |
| POST | `/api/events/:eventId/paid-sales/activate` | `{}` | `PaidSalesStatusDto` with `state: "active"` | `409 checklist_incomplete`, `409 paid_sales_suspended` |

Any checklist call moves `not_started` to `in_progress`. `activate` must re-check every item itself.

Validation the UI applies, which the server should also apply:
- IIN: exactly 12 digits
- IBAN: `KZ`, 2 digits, then 16 letters or digits (20 characters)
- names: required

Suspension (platform admin, SRS 4.5) arrives with the admin portal in Phase 2. Proposed:
`POST /api/admin/events/:eventId/paid-sales/suspend` `{ "reason" }` and `.../reinstate`.
The organizer UI already shows the suspended state and reason.

Open questions:
- Is the activation fee refundable if the event is cancelled? (SRS 12 lists this as undecided.)
- Should identity and payout carry over to the organizer's next event, or be redone per event? The UI
  assumes per event, as SRS 4.5 says activation applies only to the selected event.
- Can the organizer change the payout account after activation?

---

## Promo campaigns — needed by: the per-event Campaigns page (and later the public event page and checkout)

SRS 4.14. The server generates the promo code (unless the organizer picks one), the trackable
link, the Campaign QR image and every number. **The web app never calculates a discount.**

### Campaign object (`CampaignDto`)

```json
{
  "id": "cmp_1",
  "eventId": "evt_123",
  "name": "University posters",
  "code": "STUDENT20",
  "discountType": "percent | fixed",
  "discountValue": 20,
  "validFrom": "2026-09-25T05:00:00Z",
  "validUntil": "2026-10-12T12:00:00Z",
  "maxRedemptions": 100,
  "ticketTypeIds": [],
  "enabled": true,
  "status": "active | scheduled | expired | exhausted | disabled",
  "link": "https://biletflow.kz/events/evt_123?campaign=k3j9x0p2q8w7e5r1",
  "qrImageUrl": "https://…/campaigns/cmp_1/qr.svg",
  "qrDownloadUrl": "https://…/campaigns/cmp_1/qr.svg?download=1",
  "stats": { "redemptions": 38, "orders": 31, "ticketsSold": 38, "grossRevenue": 247000, "discountTotal": 49400, "netRevenue": 197600 },
  "createdAt": "2026-09-20T00:00:00Z"
}
```

- `discountValue` is a whole percent (1–100) or whole KZT, depending on `discountType`.
- `maxRedemptions: null` means unlimited. `ticketTypeIds: []` means every ticket type of the event.
- `status` is computed by the server. Precedence the UI expects: `disabled`, then `exhausted`, then `scheduled`/`expired` by date, otherwise `active`.
- `link` must be HTTPS and carry an **opaque token** (`?campaign=…`). It must not contain the code or the discount.
  Step 9 (public event page) reads this parameter and asks the server to validate it before showing anything.
- **QR image:** generated by the server, SVG preferred (sharp on posters). It must be visibly different
  from an admission-ticket QR, for example with a "PROMO" banner or a dashed frame drawn into the image itself.
  That matters because the downloaded file is printed without the web UI around it.
  `qrDownloadUrl` should respond with `Content-Disposition: attachment`.
- The check-in endpoint and the mobile app must **reject** campaign tokens as entry (SRS 4.14).
- `stats` are exact server records (SRS 4.14). Money is in KZT. `netRevenue` = `grossRevenue` − `discountTotal`, calculated by the server.
- A fixed discount never takes a ticket below 0. The server clamps it.

| Method | Path | Request | Response | Error codes the UI handles |
|---|---|---|---|---|
| GET | `/api/events/:eventId/campaigns` | — | `CampaignDto[]`, newest first | — |
| POST | `/api/events/:eventId/campaigns` | `{ name, code, discountType, discountValue, validFrom, validUntil, maxRedemptions, ticketTypeIds }` (`code: ""` = generate one) | `201` `CampaignDto` | `409 promo_code_taken`, `422` validation |
| PATCH | `/api/events/:eventId/campaigns/:id` | `{ "enabled": true \| false }` | `CampaignDto` | — |

Codes are unique across the platform and case-insensitive. The server stores them in upper case.
Disabling a campaign stops new redemptions immediately, and orders already placed keep their discount.
Creating and disabling a campaign should be written to the event activity timeline (SRS: "promo-code creation or disabling"; UI in Phase 2).

Validation the UI applies, which the server should also apply:
- name: 1–80 characters
- code: empty, or 4–20 characters from `A–Z`, `0–9` and `-`
- percent: 1–100; fixed: 1 to 10,000,000 KZT
- `validUntil` after `validFrom` and no later than the event's `endsAt`
- `maxRedemptions`: null or 1–100,000
- `ticketTypeIds` must belong to the event

Not in the UI yet:
- Editing a campaign after creation. Changing a discount after redemptions makes the stats hard to read,
  so the UI only offers disable plus create-new for now.

Open questions:
- Can campaigns apply to free ticket types, for attribution only?
- May one order combine several codes? The UI will assume one code per order.

---

## Public events — needed by: Discover, the public event page, promo codes, campaign links (later: checkout)

No sign-in required. Only **published** events are returned; `private` events are treated as not found
until "private" is defined (see the open question under Events). `unlisted` events open by ID/link but
never appear in the list.

### Summary object (`GET /api/public/events`)

```json
{
  "id": "evt_123",
  "title": "Almaty Nights — Vol. 4",
  "category": "Music",
  "coverUrl": "https://…/cover.jpg",
  "startsAt": "2026-10-12T14:00:00Z",
  "timeZone": "Asia/Almaty",
  "venue": { "name": "Almaty Arena", "city": "Almaty" },
  "priceFrom": 6500,
  "allFree": false,
  "available": 252,
  "total": 1120
}
```

- Query: `q` (matches title, venue and city, case-insensitive) and `category`. Only upcoming events, sorted by `startsAt`.
- Only `public` + `published` events. Hidden ticket types are excluded from `priceFrom`, `available` and `total`.
- `priceFrom` is `null` when no ticket type is listed. `total` is only used to draw the remaining-tickets bar.

### Event object (`GET /api/public/events/:id`)

The organizer `EventDto` fields that attendees may see (no `status`, `visibility` or `format`), plus:

```json
{
  "organizerName": "Nomad Sound Collective",
  "registration": "not_open | open | closed",
  "paidSalesActive": true,
  "paymentsSimulated": true,
  "ticketTypes": [
    {
      "id": "tt_1", "name": "General admission", "description": "…", "kind": "paid",
      "price": 6500, "maxPerOrder": 10, "available": 214,
      "salesStartAt": "…", "salesEndAt": "…",
      "state": "on_sale | scheduled | ended | sold_out | unavailable"
    }
  ]
}
```

- `ticketTypes` excludes hidden types. `state` is decided by the server: `unavailable` = paid type while
  paid sales aren't `active` (not activated or suspended, SRS 4.5). Only `on_sale` types can be selected.
- `paymentsSimulated: true` makes the UI show "payments are simulated, no money moves" next to any total (SRS 4.6).
- `404 event_not_found` for drafts, cancelled, private and unknown events.

### Promo codes and campaign links (SRS 4.14)

`AppliedPromo`: `{ "code": "STUDENT20", "discountType": "percent", "discountValue": 20, "ticketTypeIds": [] }`.
The UI shows "STUDENT20 applied: 20% off" from these fields but never calculates the discount itself.

| Method | Path | Request | Response | Error codes the UI handles |
|---|---|---|---|---|
| GET | `/api/public/events/:id/campaign-links/:token` | — | `AppliedPromo` | all promo codes below |
| POST | `/api/public/events/:id/promo-codes/check` | `{ "code" }` (any case) | `AppliedPromo` | all promo codes below |
| POST | `/api/public/events/:id/quote` | `{ "items": [{ "ticketTypeId", "quantity" }], "promoCode": "STUDENT20" \| null }` | `Quote` | promo codes below, `409 ticket_unavailable`, `422 quantity_over_limit` |

Promo error codes (the UI shows its own translated text for each, SRS 4.14 "clear message"):
`404 promo_not_found`, `409 promo_not_started`, `409 promo_expired`, `409 promo_disabled`,
`409 promo_exhausted`, `409 promo_not_applicable` (quote only: none of the chosen ticket types is covered).

The campaign-link endpoint is where a QR scan or link visit should be **recorded for attribution**
(without personal data; SRS 4.14 / GA4 note). Checking or quoting a code must **not** count as a redemption.
Redemptions are recorded only when an order is paid (step 10).

### Quote object

```json
{
  "lines": [{ "ticketTypeId": "tt_1", "name": "General admission", "quantity": 1, "unitPrice": 6500, "lineTotal": 6500 }],
  "subtotal": 25000,
  "discount": 5000,
  "promoCode": "STUDENT20",
  "fee": 700,
  "total": 20700
}
```

- All KZT, all calculated by the server. The UI shows exactly these numbers (prototype screen 2: 25 000 − 5 000 + 700 = 20 700).
- A quote is a **preview, not a reservation**: nothing is held. Checkout (step 10) reserves inventory and re-prices.
- The mock charges a 3.5% processing fee on the discounted subtotal, which matches the prototype. The real rate is the backend's decision.
- Discounts apply only to paid lines covered by the promo. A fixed discount is per ticket and never takes a ticket below 0.

Open questions:
- Processing fee: who pays it (attendee on top, as the prototype shows, or deducted from the organizer), and what rate?
- Is a quote valid for a fixed time, or can prices change between quote and checkout?

---

## Checkout — needed by: the checkout pages (SRS 4.4 free registration, 4.6 checkout and payments)

Requires a signed-in user (the UI sends anonymous visitors to sign-in first). A reservation belongs to
the user who created it; other users get `404`.

### Flow

1. `POST /api/checkout/reservations` holds the inventory (counts move to `reserved`) and prices the order.
2. The attendee enters a name per ticket and accepts the refund policy.
3. `POST …/:id/confirm` pays (or, for a zero total, registers). Tickets are created **only** on success
   (counts move from `reserved` to `sold`, and any promo redemption is recorded on the campaign).
4. A declined payment creates nothing and leaves the hold until it expires, so the attendee can retry.
5. Holds that expire or are cancelled release their inventory. Abandoned checkouts never create tickets.

### Reservation object (`ReservationDto`)

```json
{
  "id": "res_123",
  "status": "held | expired | cancelled | completed",
  "expiresAt": "2026-10-01T10:10:00Z",
  "event": {
    "id": "evt_123", "title": "…", "startsAt": "…", "endsAt": "…", "timeZone": "Asia/Almaty",
    "venue": { "name": "Almaty Arena", "city": "Almaty" }, "refundPolicy": "…"
  },
  "quote": { "lines": […], "subtotal": 25000, "discount": 5000, "promoCode": "STUDENT20", "fee": 700, "total": 20700 },
  "paymentsSimulated": true,
  "orderId": "ord_123"
}
```

- `quote` has the same shape as the public quote, but it's **binding** for this reservation.
- Hold length is the server's choice. The UI just counts down to `expiresAt` (the mock uses 10 minutes).
- Expiry must be enforced by the server; the UI's timer is only a display. `GET` after `expiresAt` returns `expired`.

| Method | Path | Request | Response | Error codes the UI handles |
|---|---|---|---|---|
| POST | `/api/checkout/reservations` | `{ eventId, items: [{ ticketTypeId, quantity }], promoCode \| null }` | `201` `ReservationDto` | public promo codes, `409 ticket_unavailable`, `409 insufficient_inventory`, `422 quantity_over_limit`, `422 empty_order` |
| GET | `/api/checkout/reservations/:id` | — | `ReservationDto` | `404` |
| DELETE | `/api/checkout/reservations/:id` | — | `ReservationDto` with `status: "cancelled"` | — |
| POST | `/api/checkout/reservations/:id/confirm` | `{ attendees: [{ ticketTypeId, name }], simulatedOutcome?: "success" \| "declined" }` | `201` `OrderSummaryDto` | `409 reservation_expired`, `409 reservation_not_held`, `402 payment_declined`, `422 attendees_invalid` |

- `attendees`: one entry per ticket, in the order of `quote.lines` expanded by quantity. Names are 1–100 characters.
- `simulatedOutcome` exists **only** for the simulation (SRS 4.6 allows "a clearly labelled internal simulation").
  The demo UI lets the user pick a declined card to show the failure path. A real or sandbox provider ignores it.
  With a real provider, `confirm` would instead return a redirect URL. That's a later change.
- Free orders (`total` 0) skip payment entirely (SRS 4.4) and create an order with a zero total.
- `confirm` must be idempotent per reservation: a double click or retry must never create two orders.

### Order summary (`OrderSummaryDto`)

```json
{ "id": "ord_123", "number": "BF-7K2Q9D", "eventId": "evt_123", "status": "paid | confirmed",
  "total": 20700, "ticketCount": 2, "paymentsSimulated": true, "createdAt": "…" }
```

`paymentsSimulated` must be stored on the order itself, so demo orders are labelled as simulated
everywhere (receipts, My orders, organizer reports, exports). Step 11 adds the full order and ticket endpoints.

The confirmation email with the QR tickets (SRS 4.4, 4.7) is sent by the server after `confirm` succeeds.

Open questions:
- Hold length: is 10 minutes right?
- Should a user be limited to one active hold per event?

---

## Orders and tickets — needed by: order confirmation, My orders, My tickets, the ticket page (SRS 4.7)

Signed-in users only, and only their own orders (`404` for anyone else's).

| Method | Path | Response |
|---|---|---|
| GET | `/api/me/orders` | `OrderListItemDto[]`, newest first |
| GET | `/api/me/orders/:id` | `OrderDto` (list item + lines, totals, payment method, tickets) |
| GET | `/api/me/tickets` | `TicketDto[]` across all orders |
| GET | `/api/me/tickets/:id` | `TicketDto` |

### Order (`OrderDto`)

```json
{
  "id": "ord_123", "number": "BF-NGT4A2",
  "status": "paid | confirmed | partially_refunded | refunded | cancelled",
  "event": { "id": "evt_123", "title": "…", "startsAt": "…", "endsAt": "…", "timeZone": "Asia/Almaty",
             "venue": { "name": "Almaty Arena", "address": "Momyshuly Ave 1", "city": "Almaty" } },
  "total": 20700, "ticketCount": 2, "paymentsSimulated": true, "createdAt": "…",
  "lines": [{ "ticketTypeId": "tt_1", "name": "General admission", "quantity": 1, "unitPrice": 6500, "lineTotal": 6500 }],
  "subtotal": 25000, "discount": 5000, "promoCode": "STUDENT20", "fee": 700,
  "paymentMethod": "Simulated card",
  "tickets": [TicketDto, …]
}
```

- `event` is a **snapshot** taken when the order was placed, so orders stay readable after the event is edited or cancelled.
- `paymentMethod` is a display label only. **Never card numbers**, not even the last 4 digits. It's localized via `Accept-Language`.
- `confirmed` = free order (SRS 4.4). The list item is the same object without `lines` through `tickets`.

### Ticket (`TicketDto`)

```json
{
  "id": "TK-7Q2M-K9XD",
  "orderId": "ord_123", "orderNumber": "BF-NGT4A2",
  "event": { …same snapshot… },
  "ticketTypeName": "VIP balcony",
  "attendeeName": "Aigerim Sadykova",
  "seat": { "section": "Balcony B", "row": "2", "seat": "14" },
  "status": "valid | checked_in | cancelled | refunded",
  "checkedInAt": "2026-10-12T13:41:00Z",
  "qrImageUrl": "https://…/tickets/TK-7Q2M-K9XD/qr.svg",
  "pdfUrl": "https://…/tickets/TK-7Q2M-K9XD/ticket.pdf"
}
```

- `id` is the single ticket identifier, shared by the email, the account view, the PDF and any printout.
  Printing or downloading again must never create a second admission (SRS 4.7).
- **QR:** generated by the server. It encodes a **signed, opaque token** (tamper-resistant; the check-in app
  verifies the signature and asks the server for the live status). It must not encode the attendee's name or the price.
  SVG preferred, with a quiet zone, and high enough error correction to scan from a grayscale printout.
  It must be plain, so it can't be confused with the dashed "PROMO" campaign QR.
- `qrImageUrl` is `null` for `cancelled` and `refunded` tickets; the UI shows "not valid for entry" instead.
  The check-in endpoint must reject them anyway (SRS 4.9: refunded tickets can't be scanned).
- **PDF:** print-optimized A4 with the event name, date/time (event zone), venue, ticket type, attendee name,
  seat when assigned, ticket ID and a QR of at least 50 mm. No payment details. Served with
  `Content-Disposition: attachment`. The web app also has a print stylesheet for printing straight from the browser.
- `seat` is `null` for general admission (seat maps are Phase 3).
- The confirmation email (sent after checkout) should link to `/tickets/:id` and attach or link the PDFs.

The mocks draw a "MOCK QR · NOT SCANNABLE" placeholder and a text-only mock PDF, both clearly marked.

---

## Support — needed by: Get help (event, order, ticket pages), Help pages, case thread (SRS 4.13)

Asynchronous only: no WebSocket. The UI reloads a case after each action.

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/support/cases?mine=true` | — | `SupportCaseSummaryDto[]`: cases the user opened, newest activity first |
| GET | `/api/support/cases?managed=true` | — | cases the user handles: attendee cases for events they manage (organizer staff), or all cases (platform admin) |
| GET | `/api/support/cases/:id` | — | `SupportCaseDto`; `404` if the user is neither the requester nor staff for the case |
| POST | `/api/support/cases` | `{ kind, category, subject, message, eventId?, orderId?, ticketId? }` | `201` `SupportCaseDto` |
| POST | `/api/support/cases/:id/messages` | `{ body }` | `SupportCaseDto` |
| PATCH | `/api/support/cases/:id` | `{ status?, assigneeId? \| null }` (staff only) | `SupportCaseDto`; `403` for non-staff |

```json
{
  "id": "sc_1001", "number": "SC-1001",
  "kind": "attendee | organizer",
  "category": "ticket_delivery | payment | refund | seating | event_information | check_in | account | activation | technical",
  "status": "open | in_progress | waiting_for_customer | resolved",
  "subject": "…",
  "requester": { "id": "usr_1", "name": "…" },
  "assignee": { "id": "usr_2", "name": "…" },
  "context": { "event": { "id": "…", "title": "…" }, "order": { "id": "…", "number": "BF-…" }, "ticket": { "id": "TK-…" } },
  "createdAt": "…", "updatedAt": "…",
  "messages": [{ "id": "…", "author": { "id": "…", "name": "…", "side": "requester | staff" }, "body": "…", "createdAt": "…" }],
  "canManage": false,
  "assignableStaff": [{ "id": "…", "name": "…" }]
}
```

- `context` is resolved by the server from the IDs. It should ignore IDs the requester doesn't own and include only what they're entitled to see.
- **Who handles a case:** `attendee` cases go to the staff of the event's organizer; `organizer` cases go to platform admins.
  Admins can open any case (moderation and escalation, SRS 4.12).
- **Suggested status transitions:** a staff reply moves `open` to `in_progress`. A requester reply moves
  `waiting_for_customer` or `resolved` back to `open`. Statuses are never deleted, and the history is retained.
- **Notifications** (SRS 4.10): a new message notifies the other side; a status change notifies the requester; an assignment notifies the assignee.
- Message bodies are plain text, 1–4000 characters. The UI warns users not to post card numbers or passwords.

## Notifications — needed by: the header bell and notifications page (SRS 4.10)

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/me/notifications` | — | `NotificationDto[]`, newest first (the latest 50 is enough) |
| PATCH | `/api/me/notifications/:id` | `{ "read": true }` | `204` |
| POST | `/api/me/notifications/read-all` | — | `204` |

```json
{ "id": "ntf_1", "type": "order_confirmed | payment_failed | event_updated | event_cancelled | refund_completed | payout_status | support_reply | support_assigned | support_status",
  "title": "Localized title", "body": "Localized text", "link": "/support/sc_1001", "read": false, "createdAt": "…" }
```

- `title` and `body` are localized by the server (`Accept-Language`). `link` is an in-app path.
- Email copies are the server's job. Account verification email already exists in the auth flow.

---

## Organizer back office — needed by: My events tabs, event overview, orders & attendees, staff, activity, profile

All endpoints are for the organizer staff of the event; platform admins may read them too. Everything is computed by the server.

### Event lifecycle (additions to "Events")

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/api/events/:id/cancel` | `{ "reason" }` | `EventDto` with `status: "cancelled"`. The server invalidates every ticket, fully refunds paid orders, cancels free registrations, notifies attendees (`event_cancelled`) and writes the timeline. Irreversible; `409 already_cancelled`. |
| POST | `/api/events/:id/duplicate` | — | `201` `EventDto`: a new **draft** with the same details and ticket-type setup (counters zero). Never copies orders, tickets, payments, check-ins, campaigns or support cases (SRS 4.16). |

The My events tabs (Upcoming / Active / Completed / Cancelled) are derived in the UI from `status`, `startsAt` and `endsAt`.

### Orders and attendees (SRS 4.4, 4.9)

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/organizer/events/:id/orders` | — | `OrganizerOrderDto[]`, newest first |
| POST | `/api/organizer/events/:id/orders/:orderId/refund` | `{ "reason" }` | `OrganizerOrderDto` after the refund; `409 not_refundable` |

```json
{ "id": "ord_1", "number": "BF-NGT4A2", "buyer": { "name": "…", "email": "…" },
  "status": "paid | confirmed | partially_refunded | refunded | cancelled",
  "total": 20700, "refundedAmount": 0, "ticketCount": 2, "paymentsSimulated": true, "createdAt": "…", "promoCode": "STUDENT20",
  "tickets": [{ "id": "TK-…", "ticketTypeName": "…", "attendeeName": "…", "status": "valid", "seat": null, "checkedInAt": null }],
  "refundable": true }
```

- **Full refunds only** (SRS 4.9 "initiate full refunds"). For a free order the same call cancels the registration.
- On success, the order's tickets become `refunded` or `cancelled` and can't be checked in. The attendee is notified (`refund_completed`).
  The refund goes in the audit log with the reason, and inventory counts move from `sold` to `refunded`.
- `refundable` is the server's decision (refund window, already refunded, checked-in tickets, and so on).

### Check-in staff (SRS 4.8)

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/organizer/events/:id/staff` | — | `StaffMemberDto[]`: `{ id, name, email, role: "event_admin", addedAt }` |
| POST | `/api/organizer/events/:id/staff` | `{ "email" }` | `201` `StaffMemberDto`; `404 user_not_found` (they must register first), `409 already_staff` |
| DELETE | `/api/organizer/events/:id/staff/:userId` | — | `204` |

The mobile app shows an Event Admin only the events they're assigned to.

### Organizer profile (SRS 4.1)

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/organizer/profile` | — | `OrganizerProfile` |
| PUT | `/api/organizer/profile` | `{ organizationName, contactEmail, contactPhone, website, about, payout?: { accountHolder, iban } }` | `OrganizerProfile`; `422 invalid_iban` |

`payout`: `{ status: "not_set | pending | verified", accountHolder, ibanLast4, simulated }`. The full IBAN is never returned.
A payout change resets `status` to `pending` and sends a `payout_status` notification when verified.

### Analytics (SRS 4.6, 4.15)

`GET /api/organizer/events/:id/analytics?from=&to=&ticketTypeId=` → `EventAnalytics`:

```json
{ "capacity": 1200, "sold": 864, "remaining": 336, "percentSold": 72,
  "gross": 8172000, "discounts": 49400, "refunds": 0, "fees": 284298, "net": 8122600, "estimatedPayout": 8122600, "paymentsSimulated": true,
  "salesOverTime": [{ "date": "2026-11-20", "tickets": 120, "gross": 1135000 }],
  "byTicketType": [{ "ticketTypeId": "tt_1", "name": "General admission", "sold": 586, "capacity": 800, "gross": 3809000 }],
  "campaigns": [{ "code": "STUDENT20", "name": "…", "redemptions": 38, "tickets": 38, "gross": 247000, "discount": 49400, "net": 197600 }],
  "attendance": { "checkedIn": 0, "absent": 864, "percent": 0 },
  "ticketTypes": [{ "id": "tt_1", "name": "General admission" }] }
```

- Calculated from authoritative order, ticket, campaign, refund and check-in records. No demographic data is involved.
- `salesOverTime` is bucketed by day in the event's time zone (`date` is `YYYY-MM-DD`). `from` and `to` filter the series; `ticketTypeId` scopes every figure.
- `paymentsSimulated: true` makes the UI label the money as demonstration revenue.
- Open question: `fees` are processing charges paid by attendees on top. Confirm whether the payout should deduct any platform fee.

### Activity timeline (SRS 4.16)

`GET /api/organizer/events/:id/timeline?from=&to=&type=` → `[{ id, at, actor: { name }, type, entity, description }]`, newest first.

- `type`: `event | ticket_type | order | refund | campaign | support | check_in | staff | paid_sales`.
- At minimum, include publish, unpublish and cancel; ticket price and capacity changes; refunds; promo created or disabled;
  support status changes; check-ins and check-in reversals; and staff changes.
- Entries are append-only: there's no edit or delete endpoint. `description` is localized by the server.

---

## Administration — needed by: the admin portal `/admin/*` and "Report this event" (SRS 4.5, 4.12)

Every `/api/admin/*` endpoint requires `platform_admin` (`403` otherwise). Every suspend, reinstate and settings change
is written to the audit log with the admin and the reason. Dates are ISO strings.

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/admin/search?q=` | — | `{ users: AdminUser[], events: AdminEvent[], orders: AdminOrder[], payments: AdminPayment[] }` (each capped, e.g. 20) |
| GET | `/api/admin/events` | — | `AdminEvent[]` |
| PUT | `/api/admin/users/:id/suspension` | `{ suspended, reason }` | `AdminUser`. A suspended user can't sign in, and their sessions are revoked. |
| PUT | `/api/admin/events/:id/suspension` | `{ suspended, reason }` | `AdminEvent`. Stops **all** sales. Public pages return `salesSuspended: true`, and every ticket type is `unavailable`. |
| PUT | `/api/admin/events/:id/paid-sales/suspension` | `{ suspended, reason }` | `AdminEvent`. Paid sales go to `suspended` (with the reason shown to the organizer); reinstating returns them to `active`. |
| GET | `/api/admin/reports` | — | `EventReport[]` |
| PATCH | `/api/admin/reports/:id` | `{ status: "dismissed" \| "actioned" }` | `EventReport` |
| GET | `/api/admin/activations` | — | `ActivationRecord[]`: paid-sales state, fee amount and reference, activation time, suspension reason |
| GET | `/api/admin/payments?status=&kind=` | — | `AdminPayment[]`: `{ id, reference, kind: charge \| refund \| activation_fee, status: succeeded \| failed \| disputed, amount, orderNumber, eventTitle, createdAt, simulated }` |
| GET | `/api/admin/promo-activity` | — | `{ eventTitle, code, status, redemptions, discountTotal }[]` |
| GET / PUT | `/api/admin/settings` | `{ activationFee, processingFeePercent, holdMinutes, supportEmail }` | `PlatformSettings` |
| POST | `/api/public/events/:id/reports` | `{ reason: fraud \| misleading \| inappropriate \| other, details }` (signed-in users only) | `204`. The reporter's identity is visible to admins only. |

- `AdminUser`: `{ id, name, email, roles, status: active | suspended }`.
- `AdminEvent`: `{ id, title, organizerName, status, startsAt, paidSales, suspended, openReports }`.
- `simulated: true` payments must be labelled as demonstration records everywhere, CSV exports included (SRS 4.6).
  The web app builds CSV exports from these list endpoints. A server-side export endpoint is welcome for large datasets.
- Settings: a new `activationFee` applies to events that start activation afterwards, and `processingFeePercent`
  applies to quotes created afterwards. Existing reservations keep their price.

---

## Assigned seating — needed by: Seating on the Ticket types page, the seat map on the event page, checkout (SRS 4.3.1)

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/venue-layouts` | — | `VenueLayout[]`: `{ id, name, description, seatCount, categories: [{ id, label }], sections: [{ id, name, rows: [{ label, seats: [{ id, number, category, accessible }] }] }] }` |
| GET / PUT | `/api/events/:id/seating` | `{ mode: general_admission \| assigned, layoutId, categoryTicketTypes: { [categoryId]: ticketTypeId } }` | the same object; `409 seating_has_sales` once seats are sold |
| GET | `/api/public/events/:id/seat-map` | — | `{ mode, layoutName, categories, sections }`. Every seat has `status: available \| held \| sold \| unavailable`, plus `ticketTypeId` and `price`. |

- Checkout and quote items gain `seatIds` (`quantity` = number of seats). `POST /api/checkout/reservations` holds those seats
  for the reservation (`409 seat_unavailable` if any was just taken) and returns `seats: [{ seatId, ticketTypeId, section, row, seat }]`.
- The server must make holding a seat atomic, so two concurrent checkouts can never hold or buy the same seat
  (for example a unique constraint on event + seat for active holds and sales).
- An expired or cancelled reservation releases its seats. On payment, the section, row and seat are stored on the order item and the ticket (`seat`).
- A seat's ticket-type capacity should equal the number of seats mapped to it.

---

## Accounts — needed by: sign in/out, registration, email verification, password reset, route guards

### User object

```json
{
  "id": "usr_123",
  "name": "Aigerim Sadykova",
  "email": "aigerim@example.kz",
  "roles": ["attendee", "organizer"],
  "emailVerified": true
}
```

`roles` uses `attendee`, `organizer` and `platform_admin`. The web app shows or hides
areas based on roles, but **the server must enforce them**. Event Admin (check-in
staff) is a per-event assignment for the mobile app, not a web role.

| Method | Path | Request | Response | Error codes the UI handles |
|---|---|---|---|---|
| GET | `/api/auth/me` | — | `{ "user": User }` | `401` when there is no session (the UI treats it as signed out) |
| POST | `/api/auth/sign-in` | `{ "email", "password" }` | `{ "user": User }` and sets the session cookie | `401 invalid_credentials`, `403 email_not_verified` |
| POST | `/api/auth/sign-out` | — | `204`, clears the cookie | — |
| POST | `/api/auth/register` | `{ "name", "email", "password", "accountType": "attendee" \| "organizer" }` | `201`, sends the verification email. No session yet. | `409 email_taken`, `422 weak_password` |
| POST | `/api/auth/verify-email` | `{ "token" }` | `204` | `400 invalid_token` (also for expired) |
| POST | `/api/auth/resend-verification` | `{ "email" }` | `204` (also for unknown or already-verified emails) | — |
| POST | `/api/auth/forgot-password` | `{ "email" }` | `204` **always**, so attackers can't discover which emails have accounts | — |
| POST | `/api/auth/reset-password` | `{ "token", "password" }` | `204` | `400 invalid_token`, `422 weak_password` |

Email links must point at the web app:
- verification: `{WEB_ORIGIN}/verify-email?token=…`
- password reset: `{WEB_ORIGIN}/reset-password?token=…`

Tokens should be single-use and short-lived. The UI's password minimum is 8 characters;
make the server's rule the same or looser.

Open questions:
- Should `accountType: "organizer"` grant the role immediately, or after an approval step?
- Can attendees check out without an account? The UI currently assumes an account is required.
