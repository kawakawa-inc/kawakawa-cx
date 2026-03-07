# Bot Command Testing Guide

## General

### `/help`

Shows help documentation by topic.

- [ ] Run with no topic → shows overview with all sections
- [ ] Run with `topic:Getting Started` → shows auth commands
- [ ] Commands should show correct descriptions

---

## Auth

### `/whoami`

Shows your linked account info.

- [*] Linked user → shows username, display name, roles
- [*] Unlinked user → prompts to register/link

### `/register`

Creates a new Kawakawa account.

- [*] New user → registers successfully, assigns roles
- [*] Already linked → shows error
- [*] Duplicate username → rejected

### `/link`

Generates a secure link to connect Discord to existing Kawakawa account.

- [*] Not linked → shows embed with "Link Account" button (expires in 15min)
- [*] Already linked → shows error
- [*] Web flow: Click button → login on website → Discord linked

### `/unlink`

Disconnects Discord from account.

- [*] Account with password → unlinks immediately
- [*] Discord-only account → shows warning, requires confirmation

### `/password`

Generates password reset link.

- [*] Linked user → shows reset link with 24h expiry
- [*] Discord-only → labels as "set password"

---

## Market

### `/orders`

Views your market orders with filtering.

- [*] No filters → shows your orders
- [*] Filter by commodity → narrows results
- [*] Manage button → opens edit/delete modal
- [*] Share button → posts publicly

### `/query`

Flexible market search.

- [*] Simple query `COF BEN` → finds Coffee at Benten
- [*] XIT JSON → parses materials, shows "Save as List" button
- [*] With quantities `100 COF` → shows "Create Invoice" button
- [*] Missing items noted in description
- BUG: Invoice feature: Cannot add own orders to invoices

### `/reservations`

Views your reservations.

- [ ] Shows reservations where you're owner or counterparty
- [ ] Filter by status (pending/confirmed/etc.)
- [ ] Confirm/Reject/Fulfill/Cancel buttons work

### `/invoices`

Lists draft invoices.

- [ ] Shows invoices with item count and totals
- [ ] Empty state → shows guidance

### `/close`

Submits a draft invoice.

- [ ] By username → finds and submits
- [ ] By ID → finds and submits
- [ ] Empty invoice → error
- [ ] Creates reservations for all items

---

## Inventory

### `/inventory`

Views your FIO inventory.

- [*] Shows items grouped by location with storage icons
- [*] Filter by commodity/location works
- [*] Share button posts publicly

### `/sync`

Manages FIO integration.

- [*] Shows current sync status
- [*] Set credentials via modal
- [*] Sync Now → refreshes inventory
- [*] Clear credentials → removes API key

### `/buy`

Browse sell orders (supply) or create invoices.

**Query mode** (no counterparty — shows sell orders):

- [ ] Empty `!buy` → shows help embed with usage examples
- [ ] `!buy RAT` → shows all sell orders for RAT
- [ ] `!buy RAT BEN` → shows sell orders for RAT at Benten
- [ ] `!buy 20 RAT BEN` → shows sell orders with availability emojis (✅⚠️❌)

**Invoice mode** (with counterparty):

- [ ] `!buy RAT BEN @alice` → prompts for quantity, then creates invoice
- [ ] `!buy 20 RAT BEN @alice` → creates invoice (or detects duplicate → Update/Cancel)
- [ ] Commodity display respects user preference (ticker vs name)

### `/sell`

Browse buy orders (demand) or create invoices.

**Query mode** (no counterparty — shows buy orders):

- [ ] Empty `!sell` → shows help embed with usage examples
- [ ] `!sell RAT` → shows all buy orders for RAT
- [ ] `!sell RAT BEN` → shows buy orders for RAT at Benten
- [ ] `!sell 20 RAT BEN` → shows buy orders with availability emojis (✅⚠️❌)

**Invoice mode** (with counterparty):

- [ ] `!sell RAT BEN @alice` → prompts for quantity, then creates invoice
- [ ] `!sell 20 RAT BEN @alice` → creates invoice (or detects duplicate → Update/Cancel)
- [ ] Commodity display respects user preference (ticker vs name)

### `/order`

Create or manage market orders (moved from old `/buy` and `/sell`).

**Buy subcommand** (`!order buy`):

- [ ] `!order buy RAT 100 BEN` → creates buy order with confirmation
- [ ] Auto-pricing from price list
- [ ] Updates existing order if same commodity/location

**Sell subcommand** (`!order sell`):

- [ ] `!order sell COF BEN` → creates sell order
- [ ] `!order sell COF BEN reserve:100` → creates with limit
- [ ] Auto-pricing from price list
- [ ] Updates existing order if same commodity/location

### `/delete`

Deletes orders by commodity/location.

- [ ] Finds matching orders
- [ ] Type filter (sell/buy/all) works
- [ ] Confirmation before delete

### `/bulksell`

Creates multiple sell orders via modal.

- [ ] Multi-line input parsed
- [ ] Format: `COF BEN 150` per line
- [ ] Errors reported per-line

### `/bulkbuy`

Creates multiple buy orders via modal.

- [ ] Format: `COF BEN 100 150` (ticker location qty price)
- [ ] Quantity required per line

---

## Settings

### `/settings`

Interactive settings menu.

- [ ] Shows current values for all settings
- [ ] Change location display mode → persists
- [ ] Change default price list → persists
- [ ] Manage favorites (add/remove/clear)

---

## Lists

### `/list`

Creates a shopping list.

- [ ] With quantities: `100 COF 200 RAT` → creates list
- [ ] With XIT JSON → parses and names from JSON
- [ ] Items without quantities → error
- [ ] Custom name via `name:` option

### `/lists`

Views and manages shopping lists.

- [ ] Shows all lists with previews
- [ ] Select list → shows details with buttons
- [ ] **Query Market** → searches for matching sell orders
- [ ] **Share** → posts list publicly
- [ ] **Rename** → modal to change name
- [ ] **Delete** → confirmation then deletes
- [ ] **Create Invoice** (from query results) → starts invoice flow
