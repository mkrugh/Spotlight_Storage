# Cabinet Configuration

In Spotlight Storage, a **Cabinet** represents a WLED controller and its associated LED grid mapped to physical drawer bins. This guide explains how to configure cabinets in the software to match your physical hardware.

## Single-Section vs. Multi-Section Grids

### Single-Section Grid
Use this for simple, uniform organizers where all drawers are arranged in a single continuous grid (Rows × Cols = Total LEDs). You'll configure where the data line starts (Left/Right, Top/Bottom) and the serpentine direction (Horizontal/Vertical).
*Physical Serpentine Meaning:* "Serpentine" means the LED strip snakes back and forth. For example, a horizontal serpentine starting top-left goes left-to-right on row 1, then right-to-left on row 2, and so on.

### Multi-Section Grid
Many organizers (like Akro-Mils or Stanley) have mixed-size drawers, or you might chain multiple smaller organizers together. The multi-section grid allows you to define distinct rectangular blocks (sections) of LEDs. The data line flows sequentially from Section 1, to Section 2, and so forth.

## Step-by-Step UI Walkthrough

1. Open **Settings** → click **+ Add WLED** or edit an existing controller.
2. Enter a **Name**, the **IP Address** (or hostname) of your WLED device, and optionally a custom **Port**.
3. Under **Grid Layout Type**, choose **Single-Section Grid** or **Multi-Section Grid**.
4. For multi-section configurations: click **Add Section** to add rows. For each section, configure its **Rows**, **Cols**, **Start X**, **Start Y**, and **Serpentine Direction**.
5. The live canvas preview will render the full cabinet proportionally. A dashed jumper line shows the data transitions between sections.
6. Click **Save**. All map views, item assignments, and WLED lighting logic will update automatically.

## Mapping Rules

### Bin Numbering Rule
Bins are numbered sequentially along the physical data path (1 to N). All bins in Section 1 are numbered first, followed immediately by the bins in Section 2, and so on.

### Transition Corner Rule
When wiring multiple sections, pay attention to where the data line exits a section:
- **Even number of rows:** The data line exits on the *same side* it entered.
- **Odd number of rows:** The data line exits on the *opposite side* from where it entered.
This determines where you need to route the jumper wire to the next section.

### Independent Per-Section Directional Control
Each section has its own Start X, Start Y, and Serpentine Direction settings. This flexibility ensures you can always route the jumper wire along the most convenient side between sections without crossing wires unnecessarily.

## Testing Your Configuration

Use the **Test** button in the controller settings to verify the controller is reachable. Upon a successful test, the software will trigger a double-flash LED confirmation pulse on the physical cabinet.

---
[Hardware and Wiring Guide](hardware_and_wiring.md) | [Return to Main README](../README.md)
