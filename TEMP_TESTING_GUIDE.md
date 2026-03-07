# Bot Command Testing Guide

Manual testing checklist for all Discord bot commands. Commands support both slash (`/command`) and prefix (`!command`) unless noted otherwise.

---

## General

### `/help`

Auto-generated help from command `helpInfo` metadata. Supports overview, category, and per-command views.

**Overview** (no arguments):

- [x] Shows overview embed with all category sections (Getting Started, Inventory, Trading, Orders, Invoices, Lists, Settings)
- [x] Each section lists its commands
- [x] Quick Start section present
- [x] Footer has a tip
- [x] Prefix: `!help` works

**Category view** (`topic:<category>`):

- [x] `topic:getting_started` -> shows Getting Started commands with details
- [x] `topic:Trading` -> resolves case-insensitively by title
- [x] `topic:orders` -> shows order management commands (order, orders, delete, bulksell, bulkbuy)
- [x] `topic:invoices` -> shows invoice/reservation commands
- [x] `topic:lists` -> shows list commands
- [x] `topic:settings` -> shows settings command
- [x] `topic:inventory` -> shows inventory/sync commands
- [x] Commands with details show them below the description
- [x] Prefix: `!help Trading` works

**Per-command view** (`topic:<command_name>`):

- [x] `topic:buy` -> shows /buy title, description, details, and examples
- [x] `topic:close` -> shows /close with details and examples
- [x] `topic:bulksell` -> shows slash-only footer (prefixEnabled=false)
- [x] Prefix: `!help buy` works

**Error handling**:

- [x] `topic:nonexistent` -> shows "Unknown topic or command" error

---

## Auth

### `/whoami`

Shows your linked account info.

- [x] Linked user -> shows username, display name, roles
- [x] Unlinked user -> prompts to register/link

### `/register`

Creates a new Kawakawa account.

- [x] New user -> registers successfully, assigns roles
- [x] Already linked -> shows error
- [x] Duplicate username -> rejected

### `/link`

Generates a secure link to connect Discord to existing Kawakawa account.

- [x] Not linked -> shows embed with "Link Account" button (expires in 15min)
- [x] Already linked -> shows error
- [x] Web flow: Click button -> login on website -> Discord linked

### `/unlink`

Disconnects Discord from account.

- [x] Account with password -> unlinks immediately
- [x] Discord-only account -> shows warning, requires `!unlink confirm`

### `/password`

Generates password reset link.

- [x] Linked user -> shows reset link with 24h expiry
- [x] Discord-only -> labels as "set password"
- [x] Unlinked user -> shows error

---

## Market

### `/orders`

Views your market orders with filtering.

- [ ] No filters -> shows your orders
- [ ] Filter by commodity -> narrows results
- [ ] Manage button -> opens edit/delete modal
- [ ] Share button -> posts publicly
- [ ] Prefix: `!orders` works

### `/order`

Create or manage market orders.

**Buy subcommand** (`/order buy` or `!order buy`):

- [ ] `!order buy RAT 100 BEN` -> creates buy order with confirmation
- [ ] Auto-pricing from price list when configured
- [ ] Updates existing order if same commodity/location
- [ ] Missing required args -> shows usage help

**Sell subcommand** (`/order sell` or `!order sell`):

- [ ] `!order sell COF BEN` -> creates sell order
- [ ] `!order sell COF BEN reserve:100` -> creates with reserve limit
- [ ] Auto-pricing from price list when configured
- [ ] Updates existing order if same commodity/location

### `/query`

Flexible market search.

- [ ] Simple query `COF BEN` -> finds Coffee at Benten
- [ ] XIT JSON paste -> parses materials, shows "Save as List" button
- [ ] With quantities `100 COF` -> shows "Create Invoice" button
- [ ] Missing items noted in description
- [ ] Prefix: `!query COF BEN` works (also `!q COF BEN` partial match)

### `/buy`

Browse sell orders (supply) or create invoices.

**Query mode** (no counterparty):

- [ ] Empty `!buy` -> shows help embed with usage examples
- [ ] `!buy RAT` -> shows all sell orders for RAT
- [ ] `!buy RAT BEN` -> shows sell orders for RAT at Benten
- [ ] `!buy 20 RAT BEN` -> shows sell orders with availability emojis

**Invoice mode** (with counterparty):

- [ ] `!buy RAT BEN @alice` -> prompts for quantity, then creates invoice
- [ ] `!buy 20 RAT BEN @alice` -> creates invoice (or detects duplicate -> Update/Cancel)
- [ ] Commodity display respects user preference (ticker vs name)

### `/sell`

Browse buy orders (demand) or create invoices.

**Query mode** (no counterparty):

- [ ] Empty `!sell` -> shows help embed with usage examples
- [ ] `!sell RAT` -> shows all buy orders for RAT
- [ ] `!sell RAT BEN` -> shows buy orders for RAT at Benten
- [ ] `!sell 20 RAT BEN` -> shows buy orders with availability emojis

**Invoice mode** (with counterparty):

- [ ] `!sell RAT BEN @alice` -> prompts for quantity, then creates invoice
- [ ] `!sell 20 RAT BEN @alice` -> creates invoice (or detects duplicate -> Update/Cancel)
- [ ] Commodity display respects user preference (ticker vs name)

### `/delete`

Deletes orders by commodity/location.

- [ ] Finds matching orders
- [ ] Type filter (sell/buy/all) works
- [ ] Confirmation before delete
- [ ] Prefix: `!delete COF BEN` works

### `/bulksell`

Creates multiple sell orders via modal.

- [ ] Modal opens with multi-line text input
- [ ] Format: `COF BEN 150` per line
- [ ] Errors reported per-line
- [ ] Slash command only (prefix disabled)

### `/bulkbuy`

Creates multiple buy orders via modal.

- [ ] Modal opens with multi-line text input
- [ ] Format: `COF BEN 100 150` (ticker location qty price)
- [ ] Quantity required per line
- [ ] Slash command only (prefix disabled)

### `/invoices`

Lists draft invoices.

- [ ] Shows invoices with item count and totals
- [ ] Empty state -> shows guidance message
- [ ] Prefix: `!invoices` works

### `/invoice`

View invoice details with context-sensitive actions.

- [ ] `!invoice 5` -> shows invoice #5 details
- [ ] Creator + draft -> Submit and Cancel buttons
- [ ] Creator + pending -> Cancel button
- [ ] Counterparty + pending -> Confirm and Reject buttons
- [ ] Terminal status (cancelled, fulfilled) -> read-only, no buttons
- [ ] Submit button creates reservations
- [ ] Footer shows contextual tips based on status/role

### `/close`

Submits a draft invoice to a target user.

- [ ] By username -> finds and submits
- [ ] By ID -> finds and submits
- [ ] Empty invoice -> error
- [ ] Creates reservations for all items
- [ ] Prefix: `!close @user` or `!close 5` works

### `/reservations`

Views your reservations.

- [ ] Shows reservations where you're owner or counterparty
- [ ] Filter by status (pending/confirmed/fulfilled/etc.)
- [ ] Confirm/Reject/Fulfill/Cancel buttons work based on role
- [ ] Prefix: `!reservations` works

---

## Inventory

### `/inventory`

Views your FIO inventory.

- [ ] Shows items grouped by location with storage icons
- [ ] Filter by commodity/location works
- [ ] Share button posts publicly
- [ ] Prefix: `!inventory` works (also `!inv` partial match)

### `/sync`

Manages FIO integration.

- [ ] Shows current sync status
- [ ] Set credentials via modal
- [ ] Sync Now -> refreshes inventory
- [ ] Clear credentials -> removes API key
- [ ] Slash command only (prefix disabled - uses modal)

---

## Settings

### `/settings`

Interactive settings menu.

- [ ] Shows current values for all settings
- [ ] Change location display mode -> persists
- [ ] Change default price list -> persists
- [ ] Change commodity display mode (ticker vs name) -> persists
- [ ] Manage favorites (add/remove/clear)
- [ ] Slash command only (prefix disabled - uses select menus)

---

## Lists

### `/list`

Creates a shopping list.

- [ ] With quantities: `100 COF 200 RAT` -> creates list
- [ ] With XIT JSON -> parses and names from JSON
- [ ] Items without quantities -> error
- [ ] Custom name via `name:` option
- [ ] Prefix: `!list 100 COF 200 RAT` works

### `/lists`

Views and manages shopping lists.

- [ ] Shows all lists with previews
- [ ] Select list -> shows details with buttons
- [ ] **Query Market** -> searches for matching sell orders
- [ ] **Share** -> posts list publicly
- [ ] **Rename** -> modal to change name
- [ ] **Delete** -> confirmation then deletes
- [ ] **Create Invoice** (from query results) -> starts invoice flow
- [ ] Prefix: `!lists` works

---

## Prefix Command System

General prefix behavior to verify:

- [ ] Channel-specific prefix works (configured via `commandPrefix` in channel config)
- [ ] Default prefix fallback works (channelId = '0')
- [ ] DM: any configured prefix is accepted
- [ ] DM: `!` is default when no prefixes configured
- [ ] Partial command matching: `!inv` resolves to `!inventory`
- [ ] Ambiguous partial: shows disambiguation with matching commands
- [ ] Commands with `prefixEnabled: false` (bulksell, bulkbuy, sync, settings) are ignored via prefix
