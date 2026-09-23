# Builds & BOM Recipes

Spotlight Storage features a powerful build system that lets you group required components into named Bill of Materials (BOM) recipes, track their stock readiness, and instantly deduct all parts when you assemble the project.

## What are Builds?
Builds are named BOM (Bill of Materials) recipes that list which parts and quantities are needed for a project, kit, or assembly. They allow you to define repeatable collections of parts without needing to remember every individual component.

### Use Cases
- Soldering kits
- Product assemblies
- Seasonal restocking orders
- Sub-assembly batches

## Creating a Build
Creating a build is simple from the web interface:
1. Click the **Builds** button in the top toolbar.
2. Click **New Build**.
3. Enter a descriptive name for your project.
4. Click **Add Parts** to search and select items from your inventory.
5. Set the required quantity per part.
6. Click **Save**.

## Build Readiness
The UI automatically calculates whether stock is sufficient for every build you create.

- **Ready (100%)**: All parts in the recipe have enough quantity in stock to complete the build.
- **Shortage**: One or more parts have insufficient stock. The shortfall is shown explicitly for each affected part, making it easy to see exactly what you need to order.

Build recipes are **non-destructive** until executed. You can view, plan, and edit them indefinitely without affecting your actual inventory counts.

## Executing a Build
When you are ready to physically assemble the project, you can "execute" the build to update your inventory:

1. Open the Builds modal.
2. Click the **Execute** button on a ready build.
3. A confirmation dialog will appear.
4. Confirm to atomically deduct all required quantities from your stock simultaneously.

> [!NOTE]
> If a part happens to be short at the moment of execution (due to concurrent stock changes or ignoring warnings), a warning is shown in the results, but the deduction still completes for whatever quantities were available.

## API Integration
Build creation, modification, and execution can be fully automated using the REST API. See the [API Reference](api_reference.md) for details on programmatic build management.

---

[← Back to Main README](../README.md)
