import { describe, test, expect } from "vitest";
import { capabilityName, STATUS_LABELS, CAPABILITY_NAMES, KNOWN_CAPABILITIES } from "../lib/constants";
import { keccak256, toHex } from "viem";

describe("constants", () => {
    test("CAPABILITY_NAMES has entries", () => {
        expect(CAPABILITY_NAMES.length).toBeGreaterThan(0);
    });

    test("KNOWN_CAPABILITIES maps hashes to display names", () => {
        const auditHash = keccak256(toHex("smart_contract_audit"));
        expect(KNOWN_CAPABILITIES[auditHash]).toBe("Smart Contract Audit");
    });

    test("capabilityName returns display name for known hash", () => {
        const auditHash = keccak256(toHex("smart_contract_audit"));
        expect(capabilityName(auditHash)).toBe("Smart Contract Audit");
    });

    test("capabilityName returns truncated hash for unknown", () => {
        const result = capabilityName("0xdeadbeef00000000000000000000000000000000000000000000000000000000");
        expect(result).toContain("0xdeadbeef");
        expect(result).toContain("...");
    });

    test("STATUS_LABELS has 5 entries", () => {
        expect(STATUS_LABELS).toHaveLength(5);
        expect(STATUS_LABELS[0]).toBe("active");
        expect(STATUS_LABELS[4]).toBe("resolved");
    });
});
