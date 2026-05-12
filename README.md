# Pico W Garage Door Opener

Open and close your garage door. This opener uses the Raspberry Pi Pico W and CircuitPython and requires Home Assistant with MQTT set up.

## Hardware

The Raspberry Pi Pico W is powered by a standard 5V USB Micro B power supply.

GPIO 22 drives a 3.3V logic-level relay module. The relay's normally-open and common terminals connect to the two dry-contact terminals on the garage door opener, the same terminals the wall button uses, and the firmware pulses the relay for half a second to mimic a press. Polarity does not matter because the contact is dry. The Pico's `3V3(OUT)` pin powers the relay's coil and ground is shared between the Pico and the relay module.

GPIO 22 is used because it does not have any alternative function like SPI, I2C, or ADC, leaving the other GPIO pins free if you want to attach a screen or other peripherals to your Pico. The pin is initialized as a low output so the relay stays open at boot and through soft resets, and the door does not unintentionally trigger when the Pico powers on.

### Wiring

Two electrically separate sides connect to the relay module: the logic side, where the Pico drives the relay coil, and the contact side, where the relay's mechanical switch bridges the opener's dry-contact terminals.

The logic side is three wires from the Pico to the relay module's input header:

| Pico pin   | Relay pin | Purpose                                                                 |
|------------|-----------|-------------------------------------------------------------------------|
| `3V3(OUT)` | `VCC`     | Powers the relay coil and the onboard driver transistor                 |
| `GND`      | `GND`     | Shared ground reference, without which the `GP22` signal is meaningless |
| `GP22`     | `IN`      | Logic-level pulse from the firmware that energizes the coil            |

The contact side is two wires from the relay's screw terminals to the opener:

| Relay terminal | Opener terminal                         |
|----------------|-----------------------------------------|
| `COM`          | Either of the two dry-contact terminals |
| `NO`           | The other dry-contact terminal          |

`NC` is unused. The existing wall button is already connected across the same two opener terminals, so the relay ends up wired in parallel with it and both keep working.

Before connecting the contact side, verify the module's trigger polarity. With `GP22` low, the relay's status LED should be off and you should hear no click. If the relay is energized at idle, the module is active low; use an active-high relay module, or change the PIO setup in `src/code.py` so the pin idles high, pulses low, and returns high.

### BOM

| Reference | Part description                                                                  | Example part #                                                                              |
|-----------|-----------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------|
| K1        | 3.3V single-channel relay module with logic-level trigger input and flyback diode | [Bestep 1-channel 3.3V relay module](https://www.aliexpress.com/item/1005007693151843.html) |
| U1        | Raspberry Pi Pico W                                                               | [SC0918](https://www.raspberrypi.com/products/raspberry-pi-pico/)                           |
|           | USB Micro B power supply (5V@1A is plenty)                                        |                                                                                             |
|           | Stranded copper wire, 22-24 AWG (long enough to reach the garage door opener)     |                                                                                             |

## Software

Install CircuitPython 10 on your Pico W using [a .uf2 file](https://circuitpython.org/board/raspberry_pi_pico_w/) from the CircuitPython website.

Create settings.toml under src or directly in your CIRCUITPY drive and define the following environment variables:
```toml
CIRCUITPY_WIFI_SSID = "your Wi-Fi access point's name"
CIRCUITPY_WIFI_PASSWORD = "your Wi-Fi password"

MQTT_HOSTNAME = "your MQTT broker's hostname"
MQTT_USERNAME = "the username to use with your MQTT broker"
MQTT_PASSWORD = "the password to use with your MQTT broker"

WIFI_HOSTNAME = "garageopener"

# Optional: relay pulse duration (default 500). Tune empirically — see code.py.
# BUTTON_PRESS_DURATION_MS = 500
```

There are convenient scripts under the `scripts` directory for deploying software to your Pico W and connecting to its REPL. Only macOS is supported.
