# @liguoshuai/pi-chat-protocol

Standardized communication protocol definitions, TypeScript types, message constructors, and request validators for the Pi-Chat ecosystem (Web, Android, and HarmonyOS native clients).

## Installation

```bash
pnpm add @liguoshuai/pi-chat-protocol
```

## Features

- **Full Type Definitions**: TypeScript interfaces for all WebSocket & SSE client/server messages.
- **Message Constructors**: Safe helper functions to construct standard payload messages (`createPromptMessage`, `createSteerMessage`, `createAbortMessage`, etc.).
- **Validation & Normalization**: Message validation and alias normalization (`client_send` -> `prompt`, `heartbeat` -> `ping`).

## Protocol Specification

For full specification details and message schema examples, see [PROTOCOL.md](./PROTOCOL.md).

## License

MIT
