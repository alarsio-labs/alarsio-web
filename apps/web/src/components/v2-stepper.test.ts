import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderStatic } from "@/test-support/render";
import { StepperSubmitButton } from "./v2-stepper";

// Audit issue 3: "Create organisation" showed nothing while it ran, so a second click could
// create a second organisation. The pending state is what stops that.
describe("StepperSubmitButton", () => {
  it("is disabled, busy and relabelled while the form is being sent", () => {
    const html = renderStatic(createElement(StepperSubmitButton, { pending: true, label: "Create organisation", pendingLabel: "Creating your organisation…" }));
    expect(html).toContain('disabled="true"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Creating your organisation…");
    expect(html).not.toContain(">Create organisation<");
  });

  it("keeps its own label while pending when no pending label is given", () => {
    const html = renderStatic(createElement(StepperSubmitButton, { pending: true, label: "Save" }));
    expect(html).toContain('disabled="true"');
    expect(html).toContain(">Save<");
  });

  it("is an ordinary enabled submit button when nothing is being sent", () => {
    const html = renderStatic(createElement(StepperSubmitButton, { pending: false, label: "Create organisation", pendingLabel: "Creating…" }));
    expect(html).toContain('type="submit"');
    expect(html).not.toContain("disabled");
    expect(html).not.toContain("aria-busy");
    expect(html).toContain(">Create organisation<");
  });
});
