## Summary

Adds a full invoice system across API, bot, and web — replacing the old reservation-based workflow. Members can now create, track, and fulfill invoices that group line items by counterparty. Shopping lists and a new command parser round out the feature set.

## Invoices

- Create and manage invoices with line items, status tracking, and fulfillment
- Bot commands: `!invoices` (dashboard), `!invoice <id>` (detail view with actions)
- Web: invoice panels with filtering, expanded row detail, contract breakdowns, and summary stats
- API: full CRUD endpoints on `InvoicesController`
- Database: `invoices` and `invoiceLineItems` tables (migrations 0005-0009)
- `!reservations` is deprecated — shows a redirect to `!invoices` and is hidden from `!help`
- `!reserve` and `!fill` commands removed entirely

## New Bot Commands

- `!order` — unified buy/sell command with modal-based input and confirmation before placement
- `!close` — close or cancel orders with confirmation
- `!delete` — now shows confirm/cancel buttons before deleting
- `!list` / `!lists` — create and manage shopping lists

## Shopping Lists

- Bot: create, view, edit, and share shopping lists
- Web: `ShoppingListPanel` with create/open/save dialogs and preference settings
- API: `ShoppingListsController` for list CRUD

## Parser Package

New `@kawakawa/parser` package for parsing structured text input (commodities, quantities, locations). Includes tokenizer, identifier resolver, list parser, and XIT format support — all with full test coverage.

## Batch Processing

- Reusable batch framework (`BatchProcess` interface) with `shouldRun()` gating and idempotent execution
- **Orphan reservation migration**: automatically creates invoices for any reservations not already linked to an invoice, grouped by counterparty/owner pair
- Runs as a POST_DEPLOY job on DigitalOcean (both dev and prod)

## Infrastructure

- `run-batch` POST_DEPLOY job added to DigitalOcean app specs
- GitHub Actions: auto-creates a GitHub Release with PR description as release notes on prod deploys
- Discord account linking view on web

## Test Plan

- [x] API: 500+ tests passing (35 files)
- [x] Bot: 575+ tests passing (39 files)
- [x] Parser: full test coverage
- [ ] Verify `run-batch` job runs successfully on first deploy (orphan migration)
- [ ] Verify `!invoices` and `!invoice` commands work end-to-end
- [ ] Verify `!reservations` shows deprecation message
- [ ] Verify shopping list commands work in bot and web
