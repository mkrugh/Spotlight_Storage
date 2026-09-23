# Inventory Health Tracking

Spotlight Storage includes built-in inventory health tracking to help you monitor part quantities and quickly identify when stocks are low or depleted.

## Status Levels

Spotlight Storage tracks whether each part's stock is healthy, low, or depleted. There are three status levels:

- **Unassigned** — The part exists in the inventory database but has no cabinet or bin location set. These items appear in the Placement drawer until assigned.
- **Low Stock** — The part quantity is greater than 0, but is less than or equal to its `min_quantity` threshold. This triggers the Low Stock warning.
- **Out of Stock** — The part quantity is exactly 0 AND its `min_quantity` is greater than 0. This triggers the Out of Stock alert.

### Setting the Minimum Quantity Threshold
When creating or editing a part, you can set the "Low stock alert (≤)" field (the `min_quantity`). Parts with a `min_quantity` of `0` are excluded from low-stock and out-of-stock tracking entirely.

## Inventory Health Pills

At the bottom of the main inventory page, you will find three health pills (indicators). These summarize the current state of your inventory:

- **Unassigned** pill (purple/default): Shows the count of parts with no bin location. This pill is hidden when the count is 0.
- **Low Stock** pill (yellow/warning): Shows the count of parts that are at or below their low stock threshold. Hidden when the count is 0.
- **Out of Stock** pill (red/danger): Shows the count of tracked parts with zero quantity. Hidden when the count is 0.

Clicking any of these pills opens the bottom placement/health drawer.

## The Bottom Placement Drawer

The placement drawer opens from the bottom of the page and organizes affected items into three tabs: **Unassigned Parts**, **Low Stock**, and **Out of Stock**.

Each tab provides a clear list of the affected parts along with their current quantities and quick-action buttons to locate them or edit their details.

## Stocktaking Mode

For rapid inventory audits, Spotlight Storage features a dedicated **Stocktaking Mode**.
- It is accessed via the **Stocktaking** button in the top toolbar.
- When active, item cards switch to display quick `+1` / `-1` increment buttons and a direct quantity input field.
- This allows you to rapidly adjust inventory counts without opening the full edit modal for each item.
- Press the **Stocktaking** button again to exit this mode.

### Workflow Tip
After receiving a new order or restocking, enable Stocktaking mode to quickly bump up the quantities of the replenished parts, then check the health pills to ensure no critical items remain low.

---
[Return to Main README](../README.md)
