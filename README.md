# 🎫 NyaTickerTools

> Bilibili ticket purchasing automation toolkit with cluster coordination.

**⚠️ This README is a placeholder and will be filled with full documentation.**

## Overview

NyaTickerTools is a unified toolkit for automated Bilibili ticket purchasing, integrating multiple third-party tools with a coordination layer for distributed/cluster operation.

## Features

- Multi-tool ticket purchasing (biliTickerBuy, BHYG, bili_ticket_rush, bili-ticket-go)
- Cluster coordination for distributed purchasing
- Web management UI (coming soon)
- YAML-based configuration
- Account management

## Quick Start

```bash
# Clone the repository
git clone https://github.com/PaFuNya/NyaTickerTools.git
cd NyaTickerTools

# Install dependencies and clone tools
./scripts/setup.sh

# Configure accounts
cp config/sample_accounts.yaml config/accounts.yaml
# Edit config/accounts.yaml with your credentials

# Configure tickets
cp config/sample_tickets.yaml config/tickets.yaml
# Edit config/tickets.yaml with target events
```

## Project Structure

```
NyaTickerTools/
├── config/          # Configuration files (YAML)
├── scripts/         # Setup and utility scripts
├── tools/           # Third-party tools (cloned, git-ignored)
├── web/             # Web management UI (coming soon)
├── docs/            # Documentation
└── README.md
```

## Configuration

See [`config/sample_accounts.yaml`](config/sample_accounts.yaml) and [`config/sample_tickets.yaml`](config/sample_tickets.yaml) for configuration templates.

## License

See [LICENSE](LICENSE) for details.
