# Shopping Lists - Discord Bot Guide

Create and manage shopping lists from Discord, then query the market to find what you need.

## Creating a List

```
/list 100 COF 200 RAT 500 DW
```

Enter quantities and commodity tickers in any order. You can also paste **XIT JSON** from PRUNplanner directly.

Optional: give it a name with the `name` parameter:

```
/list 100 COF 200 RAT name:Weekly Restock
```

If no name is provided, it defaults to today's date (or the name from XIT JSON).

## Viewing Your Lists

```
/lists
```

Shows all your saved lists with a preview (first 3 items), item count, total units, and last updated date. Select a list from the dropdown to see its full details.

## List Actions

After selecting a list, you get these buttons:

### Query Market

Searches the market for sell orders matching your list items. Results show:

- Available quantities and prices
- **Create Invoice** button to start buying directly from the results

This is the fastest way to go from "I need these materials" to "I have an invoice ready."

### Share

Posts the list publicly in the current Discord channel so other members can see what you need.

### Rename

Opens a dialog to change the list name (1-100 characters).

### Delete

Removes the list permanently (asks for confirmation first).

## Quick Reference

| Command | Description |
|---------|-------------|
| `/list 100 COF 200 RAT` | Create a new shopping list |
| `/list <XIT JSON>` | Create from PRUNplanner export |
| `/lists` | View and manage all your lists |

## Tips

- Use **Query Market** to jump straight from a list to creating invoices
- **Share** your list when coordinating with corp members about supply needs
- Lists created in Discord are the same lists you see on the website — they stay in sync
