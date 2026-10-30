import { describe, expect, it } from "vitest";
import { classifyVscSmtpReceipt, classifyVscSmtpError } from "./smtp-outcome";
const recipient = "shop@fixture.invalid", id = "<fixed@fixture.invalid>";
const accepted = { messageId: id, accepted: [recipient], rejected: [], response: "250 2.0.0 accepted" };
describe("Conservative VSC SMTP results", () => {
  it("requires explicit acceptance for exactly the reserved recipient and message identity", () => {
    expect(classifyVscSmtpReceipt(accepted, recipient, id)).toBe("sent");
    expect(classifyVscSmtpReceipt({ ...accepted, accepted: [{ address: recipient.toUpperCase() }] }, recipient, id)).toBe("sent");
  });
  it("does not infer successful delivery from an incomplete or contradictory receipt", () => {
    for (const receipt of [null, {}, { messageId: id }, { ...accepted, messageId: "other" }, { ...accepted, accepted: [] }, { ...accepted, accepted: ["other@fixture.invalid"] }, { ...accepted, accepted: [recipient, "other@fixture.invalid"] }, { ...accepted, rejected: [recipient] }, { ...accepted, response: "550 refused" }]) expect(classifyVscSmtpReceipt(receipt, recipient, id)).toBe("unknown");
  });
  it("recognizes only explicit envelope or DATA rejection proofs", () => {
    for (const command of ["MAIL FROM", "RCPT TO", "DATA"]) expect(classifyVscSmtpError({ code: "EENVELOPE", command, responseCode: 550, response: "550 5.1.1 refused" })).toBe("rejected");
    expect(classifyVscSmtpError({ code: "EMESSAGE", command: "DATA", responseCode: 451, response: "451 temporary refusal" })).toBe("rejected");
  });
  it("keeps timeouts, disconnects and unproven errors uncertain", () => {
    for (const error of [null, new Error("private detail"), { code: "ETIMEDOUT", command: "DATA" }, { code: "ECONNECTION" }, { code: "EMESSAGE", command: "DATA", responseCode: 550 }, { code: "EMESSAGE", command: "QUIT", responseCode: 550, response: "550 closing" }, { code: "EMESSAGE", command: "DATA", responseCode: 550, response: "250 accepted" }]) expect(classifyVscSmtpError(error)).toBe("unknown");
  });
});
