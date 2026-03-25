"""Terminal UI utilities for the autonomous agent demo."""

import os
import sys

# Enable ANSI on Windows
os.system("")

# Force UTF-8 output on Windows (cp1252 can't handle box-drawing chars)
if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ── Colors ──

RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"

CYAN = "\033[36m"       # Client agent
MAGENTA = "\033[35m"    # Provider agent
GREEN = "\033[32m"      # Success
RED = "\033[31m"        # Error
YELLOW = "\033[33m"     # USDC / warnings
WHITE = "\033[97m"      # Headings
BLUE = "\033[34m"       # Links / info

ARCSCAN = "https://testnet.arcscan.app/tx/"
CHAIN_NAME = "Arc Testnet"
CHAIN_ID = 5042002


def banner(market_addr: str, escrow_addr: str):
    """Print the demo header banner."""
    w = 62
    line = f"{BOLD}{WHITE}{'=' * w}{RESET}"
    print()
    print(line)
    print(f"{BOLD}{WHITE}  ARC AGENT COMMERCE - Autonomous Agent Demo{RESET}")
    print(f"{DIM}  {CHAIN_NAME} (Chain {CHAIN_ID}){RESET}")
    print(f"{DIM}  Market:  {market_addr}{RESET}")
    print(f"{DIM}  Escrow:  {escrow_addr}{RESET}")
    print(line)
    print()


def phase(n: int, title: str):
    """Print a phase separator."""
    print()
    print(f"{BOLD}{WHITE}{'─' * 4} Phase {n}: {title} {'─' * (46 - len(title))}{RESET}")
    print()


def agent_log(name: str, color: str, msg: str):
    """Print a colored agent log line."""
    print(f"  {BOLD}{color}[{name}]{RESET} {msg}")


def agent_sub(name: str, color: str, msg: str):
    """Print an indented sub-line for an agent."""
    padding = " " * (len(name) + 4)
    print(f"  {padding}{DIM}{msg}{RESET}")


def tx_link(tx_hash: str) -> str:
    """Format an arcscan transaction link."""
    return f"{BLUE}{ARCSCAN}{tx_hash}{RESET}"


def usdc_fmt(amount_wei: int) -> str:
    """Format 6-decimal USDC amount."""
    val = amount_wei / 1_000_000
    return f"{YELLOW}{val:,.2f} USDC{RESET}"


def check_line(index: int, total: int, name: str, passed: bool):
    """Print an audit check progress line."""
    status = f"{GREEN}PASS{RESET}" if passed else f"{RED}FAIL{RESET}"
    print(f"           [{index}/{total}] {name}... {status}")


def report_box(lines: list[str]):
    """Print a unicode-boxed audit report."""
    w = max(len(line) for line in lines) + 2
    top = f"    {BOLD}┌{'─' * w}┐{RESET}"
    bot = f"    {BOLD}└{'─' * w}┘{RESET}"
    print(top)
    for line in lines:
        padded = line.ljust(w - 2)
        print(f"    {BOLD}│{RESET} {padded} {BOLD}│{RESET}")
    print(bot)


def summary_box(data: dict):
    """Print a final summary box with before/after data."""
    w = 60
    sep = f"  {BOLD}{'═' * w}{RESET}"
    print()
    print(sep)
    print(f"  {BOLD}{GREEN}  DEMO COMPLETE{RESET}")
    print(sep)
    for key, val in data.items():
        print(f"  {BOLD}  {key:<28}{RESET} {val}")
    print(sep)
    print()


def error_exit(msg: str):
    """Print error and exit."""
    print(f"\n  {BOLD}{RED}ERROR:{RESET} {msg}\n")
    sys.exit(1)
