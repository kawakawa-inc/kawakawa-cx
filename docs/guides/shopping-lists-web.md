# Shopping Lists - Web Guide

Shopping lists help you track what commodities you need and find them on the market. They integrate with invoices to automatically update as you trade.

## Creating a List

Click **New List** in the Shopping List panel (right side of the Market page). You can:

- **Paste a list** in any of these formats:
  - **XIT JSON** — Export from PRUNplanner and paste directly
  - **CSV** — Comma, space, or tab separated (e.g., `COF,100,RAT,200`)
  - **Simple** — One item per line: `COF 100`
- **Start empty** and add items manually

The format is auto-detected. XIT JSON will also import the list name automatically.

## Managing Items

The list displays each commodity with:

- **Status indicator** — Fulfilled (green), available (light green), partial (yellow), or unavailable (red)
- **Quantity** — Shows available vs. needed (e.g., `150 / 200`)
- **Edit button** — Change the quantity or commodity inline
- **Remove button** — Delete the item

Use the **Add** button to add new items with a searchable commodity dropdown.

## Saving and Loading

- **Save** — Stores the list on the server with a name and optional notes
- **Open** — Load any of your previously saved lists
- **Copy** — Copies the list to clipboard in simple `TICKER QTY` format

Lists are also saved locally in your browser, so your working list persists between sessions.

## Market Integration

- **Filter Market** — Click to restrict the market view to only show commodities on your list
- **Own Orders** toggle — Include or exclude your own sell orders from availability calculations
- **Auto-Update** toggle — Lock/unlock the list from being modified by invoice submissions

## Auto-Update on Invoice Submission

When you submit an invoice, the system can automatically update your shopping list:

- Items fully covered by the invoice are **removed** from the list
- Items partially covered have their quantity **reduced**
- If all items are fulfilled, the list is **cleared**

The first time this happens, you'll be asked whether to enable it. You can change this later in **Account Settings**.

## Pasting into Search

You can paste a shopping list (XIT JSON, CSV, or simple format) directly into the **market search bar**. It will be parsed into a search filter that shows matching commodities.

## Tips

- Fulfillment status updates in real-time as market listings change
- The badge on each item shows how many separate orders you'd need to fill the quantity
- Saved lists are tied to your account and accessible from any device
