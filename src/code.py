import array
import binascii
import os
import time
import traceback

import board
import digitalio
import mdns
import microcontroller
import rp2pio
import socketpool
import supervisor
import wifi

import adafruit_logging
import adafruit_minimqtt.adafruit_minimqtt as adafruit_minimqtt
import adafruit_pioasm
from adafruit_ticks import ticks_add, ticks_diff, ticks_ms

from logging import create_logger
from mqtt import (
    publish_availability_online_message,
    publish_homeassistant_discovery_message,
    set_availability_offline_will,
)

_BUTTON_PRESS_MS = int(os.getenv("BUTTON_PRESS_DURATION_MS", 500))

# A PIO state machine drives the relay so the press timing is decoupled from the MQTT loop and from
# the Python runtime. The state machine reads a microsecond count from its TX FIFO, drives the relay
# pin HIGH, counts down at 1 MHz, then drives the pin LOW and waits for the next press. 1 MHz
# divides cleanly from the 125 MHz system clock and is a conventional PIO timer rate.
_RELAY_PIO_FREQUENCY = 1_000_000
_RELAY_PIO_PROGRAM = adafruit_pioasm.assemble("""
    pull block
    set pins, 1
    mov x, osr
hold:
    jmp x-- hold
    set pins, 0
""")


def main(logger: adafruit_logging.Logger) -> None:
    led = digitalio.DigitalInOut(board.LED)
    led.switch_to_output(value=False)

    # GPIO 22 drives a 3.3V relay module wired to the opener's dry-contact terminals. The state
    # machine starts with the pin low so the relay stays open at boot and through soft resets and
    # the door does not unintentionally trigger when the Pico powers on.
    relay = rp2pio.StateMachine(
        _RELAY_PIO_PROGRAM,
        frequency=_RELAY_PIO_FREQUENCY,
        first_set_pin=board.GP22,
        initial_set_pin_state=0,
    )

    logger.info("Connecting to the local Wi-Fi network...")
    wifi.radio.hostname = os.getenv("WIFI_HOSTNAME")
    wifi.radio.connect(
        os.getenv("CIRCUITPY_WIFI_SSID"), os.getenv("CIRCUITPY_WIFI_PASSWORD")
    )
    logger.info(
        "Connected to the local network: IP address = %s, router = %s, DNS server %s",
        wifi.radio.ipv4_address,
        wifi.radio.ipv4_gateway,
        wifi.radio.ipv4_dns,
    )
    pool = socketpool.SocketPool(wifi.radio)

    mdns_server = mdns.Server(wifi.radio)
    mdns_server.hostname = wifi.radio.hostname
    logger.info("Advertised mDNS hostname: %s", mdns_server.hostname)

    mqtt_device_id = binascii.hexlify(microcontroller.cpu.uid).decode("utf-8")
    mqtt_command_topic = f"door/{mqtt_device_id}/press"
    mqtt_availability_topic = f"door/{mqtt_device_id}/availability"

    # Connect to the MQTT broker. Register the will before connecting so the broker delivers our
    # "offline" availability when this device disappears without a clean disconnect (loss of Wi-Fi,
    # power, or keepalive timeout). Home Assistant uses the will to mark the button entity
    # unavailable.
    logger.info("Connecting to the MQTT broker...")
    # Use a stable client ID derived from the CPU UID so that when the device reconnects after a
    # crash, the broker takes over the previous session as a normal disconnect [MQTT-3.1.4-2] rather
    # than firing the prior session's will. Without this, adafruit_minimqtt picks a new random
    # client ID each boot and the broker eventually times out the orphaned session and publishes
    # "offline" to the availability topic, overwriting the new session's "online".
    mqtt = adafruit_minimqtt.MQTT(
        broker=os.getenv("MQTT_HOSTNAME"),
        username=os.getenv("MQTT_USERNAME"),
        password=os.getenv("MQTT_PASSWORD"),
        is_ssl=False,
        socket_pool=pool,
        client_id=mqtt_device_id,
    )
    mqtt.logger = logger
    set_availability_offline_will(mqtt, mqtt_availability_topic)
    mqtt.connect()
    logger.info("Connected to the MQTT broker")
    # Light the onboard LED to indicate the device has finished booting and is connected. The LED
    # stays on for the lifetime of the program; if the MQTT connection drops the top-level exception
    # handler resets the device, which turns the LED off until the next boot succeeds.
    led.value = True

    # Use array.array("L") so the 32-bit count enters the PIO TX FIFO as a single word
    press_payload = array.array("L", [_BUTTON_PRESS_MS * 1000])
    # Track when the relay is next available so we can drop repeated clicks from Home Assistant. We
    # can't use `relay.txstall` for this: the RP2040 sets the TXSTALL flag every cycle the state
    # machine is stalled on `pull block`, which means the flag re-asserts before `clear_txstall` has
    # any visible effect. A monotonic timestamp is the simple, reliable signal here.
    next_press_ready_ticks = ticks_ms()

    def on_press(_client, _topic, message) -> None:
        nonlocal next_press_ready_ticks
        if ticks_diff(ticks_ms(), next_press_ready_ticks) < 0:
            logger.info("Dropped MQTT press; previous press still in progress")
            return
        next_press_ready_ticks = ticks_add(ticks_ms(), _BUTTON_PRESS_MS)
        logger.info("Received button press from MQTT: %s", message)
        # `background_write` returns once DMA is armed so the MQTT loop keeps running while the
        # relay is held
        relay.background_write(press_payload)

    mqtt.add_topic_callback(mqtt_command_topic, on_press)
    # Subscribe at QoS 0 so the broker never redelivers a press. At-most-once is the right semantic
    # for an action: a missed event requires a re-tap but a duplicate event toggles the door.
    mqtt.subscribe(mqtt_command_topic, qos=0)
    # Announce we're online before sending the discovery message so Home Assistant sees the retained
    # "online" as soon as it subscribes to the availability topic. Both messages are retained so HA
    # picks them up on its next subscribe even if the device is restarting while HA is reconnecting.
    publish_availability_online_message(mqtt, mqtt_availability_topic)
    publish_homeassistant_discovery_message(
        mqtt, mqtt_device_id, mqtt_command_topic, mqtt_availability_topic
    )
    logger.info(
        "Advertised Home Assistant discovery message; awaiting button presses..."
    )

    while True:
        mqtt.loop()


logger = create_logger()

try:
    main(logger)
except Exception as exception:
    logger.critical("%s", "".join(traceback.format_exception(exception, limit=8)))
    time.sleep(10)
    if supervisor.runtime.usb_connected:
        supervisor.reload()
    else:
        microcontroller.reset()
