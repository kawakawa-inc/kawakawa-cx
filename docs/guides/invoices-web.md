# Invoices - Web Guide

Invoices are how you coordinate trades with other members. You build a draft invoice with line items from the market, submit it, and your counterparty confirms or rejects it.

## Creating an Invoice

1. Browse the **Market** page
2. Find a listing you want to trade on and click the **+ Invoice** button
3. Enter the quantity you want and confirm
4. The system creates a draft invoice with that counterparty (or adds to an existing one)

You can also create an empty invoice from the **invoice tabs bar** at the top of the Market page using the **+ Invoice** button, then select a trading partner.

> **Note:** You can only have one draft invoice per counterparty at a time.

## Managing Drafts

Draft invoices appear as **tabs** at the top of the Market page. Each tab shows the counterparty name and item count.

The **Invoice Summary Panel** shows all your drafts in an expandable accordion view:

- Each invoice shows line items grouped by BUY and SELL
- Running totals are displayed per currency
- You can remove individual items or delete the entire draft
- Use **Submit** to send it, or **Submit All** to send every draft at once

## Submitting an Invoice

When you submit an invoice:

1. A confirmation dialog shows the item count, totals, and counterparty
2. Reservations are created for each line item
3. The invoice moves from **Draft** to **Pending** status
4. Your counterparty is notified

## Responding to Received Invoices

Go to **My Orders > Invoices** to see invoices sent to you.

For each pending reservation, you can:

- **Confirm** - Accept the item
- **Reject** - Decline the item
- **Fulfill** - Mark a confirmed item as complete (traded in-game)

## Invoice Statuses

| Status              | Meaning                                       |
| ------------------- | --------------------------------------------- |
| Draft               | Still building, not yet sent                  |
| Pending             | Submitted, waiting for counterparty           |
| Confirmed           | Counterparty accepted                         |
| Fulfilled           | Trade completed in-game                       |
| Partially Fulfilled | Some items complete, others still in progress |
| Cancelled           | Invoice was cancelled by either party         |

## Contract Breakdown

The invoice detail view groups line items into **contracts** — one per combination of location, buy/sell direction, and currency. This matches how contracts work in-game, making it easy to create them in PRUN.

All values (locations, tickers, quantities, prices) are **clickable to copy** to your clipboard for quick entry in-game.

## Tips

- You can cancel a submitted invoice before it's fully confirmed
- Use the **Invoices** filter in My Orders to search by counterparty, commodity, status, or direction (sent/received)
- Submitting invoices can automatically update your shopping list (see Shopping Lists guide)
