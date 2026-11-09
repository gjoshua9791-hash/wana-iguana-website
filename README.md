# Wana Iguana website

React and Vite frontend for the Wana Iguana senior project.

## Run locally

Install Node.js 24 (or another version supported by the locked Vite toolchain), then run:

```bash
npm ci
npm run dev
```

Vite prints a local URL. Before sharing changes, run `npm run lint` and `npm run build`.
Run the page-routing checks with `node --test src/utils/routes.test.js`.

## What works today

- Four responsive views: Home, Menu, Assistant, and Account. Navigation uses hash URLs (`#/home`, `#/menu`, `#/assistant`, `#/account`) so direct links and browser Back work on static hosting without a new routing dependency.
- Home has links to all views, a past-orders empty state, and an unavailable Order again control until order history exists. The Assistant view is reserved for a future implementation.
- Account displays empty states for name, payment methods, notifications, order history, and settings; there is no sign-in or payment data collection yet.
- Menu search by item name, description or category.
- Category links on the Menu view, including a direct link to Wana Specials from Home; drinks and beer display their prices.
- Keyboard skip link, visible focus, image descriptions and reduced-motion support.
- The shared footer on every view includes the restaurant phone number and a directions link.

The menu in `src/data/menu.js` is **sample/static content**. Prices, photos, descriptions, phone and address must be checked with the restaurant before publishing. The Specials section points to the existing **Wana Specials menu category**; it does not claim that these are today's specials. Call the restaurant for current hours and specials. Beer is marked dine-in only in its category note.

## Backend handoff

The frontend currently does not accept orders, take payments, authenticate customers or manage staff changes. Home's Order again control stays disabled until a signed-in user's real order history and validated reorder flow exist. Do not store payment credentials in frontend state or source files; use the approved payment provider workflow. Do not display an active cart/checkout until the backend provides validated catalog choices, authoritative quotes, pickup availability and a tested Clover payment/kitchen workflow. The proposed public API includes `GET /api/v1/restaurant`, `GET /api/v1/menu` and `GET /api/v1/specials`; the staff API will need authenticated authorization. Replace the static menu in one small integration after those contracts are agreed with the backend and database owners.

Before staging, obtain sponsor-approved prices, hours, photos and specials; confirm the correct ordering link; provide a stable HTTPS menu URL for a QR code. Check keyboard operation and small-phone layouts with restaurant staff.
