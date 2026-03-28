import { describe, test, expect } from "vitest";
import { parseContractError } from "../lib/errors";

describe("parseContractError", () => {
    test("maps NotAgentOwner to human message", () => {
        const result = parseContractError(new Error("NotAgentOwner()"));
        expect(result).toContain("don't own");
    });

    test("maps PolicyCheckFailed to human message", () => {
        const result = parseContractError(new Error("PolicyCheckFailed"));
        expect(result).toContain("policy");
    });

    test("maps ServiceNotActive to human message", () => {
        const result = parseContractError(new Error("ServiceNotActive"));
        expect(result).toContain("not active");
    });

    test("maps ZeroAddress to human message", () => {
        const result = parseContractError(new Error("ZeroAddress"));
        expect(result).toContain("zero");
    });

    test("handles user rejection", () => {
        const result = parseContractError(new Error("User rejected"));
        expect(result).toContain("rejected");
    });

    test("handles insufficient funds", () => {
        const result = parseContractError(new Error("insufficient funds"));
        expect(result).toContain("Insufficient");
    });

    test("truncates long error messages", () => {
        const longMsg = "x".repeat(200);
        const result = parseContractError(new Error(longMsg));
        expect(result.length).toBeLessThanOrEqual(125); // 120 + "..."
    });

    test("handles non-Error objects", () => {
        const result = parseContractError("string error");
        expect(result).toBe("string error");
    });
});
