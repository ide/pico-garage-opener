"""Push the new garage-cover button-card config into lovelace-home.

Runs inside the hassio_supervisor container. The container has aiohttp and
can resolve "supervisor" via Docker DNS; we use the supervisor's WebSocket
proxy at ws://supervisor/core/websocket and authenticate with the
SUPERVISOR_TOKEN env var (set by docker exec -e from deploy.sh). The new
card JSON is read from stdin.

Refuses to save if it doesn't find exactly one matching card.
"""

import asyncio
import json
import os
import sys

import aiohttp

URL_PATH = "lovelace-home"


async def main() -> None:
    token = os.environ["SUPERVISOR_TOKEN"]
    new_card = json.load(sys.stdin)

    async with aiohttp.ClientSession() as session:
        async with session.ws_connect("ws://supervisor/core/websocket") as ws:
            msg = await ws.receive_json()
            if msg.get("type") != "auth_required":
                raise RuntimeError(f"unexpected first message: {msg}")
            await ws.send_json({"type": "auth", "access_token": token})
            msg = await ws.receive_json()
            if msg.get("type") != "auth_ok":
                raise RuntimeError(f"auth failed: {msg}")

            await ws.send_json({"id": 1, "type": "lovelace/config", "url_path": URL_PATH})
            msg = await ws.receive_json()
            if not msg.get("success"):
                raise RuntimeError(f"lovelace/config failed: {msg}")
            config = msg["result"]

            count = 0

            def visit(node: object) -> None:
                nonlocal count
                if isinstance(node, list):
                    for i, item in enumerate(node):
                        if (
                            isinstance(item, dict)
                            and item.get("type") == "custom:button-card"
                            and item.get("entity") == "cover.garage_door"
                        ):
                            node[i] = new_card
                            count += 1
                        else:
                            visit(item)
                elif isinstance(node, dict):
                    for v in node.values():
                        visit(v)

            visit(config)

            if count != 1:
                raise RuntimeError(f"expected to replace 1 card, found {count}")

            await ws.send_json({
                "id": 2,
                "type": "lovelace/config/save",
                "url_path": URL_PATH,
                "config": config,
            })
            msg = await ws.receive_json()
            if not msg.get("success"):
                raise RuntimeError(f"lovelace/config/save failed: {msg}")

    print(f"Replaced {count} card(s)")


if __name__ == "__main__":
    asyncio.run(main())
