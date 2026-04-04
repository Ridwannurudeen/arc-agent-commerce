#!/usr/bin/env python3
"""
StreamEscrow Nanopayment Demo
==============================
Demonstrates heartbeat-gated streaming payments between two ERC-8004 agents.

Usage:
    PRIVATE_KEY_A=0x... PRIVATE_KEY_B=0x... STREAM_ESCROW_ADDRESS=0x... \
    AGENT_ID_A=933 AGENT_ID_B=1149 python scripts/demo_streaming.py
"""

import os
import sys
import time

from arc_commerce import ArcCommerce


def log(msg):
    ts = time.strftime("%H:%M:%S")
    print(f"[{ts}] {msg}")


def main():
    escrow_addr = os.environ.get("STREAM_ESCROW_ADDRESS", "")
    key_a = os.environ.get("PRIVATE_KEY_A", "")
    key_b = os.environ.get("PRIVATE_KEY_B", "")
    agent_a = int(os.environ.get("AGENT_ID_A", "0"))
    agent_b = int(os.environ.get("AGENT_ID_B", "0"))

    if not all([escrow_addr, key_a, key_b, agent_a, agent_b]):
        print("Required env vars: STREAM_ESCROW_ADDRESS, PRIVATE_KEY_A, PRIVATE_KEY_B, AGENT_ID_A, AGENT_ID_B")
        sys.exit(1)

    client_a = ArcCommerce(private_key=key_a, stream_escrow_address=escrow_addr)
    client_b = ArcCommerce(private_key=key_b, stream_escrow_address=escrow_addr)

    provider_addr = client_b.account.address

    log(f"Agent A creating 5-min stream to Agent B: 10 USDC, 30s heartbeat")
    stream_id = client_a.create_stream(
        client_agent_id=agent_a,
        provider_agent_id=agent_b,
        provider_address=provider_addr,
        amount_usdc=10.0,
        duration_seconds=300,
        heartbeat_interval=30,
    )
    log(f"Stream #{stream_id} created!")

    for i in range(3):
        time.sleep(25)
        log(f"Agent B sending heartbeat {i + 1}/3...")
        client_b.heartbeat(stream_id)
        bal = client_b.stream_balance(stream_id)
        log(f"  Claimable: {bal:.4f} USDC")

    log("Agent B withdrawing accrued balance...")
    client_b.withdraw_stream(stream_id)
    stream = client_b.get_stream(stream_id)
    log(f"  Withdrawn so far: {stream.withdrawn / 1e6:.4f} USDC")

    log("Agent B stops heartbeating... waiting 65 seconds")
    time.sleep(65)

    log("Checking stream for missed heartbeats...")
    client_a.check_stream(stream_id)
    stream = client_a.get_stream(stream_id)
    log(f"  Status: {stream.status.name}")
    bal = client_b.stream_balance(stream_id)
    log(f"  Claimable (frozen): {bal:.4f} USDC")

    time.sleep(10)
    log("Agent B resuming stream...")
    client_b.resume_stream(stream_id)
    stream = client_b.get_stream(stream_id)
    log(f"  Status: {stream.status.name}")
    log(f"  Total paused time: {stream.total_paused_time}s")

    time.sleep(15)
    log("Agent A cancelling stream...")
    client_a.cancel_stream(stream_id)
    stream = client_a.get_stream(stream_id)
    log(f"  Status: {stream.status.name}")
    log(f"  Provider earned: {stream.withdrawn / 1e6:.4f} USDC")
    remaining = client_a.stream_remaining(stream_id)
    log(f"  Client refunded: {remaining:.4f} USDC")

    log("Demo complete!")


if __name__ == "__main__":
    main()
