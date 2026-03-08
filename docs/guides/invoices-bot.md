# Invoices - Discord Bot Guide

You can create, manage, and respond to invoices entirely from Discord.

## Creating an Invoice

Use `/buy` or `/sell` with a counterparty to start an invoice:

```
/buy 100 RAT BEN @alice
/sell 50 COF MOR alice
```

This creates a draft invoice with that user (or adds to an existing draft). The counterparty can be a Discord @mention, username, display name, or FIO username.

If you omit the quantity, the bot will prompt you for it.

## Viewing Your Invoices

### Dashboard

```
/invoices
```

Shows three sections:

- **Inbox** - Pending invoices sent to you that need your response
- **Drafts** - Invoices you're still building
- **Sent** - Invoices you've submitted

Each section is paginated (10 per page).

### Single Invoice

```
/invoice 5
```

Shows full details for invoice #5 including all line items, totals, status, and dates. Action buttons appear based on your role and the invoice status.

## Submitting a Draft

Use `/close` to submit a draft invoice:

```
/close          # Shows all your drafts to choose from
/close 5        # Submit invoice #5
/close alice    # Submit your draft with alice
```

Submitting creates reservations for all line items and notifies the counterparty.

## Responding to an Invoice

When someone sends you an invoice, view it with `/invoice <id>` and use the buttons:

- **Confirm** - Accept the invoice
- **Reject** - Decline the invoice

As the sender, you can **Cancel** a submitted invoice at any point before it's fulfilled.

## Creating Invoices from Market Queries

If you run `/buy` or `/sell` without a counterparty, the bot shows available market orders. From those results, you can select orders and the bot walks you through creating invoices — automatically grouping by seller if you pick orders from multiple people.

## Quick Reference

| Command                   | Description                   |
| ------------------------- | ----------------------------- |
| `/buy 100 RAT BEN @alice` | Add buy to invoice with alice |
| `/sell 50 COF MOR bob`    | Add sell to invoice with bob  |
| `/invoices`               | View all your invoices        |
| `/invoice 5`              | View invoice #5 with actions  |
| `/close`                  | Submit a draft invoice        |
| `/close 5`                | Submit invoice #5             |

## Tips

- All invoice responses are **private** (ephemeral) — only you can see them
- Buttons expire after 5 minutes; just run the command again
- After confirming an invoice, use `/reservations` to track fulfillment
