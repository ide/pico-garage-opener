import json

BUTTON_PRESS_PAYLOAD = "PRESS"


def publish_homeassistant_discovery_message(
    mqtt, device_id: str, command_topic: str, availability_topic: str
) -> None:
    mqtt.publish(
        f"homeassistant/button/{device_id}/config",
        json.dumps(
            {
                "unique_id": device_id,
                "name": "Garage Door",
                "default_entity_id": "button.garage_door",
                "device": {
                    "name": "Garage Door Opener",
                    "identifiers": [device_id],
                    "model": "Raspberry Pi Pico W Garage Door Opener",
                    "manufacturer": "Raspberry Pi",
                    "suggested_area": "garage",
                },
                "icon": "mdi:garage",
                "command_topic": command_topic,
                "payload_press": BUTTON_PRESS_PAYLOAD,
                "retain": False,
                # Home Assistant accepts the strings "online" and "offline" as the availability
                # payloads by default, so we don't need to specify "payload_available" and
                # "payload_not_available" fields in this discovery message.
                "availability_topic": availability_topic,
            }
        ),
        retain=True,
        qos=1,
    )


def clear_retained_command_message(mqtt, command_topic: str) -> None:
    mqtt.publish(command_topic, "", retain=True, qos=1)


def publish_availability_online_message(mqtt, availability_topic: str) -> None:
    mqtt.publish(availability_topic, "online", retain=True, qos=1)


def set_availability_offline_will(mqtt, availability_topic: str) -> None:
    mqtt.will_set(availability_topic, "offline", retain=True, qos=1)
