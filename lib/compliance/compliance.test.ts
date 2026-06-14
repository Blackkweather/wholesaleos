/**
 * Compliance gate tests. Run: npx tsx lib/compliance/compliance.test.ts
 * Exercises the pure rule core (evaluateSend) and quiet-hours window.
 */
import assert from "node:assert/strict";
import Module from "node:module";

type ModuleLoader = (request: string, parent: unknown, isMain: boolean) => unknown;
const loadable = Module as unknown as { _load: ModuleLoader };
const originalLoad = loadable._load;
loadable._load = (request, parent, isMain) => (request === "server-only" ? {} : originalLoad(request, parent, isMain));

async function main(): Promise<void> {
  const { evaluateSend } = await import("./guard");
  const { isWithinSendWindow } = await import("./quiet-hours");

  const base = { channel: "SMS" as const, onDnc: false, revoked: false, warm: true, humanInitiated: true, withinWindow: true };

  // Opt-out blocks every channel
  for (const channel of ["SMS", "EMAIL", "CALL", "MAIL"] as const) {
    assert.equal(evaluateSend({ ...base, channel, revoked: true }).allow, false, `${channel} blocked when revoked`);
  }
  console.log("✓ opt-out (revoked) blocks every channel");

  // DNC blocks SMS/CALL
  assert.equal(evaluateSend({ ...base, onDnc: true }).allow, false);
  assert.match(evaluateSend({ ...base, onDnc: true }).reason, /Do-Not-Call/);
  console.log("✓ DNC blocks SMS");

  // EMAIL and MAIL allowed even cold
  assert.equal(evaluateSend({ ...base, channel: "EMAIL", warm: false, humanInitiated: false }).allow, true);
  assert.equal(evaluateSend({ ...base, channel: "MAIL", warm: false, humanInitiated: false }).allow, true);
  console.log("✓ cold EMAIL + cold MAIL allowed");

  // Cold SMS must be human-initiated (TCPA)
  const coldAuto = evaluateSend({ ...base, warm: false, humanInitiated: false });
  assert.equal(coldAuto.allow, false);
  assert.match(coldAuto.reason, /human-initiated/);
  assert.equal(evaluateSend({ ...base, warm: false, humanInitiated: true }).allow, true, "cold SMS allowed when human-initiated");
  assert.equal(evaluateSend({ ...base, warm: true, humanInitiated: false }).allow, true, "warm SMS allowed");
  console.log("✓ cold SMS blocked unless human-initiated; warm SMS allowed");

  // Quiet hours block SMS/CALL
  const offHours = evaluateSend({ ...base, withinWindow: false });
  assert.equal(offHours.allow, false);
  assert.match(offHours.reason, /contact hours/);
  console.log("✓ quiet hours block SMS");

  // Quiet-hours window (America/Chicago, CST = UTC-6 in January)
  assert.equal(isWithinSendWindow(new Date("2024-01-01T14:00:00Z"), "America/Chicago"), true, "08:00 local = within");
  assert.equal(isWithinSendWindow(new Date("2024-01-01T23:00:00Z"), "America/Chicago"), true, "17:00 local = within");
  assert.equal(isWithinSendWindow(new Date("2024-01-01T04:00:00Z"), "America/Chicago"), false, "22:00 local = outside");
  assert.equal(isWithinSendWindow(new Date("2024-01-01T09:00:00Z"), "America/Chicago"), false, "03:00 local = outside");
  console.log("✓ send window computed per timezone");

  console.log("\nCOMPLIANCE TESTS PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
