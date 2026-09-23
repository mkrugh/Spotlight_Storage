# Hardware and Wiring Guide

Welcome to the physical setup guide for Spotlight Storage! The core concept of this project is to place an individually addressable LED (or a segment of an LED strip) inside or behind each drawer bin, which is then connected to a WLED-flashed ESP microcontroller. This allows the software to physically light up the location of any item in your inventory.

## Compatible Hardware

| Component | Recommended Models | Description |
|-----------|--------------------|-------------|
| **Microcontroller** | ESP32-C3, ESP8266, ESP32 variants | The "brain" of the operation. Runs WLED to control the LEDs over WiFi. |
| **LED Strips** | WS2812B, SK6812 | 5V individually addressable LED strips. 60 LEDs/m is a common density. |
| **Power Supply** | 5V DC Power Supply | Amperage depends on the number of LEDs (see Power Injection Math below). |

## Logic Level Shifting

ESP microcontrollers operate at 3.3V logic, while WS2812B/SK6812 LEDs require a 5V data signal. While 3.3V might work for short distances, it's highly recommended to use a logic level shifter like the **74AHCT125** to reliably drive the 5V LED data line. This prevents flickering and data corruption.

```text
    ESP Board                   74AHCT125                LED Strip
    +-------+                 +-----------+             +-----------+
    |       |                 |           |             |           |
    |   3.3V|-----------------|VCC        |             |           |
    |       |                 |           |             |           |
    |  GPIO2|-----(3.3V)----->|1A       1Y|----(5V)---->|Data In    |
    |       |                 |           |             |           |
    |    GND|-----------------|GND        |             |           |
    +-------+                 +-----------+             +-----------+
```

## Power Injection Math

WS2812B LEDs can draw up to ~60mA per LED when displaying full white (all RGB channels at 255).

**Formula:**
`Total Amperage = Number of LEDs × 60mA`

**Example:**
If you have a 30-drawer cabinet (30 LEDs):
`30 LEDs × 60mA = 1800mA (1.8A)`

*Recommendation:* Use a 5V 3A power supply minimum for this setup to provide sufficient headroom. For long strips, you should inject power (connect 5V and GND directly from the power supply) every 50-75 LEDs to prevent voltage drop and discoloration.

## Capacitor Buffering

It is highly recommended to place a **1000µF capacitor** across the 5V (V+) and Ground (GND) lines near the start of the LED strip. This buffers sudden voltage spikes on startup that could potentially damage the first LED.

## WLED Installation Steps

Getting WLED onto your ESP microcontroller is simple:

1. Connect your ESP to your computer via USB.
2. Visit [install.wled.me](https://install.wled.me) in a Web Serial compatible browser (like Chrome or Edge).
3. Click "Install" and follow the prompts to flash the firmware.
4. Once installed, configure your WiFi and note the IP address assigned to the WLED device.

## GPIO Wiring

Most ESP boards use specific pins for LED data. By default, WLED often uses **GPIO2** (which is labeled as **D4** on NodeMCU boards) or **GPIO16**. You can check or change which GPIO pin is used for the LED output in the WLED web UI under *Config -> LED Preferences*.

## Sequential Section Routing

When wiring your LEDs through the drawers, the data line must flow sequentially from one LED to the next. For mixed-size organizers or multiple cabinets driven by one ESP, the data line flows section-by-section.

*Please refer to the ASCII wiring diagram in the main README.md showing the section-by-section topology, and see the [Cabinet Configuration](cabinet_configuration.md) guide for mapping this physical layout in the software.*

## Note on Video Tutorials

There are excellent YouTube videos from the original project demonstrating the physical build process:
- [Video 1](https://youtu.be/7C4i-2IqSS4)
- [Video 2](https://youtu.be/QOd1apc0Lpo)

*Disclaimer: These videos reference an older version of the UI, but the physical hardware setup, LED wiring, and WLED configuration steps they demonstrate remain accurate.*

---
[Return to Main README](../README.md)
