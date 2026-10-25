# Wana Iguana website

React and Vite frontend for the Wana Iguana senior project.

## Run locally

Install Node.js 24 (or another version supported by the locked Vite toolchain), then run:

```bash
npm ci
npm run dev
```

Vite prints a local URL. Before sharing changes, run `npm run lint` and `npm run build`.

## What works today

- Responsive home, menu, About, Specials and contact sections.
- Menu search by item name, description or category.
- Category navigation, including displayed prices for drinks and beer.
- Keyboard skip link, visible focus, image descriptions and reduced-motion support.
- Phone and directions links.

The menu in `src/data/menu.js` is **sample/static content**. Prices, photos, descriptions, phone and address must be checked with the restaurant before publishing. The Specials section points to the existing **Wana Specials menu category**; it does not claim that these are today's specials. Call the restaurant for current hours and specials. Beer is marked dine-in only in its category note.

## Backend handoff

The frontend currently does not accept orders, take payments or manage staff changes. Do not display an active cart/checkout until the backend provides validated catalog choices, authoritative quotes, pickup availability and a tested Clover payment/kitchen workflow. The proposed public API includes `GET /api/v1/restaurant`, `GET /api/v1/menu` and `GET /api/v1/specials`; the staff API will need authenticated authorization. Replace the static menu in one small integration after those contracts are agreed with the backend and database owners.

Before staging, obtain sponsor-approved prices, hours, photos and specials; confirm the correct ordering link; provide a stable HTTPS menu URL for a QR code. Check keyboard operation and small-phone layouts with restaurant staff.
